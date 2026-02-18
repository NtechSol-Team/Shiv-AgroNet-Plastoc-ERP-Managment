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
import { stockMovements, rawMaterials, finishedProducts, purchaseBills, purchaseBillItems, productionBatches, rawMaterialBatches, rawMaterialRolls, purchaseBillAdjustments } from '../db/schema';
import { eq, and, sql, desc, sum } from 'drizzle-orm';
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
 * @param tx - Optional transaction object
 * @returns Current stock quantity
 */
export async function getRawMaterialStock(rawMaterialId: string, tx: any = db): Promise<number> {
    const result = await tx
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
 * @param tx - Optional transaction object
 * @returns Current stock quantity
 */
export async function getFinishedProductStock(finishedProductId: string, tx: any = db): Promise<number> {
    const result = await tx
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
 * UPDATED: Stock is now calculated from rawMaterialRolls (sum of netWeight where status='In Stock')
 * Rolls are the single source of truth for raw material inventory
 */
export async function getAllRawMaterialsWithStock() {
    // 1. Get all raw materials
    const materials = await db.select().from(rawMaterials);

    // 2. Aggregate Stock from Rolls (NOT movements anymore)
    // Stock = SUM(netWeight) WHERE status = 'In Stock'
    const stockResults = await db
        .select({
            id: rawMaterialRolls.rawMaterialId,
            totalWeight: sql<string>`COALESCE(SUM(${rawMaterialRolls.netWeight}), 0)`,
            rollCount: sql<string>`COUNT(*)`,
        })
        .from(rawMaterialRolls)
        .where(eq(rawMaterialRolls.status, 'In Stock'))
        .groupBy(rawMaterialRolls.rawMaterialId);

    const stockMap = new Map();
    const rollCountMap = new Map();
    stockResults.forEach(r => {
        if (r.id) {
            stockMap.set(r.id, parseFloat(r.totalWeight));
            rollCountMap.set(r.id, parseInt(r.rollCount));
        }
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
        rollCount: rollCountMap.get(material.id) || 0,
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

    // 3. Get Last Batch Date (Optimization: Using a more targeted query)
    // Fetch only the latest completed batch for each product
    const latestBatches = await db.execute(sql`
        SELECT DISTINCT ON (finished_product_id) 
            finished_product_id as pid, 
            code, 
            completion_date as date
        FROM production_batches
        WHERE status = 'completed'
        ORDER BY finished_product_id, completion_date DESC
    `);

    const lastBatchMap = new Map();
    (latestBatches.rows as any[]).forEach(batch => {
        lastBatchMap.set(batch.pid, batch);
    });

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
 * @param tx - Optional transaction object
 * @returns Created movement record
 */
export async function createStockMovement(input: StockMovementInput, tx: any = db) {
    // Calculate running balance
    let runningBalance = 0;

    if (input.itemType === 'raw_material' && input.rawMaterialId) {
        runningBalance = await getRawMaterialStock(input.rawMaterialId, tx);
    } else if (input.itemType === 'finished_product' && input.finishedProductId) {
        runningBalance = await getFinishedProductStock(input.finishedProductId, tx);
    }

    // Apply this movement to running balance
    runningBalance += (input.quantityIn || 0) - (input.quantityOut || 0);

    // Insert the movement
    const [movement] = await tx.insert(stockMovements).values({
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
 * Get available batches/rolls for a raw material (FIFO)
 * UPDATED: Now queries rawMaterialRolls instead of rawMaterialBatches
 * because rolls are the single source of truth for raw material inventory
 * Returns rolls with status = 'In Stock' ordered by creation date (FIFO)
 */
export async function getAvailableBatches(rawMaterialId: string) {
    console.log(`\n=== getAvailableRolls for material: ${rawMaterialId} ===`);

    // Query rolls - the user wants to select individual rolls for production
    const rolls = await db.query.rawMaterialRolls.findMany({
        where: and(
            eq(rawMaterialRolls.rawMaterialId, rawMaterialId),
            eq(rawMaterialRolls.status, 'In Stock') // Only show available rolls
        ),
        with: {
            purchaseBill: true
        },
        orderBy: (roll, { asc }) => [asc(roll.createdAt)], // FIFO: oldest first
    });

    console.log(`Found ${rolls.length} available rolls`);

    // Return rolls formatted for the dropdown
    const result = rolls.map(roll => {
        const weight = parseFloat(roll.netWeight);
        console.log(`  - ${roll.rollCode}: Weight=${weight}kg, Status=${roll.status}`);

        return {
            id: roll.id, // Roll ID
            batchCode: roll.rollCode, // Show roll code in dropdown
            quantity: roll.netWeight, // Total roll weight
            quantityUsed: '0', // Rolls are discrete units
            available: roll.netWeight, // Full roll weight available
            purchaseBill: roll.purchaseBill,
            createdAt: roll.createdAt,
        };
    });

    console.log(`Returning ${result.length} rolls\n`);
    return result;
}
// ============================================================
// PENDING QUANTITY TRACKING
// ============================================================

/**
 * Calculate pending quantity for a specific purchase bill item
 * Pending = Bill Qty - Rolls Created - Adjustments Made
 */
export async function getPendingBillQuantity(billId: string, rawMaterialId: string): Promise<number> {
    // 1. Get Bill Item Quantity
    const [billItem] = await db
        .select({ quantity: purchaseBillItems.quantity })
        .from(purchaseBillItems)
        .where(and(
            eq(purchaseBillItems.billId, billId),
            eq(purchaseBillItems.rawMaterialId, rawMaterialId)
        ));

    if (!billItem) return 0;
    const billQty = parseFloat(billItem.quantity);

    // 2. Get Total Weight of Rolls linked to this bill and material
    const [rollsResult] = await db
        .select({ totalWeight: sql<string>`COALESCE(SUM(${rawMaterialRolls.netWeight}), 0)` })
        .from(rawMaterialRolls)
        .where(and(
            eq(rawMaterialRolls.purchaseBillId, billId),
            eq(rawMaterialRolls.rawMaterialId, rawMaterialId)
        ));

    const rollsQty = parseFloat(rollsResult?.totalWeight || '0');

    // 3. Get Total Adjustments (where this bill is the SOURCE - i.e. stock transferred OUT to another bill)
    const [sourceAdjResult] = await db
        .select({ totalAdjusted: sql<string>`COALESCE(SUM(${purchaseBillAdjustments.quantity}), 0)` })
        .from(purchaseBillAdjustments)
        .where(and(
            eq(purchaseBillAdjustments.sourceBillId, billId),
            eq(purchaseBillAdjustments.rawMaterialId, rawMaterialId)
        ));

    const sourceAdjustedQty = parseFloat(sourceAdjResult?.totalAdjusted || '0');

    // 4. Get Total Adjustments (where this bill is the TARGET - i.e. stock transferred IN from another bill)
    // This effectively reduces the "Rolls" count for this bill because some rolls are attributed to previous bills
    const [targetAdjResult] = await db
        .select({ totalAdjusted: sql<string>`COALESCE(SUM(${purchaseBillAdjustments.quantity}), 0)` })
        .from(purchaseBillAdjustments)
        .where(and(
            eq(purchaseBillAdjustments.targetBillId, billId),
            eq(purchaseBillAdjustments.rawMaterialId, rawMaterialId)
        ));

    const targetAdjustedQty = parseFloat(targetAdjResult?.totalAdjusted || '0');

    // 5. Calculate Pending
    // Formula: BillQty - (Rolls - TargetAdjustments) - SourceAdjustments
    // Simplified: BillQty - Rolls + TargetAdjustments - SourceAdjustments
    return Math.max(0, billQty - rollsQty + targetAdjustedQty - sourceAdjustedQty);
}
