/**
 * Production Routes
 * 
 * Handles manufacturing production management with:
 * - Batch allocation (raw material → machine)
 * - Stock validation before allocation
 * - Production completion with loss tracking
 * - Stock movements (RAW_OUT on allocation, FG_IN on completion)
 * 
 * Production Flow:
 * 1. Allocate: Select machine + raw material + quantity → Creates in-progress batch
 * 2. Complete: Enter output quantity → Calculates loss, creates finished goods
 */

import { Router, Request, Response, NextFunction } from 'express';
import { db } from '../db/index';
import { productionBatches, machines, rawMaterials, finishedProducts, stockMovements, productionBatchInputs, productionBatchOutputs, rawMaterialBatches, rawMaterialRolls, purchaseBills } from '../db/schema';
import { eq, desc, sql, count as countFn } from 'drizzle-orm';
import { successResponse } from '../types/api';
import { createError } from '../middleware/errorHandler';
import { validateRawMaterialStock, validateFinishedProductStock } from '../services/inventory.service';

const router = Router();

// Loss threshold percentage (alert if exceeded)
const LOSS_THRESHOLD_PERCENT = 5;

// ============================================================
// GET BATCHES
// ============================================================

/**
 * GET /production/batches
 * Get all production batches with related data
 */
router.get('/batches', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const batches = await db.query.productionBatches.findMany({
            with: {
                machine: true,
                rawMaterial: true,
                finishedProduct: true,
                inputs: {
                    with: {
                        rawMaterial: true
                    }
                },
                outputs: {
                    with: { finishedProduct: true }
                }
            },
            orderBy: (batches, { desc }) => [desc(batches.createdAt)],
        });

        // Fetch roll details for inputs where materialBatchId is a roll ID
        const formatted = await Promise.all(batches.map(async batch => {
            const enhancedInputs = await Promise.all(batch.inputs.map(async (input) => {
                // Try to fetch rolls if materialBatchId exists (now stores JSON array of roll IDs)
                let rolls: any[] = [];
                let purchaseBill = null;

                if (input.materialBatchId) {
                    try {
                        // Parse JSON array of roll IDs
                        const rollIds = JSON.parse(input.materialBatchId);
                        if (Array.isArray(rollIds)) {
                            for (const rollId of rollIds) {
                                const [rollData] = await db.select()
                                    .from(rawMaterialRolls)
                                    .where(eq(rawMaterialRolls.id, rollId));

                                if (rollData) {
                                    rolls.push(rollData);
                                    // Get purchase bill for the first roll (they should all be from same bill typically)
                                    if (!purchaseBill) {
                                        const [billData] = await db.select()
                                            .from(purchaseBills)
                                            .where(eq(purchaseBills.id, rollData.purchaseBillId));
                                        purchaseBill = billData;
                                    }
                                }
                            }
                        }
                    } catch (e) {
                        // Fallback: try as single roll ID for backward compatibility
                        const [rollData] = await db.select()
                            .from(rawMaterialRolls)
                            .where(eq(rawMaterialRolls.id, input.materialBatchId));

                        if (rollData) {
                            rolls.push(rollData);
                            const [billData] = await db.select()
                                .from(purchaseBills)
                                .where(eq(purchaseBills.id, rollData.purchaseBillId));
                            purchaseBill = billData;
                        }
                    }
                }

                return {
                    ...input,
                    rolls, // Array of roll details
                    roll: rolls[0] || null, // Legacy: first roll for backward compatibility
                    purchaseBill,
                };
            }));

            // Calculate remaining capacity for partially-completed batches
            const inputQty = parseFloat(batch.inputQuantity || '0');
            const outputQty = parseFloat(batch.outputQuantity || '0');
            const remainingCapacity = inputQty - outputQty;

            // Helper field for frontend: should this batch appear in "Active Batches"?
            const isActive = batch.status === 'in-progress' ||
                batch.status === 'partially-completed' ||
                remainingCapacity > 0;

            return {
                ...batch,
                // Fallback for legacy frontend or unified access
                rawMaterial: batch.rawMaterial || batch.inputs[0]?.rawMaterial,
                finishedProduct: batch.finishedProduct || batch.outputs[0]?.finishedProduct,
                inputs: enhancedInputs,
                outputs: batch.outputs,
                remainingCapacity: remainingCapacity > 0 ? remainingCapacity : 0, // Available material that can still be processed
                isActive, // Helper for frontend filtering
            };
        }));

        res.json(successResponse(formatted));
    } catch (error) {
        next(error);
    }
});

// ============================================================
// GET AVAILABLE MATERIALS (with stock)
// ============================================================

/**
 * GET /production/available-materials
 * Get raw materials with available stock for allocation
 */
router.get('/available-materials', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const materials = await db.select().from(rawMaterials);

        // Calculate stock from movements
        const withStock = await Promise.all(
            materials.map(async (material) => {
                const stockResult = await db
                    .select({
                        totalIn: sql<string>`COALESCE(SUM(${stockMovements.quantityIn}::numeric), 0)`,
                        totalOut: sql<string>`COALESCE(SUM(${stockMovements.quantityOut}::numeric), 0)`,
                    })
                    .from(stockMovements)
                    .where(eq(stockMovements.rawMaterialId, material.id));

                const stock = parseFloat(stockResult[0]?.totalIn || '0') - parseFloat(stockResult[0]?.totalOut || '0');
                return { ...material, stock: stock.toFixed(2) };
            })
        );

        res.json(successResponse(withStock));
    } catch (error) {
        next(error);
    }
});

// ============================================================
// CREATE BATCH (ALLOCATION)
// ============================================================

/**
 * POST /production/batches
 * Create new production batch (allocation)
 * 
 * Validates stock before allocation
 * Creates RAW_OUT stock movement
 */
