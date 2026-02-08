/**
 * Inventory Service
 * 
 * Provides core inventory management functions based on stock movements.
 * Stock is calculated dynamically from movement ledger, ensuring
 * audit-friendly, accurate inventory tracking.
 * 
 * Key Features:
 * - Dynamic stock calculation from movements
 * - Stock validation before operations
 * - Movement creation with running balance
 * - Audit trail support
 * 
 * Movement Types:
 * - RAW_IN: Raw material received (purchase)
 * - RAW_OUT: Raw material consumed (production)
 * - FG_IN: Finished goods produced (production completion)
 * - FG_OUT: Finished goods sold (sales)
 * - ADJUSTMENT: Manual stock adjustments
 */

import { db } from '../db/index';
import { stockMovements, rawMaterials, finishedProducts, purchaseBills, purchaseBillItems, productionBatches, rawMaterialBatches } from '../db/schema';
import { eq, and, sql, desc } from 'drizzle-orm';
import { invalidateInventorySummary, invalidateDashboardKPIs } from './precomputed.service';

// ============================================================
// TYPE DEFINITIONS
// ============================================================

export type MovementType = 'RAW_IN' | 'RAW_OUT' | 'FG_IN' | 'FG_OUT' | 'ADJUSTMENT';

export interface StockMovementInput {
    date: Date;
    movementType: MovementType;
    itemType: 'raw_material' | 'finished_product';
    rawMaterialId?: string;
    finishedProductId?: string;
    quantityIn?: number;
    quantityOut?: number;
    referenceType: string;
    referenceCode: string;
    referenceId: string;
    reason: string;
}

export interface StockValidationResult {
    isValid: boolean;
    currentStock: number;
    requestedQuantity: number;
    shortfall: number;
    message: string;
}

// ============================================================
// STOCK CALCULATION FUNCTIONS
// ============================================================

/**
 * Calculate current stock for a raw material from movements
 * Stock = SUM(quantity_in) - SUM(quantity_out)
 * 
 * @param rawMaterialId - UUID of the raw material
 * @returns Current stock quantity
 */
export async function getRawMaterialStock(rawMaterialId: string): Promise<number> {
    const result = await db
        .select({
            totalIn: sql<string>`COALESCE(SUM(${stockMovements.quantityIn}), 0)`,
            totalOut: sql<string>`COALESCE(SUM(${stockMovements.quantityOut}), 0)`,
        })
        .from(stockMovements)
        .where(
            and(
                eq(stockMovements.itemType, 'raw_material'),
                eq(stockMovements.rawMaterialId, rawMaterialId)
            )
        );

    const totalIn = parseFloat(result[0]?.totalIn || '0');
    const totalOut = parseFloat(result[0]?.totalOut || '0');

    return totalIn - totalOut;
}

/**
 * Calculate current stock for a finished product from movements
 * 
 * @param finishedProductId - UUID of the finished product
 * @returns Current stock quantity
 */
export async function getFinishedProductStock(finishedProductId: string): Promise<number> {
    const result = await db
        .select({
            totalIn: sql<string>`COALESCE(SUM(${stockMovements.quantityIn}), 0)`,
            totalOut: sql<string>`COALESCE(SUM(${stockMovements.quantityOut}), 0)`,
        })
        .from(stockMovements)
        .where(
            and(
                eq(stockMovements.itemType, 'finished_product'),
                eq(stockMovements.finishedProductId, finishedProductId)
            )
        );

    const totalIn = parseFloat(result[0]?.totalIn || '0');
    const totalOut = parseFloat(result[0]?.totalOut || '0');

    return totalIn - totalOut;
}

/**
 * Get average purchase price per KG for a raw material
 * Calculated from all Confirmed purchase bills: (Total Amount ÷ Total Quantity)
 * 
 * @param rawMaterialId - UUID of the raw material
 * @returns Average price per KG, or 0 if no purchases
 */
