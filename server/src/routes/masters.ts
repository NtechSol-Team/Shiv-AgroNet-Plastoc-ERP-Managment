/**
 * Masters Routes
 * 
 * CRUD operations for master data entities:
 * - Raw Materials (with stock from movements)
 * - Finished Products (with stock from movements)
 * - Machines
 * - Customers (with state code for GST)
 * - Suppliers (with state code for GST)
 * - Expense Heads
 * - Bank/Cash Accounts
 * - Employees
 * 
 * Notes:
 * - Stock is calculated from stock_movements, not stored
 * - State code is inferred from GST number if not provided
 */

import { Router, Request, Response, NextFunction } from 'express';
import { db } from '../db/index';
import {
    rawMaterials, finishedProducts, machines, customers,
    suppliers, expenseHeads, bankCashAccounts, employees,
    productionBatches, stockMovements, bellItems
} from '../db/schema';
import { eq, count as countFn } from 'drizzle-orm';
import { successResponse } from '../types/api';
import { createError } from '../middleware/errorHandler';
import { getRawMaterialStock, getFinishedProductStock, getAllRawMaterialsWithStock, getAllFinishedProductsWithStock } from '../services/inventory.service';
import { cache } from '../services/cache.service';

const router = Router();

// ============================================================
// RAW MATERIALS
// ============================================================

/**
 * GET /masters/raw-materials
 * Get all raw materials with calculated stock (OPTIMIZED)
 */
router.get('/raw-materials', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const cacheKey = 'masters:raw-materials';
        const cached = cache.get(cacheKey);
        if (cached) {
            return res.json(successResponse(cached));
        }

        // Use batch-optimized function (single query instead of N+1)
        const itemsWithStock = await getAllRawMaterialsWithStock();

        cache.set(cacheKey, itemsWithStock, cache.TTL.COMPUTED); // 5 min for stock data
        res.json(successResponse(itemsWithStock));
    } catch (error) {
        next(error);
    }
});

/**
 * POST /masters/raw-materials
 * Create a new raw material
 */
router.post('/raw-materials', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { name, size, color, unit, hsnCode, gstPercent, reorderLevel } = req.body;

        // Generate code
        const countResult = await db.select({ cnt: countFn() }).from(rawMaterials);
        const count = Number(countResult[0]?.cnt || 0);
        const code = `RM-${String(count + 1).padStart(3, '0')}`;

        const [item] = await db.insert(rawMaterials).values({
            code,
            name,
            size: size || 'Standard',
            color,
            unit: unit || 'kg',
            hsnCode: hsnCode || '3901',
            gstPercent: String(gstPercent || 18),
            reorderLevel: String(reorderLevel || 100),
        }).returning();

        cache.del('masters:raw-materials');
        res.status(201).json(successResponse({ ...item, stock: '0.00' }));
    } catch (error) {
        next(error);
    }
});

/**
 * PUT /masters/raw-materials/:id
 * Update a raw material
 */
router.put('/raw-materials/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const { name, size, color, unit, hsnCode, gstPercent, reorderLevel } = req.body;

        const [item] = await db.update(rawMaterials)
            .set({
                name,
                size,
                color,
                unit,
                hsnCode,
                gstPercent: String(gstPercent),
                reorderLevel: String(reorderLevel),
                updatedAt: new Date()
            })
            .where(eq(rawMaterials.id, id))
            .returning();

        if (!item) throw createError('Raw material not found', 404);

        cache.del('masters:raw-materials');
        const stock = await getRawMaterialStock(id);
        res.json(successResponse({ ...item, stock: stock.toFixed(2) }));
    } catch (error) {
        next(error);
    }
});

/**
 * DELETE /masters/raw-materials/:id
 * Delete a raw material
 */
router.delete('/raw-materials/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        await db.delete(rawMaterials).where(eq(rawMaterials.id, id));
        cache.del('masters:raw-materials');
        res.json(successResponse({ deleted: true }));
    } catch (error) {
        next(error);
    }
});

