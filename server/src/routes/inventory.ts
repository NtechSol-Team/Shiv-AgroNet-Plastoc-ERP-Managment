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
        const limit = parseInt(req.query.limit as string) || 100;
        const movements = await getAllMovementsWithDetails(limit);
        res.json(successResponse(movements));
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

        // Create adjustment movement
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