router.post('/batches', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const {
            allocationDate,
            machineId,
            rawMaterialId,
            finishedProductId,
            inputQuantity,
            inputs, // Array of { rawMaterialId, quantity }
            outputs // Array of finishedProductId
        } = req.body;

        // Normalize inputs
        let batchInputs: { rawMaterialId: string, quantity: number, materialBatchId?: string }[] = [];
        if (inputs && Array.isArray(inputs) && inputs.length > 0) {
            batchInputs = inputs.map((i: any) => ({
                rawMaterialId: i.rawMaterialId,
                quantity: parseFloat(i.quantity),
                materialBatchId: i.materialBatchId // Optional: Specific batch
            }));
        } else if (rawMaterialId && inputQuantity) {
            batchInputs = [{ rawMaterialId, quantity: parseFloat(inputQuantity) }];
        }

        // Normalize outputs (target products)
        let batchOutputs: string[] = [];
        if (outputs && Array.isArray(outputs) && outputs.length > 0) {
            batchOutputs = outputs;
        } else if (finishedProductId) {
            batchOutputs = [finishedProductId];
        }

        // Validate
        if (!machineId) throw createError('Machine ID required', 400);
        if (batchInputs.length === 0) throw createError('At least one input material required', 400);
        if (batchInputs.length > 6) throw createError('Maximum 6 input materials allowed', 400);
        // Outputs are now optional - removed validation
        if (batchOutputs.length > 4) throw createError('Maximum 4 target products allowed', 400);

        // Validate stock for all inputs
        let totalInputQty = 0;
        for (const input of batchInputs) {
            if (isNaN(input.quantity) || input.quantity <= 0) {
                throw createError('Invalid input quantity', 400);
            }
            const stockValidation = await validateRawMaterialStock(input.rawMaterialId, input.quantity);
            if (!stockValidation.isValid) {
                throw createError(`Stock check failed for material: ${stockValidation.message}`, 400);
            }
            totalInputQty += input.quantity;
        }

        // Verify machine is active
        const [machine] = await db.select().from(machines).where(eq(machines.id, machineId));
        if (!machine || machine.status !== 'Active') {
            throw createError('Machine not available or inactive', 400);
        }

        // Generate batch code
        const countResult = await db.select({ cnt: countFn() }).from(productionBatches);
        const batchCount = Number(countResult[0]?.cnt || 0);
        const batchCode = `PB-${String(batchCount + 1).padStart(3, '0')}`;

        // Create batch header
        const [batch] = await db.insert(productionBatches).values({
            code: batchCode,
            allocationDate: new Date(allocationDate),
            machineId,
            // Legacy fields for primary item
            rawMaterialId: batchInputs[0].rawMaterialId,
            finishedProductId: batchOutputs.length > 0 ? batchOutputs[0] : null, // Optional: Primary target
            inputQuantity: String(totalInputQty),
            status: 'in-progress',
        }).returning();

        // Insert Inputs & Create Movements
        for (const input of batchInputs) {
            let consumedRollIds: string[] = [];

            // Handle specific roll selection if provided
            // materialBatchId is actually a ROLL ID from the dropdown (misnamed for backward compat)
            // Filter out: null, undefined, empty strings, or whitespace-only strings
            const hasValidRollId = input.materialBatchId &&
                typeof input.materialBatchId === 'string' &&
                input.materialBatchId.trim().length > 0;

            if (hasValidRollId) {
                // Handle potential JSON array string (e.g. '["id"]')
                let targetRollId = input.materialBatchId!;
                try {
                    if (targetRollId.startsWith('[') && targetRollId.endsWith(']')) {
                        const parsed = JSON.parse(targetRollId);
                        if (Array.isArray(parsed) && parsed.length > 0) {
                            targetRollId = parsed[0]; // Take the first ID if it's an array
                        }
                    }
                } catch (e) {
                    // Not a JSON string, extract valid ID
                }

                // Look up the ROLL (not batch!)
                const [roll] = await db.select().from(rawMaterialRolls).where(eq(rawMaterialRolls.id, targetRollId));

                if (!roll) {
                    throw createError(`Roll not found: ${input.materialBatchId}. If you don't want to specify a roll, leave it empty for FIFO allocation.`, 404);
                }

                const rollWeight = parseFloat(roll.netWeight);

                // Check if requested quantity matches roll weight (or is less for partial use)
                if (input.quantity > rollWeight) {
                    throw createError(`Requested quantity (${input.quantity}kg) exceeds roll weight (${rollWeight}kg) for ${roll.rollCode}`, 400);
                }

                // Mark the roll as "Consumed"
                await db.update(rawMaterialRolls)
                    .set({
                        status: 'Consumed',
                        updatedAt: new Date()
                    })
                    .where(eq(rawMaterialRolls.id, targetRollId));

                consumedRollIds.push(targetRollId);
                console.log(`✓ Marked roll ${roll.rollCode} as Consumed`);
            } else {
                // No specific roll selected - use FIFO to auto-select and mark rolls as consumed  
                const availableRolls = await db.query.rawMaterialRolls.findMany({
                    where: (rolls, { and, eq }) => and(
                        eq(rolls.rawMaterialId, input.rawMaterialId),
                        eq(rolls.status, 'In Stock')
                    ),
                    orderBy: (rolls, { asc }) => [asc(rolls.createdAt)] // FIFO
                });

                let remainingToConsume = input.quantity;
                for (const roll of availableRolls) {
                    if (remainingToConsume <= 0) break;

                    const rollWeight = parseFloat(roll.netWeight);
                    await db.update(rawMaterialRolls)
                        .set({
                            status: 'Consumed',
                            updatedAt: new Date()
                        })
                        .where(eq(rawMaterialRolls.id, roll.id));

                    consumedRollIds.push(roll.id);
                    console.log(`✓ Auto-consumed roll ${roll.rollCode} (${rollWeight}kg) via FIFO`);
                    remainingToConsume -= rollWeight;
                }
            }

            // Store consumed roll IDs as JSON array for proper restoration on deletion
            await db.insert(productionBatchInputs).values({
                batchId: batch.id,
                rawMaterialId: input.rawMaterialId,
                materialBatchId: consumedRollIds.length > 0 ? JSON.stringify(consumedRollIds) : null,
                quantity: String(input.quantity)
            });

            // Stock Movement
            const [material] = await db.select().from(rawMaterials).where(eq(rawMaterials.id, input.rawMaterialId));
            // Calculate balance - expensive loop but safe
            const stockValidation = await validateRawMaterialStock(input.rawMaterialId, 0); // Get current stock

            await db.insert(stockMovements).values({
                date: new Date(),
                movementType: 'RAW_OUT',
                itemType: 'raw_material',
                rawMaterialId: input.rawMaterialId,
                quantityIn: '0',
                quantityOut: String(input.quantity),
                runningBalance: String(stockValidation.currentStock - input.quantity),
                referenceType: 'production',
                referenceCode: batchCode,
                referenceId: batch.id,
                reason: `Allocated to ${machine.name} for production`,
            });
        }

        // Insert Outputs (Planned)
        for (const productId of batchOutputs) {
            await db.insert(productionBatchOutputs).values({
                batchId: batch.id,
                finishedProductId: productId,
                outputQuantity: null // Not yet produced
            });
        }

        // Fetch full data for response
        const fullBatch = await db.query.productionBatches.findFirst({
            where: eq(productionBatches.id, batch.id),
            with: {
                machine: true,
                rawMaterial: true,
                finishedProduct: true,
                inputs: { with: { rawMaterial: true } },
                outputs: { with: { finishedProduct: true } }
            }
        });

        res.json(successResponse(fullBatch));
    } catch (error) {
        next(error);
    }
});

// ============================================================
// UPDATE BATCH (EDIT ALLOCATION)
// ============================================================