// ============================================================
// FINISHED PRODUCTS
// ============================================================

/**
 * GET /masters/finished-products
 * Get all finished products with calculated stock (OPTIMIZED)
 */
router.get('/finished-products', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const cacheKey = 'masters:finished-products';
        const cached = cache.get(cacheKey);
        if (cached) return res.json(successResponse(cached));

        // Use batch-optimized function (single query instead of N+1)
        const itemsWithStock = await getAllFinishedProductsWithStock();

        cache.set(cacheKey, itemsWithStock, cache.TTL.COMPUTED); // 5 min for stock data
        res.json(successResponse(itemsWithStock));
    } catch (error) {
        next(error);
    }
});

/**
 * POST /masters/finished-products
 * Create a new finished product
 */
router.post('/finished-products', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { name, length, width, gsm, unit, hsnCode, gstPercent, ratePerKg } = req.body;

        const countResult = await db.select({ cnt: countFn() }).from(finishedProducts);
        const count = Number(countResult[0]?.cnt || 0);
        const code = `FP-${String(count + 1).padStart(3, '0')}`;

        const [item] = await db.insert(finishedProducts).values({
            code, name, length, width, gsm,
            unit: unit || 'kg',
            hsnCode: hsnCode || '5608',
            gstPercent: String(gstPercent || 18),
            ratePerKg: String(ratePerKg || 0),
        }).returning();

        cache.del('masters:finished-products');
        res.status(201).json(successResponse({ ...item, stock: '0.00' }));
    } catch (error) {
        next(error);
    }
});

/**
 * PUT /masters/finished-products/:id
 * Update a finished product
 */
router.put('/finished-products/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const { name, length, width, gsm, unit, hsnCode, gstPercent, ratePerKg } = req.body;

        const [item] = await db.update(finishedProducts)
            .set({
                name, length, width, gsm,
                unit,
                hsnCode,
                gstPercent: String(gstPercent),
                ratePerKg: String(ratePerKg),
                updatedAt: new Date()
            })
            .where(eq(finishedProducts.id, id))
            .returning();

        if (!item) throw createError('Finished product not found', 404);

        cache.del('masters:finished-products');
        const stock = await getFinishedProductStock(id);
        res.json(successResponse({ ...item, stock: stock.toFixed(2) }));
    } catch (error) {
        next(error);
    }
});

/**
 * DELETE /masters/finished-products/:id
 * Delete a finished product
 */
router.delete('/finished-products/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;

        // 1. Find all production batches that produced this product (as primary or secondary output)
        const relatedBatches = await db.query.productionBatches.findMany({
            where: (batches, { eq, or }) => or(
                eq(batches.finishedProductId, id)
            ),
            with: {
                outputs: true
            }
        });

        // Also find batches where this product is in outputs but not primary (rare but possible)
        const outputBatches = await db.query.productionBatchOutputs.findMany({
            where: (outputs, { eq }) => eq(outputs.finishedProductId, id),
            with: {
                batch: true
            }
        });

        // Combine unique batch IDs
        const batchIds = new Set<string>();
        relatedBatches.forEach(b => batchIds.add(b.id));
        outputBatches.forEach(ob => batchIds.add(ob.batchId));

        const batchesToDelete = Array.from(batchIds);

        if (batchesToDelete.length > 0) {
            console.log(`Cascading delete: Removing ${batchesToDelete.length} batches for FG ${id}`);

            // 2. Delete Stock Movements related to these batches
            // This DELETES 'RAW_OUT' (restoring RM Stock) and 'FG_IN' (removing FG Stock)
            // movements.referenceId = batch.id AND refType = 'production'
            // We can't use 'inArray' easily with simple delete, so we loop or use raw query.
            // Using loop for safety and simplicity with Drizzle payload
            for (const batchId of batchesToDelete) {
                await db.delete(stockMovements)
                    .where(
                        // @ts-ignore
                        eq(stockMovements.referenceId, batchId)
                    );
            }

            // 3. Delete the Batches (Cascade should handle inputs/outputs/movements if configured, 
            // but we manually deleted movements above to be sure about stock logic)
            // Note: productionBatchInputs/Outputs cascade on batch delete.
            for (const batchId of batchesToDelete) {
                await db.delete(productionBatches).where(eq(productionBatches.id, batchId));
            }
        }

        // 4. Delete Bell Items (Inventory)
        // Bell items reference finishedProduct. If we don't delete them, we get FK violation.
        // And since bell items ARE the inventory, deleting the product should delete its inventory.
        await db.delete(bellItems).where(eq(bellItems.finishedProductId, id));

        // 5. Delete manual stock movements for this FG (e.g. adjustments)
        await db.delete(stockMovements).where(eq(stockMovements.finishedProductId, id));

        // 6. Finally delete the Master
        await db.delete(finishedProducts).where(eq(finishedProducts.id, id));

        cache.del('masters:finished-products');
        // Clear summary cache as stock changed
        cache.del('inventory:summary');

        res.json(successResponse({ deleted: true, batchesRemoved: batchesToDelete.length }));
    } catch (error) {
        next(error);
    }
});