export async function getRawMaterialAveragePrice(rawMaterialId: string): Promise<number> {
    const result = await db
        .select({
            totalAmount: sql<string>`COALESCE(SUM(${purchaseBillItems.amount}), 0)`,
            totalQuantity: sql<string>`COALESCE(SUM(${purchaseBillItems.quantity}), 0)`,
        })
        .from(purchaseBillItems)
        .innerJoin(purchaseBills, eq(purchaseBillItems.billId, purchaseBills.id))
        .where(
            and(
                eq(purchaseBillItems.rawMaterialId, rawMaterialId),
                eq(purchaseBills.status, 'Confirmed')
            )
        );

    const totalAmount = parseFloat(result[0]?.totalAmount || '0');
    const totalQuantity = parseFloat(result[0]?.totalQuantity || '0');

    // Avoid division by zero
    if (totalQuantity === 0) return 0;

    return totalAmount / totalQuantity;
}

// ============================================================
// BATCH FETCHING FUNCTIONS (OPTIMIZED)
// ============================================================

/**
 * Get all raw materials with aggregated stock and price
 * Uses batch processing to avoid N+1 queries
 */
export async function getAllRawMaterialsWithStock() {
    // 1. Get all raw materials
    const materials = await db.select().from(rawMaterials);

    // 2. Aggregate Stock Movements (Batch)
    const stockResults = await db
        .select({
            id: stockMovements.rawMaterialId,
            totalIn: sql<string>`COALESCE(SUM(${stockMovements.quantityIn}), 0)`,
            totalOut: sql<string>`COALESCE(SUM(${stockMovements.quantityOut}), 0)`,
        })
        .from(stockMovements)
        .where(eq(stockMovements.itemType, 'raw_material'))
        .groupBy(stockMovements.rawMaterialId);

    const stockMap = new Map();
    stockResults.forEach(r => {
        if (r.id) stockMap.set(r.id, parseFloat(r.totalIn) - parseFloat(r.totalOut));
    });

    // 3. Aggregate Purchase Prices (Batch)
    const priceResults = await db
        .select({
            id: purchaseBillItems.rawMaterialId,
            totalAmount: sql<string>`COALESCE(SUM(${purchaseBillItems.amount}), 0)`,
            totalQuantity: sql<string>`COALESCE(SUM(${purchaseBillItems.quantity}), 0)`,
        })
        .from(purchaseBillItems)
        .innerJoin(purchaseBills, eq(purchaseBillItems.billId, purchaseBills.id))
        .where(eq(purchaseBills.status, 'Confirmed'))
        .groupBy(purchaseBillItems.rawMaterialId);

    const priceMap = new Map();
    priceResults.forEach(r => {
        const qty = parseFloat(r.totalQuantity);
        if (r.id && qty > 0) {
            priceMap.set(r.id, parseFloat(r.totalAmount) / qty);
        }
    });

    // 4. Merge results
    return materials.map(material => ({
        ...material,
        stock: (stockMap.get(material.id) || 0).toFixed(2),
        averagePrice: (priceMap.get(material.id) || 0).toFixed(2),
    }));
}

/**
 * Get all finished products with aggregated stock
 * Uses batch processing to avoid N+1 queries
 */