/**
 * PUT /production/batches/:id
 * Update an existing production batch
 * - Handle inputs: Add, Remove, Update (smart sync with stock)
 * - Handle outputs: Update target list
 * - Update machine/date
 */
router.put('/batches/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const {
            allocationDate,
            machineId,
            inputs, // Array of { rawMaterialId, quantity, materialBatchId }
            outputs // Array of finishedProductId
        } = req.body;

        // 1. Get Existing Batch
        const existingBatch = await db.query.productionBatches.findFirst({
            where: eq(productionBatches.id, id),
            with: {
                inputs: true,
                outputs: true
            }
        });

        if (!existingBatch) throw createError('Batch not found', 404);
        if (existingBatch.status === 'completed') throw createError('Cannot edit completed batch', 400);

        // 2. Validate Inputs
        let batchInputs: { rawMaterialId: string, quantity: number, materialBatchId?: string }[] = [];
        if (inputs && Array.isArray(inputs)) {
            batchInputs = inputs.map((i: any) => ({
                rawMaterialId: i.rawMaterialId,
                quantity: parseFloat(i.quantity),
                materialBatchId: i.materialBatchId
            })).filter(i => i.rawMaterialId && i.quantity > 0);
        }

        if (batchInputs.length === 0) throw createError('At least one input required', 400);

        await db.transaction(async (tx) => {
            // 3. Update Batch Header
            let totalInputQty = 0;
            batchInputs.forEach(i => totalInputQty += i.quantity);

            await tx.update(productionBatches)
                .set({
                    allocationDate: new Date(allocationDate),
                    machineId,
                    inputQuantity: String(totalInputQty),
                    rawMaterialId: batchInputs[0].rawMaterialId, // Legacy primary
                    updatedAt: new Date()
                })
                .where(eq(productionBatches.id, id));

            // 4. Reconcile Inputs (Smart Sync)
            // Strategy: Reverse ALL old inputs (restore stock/rolls), then Process ALL new inputs (consume stock/rolls)
            // This is safer/easier than diffing complexities allowing for mix of roll/batch updates

            // A. Reverse Old Inputs
            for (const oldInput of existingBatch.inputs) {
                // Restore Stock
                const stockValidation = await validateRawMaterialStock(oldInput.rawMaterialId, 0);
                await tx.insert(stockMovements).values({
                    id: crypto.randomUUID(),
                    date: new Date(),
                    movementType: 'RAW_IN', // Returning stock
                    itemType: 'raw_material',
                    rawMaterialId: oldInput.rawMaterialId,
                    quantityIn: oldInput.quantity,
                    quantityOut: '0',
                    runningBalance: String(stockValidation.currentStock + parseFloat(oldInput.quantity)),
                    referenceType: 'production_edit_reversal',
                    referenceCode: existingBatch.code,
                    referenceId: existingBatch.id,
                    reason: `Edit reversal for ${existingBatch.code}`,
                });

                // Restore Rolls
                if (oldInput.materialBatchId) {
                    let rollIds: string[] = [];
                    try {
                        const parsed = JSON.parse(oldInput.materialBatchId);
                        if (Array.isArray(parsed)) rollIds = parsed;
                        else rollIds = [oldInput.materialBatchId];
                    } catch (e) {
                        rollIds = [oldInput.materialBatchId];
                    }

                    for (const rollId of rollIds) {
                        await tx.update(rawMaterialRolls)
                            .set({ status: 'In Stock' }) // Make available again
                            .where(eq(rawMaterialRolls.id, rollId));
                    }
                }
            }

            // Delete old input records
            await tx.delete(productionBatchInputs).where(eq(productionBatchInputs.batchId, id));

            // B. Process New Inputs
            for (const input of batchInputs) {
                let consumedRollIds: string[] = [];

                // Valid Roll ID check
                let targetRollId: string | null = null;
                if (input.materialBatchId) {
                    // Handle potential JSON array or raw string
                    if (input.materialBatchId.startsWith('[') && input.materialBatchId.endsWith(']')) {
                        try {
                            const parsed = JSON.parse(input.materialBatchId);
                            if (Array.isArray(parsed) && parsed.length > 0) targetRollId = parsed[0];
                        } catch (e) { }
                    } else {
                        targetRollId = input.materialBatchId;
                    }
                }

                if (targetRollId) {
                    // Consume specific roll
                    // We just made it 'In Stock' above if it was used before, so we can re-consume it.
                    // Or if it's a new roll, we consume it.
                    const [roll] = await tx.select().from(rawMaterialRolls).where(eq(rawMaterialRolls.id, targetRollId));
                    if (!roll) throw createError(`Roll not found: ${targetRollId}`, 404);

                    if (roll.status !== 'In Stock') {
                        // Edge case: User swapped to a roll that is already used by SOMEONE ELSE
                        throw createError(`Roll ${roll.rollCode} is not available (Status: ${roll.status})`, 400);
                    }

                    await tx.update(rawMaterialRolls)
                        .set({ status: 'Consumed', updatedAt: new Date() })
                        .where(eq(rawMaterialRolls.id, targetRollId));

                    consumedRollIds.push(targetRollId);
                } else {
                    // FIFO Logic if no roll specified
                    const availableRolls = await tx.query.rawMaterialRolls.findMany({
                        where: (rolls, { and, eq }) => and(
                            eq(rolls.rawMaterialId, input.rawMaterialId),
                            eq(rolls.status, 'In Stock')
                        ),
                        orderBy: (rolls, { asc }) => [asc(rolls.createdAt)]
                    });

                    let remaining = input.quantity;
                    for (const roll of availableRolls) {
                        if (remaining <= 0) break;
                        const weight = parseFloat(roll.netWeight);
                        await tx.update(rawMaterialRolls)
                            .set({ status: 'Consumed', updatedAt: new Date() })
                            .where(eq(rawMaterialRolls.id, roll.id));
                        consumedRollIds.push(roll.id);
                        remaining -= weight;
                    }
                }

                // Insert New Input Record
                await tx.insert(productionBatchInputs).values({
                    batchId: id,
                    rawMaterialId: input.rawMaterialId,
                    materialBatchId: consumedRollIds.length > 0 ? JSON.stringify(consumedRollIds) : null,
                    quantity: String(input.quantity)
                });

                // Consume Stock (RAW_OUT)
                // Get fresh stock level after reversal
                // Note: In transaction, we can't easily use external service that uses separate connection/pool context unless we pass TX
                // For simplicity, we assume the reversal committed conceptually within TX. 
                // We'll calculate balance manually or use a helper. 
                // Since this is a trace log, exact running balance perfection in high concurrency is hard without locking.
                // We will append.

                await tx.insert(stockMovements).values({
                    id: crypto.randomUUID(),
                    date: new Date(),
                    movementType: 'RAW_OUT',
                    itemType: 'raw_material',
                    rawMaterialId: input.rawMaterialId,
                    quantityIn: '0',
                    quantityOut: String(input.quantity),
                    runningBalance: '0', // TODO: Ideal world we calc real balance, but for now '0' or skipping to avoid expensive query in TX loop
                    referenceType: 'production',
                    referenceCode: existingBatch.code,
                    referenceId: existingBatch.id,
                    reason: `Allocated (Edit) to ${machineId}`,
                });
            }

            // 5. Update Outputs
            await tx.delete(productionBatchOutputs).where(eq(productionBatchOutputs.batchId, id));
            let batchOutputs = outputs;
            if (!batchOutputs || !Array.isArray(batchOutputs)) batchOutputs = [];

            for (const productId of batchOutputs) {
                if (productId) {
                    await tx.insert(productionBatchOutputs).values({
                        batchId: id,
                        finishedProductId: productId,
                        outputQuantity: null
                    });
                }
            }
        });

        res.json(successResponse({ message: 'Batch updated successfully' }));
    } catch (error) {
        next(error);
    }
});