// ============================================================
// MACHINES
// ============================================================

router.get('/machines', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const cacheKey = 'masters:machines';
        const cached = cache.get(cacheKey);
        if (cached) return res.json(successResponse(cached));

        const items = await db.select().from(machines).orderBy(machines.code);
        cache.set(cacheKey, items);
        res.json(successResponse(items));
    } catch (error) {
        next(error);
    }
});

router.post('/machines', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { name, type, capacity, status } = req.body;

        const countResult = await db.select({ cnt: countFn() }).from(machines);
        const count = Number(countResult[0]?.cnt || 0);
        const code = `M-${String(count + 1).padStart(3, '0')}`;

        const [item] = await db.insert(machines).values({
            code, name, type, capacity, status: status || 'Active',
        }).returning();

        cache.del('masters:machines');
        res.status(201).json(successResponse(item));
    } catch (error) {
        next(error);
    }
});

router.put('/machines/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { name, type, capacity, status } = req.body;
        const [item] = await db.update(machines)
            .set({ name, type, capacity, status, updatedAt: new Date() })
            .where(eq(machines.id, req.params.id))
            .returning();

        if (!item) throw createError('Machine not found', 404);
        cache.del('masters:machines');
        res.json(successResponse(item));
    } catch (error) {
        next(error);
    }
});

router.delete('/machines/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
        await db.delete(machines).where(eq(machines.id, req.params.id));
        cache.del('masters:machines');
        res.json(successResponse({ deleted: true }));
    } catch (error) {
        next(error);
    }
});

// ============================================================
// CUSTOMERS
// ============================================================

router.get('/customers', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const cacheKey = 'masters:customers';
        const cached = cache.get(cacheKey);
        if (cached) return res.json(successResponse(cached));

        const items = await db.select().from(customers).orderBy(customers.code);
        cache.set(cacheKey, items);
        res.json(successResponse(items));
    } catch (error) {
        next(error);
    }
});

router.post('/customers', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { name, gstNo, stateCode, email, phone, address, outstanding } = req.body;

        const countResult = await db.select({ cnt: countFn() }).from(customers);
        const count = Number(countResult[0]?.cnt || 0);
        const code = `C-${String(count + 1).padStart(3, '0')}`;

        // Extract state code from GST number if not provided (first 2 digits)
        const inferredStateCode = stateCode || (gstNo ? gstNo.substring(0, 2) : '27');

        const [item] = await db.insert(customers).values({
            code, name, gstNo,
            stateCode: inferredStateCode,
            email, phone, address,
            outstanding: String(outstanding || 0),
        }).returning();

        cache.del('masters:customers');
        res.status(201).json(successResponse(item));
    } catch (error) {
        next(error);
    }
});

