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
    productionBatches, stockMovements, bellItems,
    paymentTransactions, invoices, purchaseBills, purchaseBillItems,
    billPaymentAllocations, invoicePaymentAllocations,
    expenses, financialTransactions, generalLedger,
    ccAccountDetails, generalItems,
} from '../db/schema';
import { eq, and, like, notLike, count as countFn } from 'drizzle-orm';
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
        const lastItem = await db.query.rawMaterials.findFirst({
            orderBy: (table, { desc }) => [desc(table.code)]
        });
        const lastCode = lastItem?.code || 'RM-000';
        const lastNum = parseInt(lastCode.split('-')[1] || '0');
        const code = `RM-${String(lastNum + 1).padStart(3, '0')}`;

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

        const lastItem = await db.query.finishedProducts.findFirst({
            orderBy: (table, { desc }) => [desc(table.code)]
        });
        const lastCode = lastItem?.code || 'FP-000';
        const lastNum = parseInt(lastCode.split('-')[1] || '0');
        const code = `FP-${String(lastNum + 1).padStart(3, '0')}`;

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

        // 4. Check for Invoice Dependencies
        // If any bell items for this product are on invoices, we cannot delete
        const bellItemsForProduct = await db.query.bellItems.findMany({
            where: eq(bellItems.finishedProductId, id)
        });

        if (bellItemsForProduct.length > 0) {
            const bellItemIds = bellItemsForProduct.map(bi => bi.id);

            // Check if any of these bell items are on invoices
            const invoicedItems = await db.query.invoiceItems.findMany({
                where: (invoiceItems, { inArray, isNotNull, and }) =>
                    and(
                        inArray(invoiceItems.bellItemId as any, bellItemIds),
                        isNotNull(invoiceItems.bellItemId)
                    )
            });

            if (invoicedItems.length > 0) {
                // Get unique invoice IDs and fetch their codes
                const invoiceIds = [...new Set(invoicedItems.map(ii => ii.invoiceId))];
                const invoices = await db.query.invoices.findMany({
                    where: (invoices, { inArray }) => inArray(invoices.id as any, invoiceIds)
                });
                const invoiceNumbers = invoices.map(inv => inv.invoiceNumber).join(', ');

                throw createError(
                    `Cannot delete product: ${invoicedItems.length} bell item(s) from this product are in invoices (${invoiceNumbers}). Please delete or modify those invoices first.`,
                    409 // Conflict
                );
            }
        }


        // 5. Delete Bell Items (Inventory)
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

        const lastItem = await db.query.machines.findFirst({
            orderBy: (table, { desc }) => [desc(table.code)]
        });
        const lastCode = lastItem?.code || 'M-000';
        const lastNum = parseInt(lastCode.split('-')[1] || '0');
        const code = `M-${String(lastNum + 1).padStart(3, '0')}`;

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
        res.set('Cache-Control', 'no-store');
        res.json(successResponse(items));
    } catch (error) {
        next(error);
    }
});

router.post('/customers', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { name, gstNo, stateCode, email, phone, address, outstanding } = req.body;

        const lastItem = await db.query.customers.findFirst({
            orderBy: (table, { desc }) => [desc(table.code)]
        });
        const lastCode = lastItem?.code || 'C-000';
        const lastNum = parseInt(lastCode.split('-')[1] || '0');
        const code = `C-${String(lastNum + 1).padStart(3, '0')}`;

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
        res.set('Cache-Control', 'no-store');
        res.json(successResponse(items));
    } catch (error) {
        next(error);
    }
});