// ============================================================
// COMPLETE BATCH
// ============================================================

/**
 * POST /production/batches/:id/complete
 * Complete a production batch
 * 
 * Calculates loss percentage
 * Creates FG_IN stock movement
 * Flags if loss exceeds threshold
 */
router.post('/batches/:id/complete', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const { outputQuantity, completionDate, finishedProductId, outputs } = req.body; // outputs: [{ productId, quantity }]

        // Normalize outputs
        let completeOutputs: { productId: string, quantity: number }[] = [];
        if (outputs && Array.isArray(outputs) && outputs.length > 0) {
            completeOutputs = outputs.map((o: any) => ({
                productId: o.finishedProductId || o.productId,
                quantity: parseFloat(o.quantity)
            }));
        } else if (outputQuantity) {
            // Legacy fallback - assumes single product in batch header or passed finishedProductId
            const pId = finishedProductId;
            completeOutputs = [{ productId: pId, quantity: parseFloat(outputQuantity) }];
        }

        if (completeOutputs.length === 0) {
            throw createError('Output quantities required', 400);
        }

        // Get existing batch
        const batch = await db.query.productionBatches.findFirst({
            where: eq(productionBatches.id, id),
            with: { outputs: true }
        });

        if (!batch) throw createError('Batch not found', 404);
        if (batch.status === 'completed') throw createError('Batch already completed', 400);

        // Process Outputs
        let totalOutputQty = 0;

        for (const output of completeOutputs) {
            if (!output.productId) throw createError('Product ID required for output', 400);

            // Validate quantity
            if (isNaN(output.quantity) || output.quantity < 0) throw createError('Invalid output quantity', 400);

            totalOutputQty += output.quantity;

            // Update or Insert ProductionBatchOutput
            // Try to find existing row
            const existing = batch.outputs.find(o => o.finishedProductId === output.productId);

            if (existing) {
                await db.update(productionBatchOutputs)
                    .set({ outputQuantity: String(output.quantity) })
                    .where(eq(productionBatchOutputs.id, existing.id));
            } else {
                await db.insert(productionBatchOutputs).values({
                    batchId: batch.id,
                    finishedProductId: output.productId,
                    outputQuantity: String(output.quantity)
                });
            }

            // Create FG_IN Movement
            await db.insert(stockMovements).values({
                date: new Date(),
                movementType: 'FG_IN',
                itemType: 'finished_product',
                finishedProductId: output.productId,
                quantityIn: String(output.quantity),
                quantityOut: '0',
                runningBalance: '0', // Should be calculated but we'll leave 0 as in original code
                referenceType: 'production',
                referenceCode: batch.code,
                referenceId: batch.id,
                reason: `Production completed from batch ${batch.code}`,
            });
        }

        const input = parseFloat(batch.inputQuantity || '0'); // Assuming inputQuantity in header is total
        const diff = input - totalOutputQty;
        const lossPercentage = input > 0 ? (diff / input) * 100 : 0;
        const lossExceeded = lossPercentage > LOSS_THRESHOLD_PERCENT;

        // Update batch header
        const [updatedBatch] = await db.update(productionBatches)
            .set({
                outputQuantity: String(totalOutputQty),
                completionDate: completionDate ? new Date(completionDate) : new Date(),
                lossQuantity: String(diff),
                lossPercentage: String(lossPercentage),
                lossExceeded,
                status: 'completed',
                updatedAt: new Date(),
            })
            .where(eq(productionBatches.id, id))
            .returning();

        // Prepare response
        const fullBatch = await db.query.productionBatches.findFirst({
            where: eq(productionBatches.id, updatedBatch.id),
            with: {
                machine: true,
                rawMaterial: true,
                finishedProduct: true,
                inputs: { with: { rawMaterial: true } },
                outputs: { with: { finishedProduct: true } }
            }
        });

        // Add warning if loss exceeded
        const response: any = { ...fullBatch };
        if (lossExceeded) {
            response.warning = `Production loss ${lossPercentage.toFixed(2)}% exceeds ${LOSS_THRESHOLD_PERCENT}% threshold`;
        }

        res.json(successResponse(response));
    } catch (error) {
        next(error);
    }
});

// ============================================================
// QUICK COMPLETE (Direct Production Entry - Machine Level FIFO)
// ============================================================

/**
 * POST /production/quick-complete
 * Quick production entry from inventory
 * 
 * Machine-level FIFO consumption:
 * - Accepts machineId instead of batchId
 * - Uses percentage-based weight loss calculation
 * - Consumes from all machine batches in FIFO order (oldest first)
 * - Automatically manages batch status and completion
 */
