/**
 * Inventory Routes
 * 
 * Provides API endpoints for inventory management including:
 * - Raw material stock view
 * - Finished goods stock view
 * - Stock movement ledger (audit trail)
 * - Manual stock adjustments
 * 
 * All stock data is calculated from the stock_movements table,
 * ensuring accurate, auditable inventory records.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { successResponse } from '../types/api';
import { createError } from '../middleware/errorHandler';
import {
    getAllRawMaterialsWithStock,
    getAllFinishedProductsWithStock,
    getAllMovementsWithDetails,
    createStockMovement,
    getRawMaterialMovements,
    getFinishedProductMovements,
    getInventorySummary,
    getAvailableBatches,
    validateRawMaterialStock,
    validateFinishedProductStock,
} from '../services/inventory.service';

const router = Router();

// ============================================================
// STOCK ENDPOINTS
// ============================================================

/**
 * GET /inventory/raw-materials
 * Get all raw materials with current stock levels
 */
router.get('/raw-materials', async (req: Request, res: Response, next: NextFunction) => {
    try {
        console.log('================================');
        console.log('GET /inventory/raw-materials - START');

        const materials = await getAllRawMaterialsWithStock();

        console.log(`✓ Retrieved ${materials.length} materials with stock`);
        if (materials.length > 0) {
            console.log('  Sample:', {
                name: materials[0].name,
                stock: materials[0].stock
            });
        }
        console.log('✅ GET /inventory/raw-materials - SUCCESS');
        console.log('================================\n');

        res.json(successResponse(materials));
    } catch (error) {
        console.log('❌ GET /inventory/raw-materials - ERROR');
        console.error(error);
        console.log('================================\n');
        next(error);
    }
});

/**
 * GET /inventory/raw-materials/:id/batches
 * Get available batches for a raw material for FIFO allocation
 */
router.get('/raw-materials/:id/batches', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const batches = await getAvailableBatches(id);
        res.json(successResponse(batches));
    } catch (error) {
        next(error);
    }
});

/**
 * GET /inventory/raw-materials/:id/rolls
 * Get all rolls for a raw material with FIFO ordering (oldest first)
 * Shows all rolls across all purchase bills for this material
 */
router.get('/raw-materials/:id/rolls', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const { db } = await import('../db/index');
        const { rawMaterialRolls, purchaseBills } = await import('../db/schema');
        const { eq, asc } = await import('drizzle-orm');

        // Get all rolls for this material, ordered by creation date (FIFO)
        const rolls = await db.query.rawMaterialRolls.findMany({
            where: eq(rawMaterialRolls.rawMaterialId, id),
            with: {
                purchaseBill: {
                    columns: { code: true, date: true }
                }
            },
            orderBy: (rolls, { asc }) => [asc(rolls.createdAt)]
        });

        res.json(successResponse(rolls));
    } catch (error) {
        next(error);
    }
});

/**
 * GET /inventory/finished-goods
 * Get all finished products with current stock levels
 */
router.get('/finished-goods', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const products = await getAllFinishedProductsWithStock();
        res.json(successResponse(products));
    } catch (error) {
        next(error);
    }
});

/**
 * GET /inventory/summary
 * Get inventory summary with counts and alerts
 */
router.get('/summary', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const summary = await getInventorySummary();
        res.json(successResponse(summary));
    } catch (error) {
        next(error);
    }
});

// ============================================================
// STOCK MOVEMENT LEDGER
// ============================================================

/**
 * GET /inventory/movements
 * Get stock movement ledger for audit trail
 * Supports filtering by item type
 */
router.get('/movements', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const page = Math.max(1, parseInt(req.query.page as string) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
        const offset = (page - 1) * limit;
        const result = await getAllMovementsWithDetails(limit, offset);
        res.json(successResponse({
            data: result.data,
            total: result.total,
            page,
            limit,
            totalPages: Math.ceil(result.total / limit),
        }));
    } catch (error) {
        next(error);
    }
});