router.put('/customers/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { name, gstNo, stateCode, email, phone, address, outstanding } = req.body;

        const inferredStateCode = stateCode || (gstNo ? gstNo.substring(0, 2) : '27');

        const [item] = await db.update(customers)
            .set({
                name, gstNo,
                stateCode: inferredStateCode,
                email, phone, address,
                outstanding: String(outstanding || 0),
                updatedAt: new Date()
            })
            .where(eq(customers.id, req.params.id))
            .returning();

        if (!item) throw createError('Customer not found', 404);
        cache.del('masters:customers');
        res.json(successResponse(item));
    } catch (error) {
        next(error);
    }
});

router.delete('/customers/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
        await db.delete(customers).where(eq(customers.id, req.params.id));
        cache.del('masters:customers');
        res.json(successResponse({ deleted: true }));
    } catch (error) {
        next(error);
    }
});

// ============================================================
// SUPPLIERS
// ============================================================

router.get('/suppliers', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const cacheKey = 'masters:suppliers';
        const cached = cache.get(cacheKey);
        if (cached) return res.json(successResponse(cached));

        const items = await db.select().from(suppliers).orderBy(suppliers.code);
        cache.set(cacheKey, items);
        res.json(successResponse(items));
    } catch (error) {
        next(error);
    }
});

router.post('/suppliers', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { name, gstNo, stateCode, contact, address, outstanding } = req.body;

        const countResult = await db.select({ cnt: countFn() }).from(suppliers);
        const count = Number(countResult[0]?.cnt || 0);
        const code = `S-${String(count + 1).padStart(3, '0')}`;

        // Extract state code from GST number if not provided
        const inferredStateCode = stateCode || (gstNo ? gstNo.substring(0, 2) : '27');

        const [item] = await db.insert(suppliers).values({
            code, name, gstNo,
            stateCode: inferredStateCode,
            contact, address,
            outstanding: String(outstanding || 0),
        }).returning();

        cache.del('masters:suppliers');
        res.status(201).json(successResponse(item));
    } catch (error) {
        next(error);
    }
});

router.put('/suppliers/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { name, gstNo, stateCode, contact, address, outstanding } = req.body;

        const inferredStateCode = stateCode || (gstNo ? gstNo.substring(0, 2) : '27');

        const [item] = await db.update(suppliers)
            .set({
                name, gstNo,
                stateCode: inferredStateCode,
                contact, address,
                outstanding: String(outstanding || 0),
                updatedAt: new Date()
            })
            .where(eq(suppliers.id, req.params.id))
            .returning();

        if (!item) throw createError('Supplier not found', 404);
        cache.del('masters:suppliers');
        res.json(successResponse(item));
    } catch (error) {
        next(error);
    }
});

router.delete('/suppliers/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
        await db.delete(suppliers).where(eq(suppliers.id, req.params.id));
        cache.del('masters:suppliers');
        res.json(successResponse({ deleted: true }));
    } catch (error) {
        next(error);
    }
});

// ============================================================
// EXPENSE HEADS
// ============================================================

router.get('/expense-heads', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const cacheKey = 'masters:expense-heads';
        const cached = cache.get(cacheKey);
        if (cached) return res.json(successResponse(cached));

        const items = await db.select().from(expenseHeads).orderBy(expenseHeads.code);
        cache.set(cacheKey, items);
        res.json(successResponse(items));
    } catch (error) {
        next(error);
    }
});

router.post('/expense-heads', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { name, category } = req.body;

        const countResult = await db.select({ cnt: countFn() }).from(expenseHeads);
        const count = Number(countResult[0]?.cnt || 0);
        const code = `E-${String(count + 1).padStart(3, '0')}`;

        const [item] = await db.insert(expenseHeads).values({
            code, name, category: category || 'Variable',
        }).returning();

        cache.del('masters:expense-heads');
        res.status(201).json(successResponse(item));
    } catch (error) {
        next(error);
    }
});