router.post('/suppliers', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { name, gstNo, stateCode, contact, address, outstanding } = req.body;

        const lastItem = await db.query.suppliers.findFirst({
            orderBy: (table, { desc }) => [desc(table.code)]
        });
        const lastCode = lastItem?.code || 'S-000';
        const lastNum = parseInt(lastCode.split('-')[1] || '0');
        const code = `S-${String(lastNum + 1).padStart(3, '0')}`;

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

        // Find last code that starts with 'E-' but NOT 'EXP-'
        // This avoids conflict with auto-generated expense heads from Purchase Bills
        const lastItem = await db.query.expenseHeads.findFirst({
            where: (table, { and, like, notLike }) => and(
                like(table.code, 'E-%'),
                notLike(table.code, 'EXP-%')
            ),
            orderBy: (table, { desc }) => [desc(table.code)]
        });

        let code = 'E-001';
        if (lastItem) {
            const parts = lastItem.code.split('-');
            const numStr = parts[1];
            if (numStr && !isNaN(parseInt(numStr))) {
                const nextNum = parseInt(numStr) + 1;
                // Preserve padding if small, else just use number
                code = `E-${String(nextNum).padStart(3, '0')}`;
            } else {
                // Fallback if parsing fails
                code = `E-${Date.now()}`;
            }
        }

        // Double check uniqueness
        const existing = await db.query.expenseHeads.findFirst({ where: eq(expenseHeads.code, code) });
        if (existing) {
            code = `E-${Date.now()}`;
        }

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
        const { id } = req.params;

        // 1. Check for references in Purchase Bill Items
        const purchaseItems = await db.query.purchaseBillItems.findFirst({
            where: eq(purchaseBillItems.expenseHeadId, id)
        });
        if (purchaseItems) {
            throw createError('Cannot delete: This expense head is used in Purchase Bills.', 409);
        }

        // 2. Check for references in Expenses (Cash/Bank)
        const expenseEntries = await db.query.expenses.findFirst({
            where: eq(expenses.expenseHeadId, id)
        });
        if (expenseEntries) {
            throw createError('Cannot delete: This expense head is used in Cash/Bank Expenses.', 409);
        }

        // 3. Delete
        await db.delete(expenseHeads).where(eq(expenseHeads.id, id));
        cache.del('masters:expense-heads');
        res.json(successResponse({ deleted: true }));
    } catch (error) {
        next(error);
    }
});

// ============================================================
// GENERAL ITEMS
// ============================================================

router.get('/general-items', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const items = await db.query.generalItems.findMany({
            with: { defaultExpenseHead: true },
            orderBy: (table, { asc }) => [asc(table.name)]
        });
        res.json(successResponse(items));
    } catch (error) {
        next(error);
    }
});

router.post('/general-items', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { name, defaultExpenseHeadId } = req.body;
        const [item] = await db.insert(generalItems).values({
            name,
            defaultExpenseHeadId
        }).returning();
        cache.del('masters:general-items');
        res.status(201).json(successResponse(item));
    } catch (error) {
        next(error);
    }
});

router.put('/general-items/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { name, defaultExpenseHeadId } = req.body;
        const [item] = await db.update(generalItems)
            .set({ name, defaultExpenseHeadId, updatedAt: new Date() })
            .where(eq(generalItems.id, req.params.id))
            .returning();
        if (!item) throw createError('General Item not found', 404);
        cache.del('masters:general-items');
        res.json(successResponse(item));
    } catch (error) {
        next(error);
    }
});

