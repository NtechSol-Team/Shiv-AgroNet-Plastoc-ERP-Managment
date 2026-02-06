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
import { productionBatches, machines, rawMaterials, finishedProducts, stockMovements, productionBatchInputs, productionBatchOutputs, rawMaterialBatches } from '../db/schema';
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
                    with: { rawMaterial: true }
                },
                outputs: {
                    with: { finishedProduct: true }
                }
            },
            orderBy: (batches, { desc }) => [desc(batches.createdAt)],
        });

        const formatted = batches.map(batch => ({
            ...batch,
            // Fallback for legacy frontend or unified access
            rawMaterial: batch.rawMaterial || batch.inputs[0]?.rawMaterial,
            finishedProduct: batch.finishedProduct || batch.outputs[0]?.finishedProduct,
            inputs: batch.inputs,
            outputs: batch.outputs,
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
        if (batchOutputs.length === 0) throw createError('At least one target product required', 400);
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
            finishedProductId: batchOutputs[0], // Primary target
            inputQuantity: String(totalInputQty),
            status: 'in-progress',
        }).returning();

        // Insert Inputs & Create Movements
        for (const input of batchInputs) {

            // Handle specific batch consumption if provided
            if (input.materialBatchId) {
                const [batch] = await db.select().from(rawMaterialBatches).where(eq(rawMaterialBatches.id, input.materialBatchId));

                if (!batch) {
                    throw createError('Selected raw material batch not found', 404);
                }

                const currentUsed = parseFloat(batch.quantityUsed || '0');
                const totalQty = parseFloat(batch.quantity);
                const available = totalQty - currentUsed;

                if (input.quantity > available) {
                    throw createError(`Insufficient quantity in batch ${batch.batchCode}. Available: ${available}, Requested: ${input.quantity}`, 400);
                }

                // Update Batch Usage
                const newUsed = currentUsed + input.quantity;
                const newStatus = newUsed >= (totalQty - 0.01) ? 'Exhausted' : 'Active'; // Tolerance

                await db.update(rawMaterialBatches)
                    .set({
                        quantityUsed: String(newUsed),
                        status: newStatus,
                        updatedAt: new Date()
                    })
                    .where(eq(rawMaterialBatches.id, input.materialBatchId));
            }

            await db.insert(productionBatchInputs).values({
                batchId: batch.id,
                rawMaterialId: input.rawMaterialId,
                materialBatchId: input.materialBatchId || null, // Link to batch
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

export default router;