router.put('/expense-heads/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { name, category } = req.body;
        const [item] = await db.update(expenseHeads)
            .set({ name, category, updatedAt: new Date() })
            .where(eq(expenseHeads.id, req.params.id))
            .returning();

        if (!item) throw createError('Expense head not found', 404);
        cache.del('masters:expense-heads');
        res.json(successResponse(item));
    } catch (error) {
        next(error);
    }
});

router.delete('/expense-heads/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
        await db.delete(expenseHeads).where(eq(expenseHeads.id, req.params.id));
        cache.del('masters:expense-heads');
        res.json(successResponse({ deleted: true }));
    } catch (error) {
        next(error);
    }
});

// ============================================================
// BANK/CASH ACCOUNTS
// ============================================================

router.get('/accounts', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const cacheKey = 'masters:accounts';
        const cached = cache.get(cacheKey);
        if (cached) return res.json(successResponse(cached));

        const items = await db.select().from(bankCashAccounts).orderBy(bankCashAccounts.code);
        cache.set(cacheKey, items);
        res.json(successResponse(items));
    } catch (error) {
        next(error);
    }
});

router.post('/accounts', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { name, accountNo, type, balance } = req.body;

        const countResult = await db.select({ cnt: countFn() }).from(bankCashAccounts);
        const count = Number(countResult[0]?.cnt || 0);
        const code = `A-${String(count + 1).padStart(3, '0')}`;

        const [item] = await db.insert(bankCashAccounts).values({
            code, name, accountNo, type: type || 'Bank',
            balance: String(balance || 0),
        }).returning();

        cache.del('masters:accounts');
        res.status(201).json(successResponse(item));
    } catch (error) {
        next(error);
    }
});

router.put('/accounts/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { name, accountNo, type, balance } = req.body;
        const [item] = await db.update(bankCashAccounts)
            .set({ name, accountNo, type, balance: String(balance || 0), updatedAt: new Date() })
            .where(eq(bankCashAccounts.id, req.params.id))
            .returning();

        if (!item) throw createError('Account not found', 404);
        cache.del('masters:accounts');
        res.json(successResponse(item));
    } catch (error) {
        next(error);
    }
});

router.delete('/accounts/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
        await db.delete(bankCashAccounts).where(eq(bankCashAccounts.id, req.params.id));
        cache.del('masters:accounts');
        res.json(successResponse({ deleted: true }));
    } catch (error) {
        next(error);
    }
});

// ============================================================
// EMPLOYEES
// ============================================================

router.get('/employees', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const items = await db.select().from(employees).orderBy(employees.code);
        res.json(successResponse(items));
    } catch (error) {
        next(error);
    }
});

router.post('/employees', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { name, designation, contact, salary } = req.body;

        const countResult = await db.select({ cnt: countFn() }).from(employees);
        const count = Number(countResult[0]?.cnt || 0);
        const code = `EMP-${String(count + 1).padStart(3, '0')}`;

        const [item] = await db.insert(employees).values({
            code, name, designation, contact, salary: String(salary),
        }).returning();

        res.status(201).json(successResponse(item));
    } catch (error) {
        next(error);
    }
});

router.put('/employees/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { name, designation, contact, salary } = req.body;
        const [item] = await db.update(employees)
            .set({ name, designation, contact, salary: String(salary), updatedAt: new Date() })
            .where(eq(employees.id, req.params.id))
            .returning();

        if (!item) throw createError('Employee not found', 404);
        res.json(successResponse(item));
    } catch (error) {
        next(error);
    }
});

router.delete('/employees/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
        await db.delete(employees).where(eq(employees.id, req.params.id));
        res.json(successResponse({ deleted: true }));
    } catch (error) {
        next(error);
    }
});

export default router;