router.post('/quick-complete', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const {
            machineId,
            finishedProductId,
            outputWeight, // in kg
            weightLossPercent // percentage (0-100)
        } = req.body;

        // Validate inputs
        if (!machineId || !finishedProductId) {
            throw createError('Machine ID and Product ID are required', 400);
        }
        if (!outputWeight || parseFloat(outputWeight) <= 0) {
            throw createError('Output weight must be greater than 0', 400);
        }
        if (weightLossPercent === undefined || parseFloat(weightLossPercent) < 0 || parseFloat(weightLossPercent) >= 100) {
            throw createError('Weight loss percentage must be between 0 and 100', 400);
        }

        const output = parseFloat(outputWeight);
        const lossPercent = parseFloat(weightLossPercent);

        // Calculate total consumption using percentage formula
        // Formula: totalConsumption = output / (1 - lossPercent/100)
        // Example: 100kg output with 5% loss = 100 / 0.95 = 105.26kg consumed
        const totalConsumption = lossPercent >= 100 ? 0 : output / (1 - lossPercent / 100);
        const actualLoss = totalConsumption - output;

        // Fetch all in-progress and partially-completed batches for this machine in FIFO order
        const machineBatches = await db.query.productionBatches.findMany({
            where: (batches, { and, eq, or }) => and(
                eq(batches.machineId, machineId),
                or(
                    eq(batches.status, 'in-progress'),
                    eq(batches.status, 'partially-completed')
                )
            ),
            with: {
                machine: true,
                outputs: true
            },
            orderBy: (batches, { asc }) => [asc(batches.allocationDate)] // FIFO
        });

        if (machineBatches.length === 0) {
            throw createError('No active batches found for this machine', 404);
        }

        // Calculate total available capacity
        const totalAvailable = machineBatches.reduce((sum, batch) => {
            const input = parseFloat(batch.inputQuantity || '0');
            const consumed = parseFloat(batch.outputQuantity || '0');
            return sum + (input - consumed);
        }, 0);

        // Validate total consumption doesn't exceed available
        if (totalConsumption > totalAvailable) {
            throw createError(
                `Total consumption (${totalConsumption.toFixed(2)}kg) exceeds available capacity (${totalAvailable.toFixed(2)}kg)`,
                400
            );
        }

        // FIFO Consumption: Distribute consumption across batches
        let remainingToConsume = totalConsumption;
        const affectedBatches: any[] = [];

        for (const batch of machineBatches) {
            if (remainingToConsume <= 0.001) break; // Stop if fully consumed (0.001kg tolerance)

            const inputQty = parseFloat(batch.inputQuantity || '0');
            const currentOutput = parseFloat(batch.outputQuantity || '0');
            const available = inputQty - currentOutput;

            if (available <= 0) continue; // Skip fully consumed batches

            // Determine how much to consume from this batch
            const toConsume = Math.min(remainingToConsume, available);
            const newOutputQty = currentOutput + toConsume;
            const remaining = inputQty - newOutputQty;

            // Calculate loss for this batch portion
            const batchLoss = (toConsume / totalConsumption) * actualLoss;
            const batchLossPercent = inputQty > 0 ? (batchLoss / inputQty) * 100 : 0;
            const lossExceeded = batchLossPercent > LOSS_THRESHOLD_PERCENT;

            // Determine new status
            const newStatus = remaining > 0.01 ? 'partially-completed' : 'completed';

            // Update batch
            await db.update(productionBatches)
                .set({
                    outputQuantity: String(newOutputQty),
                    completionDate: new Date(),
                    lossQuantity: String(batchLoss),
                    lossPercentage: String(batchLossPercent),
                    lossExceeded,
                    status: newStatus,
                    updatedAt: new Date(),
                })
                .where(eq(productionBatches.id, batch.id));

            // Update or insert output record for this batch
            const existing = batch.outputs.find(o => o.finishedProductId === finishedProductId);
            if (existing) {
                const existingQty = parseFloat(existing.outputQuantity || '0');
                await db.update(productionBatchOutputs)
                    .set({ outputQuantity: String(existingQty + (toConsume - batchLoss)) })
                    .where(eq(productionBatchOutputs.id, existing.id));
            } else {
                await db.insert(productionBatchOutputs).values({
                    batchId: batch.id,
                    finishedProductId,
                    outputQuantity: String(toConsume - batchLoss)
                });
            }

            affectedBatches.push({
                batchCode: batch.code,
                consumed: toConsume.toFixed(2),
                remaining: remaining.toFixed(2),
                status: newStatus
            });

            remainingToConsume -= toConsume;
        }

        // Create single FG_IN stock movement for total output
        const firstBatch = machineBatches[0];
        await db.insert(stockMovements).values({
            date: new Date(),
            movementType: 'FG_IN',
            itemType: 'finished_product',
            finishedProductId,
            quantityIn: String(output),
            quantityOut: '0',
            runningBalance: '0', // Calculated separately
            referenceType: 'production',
            referenceCode: `${firstBatch.machine?.name || 'Machine'} Production`,
            referenceId: firstBatch.id,
            reason: `Quick production entry from ${firstBatch.machine?.name || 'machine'} (${affectedBatches.length} batch${affectedBatches.length > 1 ? 'es' : ''})`,
        });

        // Fetch product
        const product = await db.query.finishedProducts.findFirst({
            where: eq(finishedProducts.id, finishedProductId)
        });

        // Calculate overall loss percentage
        const overallLossPercent = lossPercent;
        const lossExceeded = overallLossPercent > LOSS_THRESHOLD_PERCENT;

        // Prepare response
        const response: any = {
            success: true,
            product,
            consumption: {
                output: output,
                lossPercent: lossPercent,
                lossKg: actualLoss.toFixed(2),
                totalConsumed: totalConsumption.toFixed(2),
                remainingCapacity: (totalAvailable - totalConsumption).toFixed(2)
            },
            affectedBatches
        };

        if (lossExceeded) {
            response.warning = `Production loss ${overallLossPercent.toFixed(2)}% exceeds ${LOSS_THRESHOLD_PERCENT}% threshold`;
        }

        res.json(successResponse(response));
    } catch (error) {
        next(error);
    }
});

// ============================================================
// GET STATISTICS
// ============================================================

/**
 * GET /production/stats
 * Get production statistics for dashboard
 */
router.get('/stats', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const stats = await db
            .select({
                totalBatches: sql<number>`COUNT(*)`,
                inProgress: sql<number>`COUNT(*) FILTER (WHERE ${productionBatches.status} = 'in-progress')`,
                completed: sql<number>`COUNT(*) FILTER (WHERE ${productionBatches.status} = 'completed')`,
                exceededLoss: sql<number>`COUNT(*) FILTER (WHERE ${productionBatches.lossExceeded} = true)`,
                totalInput: sql<string>`COALESCE(SUM(${productionBatches.inputQuantity}::numeric), 0)`,
                totalOutput: sql<string>`COALESCE(SUM(${productionBatches.outputQuantity}::numeric), 0)`,
            })
            .from(productionBatches);

        res.json(successResponse({
            ...stats[0],
            totalInput: parseFloat(stats[0]?.totalInput || '0'),
            totalOutput: parseFloat(stats[0]?.totalOutput || '0'),
        }));
    } catch (error) {
        next(error);
    }
});

// ============================================================
// DELETE PRODUCTION BATCH
// ============================================================

/**
 * DELETE /production/batches/:id
 * Delete a production batch (only if in-progress)
 */