/**
 * GET /inventory/movements/raw-material/:id
 * Get movement history for a specific raw material
 */
router.get('/movements/raw-material/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const limit = parseInt(req.query.limit as string) || 50;
        const movements = await getRawMaterialMovements(id, limit);
        res.json(successResponse(movements));
    } catch (error) {
        next(error);
    }
});

/**
 * GET /inventory/movements/finished-product/:id
 * Get movement history for a specific finished product
 */
router.get('/movements/finished-product/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const limit = parseInt(req.query.limit as string) || 50;
        const movements = await getFinishedProductMovements(id, limit);
        res.json(successResponse(movements));
    } catch (error) {
        next(error);
    }
});

// ============================================================
// MANUAL ADJUSTMENTS
// ============================================================

/**
 * POST /inventory/adjust
 * Create a manual stock adjustment
 * Used for cycle counts, damage write-offs, etc.
 * 
 * Body:
 * - itemType: 'raw_material' | 'finished_product'
 * - itemId: UUID of the item
 * - quantity: Positive for addition, negative for deduction
 * - reason: Reason for adjustment
 */
router.post('/adjust', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { itemType, itemId, quantity, reason } = req.body;
        const { db } = await import('../db/index');
        const { stockMovements, rawMaterialRolls, purchaseBills, suppliers } = await import('../db/schema');
        const { eq, and, asc } = await import('drizzle-orm');

        // Validate inputs
        if (!itemType || !itemId || quantity === undefined || !reason) {
            throw createError('Missing required fields: itemType, itemId, quantity, reason', 400);
        }

        if (!['raw_material', 'finished_product'].includes(itemType)) {
            throw createError('Invalid itemType. Must be raw_material or finished_product', 400);
        }

        const adjustmentQty = parseFloat(quantity);
        if (isNaN(adjustmentQty) || adjustmentQty === 0) {
            throw createError('Invalid quantity. Must be a non-zero number', 400);
        }

        // ===========================================
        // RAW MATERIAL ADJUSTMENT (Roll-Based Logic)
        // ===========================================
        if (itemType === 'raw_material') {
            if (adjustmentQty > 0) {
                // ADDITION: Create a new "Adjustment" Roll
                // We need a dummy Purchase Bill for traceability if one doesn't exist, or just link to a system bill
                // For simplicity, we'll create a standalone roll with a special prefix

                // Generate a unique roll code
                const rollCode = `RW-ADJ-${Date.now().toString().slice(-6)}`;

                // We need a purchase bill ID to satisfy foreign key. 
                // Best practice: Find or Create a "Stock Adjustment" dummy bill/supplier
                // For now, we'll try to find any existing bill to attach to, or create a dummy structure.
                // safer approach: We need to loosen the FK or ensure a dummy bill exists.
                // Let's check if we can insert without bill? No, FK is NOT NULL.

                // Strategy: Find a "Stock Adjustment" bill or create one
                let [adjBill] = await db.select().from(purchaseBills).where(eq(purchaseBills.code, 'BILL-ADJ'));
                if (!adjBill) {
                    // Create dummy supplier if needed
                    let [adjSupplier] = await db.select().from(suppliers).where(eq(suppliers.name, 'System Adjustment'));
                    if (!adjSupplier) {
                        [adjSupplier] = await db.insert(suppliers).values({
                            code: 'SUP-ADJ',
                            name: 'System Adjustment',
                            contact: 'System',
                        }).returning();
                    }

                    [adjBill] = await db.insert(purchaseBills).values({
                        code: 'BILL-ADJ',
                        invoiceNumber: 'INV-ADJ',
                        date: new Date(),
                        supplierId: adjSupplier.id,
                        total: '0',
                        grandTotal: '0',
                        status: 'Confirmed'
                    }).returning();
                }

                await db.insert(rawMaterialRolls).values({
                    purchaseBillId: adjBill.id,
                    rawMaterialId: itemId,
                    rollCode: rollCode,
                    grossWeight: String(adjustmentQty),
                    netWeight: String(adjustmentQty),
                    pipeWeight: '0',
                    length: '0',
                    gsm: '0',
                    status: 'In Stock'
                });

                console.log(`✓ Created adjustment roll ${rollCode} for +${adjustmentQty}kg`);

            } else {
                // DEDUCTION: FIFO Consumption
                const deductQty = Math.abs(adjustmentQty);

                // 1. Validate Stock Availability FIRST
                const stockCheck = await validateRawMaterialStock(itemId, deductQty);
                if (!stockCheck.isValid) {
                    throw createError(`Insufficient stock. Cannot deduct ${deductQty}kg from ${stockCheck.currentStock}kg`, 400);
                }

                let remainingToDeduct = deductQty;

                // 2. Get In Stock rolls sorted by Date (FIFO)
                const rolls = await db.select().from(rawMaterialRolls)
                    .where(and(
                        eq(rawMaterialRolls.rawMaterialId, itemId),
                        eq(rawMaterialRolls.status, 'In Stock')
                    ))
                    .orderBy(asc(rawMaterialRolls.createdAt));

                // 3. Consume rolls
                for (const roll of rolls) {
                    if (remainingToDeduct <= 0) break;

                    const rollWeight = parseFloat(roll.netWeight);

                    if (rollWeight <= remainingToDeduct) {
                        // Consume entire roll
                        await db.update(rawMaterialRolls)
                            .set({ status: 'Consumed', updatedAt: new Date() })
                            .where(eq(rawMaterialRolls.id, roll.id));

                        remainingToDeduct -= rollWeight;
                        console.log(`✓ Consumed roll ${roll.rollCode} (${rollWeight}kg)`);
                    } else {
                        // Partial deduction (Update weight)
                        const newWeight = rollWeight - remainingToDeduct;
                        await db.update(rawMaterialRolls)
                            .set({
                                netWeight: String(newWeight),
                                updatedAt: new Date()
                            })
                            .where(eq(rawMaterialRolls.id, roll.id));

                        console.log(`✓ Reduced roll ${roll.rollCode} from ${rollWeight}kg to ${newWeight}kg`);
                        remainingToDeduct = 0;
                    }
                }

                if (remainingToDeduct > 0.001) {
                    // This should theoretically not happen due to the validation above, 
                    // unless there's a concurrency issue or database inconsistency.
                    throw createError(`System Error: Stock validation passed but could not find enough rolls to deduct. Mismatch: ${remainingToDeduct}kg`, 500);
                }
            }
        } else if (itemType === 'finished_product') {
            // ===========================================
            // FINISHED PRODUCT ADJUSTMENT
            // ===========================================
            if (adjustmentQty < 0) {
                const deductQty = Math.abs(adjustmentQty);
                const stockCheck = await validateFinishedProductStock(itemId, deductQty);
                if (!stockCheck.isValid) {
                    throw createError(`Insufficient stock. Cannot deduct ${deductQty}kg from ${stockCheck.currentStock}kg`, 400);
                }
            }
        }

        // ===========================================
        // CREATE LEDGER MOVEMENT
        // ===========================================
        const movement = await createStockMovement({
            date: new Date(),
            movementType: 'ADJUSTMENT',
            itemType: itemType as 'raw_material' | 'finished_product',
            rawMaterialId: itemType === 'raw_material' ? itemId : undefined,
            finishedProductId: itemType === 'finished_product' ? itemId : undefined,
            quantityIn: adjustmentQty > 0 ? adjustmentQty : 0,
            quantityOut: adjustmentQty < 0 ? Math.abs(adjustmentQty) : 0,
            referenceType: 'adjustment',
            referenceCode: `ADJ-${Date.now()}`,
            referenceId: crypto.randomUUID(),
            reason: reason,
        });

        res.json(successResponse({
            message: 'Stock adjustment recorded',
            movement,
        }));
    } catch (error) {
        next(error);
    }
});

export default router;