router.delete('/general-items/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;

        // Check for references in Purchase Bill Items
        const purchaseItems = await db.query.purchaseBillItems.findFirst({
            where: eq(purchaseBillItems.generalItemId, id)
        });
        if (purchaseItems) {
            throw createError('Cannot delete: This item is used in Purchase Bills.', 409);
        }

        await db.delete(generalItems).where(eq(generalItems.id, id));
        cache.del('masters:general-items');
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

        const lastItem = await db.query.bankCashAccounts.findFirst({
            orderBy: (table, { desc }) => [desc(table.code)]
        });
        const lastCode = lastItem?.code || 'A-000';
        const lastNum = parseInt(lastCode.split('-')[1] || '0');
        const code = `A-${String(lastNum + 1).padStart(3, '0')}`;

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

// Helper to Cascade Delete Account
const deleteAccountWithCascade = async (accountId: string, isCC: boolean) => {
    await db.transaction(async (tx) => {
        // 1. Fetch all Payment Transactions linked to this account
        const transactions = await tx.select().from(paymentTransactions).where(eq(paymentTransactions.accountId, accountId));

        // 2. Revert Financial Impact for each transaction
        for (const txn of transactions) {
            // A. Revert Invoices/Bills (if linked)
            if (txn.type === 'RECEIPT') {
                const allocations = await tx.query.invoicePaymentAllocations.findMany({
                    where: eq(invoicePaymentAllocations.paymentId, txn.id),
                    with: { invoice: true }
                });

                for (const allocation of allocations) {
                    if (allocation.invoice) {
                        const newPaid = parseFloat(allocation.invoice.paidAmount || '0') - parseFloat(allocation.amount);
                        const newBalance = parseFloat(allocation.invoice.grandTotal || '0') - newPaid;

                        await tx.update(invoices)
                            .set({
                                paidAmount: newPaid.toString(),
                                balanceAmount: newBalance.toString(),
                                paymentStatus: newBalance >= parseFloat(allocation.invoice.grandTotal || '0') - 1 ? 'Unpaid' : (newBalance > 1 ? 'Partial' : 'Paid'),
                                updatedAt: new Date()
                            })
                            .where(eq(invoices.id, allocation.invoice.id));
                    }
                }
                // Delete allocations
                await tx.delete(invoicePaymentAllocations).where(eq(invoicePaymentAllocations.paymentId, txn.id));

                // Revert Customer Outstanding
                if (txn.partyId && txn.partyType === 'customer') {
                    const [customer] = await tx.select().from(customers).where(eq(customers.id, txn.partyId));
                    if (customer) {
                        const newOutstanding = parseFloat(customer.outstanding || '0') + parseFloat(txn.amount);
                        await tx.update(customers)
                            .set({ outstanding: newOutstanding.toString(), updatedAt: new Date() })
                            .where(eq(customers.id, customer.id));
                    }
                }

            } else if (txn.type === 'PAYMENT') {
                const allocations = await tx.query.billPaymentAllocations.findMany({
                    where: eq(billPaymentAllocations.paymentId, txn.id),
                    with: { bill: true }
                });

                for (const allocation of allocations) {
                    if (allocation.bill) {
                        const newPaid = parseFloat(allocation.bill.paidAmount || '0') - parseFloat(allocation.amount);
                        const newBalance = parseFloat(allocation.bill.grandTotal || '0') - newPaid;

                        await tx.update(purchaseBills)
                            .set({
                                paidAmount: newPaid.toString(),
                                balanceAmount: newBalance.toString(),
                                paymentStatus: newBalance >= parseFloat(allocation.bill.grandTotal || '0') - 1 ? 'Unpaid' : (newBalance > 1 ? 'Partial' : 'Paid'),
                                updatedAt: new Date()
                            })
                            .where(eq(purchaseBills.id, allocation.bill.id));
                    }
                }
                // Delete allocations
                await tx.delete(billPaymentAllocations).where(eq(billPaymentAllocations.paymentId, txn.id));

                // Revert Supplier Outstanding
                if (txn.partyId && txn.partyType === 'supplier') {
                    const [supplier] = await tx.select().from(suppliers).where(eq(suppliers.id, txn.partyId));
                    if (supplier) {
                        const newOutstanding = parseFloat(supplier.outstanding || '0') + parseFloat(txn.amount);
                        await tx.update(suppliers)
                            .set({ outstanding: newOutstanding.toString(), updatedAt: new Date() })
                            .where(eq(suppliers.id, supplier.id));
                    }
                }
            }
        }

        // 3. Delete Transactions (Payments, Expenses, Financial)
        await tx.delete(paymentTransactions).where(eq(paymentTransactions.accountId, accountId));
        await tx.delete(expenses).where(eq(expenses.accountId, accountId));
        await tx.delete(financialTransactions).where(eq(financialTransactions.accountId, accountId));

        // 4. Delete Ledger Entries
        await tx.delete(generalLedger).where(eq(generalLedger.ledgerId, accountId));

        // 5. Delete Account Specifics
        if (isCC) {
            await tx.delete(ccAccountDetails).where(eq(ccAccountDetails.accountId, accountId));
        }

        // 6. Delete the Account
        await tx.delete(bankCashAccounts).where(eq(bankCashAccounts.id, accountId));
    });
};

router.delete('/accounts/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
        await deleteAccountWithCascade(req.params.id, false);
        cache.del('masters:accounts');
        res.json(successResponse({ deleted: true, message: 'Account and associated transactions deleted successfully' }));
    } catch (error) {
        next(error);
    }
});

router.delete('/cc-accounts/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
        await deleteAccountWithCascade(req.params.id, true);
        cache.del('masters:cc-accounts');
        res.json(successResponse({ deleted: true, message: 'CC Account and associated transactions deleted successfully' }));
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

        const lastItem = await db.query.employees.findFirst({
            orderBy: (table, { desc }) => [desc(table.code)]
        });
        const lastCode = lastItem?.code || 'EMP-000';
        const lastNum = parseInt(lastCode.split('-')[1] || '0');
        const code = `EMP-${String(lastNum + 1).padStart(3, '0')}`;

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