router.delete('/batches/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;

        // Get the batch
        const [batch] = await db.select().from(productionBatches).where(eq(productionBatches.id, id));
        if (!batch) throw createError('Batch not found', 404);

        // Allow deletion of completed batches (Reversal Logic)
        if (batch.status === 'completed' || batch.status === 'partially-completed') {
            console.log(`↺ Reverse-Deleting batch ${batch.code} (Status: ${batch.status})`);

            // 1. Reverse Output (FG_OUT)
            // Get all outputs for this batch
            const outputs = await db.select().from(productionBatchOutputs).where(eq(productionBatchOutputs.batchId, id));

            for (const output of outputs) {
                if (output.outputQuantity && parseFloat(output.outputQuantity) > 0) {
                    const reversQty = parseFloat(output.outputQuantity);
                    // CHECK: Is the finished good stock still available to reverse?
                    const stockCheck = await validateFinishedProductStock(output.finishedProductId, reversQty);
                    if (!stockCheck.isValid) {
                        throw createError(`Cannot delete batch: Produced stock (${reversQty}kg) has already been consumed or sold. Current stock: ${stockCheck.currentStock}kg`, 400);
                    }

                    // Create FG_OUT movement to remove the produced goods
                    await db.insert(stockMovements).values({
                        date: new Date(),
                        movementType: 'FG_OUT',
                        itemType: 'finished_product',
                        finishedProductId: output.finishedProductId,
                        quantityIn: '0',
                        quantityOut: output.outputQuantity,
                        runningBalance: '0', // Will be calculated by trigger or ignored for now
                        referenceType: 'batch_delete',
                        referenceCode: batch.code,
                        referenceId: id,
                        reason: `Batch ${batch.code} deleted - finished goods reversed`
                    });
                    console.log(`✓ Reversed FG output for ${batch.code}: -${output.outputQuantity}kg`);
                }
            }

            // 2. Reverse Input (RAW_IN) - same as in-progress logic below
            // We flow through to the standard input reversal logic
        } else if (batch.status !== 'in-progress') {
            // Cancelled batches might be deletable if we just want to clean up record, 
            // but for now let's stick to active/completed states.
            throw createError('Cannot delete cancelled batches', 400);
        }

        // Get batch inputs to reverse stock movements
        const batchInputs = await db.select().from(productionBatchInputs).where(eq(productionBatchInputs.batchId, id));

        // Reverse stock movements (add back the consumed raw materials)
        for (const input of batchInputs) {
            // Calculate current stock for running balance
            const stockValidation = await validateRawMaterialStock(input.rawMaterialId, 0);

            await db.insert(stockMovements).values({
                date: new Date(),
                movementType: 'RAW_IN',
                itemType: 'raw_material',
                rawMaterialId: input.rawMaterialId,
                quantityIn: input.quantity,
                quantityOut: '0',
                runningBalance: String(stockValidation.currentStock + parseFloat(input.quantity)),
                referenceType: 'batch_delete',
                referenceCode: batch.code,
                referenceId: id,
                reason: `Batch ${batch.code} deleted - raw material restored`
            });

            // Restore roll status back to "In Stock" if it was consumed
            if (input.materialBatchId) {
                console.log(`🔍 Processing materialBatchId: ${input.materialBatchId}`);
                try {
                    // Parse JSON array of roll IDs
                    const rollIds = JSON.parse(input.materialBatchId);
                    if (Array.isArray(rollIds)) {
                        for (const rollId of rollIds) {
                            const [roll] = await db.select().from(rawMaterialRolls).where(eq(rawMaterialRolls.id, rollId));
                            if (roll) {
                                // Restore roll if it was marked consumed
                                // Also restore weight if it was partially consumed (for now assuming full restore of what was taken)
                                // Since we don't track exact "deducted amount per roll" easily in `batchInputs` (it just has total quantity),
                                // we mostly rely on status. A more robust way would be to check if we can restore specific weights.
                                // For Simplicity/Robustness: We set status to 'In Stock'.
                                // If it was a partial cut, we might need to rely on the roll's current netWeight which should be correct 
                                // (remaining weight). But if we want to restore the USED weight, we'd need to add it back.
                                // LIMITATION: partial consuption restoration logic is complex without detailed ledger of "roll X usage for batch Y".
                                // CURRENT LOGIC: Restores status to 'In Stock'. 

                                // FIX: If roll is "Consumed", we must restore it.
                                if (roll.status === 'Consumed') {
                                    await db.update(rawMaterialRolls)
                                        .set({
                                            status: 'In Stock',
                                            updatedAt: new Date()
                                        })
                                        .where(eq(rawMaterialRolls.id, rollId));
                                    console.log(`✓ Restored roll ${roll.rollCode} to In Stock`);
                                }
                            }
                        }
                    }
                } catch (e) {
                    // Backward compatibility: If JSON parse fails, try as single roll ID
                    try {
                        const [roll] = await db.select().from(rawMaterialRolls).where(eq(rawMaterialRolls.id, input.materialBatchId));
                        if (roll && roll.status === 'Consumed') {
                            await db.update(rawMaterialRolls)
                                .set({ status: 'In Stock', updatedAt: new Date() })
                                .where(eq(rawMaterialRolls.id, input.materialBatchId));
                            console.log(`✓ Restored roll ${roll.rollCode} to In Stock`);
                        }
                    } catch (err) {
                        console.error(`Error restoring single roll ${input.materialBatchId}:`, err);
                    }
                }
            }
        }

        // Delete batch outputs
        await db.delete(productionBatchOutputs).where(eq(productionBatchOutputs.batchId, id));

        // Delete batch inputs
        await db.delete(productionBatchInputs).where(eq(productionBatchInputs.batchId, id));

        // Delete the batch
        await db.delete(productionBatches).where(eq(productionBatches.id, id));

        res.json(successResponse({ message: 'Batch deleted successfully' }));
    } catch (error) {
        next(error);
    }
});

// ============================================================
// UPDATE/EDIT PRODUCTION BATCH
// ============================================================

/**
 * PUT /production/batches/:id
 * Update a production batch (only if in-progress)
 * 
 * Process:
 * 1. Revert original allocations (restore rolls and stock)
 * 2. Apply new allocations
 */
