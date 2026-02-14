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
import { validateRawMaterialStock } from '../services/inventory.service';

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
                        rawMaterial: true,
                        materialBatch: {
                            with: {
                                purchaseBill: true
                            }
                        }
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
                // Try to fetch roll if materialBatchId exists
                let roll = null;
                let purchaseBill = null;

                if (input.materialBatchId) {
                    // Check if this is a roll ID
                    const [rollData] = await db.select()
                        .from(rawMaterialRolls)
                        .where(eq(rawMaterialRolls.id, input.materialBatchId));

                    if (rollData) {
                        roll = rollData;
                        // Get purchase bill for this roll
                        const [billData] = await db.select()
                            .from(purchaseBills)
                            .where(eq(purchaseBills.id, rollData.purchaseBillId));
                        purchaseBill = billData;
                    }
                }

                return {
                    ...input,
                    roll, // Roll details including rollCode
                    purchaseBill, // Bill details including code
                };
            }));

            return {
                ...batch,
                // Fallback for legacy frontend or unified access
                rawMaterial: batch.rawMaterial || batch.inputs[0]?.rawMaterial,
                finishedProduct: batch.finishedProduct || batch.outputs[0]?.finishedProduct,
                inputs: enhancedInputs,
                outputs: batch.outputs,
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


            // Handle specific roll selection if provided
            // materialBatchId is actually a ROLL ID from the dropdown (misnamed for backward compat)
            // Filter out: null, undefined, empty strings, or whitespace-only strings
            const hasValidRollId = input.materialBatchId &&
                typeof input.materialBatchId === 'string' &&
                input.materialBatchId.trim().length > 0;

            if (hasValidRollId) {
                // Look up the ROLL (not batch!)
                const [roll] = await db.select().from(rawMaterialRolls).where(eq(rawMaterialRolls.id, input.materialBatchId!));

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
                    .where(eq(rawMaterialRolls.id, input.materialBatchId!));

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

                    console.log(`✓ Auto-consumed roll ${roll.rollCode} (${rollWeight}kg) via FIFO`);
                    remainingToConsume -= rollWeight;
                }
            }



            await db.insert(productionBatchInputs).values({
                batchId: batch.id,
                rawMaterialId: input.rawMaterialId,
                materialBatchId: null, // Not using batch tracking - rolls are tracked by status change
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

        // Only allow deletion of in-progress batches
        if (batch.status !== 'in-progress') {
            throw createError('Cannot delete completed or cancelled batches', 400);
        }

        // Get batch inputs to reverse stock movements
        const batchInputs = await db.select().from(productionBatchInputs).where(eq(productionBatchInputs.batchId, id));

        // Reverse stock movements (add back the consumed raw materials)
        for (const input of batchInputs) {
            await db.insert(stockMovements).values({
                date: new Date(),
                movementType: 'RAW_IN',
                itemType: 'raw_material',
                rawMaterialId: input.rawMaterialId,
                quantityIn: input.quantity,
                quantityOut: '0',
                referenceType: 'batch_delete',
                referenceCode: batch.code,
                referenceId: id,
                reason: `Batch ${batch.code} deleted - stock restored`
            });

            // Update roll status back to "In Stock" if it was consumed
            if (input.materialBatchId) {
                // Check if this is a roll ID
                const [roll] = await db.select().from(rawMaterialRolls).where(eq(rawMaterialRolls.id, input.materialBatchId));
                if (roll) {
                    await db.update(rawMaterialRolls)
                        .set({ status: 'In Stock' })
                        .where(eq(rawMaterialRolls.id, input.materialBatchId));
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

export default router;