export async function getAllFinishedProductsWithStock() {
    // 1. Get all products
    const products = await db.select().from(finishedProducts);

    // 2. Aggregate Stock Movement (Batch)
    const stockResults = await db
        .select({
            id: stockMovements.finishedProductId,
            totalIn: sql<string>`COALESCE(SUM(${stockMovements.quantityIn}), 0)`,
            totalOut: sql<string>`COALESCE(SUM(${stockMovements.quantityOut}), 0)`,
        })
        .from(stockMovements)
        .where(eq(stockMovements.itemType, 'finished_product'))
        .groupBy(stockMovements.finishedProductId);

    const stockMap = new Map();
    stockResults.forEach(r => {
        if (r.id) stockMap.set(r.id, parseFloat(r.totalIn) - parseFloat(r.totalOut));
    });

    // 3. Get Last Batch Date (Optimization: Using subquery or simpler window if feasible, 
    // but for now, we'll keep it simple or skip if not critical. 
    // Optimization: Fetch ALL completed batches sorted by date, keep first per product in memory map.)
    const completedBatches = await db
        .select({
            pid: productionBatches.finishedProductId,
            code: productionBatches.code,
            date: productionBatches.completionDate,
        })
        .from(productionBatches)
        .where(eq(productionBatches.status, 'completed'))
        .orderBy(desc(productionBatches.completionDate));

    const lastBatchMap = new Map();
    // Since it's ordered by desc, the first one we encounter for a PID is the latest
    for (const batch of completedBatches) {
        if (batch.pid && !lastBatchMap.has(batch.pid)) {
            lastBatchMap.set(batch.pid, batch);
        }
    }

    // 4. Merge results
    return products.map(product => {
        const batch = lastBatchMap.get(product.id);
        return {
            ...product,
            stock: (stockMap.get(product.id) || 0).toFixed(2),
            lastBatchCode: batch?.code || null,
            lastBatchDate: batch?.date || null,
        };
    });
}

// ============================================================
// STOCK VALIDATION FUNCTIONS
// ============================================================

/**
 * Validate raw material stock before consumption
 * Used before production allocation
 * 
 * @param rawMaterialId - Material to check
 * @param requiredQuantity - Quantity needed
 * @returns Validation result with details
 */
export async function validateRawMaterialStock(
    rawMaterialId: string,
    requiredQuantity: number
): Promise<StockValidationResult> {
    const currentStock = await getRawMaterialStock(rawMaterialId);
    const isValid = currentStock >= requiredQuantity;

    return {
        isValid,
        currentStock,
        requestedQuantity: requiredQuantity,
        shortfall: isValid ? 0 : requiredQuantity - currentStock,
        message: isValid
            ? 'Stock available'
            : `Insufficient stock. Need ${requiredQuantity.toFixed(2)} kg, have ${currentStock.toFixed(2)} kg`,
    };
}

/**
 * Validate finished product stock before sales
 * 
 * @param finishedProductId - Product to check
 * @param requiredQuantity - Quantity needed
 * @returns Validation result with details
 */
export async function validateFinishedProductStock(
    finishedProductId: string,
    requiredQuantity: number
): Promise<StockValidationResult> {
    const currentStock = await getFinishedProductStock(finishedProductId);
    const isValid = currentStock >= requiredQuantity;

    return {
        isValid,
        currentStock,
        requestedQuantity: requiredQuantity,
        shortfall: isValid ? 0 : requiredQuantity - currentStock,
        message: isValid
            ? 'Stock available'
            : `Insufficient stock. Need ${requiredQuantity.toFixed(2)} kg, have ${currentStock.toFixed(2)} kg`,
    };
}

// ============================================================
// STOCK MOVEMENT CREATION
// ============================================================

/**
 * Create a stock movement entry with running balance calculation
 * This is the core function that modifies inventory
 * 
 * @param input - Movement details
 * @returns Created movement record
 */
export async function createStockMovement(input: StockMovementInput) {
    // Calculate running balance
    let runningBalance = 0;

    if (input.itemType === 'raw_material' && input.rawMaterialId) {
        runningBalance = await getRawMaterialStock(input.rawMaterialId);
    } else if (input.itemType === 'finished_product' && input.finishedProductId) {
        runningBalance = await getFinishedProductStock(input.finishedProductId);
    }

    // Apply this movement to running balance
    runningBalance += (input.quantityIn || 0) - (input.quantityOut || 0);

    // Insert the movement
    const [movement] = await db.insert(stockMovements).values({
        date: input.date,
        movementType: input.movementType,
        itemType: input.itemType,
        rawMaterialId: input.rawMaterialId,
        finishedProductId: input.finishedProductId,
        quantityIn: String(input.quantityIn || 0),
        quantityOut: String(input.quantityOut || 0),
        runningBalance: String(runningBalance),
        referenceType: input.referenceType,
        referenceCode: input.referenceCode,
        referenceId: input.referenceId,
        reason: input.reason,
    }).returning();

    // Invalidate precomputed caches after stock change
    invalidateInventorySummary();
    invalidateDashboardKPIs();

    return movement;
}