router.put('/batches/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const {
            allocationDate,
            machineId,
            inputs, // Array of { rawMaterialId, quantity, materialBatchId? }
            outputs // Array of finishedProductId
        } = req.body;

        // Get the existing batch
        const batch = await db.query.productionBatches.findFirst({
            where: eq(productionBatches.id, id),
            with: {
                machine: true,
                inputs: true,
                outputs: true
            }
        });

        if (!batch) throw createError('Batch not found', 404);
        if (batch.status !== 'in-progress') {
            throw createError('Can only edit in-progress batches', 400);
        }

        // Validate new inputs
        let batchInputs: { rawMaterialId: string, quantity: number, materialBatchId?: string }[] = [];
        if (inputs && Array.isArray(inputs) && inputs.length > 0) {
            batchInputs = inputs.map((i: any) => ({
                rawMaterialId: i.rawMaterialId,
                quantity: parseFloat(i.quantity),
                materialBatchId: i.materialBatchId
            }));
        } else {
            throw createError('At least one input material required', 400);
        }

        if (batchInputs.length > 6) throw createError('Maximum 6 input materials allowed', 400);

        // Validate new outputs
        let batchOutputs: string[] = [];
        if (outputs && Array.isArray(outputs) && outputs.length > 0) {
            batchOutputs = outputs;
        }
        if (batchOutputs.length > 4) throw createError('Maximum 4 target products allowed', 400);

        // Step 1: REVERT original allocations
        // Restore rolls and stock from original inputs
        for (const input of batch.inputs) {
            // Calculate current stock for running balance
            const stockValidation = await validateRawMaterialStock(input.rawMaterialId, 0);

            // Reverse stock movement
            await db.insert(stockMovements).values({
                date: new Date(),
                movementType: 'RAW_IN',
                itemType: 'raw_material',
                rawMaterialId: input.rawMaterialId,
                quantityIn: input.quantity,
                quantityOut: '0',
                runningBalance: String(stockValidation.currentStock + parseFloat(input.quantity)),
                referenceType: 'batch_edit',
                referenceCode: batch.code,
                referenceId: id,
                reason: `Batch ${batch.code} edited - original allocation reversed`
            });

            // Restore roll status
            if (input.materialBatchId) {
                try {
                    const rollIds = JSON.parse(input.materialBatchId);
                    if (Array.isArray(rollIds)) {
                        for (const rollId of rollIds) {
                            await db.update(rawMaterialRolls)
                                .set({
                                    status: 'In Stock',
                                    updatedAt: new Date()
                                })
                                .where(eq(rawMaterialRolls.id, rollId));
                        }
                    }
                } catch (e) {
                    await db.update(rawMaterialRolls)
                        .set({
                            status: 'In Stock',
                            updatedAt: new Date()
                        })
                        .where(eq(rawMaterialRolls.id, input.materialBatchId));
                }
            }
        }

        // Delete old inputs and outputs
        await db.delete(productionBatchInputs).where(eq(productionBatchInputs.batchId, id));
        await db.delete(productionBatchOutputs).where(eq(productionBatchOutputs.batchId, id));

        // Step 2: APPLY new allocations
        // Validate stock for all new inputs
        let totalInputQty = 0;
        for (const input of batchInputs) {
            if (isNaN(input.quantity) || input.quantity <= 0) {
                throw createError('Invalid input quantity', 400);
            }
            const stockValidation = await validateRawMaterialStock(input.rawMaterialId, input.quantity);
            if (!stockValidation.isValid) {
                throw createError(`Stock check failed for material: ${stockValidation.message}`, 400);
            }
            totalInputQty += input.quantity;
        }

        // Verify machine is active
        const [machine] = await db.select().from(machines).where(eq(machines.id, machineId));
        if (!machine || machine.status !== 'Active') {
            throw createError('Machine not available or inactive', 400);
        }

        // Insert new inputs with roll consumption
        for (const input of batchInputs) {
            let consumedRollIds: string[] = [];

            const hasValidRollId = input.materialBatchId &&
                typeof input.materialBatchId === 'string' &&
                input.materialBatchId.trim().length > 0;

            if (hasValidRollId) {
                const [roll] = await db.select().from(rawMaterialRolls).where(eq(rawMaterialRolls.id, input.materialBatchId!));
                if (!roll) {
                    throw createError(`Roll not found: ${input.materialBatchId}`, 404);
                }
                const rollWeight = parseFloat(roll.netWeight);
                if (input.quantity > rollWeight) {
                    throw createError(`Requested quantity (${input.quantity}kg) exceeds roll weight (${rollWeight}kg) for ${roll.rollCode}`, 400);
                }

                await db.update(rawMaterialRolls)
                    .set({ status: 'Consumed', updatedAt: new Date() })
                    .where(eq(rawMaterialRolls.id, input.materialBatchId!));

                consumedRollIds.push(input.materialBatchId!);
            } else {
                // FIFO allocation
                const availableRolls = await db.query.rawMaterialRolls.findMany({
                    where: (rolls, { and, eq }) => and(
                        eq(rolls.rawMaterialId, input.rawMaterialId),
                        eq(rolls.status, 'In Stock')
                    ),
                    orderBy: (rolls, { asc }) => [asc(rolls.createdAt)]
                });

                let remainingToConsume = input.quantity;
                for (const roll of availableRolls) {
                    if (remainingToConsume <= 0) break;
                    await db.update(rawMaterialRolls)
                        .set({ status: 'Consumed', updatedAt: new Date() })
                        .where(eq(rawMaterialRolls.id, roll.id));
                    consumedRollIds.push(roll.id);
                    remainingToConsume -= parseFloat(roll.netWeight);
                }
            }

            await db.insert(productionBatchInputs).values({
                batchId: id,
                rawMaterialId: input.rawMaterialId,
                materialBatchId: consumedRollIds.length > 0 ? JSON.stringify(consumedRollIds) : null,
                quantity: String(input.quantity)
            });

            // Create new stock movement
            const stockValidation = await validateRawMaterialStock(input.rawMaterialId, 0);
            await db.insert(stockMovements).values({
                date: new Date(),
                movementType: 'RAW_OUT',
                itemType: 'raw_material',
                rawMaterialId: input.rawMaterialId,
                quantityIn: '0',
                quantityOut: String(input.quantity),
                runningBalance: String(stockValidation.currentStock - input.quantity),
                referenceType: 'production',
                referenceCode: batch.code,
                referenceId: id,
                reason: `Batch ${batch.code} edited - new allocation to ${machine.name}`,
            });
        }

        // Insert new outputs
        for (const productId of batchOutputs) {
            await db.insert(productionBatchOutputs).values({
                batchId: id,
                finishedProductId: productId,
                outputQuantity: null
            });
        }

        // Update batch header
        await db.update(productionBatches)
            .set({
                allocationDate: allocationDate ? new Date(allocationDate) : batch.allocationDate,
                machineId,
                rawMaterialId: batchInputs[0].rawMaterialId,
                finishedProductId: batchOutputs.length > 0 ? batchOutputs[0] : null,
                inputQuantity: String(totalInputQty),
                updatedAt: new Date()
            })
            .where(eq(productionBatches.id, id));

        // Fetch updated batch for response
        const updatedBatch = await db.query.productionBatches.findFirst({
            where: eq(productionBatches.id, id),
            with: {
                machine: true,
                rawMaterial: true,
                finishedProduct: true,
                inputs: { with: { rawMaterial: true } },
                outputs: { with: { finishedProduct: true } }
            }
        });

        res.json(successResponse(updatedBatch));
    } catch (error) {
        next(error);
    }
});

// ============================================================
// REVERSE/UNDO PRODUCTION BATCH
// ============================================================