// ============================================================
// MOVEMENT QUERY FUNCTIONS
// ============================================================

/**
 * Get stock movement history for a raw material
 * Ordered by date descending (newest first)
 */
export async function getRawMaterialMovements(rawMaterialId: string, limit: number = 50) {
    return db
        .select()
        .from(stockMovements)
        .where(
            and(
                eq(stockMovements.itemType, 'raw_material'),
                eq(stockMovements.rawMaterialId, rawMaterialId)
            )
        )
        .orderBy(desc(stockMovements.date))
        .limit(limit);
}

/**
 * Get stock movement history for a finished product
 */
export async function getFinishedProductMovements(finishedProductId: string, limit: number = 50) {
    return db
        .select()
        .from(stockMovements)
        .where(
            and(
                eq(stockMovements.itemType, 'finished_product'),
                eq(stockMovements.finishedProductId, finishedProductId)
            )
        )
        .orderBy(desc(stockMovements.date))
        .limit(limit);
}

/**
 * Get all movements with related material/product info
 * Used for the audit ledger view
 * optimized to use Relation queries
 */
export async function getAllMovementsWithDetails(limit: number = 100) {
    return db.query.stockMovements.findMany({
        orderBy: (movements, { desc }) => [desc(movements.date)],
        limit,
        with: {
            rawMaterial: true,
            finishedProduct: true
        }
    });
}

// ============================================================
// INVENTORY SUMMARY FUNCTIONS
// ============================================================

/**
 * Get total inventory value summary
 * 
 * @returns Summary with counts and totals
 */
export async function getInventorySummary() {
    const materials = await getAllRawMaterialsWithStock();
    const products = await getAllFinishedProductsWithStock();

    const rawMaterialStock = materials.reduce((sum, m) => sum + parseFloat(m.stock), 0);
    const finishedGoodsStock = products.reduce((sum, p) => sum + parseFloat(p.stock), 0);

    // Calculate total value of raw materials
    const rawMaterialValue = materials.reduce((sum, m) => sum + (parseFloat(m.stock) * parseFloat(m.averagePrice)), 0);

    // Count low stock items
    const lowStockCount = materials.filter(m => parseFloat(m.stock) < parseFloat(m.reorderLevel || '100')).length;

    // Return flat structure matching frontend expectations
    return {
        rawMaterialStock,
        finishedGoodsStock,
        rawMaterialValue,
        lowStockCount,
        rawMaterialCount: materials.length,
        finishedGoodsCount: products.length,
    };
}

// ============================================================
// BATCH TRACEABILITY FUNCTIONS
// ============================================================

/**
 * Get available batches for a raw material (FIFO)
 * Returns batches with remaining quantity > 0
 */
export async function getAvailableBatches(rawMaterialId: string) {
    // NEW: Updated to include relations for traceability
    const batches = await db.query.rawMaterialBatches.findMany({
        where: and(
            eq(rawMaterialBatches.rawMaterialId, rawMaterialId),
            eq(rawMaterialBatches.status, 'Active')
        ),
        with: {
            purchaseBill: {
                with: { supplier: true }
            }
        },
        orderBy: (rmb, { asc }) => [asc(rmb.createdAt)],
    });

    // Filter only those with actual remaining quantity (double check)
    return batches.filter(batch =>
        (parseFloat(batch.quantity) - parseFloat(batch.quantityUsed || '0')) > 0
    );
}