/**
 * POST /production/batches/:id/reverse
 * Reverse a completed or partially-completed production batch
 * 
 * Options:
 * - restoreToInProgress: true (default) - Restores batch to in-progress for FIFO
 * - restoreToInProgress: false - Cancels the batch completely
 * 
 * Process:
 * 1. Validate batch is completed/partially-completed
 * 2. Reverse finished goods stock movements (FG_OUT)
 * 3. Restore raw materials stock movements (RAW_IN)
 * 4. Restore rolls to "In Stock" status
 * 5. Update batch status (in-progress or cancelled)
 */
router.post('/batches/:id/reverse', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const { restoreToInProgress = true } = req.body; // Default: maintain FIFO order

        console.log(`🔄 Reversing batch ${id}, restoreToInProgress: ${restoreToInProgress}`);

        // Get the batch with all related data
        const batch = await db.query.productionBatches.findFirst({
            where: eq(productionBatches.id, id),
            with: {
                inputs: true,
                outputs: true,
                machine: true
            }
        });

        if (!batch) throw createError('Batch not found', 404);

        // Validate batch can be reversed
        if (batch.status === 'cancelled') {
            throw createError('Cannot reverse a cancelled batch', 400);
        }
        if (batch.status === 'in-progress') {
            throw createError('Cannot reverse an in-progress batch (nothing to reverse)', 400);
        }
        if (batch.status !== 'completed' && batch.status !== 'partially-completed') {
            throw createError(`Cannot reverse batch with status: ${batch.status}`, 400);
        }

        console.log(`✓ Batch ${batch.code} status: ${batch.status}, can be reversed`);

        // Step 1: Reverse Finished Goods Stock Movements
        // Remove produced items from finished goods inventory
        for (const output of batch.outputs) {
            if (!output.outputQuantity || parseFloat(output.outputQuantity) <= 0) continue;

            const qty = parseFloat(output.outputQuantity);

            // Create FG_OUT movement to remove from stock
            await db.insert(stockMovements).values({
                date: new Date(),
                movementType: 'FG_OUT',
                itemType: 'finished_product',
                finishedProductId: output.finishedProductId,
                quantityIn: '0',
                quantityOut: String(qty),
                runningBalance: '0', // Will be calculated by inventory system
                referenceType: 'batch_reversal',
                referenceCode: batch.code,
                referenceId: id,
                reason: `Batch ${batch.code} reversed - removing finished goods from stock`,
            });

            console.log(`  ✓ Reversed FG output: ${qty}kg for product ${output.finishedProductId}`);
        }

        // Step 2: Restore Raw Materials Stock Movements
        // Add back consumed raw materials to inventory
        for (const input of batch.inputs) {
            const qty = parseFloat(input.quantity);

            // Create RAW_IN movement to restore to stock
            await db.insert(stockMovements).values({
                date: new Date(),
                movementType: 'RAW_IN',
                itemType: 'raw_material',
                rawMaterialId: input.rawMaterialId,
                quantityIn: input.quantity,
                quantityOut: '0',
                runningBalance: '0', // Will be calculated by inventory system
                referenceType: 'batch_reversal',
                referenceCode: batch.code,
                referenceId: id,
                reason: `Batch ${batch.code} reversed - restoring raw materials to stock`,
            });

            console.log(`  ✓ Restored RM input: ${qty}kg for material ${input.rawMaterialId}`);
        }

        // Step 3: Restore Roll Status to "In Stock"
        for (const input of batch.inputs) {
            if (input.materialBatchId) {
                console.log(`🔍 Processing materialBatchId: ${input.materialBatchId}`);
                try {
                    // Parse JSON array of roll IDs
                    const rollIds = JSON.parse(input.materialBatchId);
                    if (Array.isArray(rollIds)) {
                        console.log(`✓ Roll IDs is an array with ${rollIds.length} items`);
                        for (const rollId of rollIds) {
                            const [roll] = await db.select().from(rawMaterialRolls).where(eq(rawMaterialRolls.id, rollId));
                            if (roll && roll.status === 'Consumed') {
                                await db.update(rawMaterialRolls)
                                    .set({
                                        status: 'In Stock',
                                        updatedAt: new Date()
                                    })
                                    .where(eq(rawMaterialRolls.id, rollId));
                                console.log(`  ✓ Restored roll ${roll.rollCode} to In Stock`);
                            }
                        }
                    }
                } catch (e) {
                    // Fallback: try as single roll ID
                    const [roll] = await db.select().from(rawMaterialRolls).where(eq(rawMaterialRolls.id, input.materialBatchId));
                    if (roll && roll.status === 'Consumed') {
                        await db.update(rawMaterialRolls)
                            .set({
                                status: 'In Stock',
                                updatedAt: new Date()
                            })
                            .where(eq(rawMaterialRolls.id, input.materialBatchId));
                        console.log(`  ✓ Restored roll ${roll.rollCode} to In Stock`);
                    }
                }
            }
        }

        // Step 4: Update Batch Status
        let updateData: any;
        let statusMessage: string;

        if (restoreToInProgress) {
            // Option A: Restore to in-progress (maintains FIFO order)
            updateData = {
                status: 'in-progress',
                outputQuantity: null,
                completionDate: null,
                lossQuantity: null,
                lossPercentage: null,
                lossExceeded: false,
                updatedAt: new Date(),
            };
            statusMessage = 'Batch restored to in-progress - ready for FIFO consumption';
            console.log(`✓ Restoring batch to in-progress status`);
        } else {
            // Option B: Cancel the batch (removes from FIFO)
            updateData = {
                status: 'cancelled',
                updatedAt: new Date(),
            };
            statusMessage = 'Batch cancelled - removed from production flow';
            console.log(`✓ Marking batch as cancelled`);
        }

        await db.update(productionBatches)
            .set(updateData)
            .where(eq(productionBatches.id, id));

        // Delete batch outputs if restoring to in-progress
        if (restoreToInProgress) {
            await db.delete(productionBatchOutputs).where(eq(productionBatchOutputs.batchId, id));
            console.log(`  ✓ Cleared batch outputs`);
        }

        // Fetch updated batch
        const updatedBatch = await db.query.productionBatches.findFirst({
            where: eq(productionBatches.id, id),
            with: {
                machine: true,
                rawMaterial: true,
                finishedProduct: true,
                inputs: { with: { rawMaterial: true } },
                outputs: { with: { finishedProduct: true } }
            }
        });

        console.log(`✅ Batch ${batch.code} reversed successfully`);

        res.json(successResponse({
            batch: updatedBatch,
            message: statusMessage,
            warning: 'Stock movements have been reversed. Please verify inventory is correct.',
            fifoMaintained: restoreToInProgress
        }));
    } catch (error) {
        next(error);
    }
});


export default router;

