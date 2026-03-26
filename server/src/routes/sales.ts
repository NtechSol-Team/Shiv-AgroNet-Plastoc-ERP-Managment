/**
 * Sales Routes
 * 
 * Handles sales invoice management with:
 * - B2B/B2C invoice support
 * - CGST/SGST/IGST calculation based on customer state
 * - Stock validation before invoicing
 * - Stock movements (FG_OUT) on confirmation
 * - Payment tracking
 * - Customer ledger updates
 * 
 * Invoice Flow:
 * 1. Create draft invoice
 * 2. Confirm invoice (validates stock, creates FG_OUT movements)
 * 3. Record payments
 */

import { Router, Request, Response, NextFunction } from 'express';
import { db } from '../db/index';
import { invoices, invoiceItems, customers, finishedProducts, stockMovements, paymentTransactions, invoicePaymentAllocations, bankCashAccounts, salesInvoices, generalLedger, bellItems, bellBatches, rawMaterials, rawMaterialRolls, generalItems } from '../db/schema';
import { eq, desc, sql, count as countFn, and, inArray, gte, lte } from 'drizzle-orm';
import { successResponse } from '../types/api';
import { createError } from '../middleware/errorHandler';
import { createStockMovement, validateFinishedProductStock, getFinishedProductStock } from '../services/inventory.service';
import { cache as cacheService } from '../services/cache.service';
import { syncCustomerOutstanding } from '../utils/balance';
import { realtimeService } from '../services/realtime.service';
import { invalidateInventorySummary, invalidateDashboardKPIs } from '../services/precomputed.service';
import { getNextTransactionCode } from '../utils/generateCode';

const router = Router();

// Company state code for GST calculation (Gujarat)
const COMPANY_STATE_CODE = '24';

// ============================================================
// TYPE DEFINITIONS
// ============================================================

interface InvoiceItem {
    finishedProductId?: string;
    rawMaterialId?: string;
    rawMaterialRollId?: string;
    generalItemId?: string;
    bellItemId?: string; // Added bellItemId
    quantity: number;
    rate: number;
    discount?: number;
    gstPercent: number;
    childItems?: any[]; // For bale groups
}

interface CreateInvoiceRequest {
    invoiceDate: string;
    customerId?: string;
    customerName?: string;
    invoiceType: 'B2B' | 'B2C';
    status: 'Draft' | 'Confirmed';
    items: InvoiceItem[];
}

// ============================================================
// GET ALL INVOICES
// ============================================================

// ============================================================
// GET ALL INVOICES (PAGINATED & OPTIMIZED)
// ============================================================

/**
 * GET /sales/invoices
 * Get paginated sales invoices with customer and items
 * Query Params: page, limit, search
 */
router.get('/invoices', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const offset = (page - 1) * limit;

        const { customerId, placeOfSupply, startDate, endDate } = req.query;

        const conditions = [];
        if (customerId) conditions.push(eq(invoices.customerId, customerId as string));
        if (placeOfSupply) conditions.push(eq(invoices.placeOfSupply, placeOfSupply as string));
        if (startDate) conditions.push(gte(invoices.invoiceDate, new Date(startDate as string)));
        if (endDate) conditions.push(lte(invoices.invoiceDate, new Date(endDate as string)));

        const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

        // 1. Get total count
        const totalResult = await db.select({ count: countFn() })
            .from(invoices)
            .where(whereClause);
        const total = Number(totalResult[0]?.count || 0);

        // 2. Get invoices (paginated)
        const allInvoices = await db
            .select()
            .from(invoices)
            .leftJoin(customers, eq(invoices.customerId, customers.id))
            .where(whereClause)
            .orderBy(desc(invoices.createdAt))
            .limit(limit)
            .offset(offset);

        if (allInvoices.length === 0) {
            return res.json(successResponse({
                data: [],
                meta: { total, page, limit, totalPages: Math.ceil(total / limit) }
            }));
        }

        // 3. Batch fetch items for these invoices
        const invoiceIds = allInvoices.map(i => i.sales_invoices.id);

        const allItems = await db
            .select()
            .from(invoiceItems)
            .leftJoin(finishedProducts, eq(invoiceItems.finishedProductId, finishedProducts.id))
            .leftJoin(bellItems, eq(invoiceItems.id, bellItems.invoiceItemId))
            .leftJoin(bellBatches, eq(bellItems.batchId, bellBatches.id))
            .where(inArray(invoiceItems.invoiceId, invoiceIds));

        // First, group rows by invoiceItem.id to aggregate childItems (bales)
        const aggregatedItemsMap = new Map<string, any>();
        allItems.forEach(row => {
            const itemId = row.invoice_items.id;
            if (!aggregatedItemsMap.has(itemId)) {
                aggregatedItemsMap.set(itemId, {
                    ...row.invoice_items,
                    finishedProduct: row.finished_products,
                    childItems: [],
                    // Summary fields for list view compatibility
                    pieceCount: row.bell_items?.pieceCount,
                    batchCode: row.bell_batches?.code,
                });
            }

            if (row.bell_items) {
                aggregatedItemsMap.get(itemId).childItems.push({
                    ...row.bell_items,
                    batch: row.bell_batches
                });
            }
        });

        // Group aggregated items by invoiceId
        const itemsMap = new Map<string, any[]>();
        aggregatedItemsMap.forEach(item => {
            const iId = item.invoiceId;
            if (!itemsMap.has(iId)) itemsMap.set(iId, []);
            itemsMap.get(iId)?.push(item);
        });

        // 4. Merge
        const result = allInvoices.map(row => ({
            ...row.sales_invoices,
            customer: row.customers,
            items: itemsMap.get(row.sales_invoices.id) || [],
        }));

        res.json(successResponse({
            data: result,
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) }
        }));

    } catch (error) {
        next(error);
    }
});

// ============================================================
// CREATE/UPDATE INVOICE
// ============================================================

/**
 * POST /sales/invoices
 * Create a new sales invoice
 * 
 * Features:
 * - B2B/B2C support
 * - GST calculation based on customer state
 * - Stock validation on confirm
 * - FG_OUT movements on confirm
 */
router.get('/available-bells', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const availableBells = await db.query.bellItems.findMany({
            where: (bellItems, { eq }) => eq(bellItems.status, 'Available'),
            with: {
                finishedProduct: true,
                batch: true
            }
        });
        res.json(successResponse(availableBells));
    } catch (error) {
        next(error);
    }
});

router.get('/available-rolls', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const availableRolls = await db.query.rawMaterialRolls.findMany({
            where: (rawMaterialRolls, { eq }) => eq(rawMaterialRolls.status, 'In Stock'),
            with: {
                rawMaterial: true,
                purchaseBill: true
            }
        });
        res.json(successResponse(availableRolls));
    } catch (error) {
        next(error);
    }
});

router.post('/invoices', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const {
            invoiceDate,
            customerId,
            customerName,
            invoiceType = 'B2B',
            status = 'Draft',
            placeOfSupply,
            items
        } = req.body as CreateInvoiceRequest & { items: (InvoiceItem & { bellItemId?: string })[], placeOfSupply?: string };

        if (!items || items.length === 0) {
            throw createError('No items provided', 400);
        }

        // Start Transaction
        const result = await db.transaction(async (tx) => {
            // 1. Generate invoice number (SA/YY-YY/XXX)
            const today = new Date();
            const year = today.getFullYear();
            const fiscalYear = today.getMonth() > 2
                ? `${year.toString().slice(-2)}-${(year + 1).toString().slice(-2)}`
                : `${(year - 1).toString().slice(-2)}-${year.toString().slice(-2)}`;
            const prefix = `SA/${fiscalYear}/`;

            // Fetch all invoices for this fiscal prefix and find the max sequence number
            // Using reduce (instead of orderBy createdAt) to be safe against concurrent inserts & gaps
            const lastInvoiceResult = await tx
                .select({ invoiceNumber: invoices.invoiceNumber })
                .from(invoices)
                .where(sql`${invoices.invoiceNumber} LIKE ${prefix + '%'}`);

            let sequence = 1;
            if (lastInvoiceResult.length > 0) {
                const maxSeq = lastInvoiceResult.reduce((max, row) => {
                    const parts = row.invoiceNumber.split('/');
                    const seq = parseInt(parts[parts.length - 1]);
                    return !isNaN(seq) && seq > max ? seq : max;
                }, 0);
                sequence = maxSeq + 1;
            }

            const invoiceNumber = `${prefix}${String(sequence).padStart(3, '0')}`;

            // 2. If confirming, validate all stock first
            if (status === 'Confirmed') {
                for (const item of items) {
                    if (item.rawMaterialRollId) {
                        const [roll] = await tx.select().from(rawMaterialRolls).where(eq(rawMaterialRolls.id, item.rawMaterialRollId));
                        if (!roll) throw createError(`Roll not found`, 404);
                        if (roll.status !== 'In Stock') throw createError(`Roll ${roll.rollCode} is already ${roll.status}`, 400);
                    } else if (item.bellItemId) {
                        const [bell] = await tx.select().from(bellItems).where(eq(bellItems.id, item.bellItemId));
                        if (!bell) throw createError(`Bell item not found`, 404);
                        if (bell.status !== 'Available') throw createError(`Bell item ${bell.code} is already ${bell.status}`, 400);
                    } else if (item.finishedProductId) {
                        // Only validate regular finished goods, bales are discrete and bypassed
                        if (!item.bellItemId && (!item.childItems || item.childItems.length === 0)) {
                            const validation = await validateFinishedProductStock(item.finishedProductId, item.quantity, tx);
                            if (!validation.isValid) {
                                const [product] = await tx.select().from(finishedProducts).where(eq(finishedProducts.id, item.finishedProductId));
                                throw createError(`Insufficient stock for ${product?.name || 'product'}: ${validation.message}`, 400);
                            }
                        }
                    }
                }
            }

            // 3. Process items and calculate totals
            let subtotal = 0;
            let totalDiscount = 0;
            let totalCgst = 0;
            let totalSgst = 0;
            let totalIgst = 0;

            const effectivePOS = placeOfSupply || COMPANY_STATE_CODE;
            const isInterState = effectivePOS !== COMPANY_STATE_CODE;

            const processedItems = await Promise.all(items.map(async item => {
                let productName = 'Unknown Item';
                let hsnCode = '60059000';
                let product = null;

                if (item.finishedProductId) {
                    [product] = await tx.select().from(finishedProducts).where(eq(finishedProducts.id, item.finishedProductId));
                    productName = product?.name || 'Unknown Product';
                    hsnCode = product?.hsnCode || '60059000';

                    if (item.bellItemId) {
                        const bellData = await tx
                            .select({ code: bellItems.code, batchCode: bellBatches.code, pieceCount: bellItems.pieceCount })
                            .from(bellItems)
                            .leftJoin(bellBatches, eq(bellItems.batchId, bellBatches.id))
                            .where(eq(bellItems.id, item.bellItemId));

                        if (bellData[0]) {
                            const itemCode = bellData[0].batchCode || bellData[0].code;
                            const pcs = bellData[0].pieceCount || '1';
                            productName = `${itemCode} - ${productName} (${Math.round(Number(pcs))} pcs)`;
                        }
                    } else if (item.childItems && item.childItems.length > 0) {
                        const representative = item.childItems[0];
                        const itemCode = representative.batch?.code || representative.code || representative.batchCode;
                        const totalPcs = item.childItems.reduce((sum: number, b: any) => sum + Number(b.pieceCount || 1), 0);
                        if (itemCode) {
                            productName = `${itemCode} - ${productName} (${Math.round(totalPcs)} pcs)`;
                        }
                    }
                } else if (item.rawMaterialRollId) {
                    const [roll] = await tx.select().from(rawMaterialRolls)
                        .leftJoin(rawMaterials, eq(rawMaterialRolls.rawMaterialId, rawMaterials.id))
                        .where(eq(rawMaterialRolls.id, item.rawMaterialRollId));
                    if (roll && roll.raw_materials) {
                        productName = `${roll.raw_material_rolls.rollCode} - ${roll.raw_materials.name}`;
                        hsnCode = roll.raw_materials.hsnCode || '3901';
                    }
                } else if (item.rawMaterialId) {
                    const [material] = await tx.select().from(rawMaterials).where(eq(rawMaterials.id, item.rawMaterialId));
                    if (material) {
                        productName = material.name;
                        hsnCode = material.hsnCode || '3901';
                    }
                }

                const amount = item.quantity * item.rate;
                const discount = item.discount || 0;
                const taxableAmount = amount - discount;
                const gstAmount = (taxableAmount * item.gstPercent) / 100;

                subtotal += amount;
                totalDiscount += discount;

                const cgst = isInterState ? 0 : gstAmount / 2;
                const sgst = isInterState ? 0 : gstAmount / 2;
                const igst = isInterState ? gstAmount : 0;

                if (isInterState) {
                    totalIgst += igst;
                } else {
                    totalCgst += cgst;
                    totalSgst += sgst;
                }

                return {
                    ...item,
                    productName,
                    hsnCode,
                    product,
                    amount,
                    taxableAmount,
                    cgst,
                    sgst,
                    igst,
                    total: taxableAmount + gstAmount,
                } as any;
            }));

            const totalTax = totalCgst + totalSgst + totalIgst;
            const taxableTotal = subtotal - totalDiscount;
            const grandTotal = Math.round(taxableTotal + totalTax);

            // 4. Fetch customer if B2B
            let finalCustomerName = customerName || 'Walk-in Customer';
            let customerEntry = null;
            if (customerId) {
                [customerEntry] = await tx.select().from(customers).where(eq(customers.id, customerId));
                if (customerEntry) finalCustomerName = customerEntry.name;
            }

            // 5. Create invoice
            const [invoice] = await tx.insert(invoices).values({
                invoiceNumber,
                invoiceDate: new Date(invoiceDate),
                customerId: customerEntry?.id || null,
                customerName: finalCustomerName,
                customerGST: customerEntry?.gstNo || null,
                invoiceType,
                placeOfSupply: effectivePOS,
                subtotal: String(subtotal),
                discountAmount: String(totalDiscount),
                taxableAmount: String(taxableTotal),
                cgst: String(totalCgst),
                sgst: String(totalSgst),
                igst: String(totalIgst),
                totalTax: String(totalTax),
                grandTotal: String(grandTotal),
                paidAmount: '0',
                balanceAmount: String(grandTotal),
                paymentStatus: 'Unpaid',
                status,
            }).returning();

            // 6. Insert items and update inventory if confirmed
            const insertedItems = await Promise.all(
                processedItems.map(async (item) => {
                    const [insertedItem] = (await tx.insert(invoiceItems).values({
                        invoiceId: invoice.id,
                        finishedProductId: item.finishedProductId || null,
                        rawMaterialId: item.rawMaterialId || null,
                        rawMaterialRollId: item.rawMaterialRollId || null,
                        generalItemId: item.generalItemId || null,
                        productName: item.productName,
                        hsnCode: item.hsnCode || '60059000',
                        quantity: String(item.quantity),
                        rate: String(item.rate),
                        amount: String(item.amount),
                        discountAmount: String(item.discount || 0),
                        bellItemId: item.bellItemId,

                        taxableAmount: String(item.taxableAmount),
                        gstPercent: String(item.gstPercent),
                        cgst: String(item.cgst),
                        sgst: String(item.sgst),
                        igst: String(item.igst),
                        totalAmount: String(item.total),
                    }).returning()) as any[];

                    const baleIds = item.bellItemId ? [item.bellItemId] : (item.childItems || []).map((b: any) => b.id);
                    for (const baleId of baleIds) {
                        await tx.update(bellItems)
                            .set({
                                invoiceItemId: insertedItem.id,
                                updatedAt: new Date()
                            })
                            .where(eq(bellItems.id, baleId));
                    }

                    if (status === 'Confirmed') {
                        if (item.rawMaterialRollId) {
                            await tx.update(rawMaterialRolls).set({ status: 'Sold' }).where(eq(rawMaterialRolls.id, item.rawMaterialRollId));
                            await createStockMovement({
                                date: new Date(),
                                movementType: 'RAW_OUT',
                                itemType: 'raw_material',
                                rawMaterialId: item.rawMaterialId!,
                                quantityOut: Number(item.quantity),
                                referenceType: 'sales',
                                referenceCode: invoiceNumber,
                                referenceId: invoice.id,
                                reason: `Sold Roll ${item.productName} to ${finalCustomerName}`,
                            }, tx);
                        } else if (item.bellItemId || (item.childItems && item.childItems.length > 0)) {
                            for (const baleId of baleIds) {
                                await tx.update(bellItems).set({ status: 'Sold' }).where(eq(bellItems.id, baleId));
                            }
                        } else if (item.finishedProductId) {
                            await createStockMovement({
                                date: new Date(),
                                movementType: 'FG_OUT',
                                itemType: 'finished_product',
                                finishedProductId: item.finishedProductId,
                                quantityOut: Number(item.quantity),
                                referenceType: 'sales',
                                referenceCode: invoiceNumber,
                                referenceId: invoice.id,
                                reason: `Sold to ${finalCustomerName}`,
                            }, tx);
                        } else if (item.rawMaterialId) {
                            await createStockMovement({
                                date: new Date(),
                                movementType: 'RAW_OUT',
                                itemType: 'raw_material',
                                rawMaterialId: item.rawMaterialId,
                                quantityOut: Number(item.quantity),
                                referenceType: 'sales',
                                referenceCode: invoiceNumber,
                                referenceId: invoice.id,
                                reason: `Sold material ${item.productName} to ${finalCustomerName}`,
                            }, tx);
                        }
                    }

                    return { ...insertedItem, finishedProduct: item.product };
                })
            );

            // 7. Update customer outstanding if confirmed
            if (status === 'Confirmed' && customerEntry) {
                await syncCustomerOutstanding(customerEntry.id, tx);
            }

            return { invoice, customer: customerEntry, items: insertedItems, invoiceNumber, taxableTotal, totalTax, grandTotal };
        });

        const { invoice, customer, items: insertedItems, invoiceNumber, taxableTotal, totalTax, grandTotal } = result;

        // Detailed Console Log for Accounting Entry
        console.log('\n======================================================');
        console.log(`[ACCOUNTING LOG] INVOICE Created Successfully`);
        console.log('======================================================');
        console.log(`Invoice No     : ${invoiceNumber}`);
        console.log(`Date           : ${new Date(invoiceDate).toLocaleString()}`);
        console.log(`Customer       : ${invoice.customerName} (${invoiceType})`);
        console.log(`Items Count    : ${items.length} item(s)`);
        console.log(`Taxable Amount : ₹${parseFloat(String(taxableTotal)).toFixed(2)}`);
        console.log(`Total Tax      : ₹${parseFloat(String(totalTax)).toFixed(2)}`);
        console.log(`Grand Total    : ₹${parseFloat(String(grandTotal)).toFixed(2)}`);
        console.log(`Status         : ${status}`);
        console.log('------------------------------------------------------\n');

        res.json(successResponse({
            ...invoice,
            customer,
            items: insertedItems,
        }));

        // Broadcast real-time update
        realtimeService.emit('sales_updated');
        realtimeService.emit('dashboard_updated');
        if (status === 'Confirmed') {
            invalidateInventorySummary();
            invalidateDashboardKPIs();
            cacheService.del('masters:customers');
        }
    } catch (error) {
        next(error);
    }
});

/**
 * PUT /sales/invoices/:id
 * Update an existing sales invoice
 */
router.put('/invoices/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const {
            invoiceDate,
            customerId,
            customerName,
            invoiceType = 'B2B',
            status = 'Draft',
            placeOfSupply,
            items
        } = req.body as CreateInvoiceRequest & { items: (InvoiceItem & { id?: string })[], placeOfSupply?: string };

        // 1. Get existing invoice
        const existingInvoice = await db.query.salesInvoices.findFirst({
            where: eq(salesInvoices.id, id),
            with: { items: true }
        });

        if (!existingInvoice) {
            throw createError('Invoice not found', 404);
        }

        if (existingInvoice.status === 'Paid') {
            throw createError('Cannot update a paid invoice', 400);
        }

        // 2. Revert previous stock movements/states if it was already confirmed
        await db.transaction(async (tx) => {
            if (existingInvoice.status === 'Confirmed') {
                for (const item of existingInvoice.items || []) {
                    if (item.rawMaterialRollId) {
                        await tx.update(rawMaterialRolls)
                            .set({ status: 'In Stock' })
                            .where(eq(rawMaterialRolls.id, item.rawMaterialRollId));

                        await createStockMovement({
                            date: new Date(),
                            movementType: 'RAW_IN',
                            itemType: 'raw_material',
                            rawMaterialId: item.rawMaterialId!,
                            quantityIn: Number(item.quantity),
                            referenceType: 'sales',
                            referenceCode: existingInvoice.invoiceNumber,
                            referenceId: existingInvoice.id,
                            reason: `Update reversal for roll ${item.productName} in invoice ${existingInvoice.invoiceNumber}`,
                        }, tx);
                    } else if (item.finishedProductId) {
                        // Restore all bales linked to this specific invoice item
                        const restoredBales = await tx.update(bellItems)
                            .set({ status: 'Available', invoiceItemId: null })
                            .where(eq(bellItems.invoiceItemId, item.id))
                            .returning();

                        // Reversal stock movement ONLY for non-bale items
                        // Bales already deducted stock from FG when they were produced/created
                        if (restoredBales.length === 0) {
                            await createStockMovement({
                                date: new Date(),
                                movementType: 'FG_IN',
                                itemType: 'finished_product',
                                finishedProductId: item.finishedProductId,
                                quantityIn: Number(item.quantity),
                                referenceType: 'sales',
                                referenceCode: existingInvoice.invoiceNumber,
                                referenceId: existingInvoice.id,
                                reason: `Update reversal for invoice ${existingInvoice.invoiceNumber}`,
                            }, tx);
                        }
                    } else if (item.rawMaterialId) {
                        await createStockMovement({
                            date: new Date(),
                            movementType: 'RAW_IN',
                            itemType: 'raw_material',
                            rawMaterialId: item.rawMaterialId,
                            quantityIn: Number(item.quantity),
                            referenceType: 'sales',
                            referenceCode: existingInvoice.invoiceNumber,
                            referenceId: existingInvoice.id,
                            reason: `Update reversal for material ${item.productName} in invoice ${existingInvoice.invoiceNumber}`,
                        }, tx);
                    }
                }
            }

            // Correction for reversal logic (matching DELETE)
            if (existingInvoice.status === 'Confirmed') {
                // Clear previous movements for this invoice to avoid double reversal if updated multiple times?
                // No, standard flow is to create a new reversal entry.
            }

            // 3. Re-calculate GST logic based on effective placeOfSupply
            // Extract state code from GST number if available
            let validGstCode = null;
            if (customerId) {
                const [customer] = await tx.select().from(customers).where(eq(customers.id, customerId));
                if (customer?.gstNo && customer.gstNo.length >= 2) {
                    const prefix = customer.gstNo.substring(0, 2);
                    if (/^\d{2}$/.test(prefix)) validGstCode = prefix;
                }
            }

            const effectivePOS = placeOfSupply || validGstCode || existingInvoice.placeOfSupply || COMPANY_STATE_CODE;
            const isInterState = effectivePOS !== COMPANY_STATE_CODE;

            // 3. Validation
            if (status === 'Confirmed') {
                for (const item of items) {
                    if (item.rawMaterialRollId) {
                        const [roll] = await db.select().from(rawMaterialRolls).where(eq(rawMaterialRolls.id, item.rawMaterialRollId));
                        if (!roll) throw createError(`Roll not found`, 404);
                        // Check if this roll was already in this invoice
                        const wasInInvoice = existingInvoice.items?.some(i => i.rawMaterialRollId === item.rawMaterialRollId);
                        if (!wasInInvoice && roll.status !== 'In Stock') {
                            throw createError(`Roll ${roll.rollCode} is already ${roll.status}`, 400);
                        }
                    } else if (item.bellItemId) {
                        const [bell] = await db.select().from(bellItems).where(eq(bellItems.id, item.bellItemId));
                        if (!bell) throw createError(`Bell item not found`, 404);
                        // Start Correction: Check if it was already in this invoice
                        const wasInInvoice = existingInvoice.items?.some(i => (i.bellItemId || undefined) === item.bellItemId);
                        if (!wasInInvoice && bell.status !== 'Available') {
                            throw createError(`Bell item ${bell.code} is already ${bell.status}`, 400);
                        }
                        // End Correction
                    } else if (item.finishedProductId) {
                        // Only validate regular finished goods, bales are discrete and bypassed
                        if (!item.bellItemId && (!item.childItems || item.childItems.length === 0)) {
                            const validation = await validateFinishedProductStock(item.finishedProductId, item.quantity, tx);
                            if (!validation.isValid) {
                                const [product] = await tx.select().from(finishedProducts).where(eq(finishedProducts.id, item.finishedProductId));
                                throw createError(`Insufficient stock for ${product?.name || 'product'}: ${validation.message}`, 400);
                            }
                        }
                    }
                }
            }

            // 5. Calculate New Totals
            let subtotal = 0;
            let totalDiscount = 0;
            let totalCgst = 0;
            let totalSgst = 0;
            let totalIgst = 0;

            const processedItems = await Promise.all(items.map(async item => {
                let productName = 'Unknown Item';
                let hsnCode = '60059000';
                let product = null;
                let rawMaterial = null;

                if (item.finishedProductId) {
                    [product] = await tx.select().from(finishedProducts).where(eq(finishedProducts.id, item.finishedProductId));
                    productName = product?.name || 'Unknown Product';
                    hsnCode = product?.hsnCode || '60059000';

                    if (item.bellItemId) {
                        const bellData = await tx
                            .select({ code: bellItems.code, batchCode: bellBatches.code, pieceCount: bellItems.pieceCount })
                            .from(bellItems)
                            .leftJoin(bellBatches, eq(bellItems.batchId, bellBatches.id))
                            .where(eq(bellItems.id, item.bellItemId));

                        if (bellData[0]) {
                            const itemCode = bellData[0].batchCode || bellData[0].code;
                            const pcs = bellData[0].pieceCount || '1';
                            productName = `${itemCode} - ${productName} (${Math.round(Number(pcs))} pcs)`;
                        }
                    } else if (item.childItems && item.childItems.length > 0) {
                        const representative = item.childItems[0];
                        const itemCode = representative.batch?.code || representative.code || representative.batchCode;
                        const totalPcs = item.childItems.reduce((sum: number, b: any) => sum + Number(b.pieceCount || 1), 0);
                        if (itemCode) {
                            productName = `${itemCode} - ${productName} (${Math.round(totalPcs)} pcs)`;
                        }
                    }
                } else if (item.rawMaterialRollId) {
                    const [roll] = await tx.select().from(rawMaterialRolls)
                        .leftJoin(rawMaterials, eq(rawMaterialRolls.rawMaterialId, rawMaterials.id))
                        .where(eq(rawMaterialRolls.id, item.rawMaterialRollId));
                    if (roll && roll.raw_materials) {
                        productName = `${roll.raw_material_rolls.rollCode} - ${roll.raw_materials.name}`;
                        hsnCode = roll.raw_materials.hsnCode || '3901';
                        rawMaterial = roll.raw_materials;
                    }
                } else if (item.rawMaterialId) {
                    const [material] = await tx.select().from(rawMaterials).where(eq(rawMaterials.id, item.rawMaterialId));
                    if (material) {
                        productName = material.name;
                        hsnCode = material.hsnCode || '3901';
                        rawMaterial = material;
                    }
                } else if (item.generalItemId) {
                    const [genItem] = await tx.select().from(generalItems).where(eq(generalItems.id, item.generalItemId));
                    if (genItem) {
                        productName = genItem.name;
                        hsnCode = '00000000';
                    }
                }

                const amount = item.quantity * item.rate;
                const discount = item.discount || 0;
                const taxableAmount = amount - discount;
                const gstAmount = (taxableAmount * item.gstPercent) / 100;

                subtotal += amount;
                totalDiscount += discount;

                const cgst = isInterState ? 0 : gstAmount / 2;
                const sgst = isInterState ? 0 : gstAmount / 2;
                const igst = isInterState ? gstAmount : 0;

                if (isInterState) {
                    totalIgst += igst;
                } else {
                    totalCgst += cgst;
                    totalSgst += sgst;
                }

                return {
                    ...item,
                    productName,
                    hsnCode,
                    product,
                    rawMaterial,
                    amount,
                    taxableAmount,
                    cgst,
                    sgst,
                    igst,
                    total: taxableAmount + gstAmount,
                };
            }));

            const totalTax = totalCgst + totalSgst + totalIgst;
            const taxableTotal = subtotal - totalDiscount;
            const grandTotal = Math.round(taxableTotal + totalTax);

            // 6. Update Invoice Record
            let finalCustomerName = customerName;
            if (!finalCustomerName && customerId && customerId !== existingInvoice.customerId) {
                const [newCustomer] = await tx.select().from(customers).where(eq(customers.id, customerId));
                finalCustomerName = newCustomer?.name || 'Unknown Customer';
            } else if (!finalCustomerName) {
                finalCustomerName = existingInvoice.customerName;
            }

            // 6. Check for exact payment recalculations if grandTotal drops below paidAmount
            const currentPaidAmount = parseFloat(existingInvoice.paidAmount || '0');
            let newPaidAmount = currentPaidAmount;
            let newBalanceAmount = grandTotal - currentPaidAmount;
            let finalPaymentStatus: string = existingInvoice.paymentStatus || 'Unpaid';

            if (grandTotal < currentPaidAmount) {
                // The newly updated invoice total is smaller than what has already been paid for it.
                // We must un-allocate the excess payment.
                let excessAmount = currentPaidAmount - grandTotal;
                newPaidAmount = grandTotal;
                newBalanceAmount = 0;

                // Process existing allocations LIFO
                const allocations = await tx.select().from(invoicePaymentAllocations)
                    .where(eq(invoicePaymentAllocations.invoiceId, id))
                    .orderBy(desc(invoicePaymentAllocations.createdAt));

                for (const alloc of allocations) {
                    if (excessAmount <= 0) break;

                    const allocAmount = parseFloat(alloc.amount);
                    const amountToRevert = Math.min(allocAmount, excessAmount);

                    if (amountToRevert === allocAmount) {
                        await tx.delete(invoicePaymentAllocations).where(eq(invoicePaymentAllocations.id, alloc.id));
                    } else {
                        await tx.update(invoicePaymentAllocations)
                            .set({ amount: String(allocAmount - amountToRevert) })
                            .where(eq(invoicePaymentAllocations.id, alloc.id));
                    }

                    // Revert to advance balance
                    await tx.update(paymentTransactions)
                        .set({
                            isAdvance: true,
                            advanceBalance: sql`COALESCE(${paymentTransactions.advanceBalance}, 0) + ${amountToRevert}`
                        })
                        .where(eq(paymentTransactions.id, alloc.paymentId));

                    excessAmount -= amountToRevert;
                }
            } else {
                newBalanceAmount = Math.max(0, grandTotal - currentPaidAmount);
            }

            // Determine final payment status manually based on new paid amount and grand total
            if (newPaidAmount >= grandTotal) {
                finalPaymentStatus = 'Paid';
            } else if (newPaidAmount > 0) {
                finalPaymentStatus = 'Partial';
            } else {
                finalPaymentStatus = 'Unpaid';
            }

            const [updatedInvoice] = await tx.update(invoices)
                .set({
                    invoiceDate: new Date(invoiceDate),
                    customerId: customerId || null,
                    customerName: finalCustomerName,
                    placeOfSupply: effectivePOS,
                    invoiceType,
                    subtotal: String(subtotal),
                    discountAmount: String(totalDiscount),
                    taxableAmount: String(taxableTotal),
                    cgst: String(totalCgst),
                    sgst: String(totalSgst),
                    igst: String(totalIgst),
                    totalTax: String(totalTax),
                    grandTotal: String(grandTotal),
                    paidAmount: String(newPaidAmount),
                    balanceAmount: String(newBalanceAmount),
                    paymentStatus: finalPaymentStatus,
                    status,
                    updatedAt: new Date(),
                })
                .where(eq(invoices.id, id))
                .returning();

            // 7. Replace Items
            await tx.delete(invoiceItems).where(eq(invoiceItems.invoiceId, id));

            const insertedItems = await Promise.all(processedItems.map(async (item) => {
                const [insertedItem] = (await tx.insert(invoiceItems).values({
                    invoiceId: id,
                    finishedProductId: item.finishedProductId || null,
                    rawMaterialId: item.rawMaterialId || null,
                    rawMaterialRollId: item.rawMaterialRollId || null,
                    generalItemId: item.generalItemId || null,
                    productName: item.productName,
                    hsnCode: item.hsnCode || '60059000',
                    quantity: String(item.quantity),
                    rate: String(item.rate),
                    amount: String(item.amount),
                    discountAmount: String(item.discount || 0),
                    bellItemId: item.bellItemId,

                    taxableAmount: String(item.taxableAmount),
                    gstPercent: String(item.gstPercent),
                    cgst: String(item.cgst),
                    sgst: String(item.sgst),
                    igst: String(item.igst),
                    totalAmount: String(item.total),
                }).returning()) as any[];

                // Start Update: Always link Bales to preserve relationship in Drafts
                const baleIds = item.bellItemId ? [item.bellItemId] : (item.childItems || []).map((b: any) => b.id);
                for (const baleId of baleIds) {
                    await tx.update(bellItems)
                        .set({
                            invoiceItemId: insertedItem.id,
                            updatedAt: new Date()
                        })
                        .where(eq(bellItems.id, baleId));
                }

                if (status === 'Confirmed') {
                    if (item.rawMaterialRollId) {
                        await tx.update(rawMaterialRolls)
                            .set({ status: 'Sold' })
                            .where(eq(rawMaterialRolls.id, item.rawMaterialRollId));

                        await createStockMovement({
                            date: new Date(),
                            movementType: 'RAW_OUT',
                            itemType: 'raw_material',
                            rawMaterialId: item.rawMaterialId!,
                            quantityOut: Number(item.quantity),
                            referenceType: 'sales',
                            referenceCode: existingInvoice.invoiceNumber,
                            referenceId: existingInvoice.id,
                            reason: `Sold Roll ${item.productName} to ${finalCustomerName || 'Customer'}`,
                        }, tx);
                    } else if (item.bellItemId || (item.childItems && item.childItems.length > 0)) {
                        // Already linked above, now mark as Sold if confirmed
                        for (const baleId of baleIds) {
                            await tx.update(bellItems)
                                .set({ status: 'Sold' })
                                .where(eq(bellItems.id, baleId));
                        }
                    } else if (item.finishedProductId) {
                        // ONLY create FG_OUT movement for non-bale items
                        await createStockMovement({
                            date: new Date(),
                            movementType: 'FG_OUT',
                            itemType: 'finished_product',
                            finishedProductId: item.finishedProductId,
                            quantityOut: Number(item.quantity),
                            referenceType: 'sales',
                            referenceCode: existingInvoice.invoiceNumber,
                            referenceId: existingInvoice.id,
                            reason: `Sold to ${finalCustomerName || 'Customer'}`,
                        }, tx);
                    } else if (item.rawMaterialId) {
                        await createStockMovement({
                            date: new Date(),
                            movementType: 'RAW_OUT',
                            itemType: 'raw_material',
                            rawMaterialId: item.rawMaterialId,
                            quantityOut: Number(item.quantity),
                            referenceType: 'sales',
                            referenceCode: existingInvoice.invoiceNumber,
                            referenceId: existingInvoice.id,
                            reason: `Sold material ${item.productName} to ${finalCustomerName || 'Customer'}`,
                        }, tx);
                    }
                }
                return insertedItem;
            }));

            // 8. Sync Outstanding
            if (customerId) await syncCustomerOutstanding(customerId, tx);
            if (existingInvoice.customerId && existingInvoice.customerId !== customerId) {
                await syncCustomerOutstanding(existingInvoice.customerId, tx);
            }
        });

        res.json(successResponse({ message: 'Invoice updated successfully' }));

        realtimeService.emit('sales_updated');
        realtimeService.emit('dashboard_updated');
        if (status === 'Confirmed') {
            invalidateInventorySummary();
            invalidateDashboardKPIs();
            cacheService.del('masters:customers');
        }

    } catch (error) {
        next(error);
    }
});

// ============================================================
// RECORD PAYMENT
// ============================================================

/**
 * POST /sales/invoices/:id/payment
 * Record a payment against a sales invoice
 */
router.post('/invoices/:id/payments', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const { amount, paymentMode = 'Cash', reference } = req.body;

        if (!amount || amount <= 0) {
            throw createError('Valid payment amount required', 400);
        }

        const result = await db.transaction(async (tx) => {
            // 1. Get current invoice
            const [invoice] = await tx.select().from(invoices).where(eq(invoices.id, id));
            if (!invoice) throw createError('Invoice not found', 404);

            const currentPaid = parseFloat(invoice.paidAmount || '0');
            const grandTotal = parseFloat(invoice.grandTotal || '0');
            const newPaid = currentPaid + parseFloat(amount);
            const newBalance = grandTotal - newPaid;

            // 2. Determine payment status
            let paymentStatus = 'Unpaid';
            if (newPaid >= grandTotal) paymentStatus = 'Paid';
            else if (newPaid > 0) paymentStatus = 'Partial';

            // 3. Update invoice
            const [updatedInvoice] = await tx.update(invoices)
                .set({
                    paidAmount: String(newPaid),
                    balanceAmount: String(newBalance),
                    paymentStatus,
                    updatedAt: new Date(),
                })
                .where(eq(invoices.id, id))
                .returning();

            // 4. Generate payment code
            const paymentCode = await getNextTransactionCode('RECEIPT');

            // 5. Record payment transaction
            await tx.insert(paymentTransactions).values({
                code: paymentCode,
                date: new Date(),
                type: 'RECEIPT',
                referenceType: 'sales',
                referenceId: id,
                referenceCode: invoice.invoiceNumber,
                partyType: 'customer',
                partyId: invoice.customerId || 'walk-in',
                partyName: invoice.customerName,
                mode: paymentMode,
                amount: String(amount),
                bankReference: reference || null,
            });

            // 6. Update customer outstanding
            if (invoice.customerId) {
                await syncCustomerOutstanding(invoice.customerId, tx);
            }

            return { paymentCode, invoiceCode: invoice.invoiceNumber, customerName: invoice.customerName, newPaid, newBalance, paymentStatus };
        });

        const { paymentCode, invoiceCode, customerName, newPaid, newBalance, paymentStatus } = result;

        // Detailed Console Log for Accounting Entry
        console.log('\n======================================================');
        console.log(`[ACCOUNTING LOG] INVOICE PAYMENT Recorded Successfully`);
        console.log('======================================================');
        console.log(`Payment Code   : ${paymentCode}`);
        console.log(`Invoice No     : ${invoiceCode}`);
        console.log(`Date           : ${new Date().toLocaleString()}`);
        console.log(`Amount Paid    : ₹${parseFloat(String(amount)).toFixed(2)} ([${paymentMode}])`);
        console.log(`New Paid Total : ₹${parseFloat(String(newPaid)).toFixed(2)}`);
        console.log(`New Balance    : ₹${parseFloat(String(newBalance)).toFixed(2)}`);
        console.log(`Payment Status : ${paymentStatus}`);
        console.log('------------------------------------------------------\n');

        res.json(successResponse({
            message: 'Payment recorded',
            paymentCode
        }));

        cacheService.del('masters:customers');
        realtimeService.emit('sales_updated');
    } catch (error) {
        next(error);
    }
});

// ============================================================
// GET SALES SUMMARY
// ============================================================

/**
 * GET /sales/summary
 * Get sales summary for dashboard cards
 */
router.get('/summary', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const result = await db
            .select({
                totalSales: sql<string>`COALESCE(SUM(${invoices.grandTotal}::numeric), 0)`,
                collected: sql<string>`COALESCE(SUM(${invoices.paidAmount}::numeric), 0)`,
                invoiceCount: sql<number>`COUNT(*)`,
                paidCount: sql<number>`COUNT(*) FILTER (WHERE ${invoices.paymentStatus} = 'Paid')`,
                unpaidCount: sql<number>`COUNT(*) FILTER (WHERE ${invoices.paymentStatus} = 'Unpaid')`,
                gstCollected: sql<string>`COALESCE(SUM(${invoices.totalTax}::numeric), 0)`,
            })
            .from(invoices)
            .where(inArray(invoices.status, ['Confirmed', 'Approved']));

        const summary = result[0];
        const totalSales = parseFloat(summary?.totalSales || '0');
        const collected = parseFloat(summary?.collected || '0');

        res.json(successResponse({
            totalSales,
            collected,
            receivables: totalSales - collected,
            gstCollected: parseFloat(summary?.gstCollected || '0'),
            invoiceCount: Number(summary?.invoiceCount || 0),
            paidCount: Number(summary?.paidCount || 0),
            unpaidCount: Number(summary?.unpaidCount || 0),
        }));
    } catch (error) {
        next(error);
    }
});

/**
 * DELETE /sales/invoices/:id
 * Delete (void) a sales invoice
 * - Restores bell item status to 'Available' if bells were used
 * - Creates reversal stock movements
 */
router.delete('/invoices/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;

        // Find the invoice with its items using salesInvoices which has relations defined
        const invoice = await db.query.salesInvoices.findFirst({
            where: eq(salesInvoices.id, id),
            with: {
                items: true
            }
        });

        if (!invoice) {
            throw createError('Invoice not found', 404);
        }

        // Cannot delete already paid invoices
        if (invoice.status === 'Paid') {
            throw createError('Cannot delete a paid invoice. Please reverse payments first.', 400);
        }

        // Save customerId before deletion
        const affectedCustomerId = invoice.customerId;

        await db.transaction(async (tx) => {
            // Restore items to stock
            for (const item of invoice.items || []) {
                // 1. Restore bell items (bales) if any
                const restoredBales = await tx.update(bellItems)
                    .set({ status: 'Available', invoiceItemId: null })
                    .where(eq(bellItems.invoiceItemId, item.id))
                    .returning();

                // 2. Create reversal stock movements (only if confirmed)
                if (invoice.status === 'Confirmed') {
                    // A. Generic Finished Goods (Non-Bale)
                    // If restoredBales has items, it was a bale sale, so skip FG_IN movement
                    if (item.finishedProductId && restoredBales.length === 0 && !item.bellItemId) {
                        await createStockMovement({
                            date: new Date(),
                            movementType: 'FG_IN',
                            itemType: 'finished_product',
                            finishedProductId: item.finishedProductId,
                            quantityIn: parseFloat(item.quantity),
                            referenceType: 'sales_invoice_reversal',
                            referenceId: invoice.id,
                            referenceCode: invoice.invoiceNumber,
                            reason: `Reversal of deleted invoice ${invoice.invoiceNumber}`,
                        }, tx);
                    }
                    // B. Raw Material Rolls
                    else if (item.rawMaterialRollId) {
                        await tx.update(rawMaterialRolls)
                            .set({ status: 'In Stock' })
                            .where(eq(rawMaterialRolls.id, item.rawMaterialRollId));

                        await createStockMovement({
                            date: new Date(),
                            movementType: 'RAW_IN',
                            itemType: 'raw_material',
                            rawMaterialId: item.rawMaterialId!,
                            quantityIn: parseFloat(item.quantity),
                            referenceType: 'sales_invoice_reversal',
                            referenceId: invoice.id,
                            referenceCode: invoice.invoiceNumber,
                            reason: `Reversal of deleted roll sale ${invoice.invoiceNumber}`,
                        }, tx);
                    }
                    // C. Generic Raw Materials
                    else if (item.rawMaterialId) {
                        await createStockMovement({
                            date: new Date(),
                            movementType: 'RAW_IN',
                            itemType: 'raw_material',
                            rawMaterialId: item.rawMaterialId,
                            quantityIn: parseFloat(item.quantity),
                            referenceType: 'sales_invoice_reversal',
                            referenceId: invoice.id,
                            referenceCode: invoice.invoiceNumber,
                            reason: `Reversal of deleted raw material sale ${invoice.invoiceNumber}`,
                        }, tx);
                    }
                }
            }

            // 3. Delete invoice items
            await tx.delete(invoiceItems).where(eq(invoiceItems.invoiceId, id));

            // 4. Delete the invoice
            await tx.delete(salesInvoices).where(eq(salesInvoices.id, id));

            // 5. Update customer outstanding
            if (affectedCustomerId) {
                await syncCustomerOutstanding(affectedCustomerId, tx);
            }
        });

        // Invalidate caches
        cacheService.del('dashboard:kpis');
        cacheService.del('masters:customers');

        res.json(successResponse({ message: 'Invoice deleted successfully' }));

        // Broadcast real-time update
        realtimeService.emit('sales_updated');
        realtimeService.emit('inventory_updated');
        realtimeService.emit('dashboard_updated');
        invalidateInventorySummary();
        invalidateDashboardKPIs();
    } catch (error) {
        next(error);
    }
});

export default router;

// ============================================================
// RECEIPT / PAYMENT ENTRY (NEW)
// ============================================================

/**
 * GET /sales/outstanding/:customerId
 * Get all unpaid invoices for a customer
 */
router.get('/outstanding/:customerId', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { customerId } = req.params;
        const { includeReceiptId } = req.query;

        // Get confirmed invoices with outstanding balance
        const outstandingInvoices = await db
            .select()
            .from(invoices)
            .where(
                and(
                    eq(invoices.customerId, customerId),
                    eq(invoices.status, 'Confirmed'),
                    sql`${invoices.paymentStatus} != 'Paid'`
                )
            )
            .orderBy(invoices.invoiceDate);

        let finalInvoices = [...outstandingInvoices];

        // If editing a receipt, we must also include invoices that were fully/partially paid by this specific receipt
        // and add the allocated amount BACK to their balance so the user can reallocate.
        if (includeReceiptId) {
            const allocations = await db.select()
                .from(invoicePaymentAllocations)
                .where(eq(invoicePaymentAllocations.paymentId, includeReceiptId as string));

            for (const alloc of allocations) {
                // Check if this invoice is already in our list
                let inv = finalInvoices.find(i => i.id === alloc.invoiceId);

                if (!inv) {
                    // It was fully paid, so it wasn't fetched above. Fetch it now.
                    const [paidInv] = await db.select().from(invoices).where(eq(invoices.id, alloc.invoiceId));
                    if (paidInv) {
                        inv = paidInv;
                        finalInvoices.push(inv);
                    }
                }

            }

            // Re-sort by date just in case
            finalInvoices.sort((a, b) => new Date(a.invoiceDate).getTime() - new Date(b.invoiceDate).getTime());
        }

        res.json(successResponse(finalInvoices));
    } catch (error) {
        next(error);
    }
});

interface Allocation {
    invoiceId: string;
    amount: number;
}

interface CreateReceiptRequest {
    customerId: string;
    date: string;
    mode: 'Cash' | 'Bank' | 'Cheque' | 'UPI';
    amount: number;
    accountId: string;
    reference?: string;
    remarks?: string;
    allocations: Allocation[];
}

/**
 * POST /sales/receipts
 * Create a new receipt with invoice allocations
 */
router.post('/receipts', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const {
            customerId,
            amount,
            mode, // Cash, Bank, Cheque, UPI
            accountId, // Bank/Cash account ID
            bankReference,
            allocations, // Array of { invoiceId, amount }
            useAdvanceReceipt, // NEW: Boolean
            selectedAdvanceId, // NEW: ID of advance to adjust
            isAdvance // Boolean (for creating new advance)
        } = req.body;

        const transactionId = crypto.randomUUID();
        const code = `RCPT-${Date.now()}`;

        const result = await db.transaction(async (tx) => {
            // 1. Get customer for details
            const [customer] = await tx.select().from(customers).where(eq(customers.id, customerId));
            if (!customer) {
                throw createError('Customer not found', 404);
            }

            let finalMode = mode;
            let finalAccountId = accountId;

            // HANDLE ADVANCE ADJUSTMENT
            if (useAdvanceReceipt && selectedAdvanceId) {
                finalMode = 'Adjustment';
                finalAccountId = null; // No bank account involved

                // Fetch Advance
                const [advance] = await tx.select().from(paymentTransactions).where(eq(paymentTransactions.id, selectedAdvanceId));
                if (!advance) throw createError('Selected advance not found', 404);

                const currentAdvanceBalance = parseFloat(advance.advanceBalance || '0');
                const adjustmentAmount = parseFloat(amount);

                if (currentAdvanceBalance < adjustmentAmount) {
                    throw createError('Insufficient advance balance', 400);
                }

                // Reduce Advance Balance
                await tx.update(paymentTransactions)
                    .set({
                        advanceBalance: String(currentAdvanceBalance - adjustmentAmount),
                    })
                    .where(eq(paymentTransactions.id, selectedAdvanceId));
            }

            // 3. Create Payment Transaction (The Receipt)
            await tx.insert(paymentTransactions).values({
                id: transactionId,
                code,
                date: new Date(),
                type: 'RECEIPT',
                referenceType: 'sales',
                referenceId: transactionId,
                referenceCode: 'MULTIPLE',
                partyType: 'customer',
                partyId: customerId,
                partyName: customer.name,
                mode: finalMode,
                accountId: finalAccountId,
                amount: amount.toString(),
                bankReference: useAdvanceReceipt ? `Adj Ref: ${selectedAdvanceId}` : bankReference,
                status: 'Completed',
                // Calculate Advance Automatically
                isAdvance: (parseFloat(amount) - (allocations || []).reduce((sum: number, a: any) => sum + Number(a.amount), 0)) > 0,
                advanceBalance: String(Math.max(0, parseFloat(amount) - (allocations || []).reduce((sum: number, a: any) => sum + Number(a.amount), 0))),
                remarks: useAdvanceReceipt ? `Adjusted from Advance` : req.body.remarks
            });

            // 4. Process Allocations
            if (allocations && allocations.length > 0) {
                for (const allocation of allocations) {
                    await tx.insert(invoicePaymentAllocations).values({
                        paymentId: transactionId,
                        invoiceId: allocation.invoiceId,
                        amount: allocation.amount.toString(),
                    });

                    // Update Invoice
                    const [invoice] = await tx.select().from(salesInvoices).where(eq(salesInvoices.id, allocation.invoiceId));
                    if (invoice) {
                        const newPaid = parseFloat(invoice.paidAmount || '0') + Number(allocation.amount);
                        const newBalance = parseFloat(invoice.grandTotal || '0') - newPaid;

                        await tx.update(salesInvoices)
                            .set({
                                paidAmount: newPaid.toString(),
                                balanceAmount: newBalance.toString(),
                                paymentStatus: newBalance <= 1 ? 'Paid' : 'Partial'
                            })
                            .where(eq(salesInvoices.id, allocation.invoiceId));
                    }
                }
            }

            // 5. Update Customer Outstanding
            await syncCustomerOutstanding(customerId, tx);

            // 6. Update Bank/Cash Balance (only if NOT adjustment)
            if (finalAccountId && !useAdvanceReceipt) {
                const [account] = await tx.select().from(bankCashAccounts).where(eq(bankCashAccounts.id, finalAccountId));
                if (account) {
                    const newAccountBalance = parseFloat(account.balance || '0') + parseFloat(amount);
                    await tx.update(bankCashAccounts)
                        .set({ balance: newAccountBalance.toString() })
                        .where(eq(bankCashAccounts.id, finalAccountId));
                }
            }

            // 7. Create General Ledger Entries
            if (useAdvanceReceipt) {
                // ADJUSTMENT ENTRIES
                await tx.insert(generalLedger).values({
                    transactionDate: new Date(),
                    voucherNumber: code,
                    voucherType: 'JOURNAL',
                    ledgerId: customerId,
                    ledgerType: 'CUSTOMER',
                    debitAmount: amount.toString(),
                    creditAmount: '0',
                    description: `Adjustment from Advance`,
                    referenceId: transactionId
                });
            } else {
                if (finalAccountId) {
                    await tx.insert(generalLedger).values({
                        transactionDate: new Date(),
                        voucherNumber: code,
                        voucherType: 'RECEIPT',
                        ledgerId: finalAccountId,
                        ledgerType: mode === 'Cash' ? 'CASH' : 'BANK',
                        debitAmount: amount.toString(),
                        creditAmount: '0',
                        description: `Receipt from ${customer.name}`,
                        referenceId: transactionId
                    });
                }
            }

            // CREDIT: Customer Account (Receivables / Payment)
            await tx.insert(generalLedger).values({
                transactionDate: new Date(),
                voucherNumber: code,
                voucherType: 'RECEIPT',
                ledgerId: customerId,
                ledgerType: 'CUSTOMER',
                debitAmount: '0',
                creditAmount: amount.toString(),
                description: useAdvanceReceipt ? `Invoice Adjusted with Advance` : `Payment received in ${mode}`,
                referenceId: transactionId
            });

            return { customerName: customer.name, finalMode };
        });

        const { customerName, finalMode } = result;

        // Invalidate caches
        cacheService.del('dashboard:kpis');
        cacheService.del('finance:transactions');
        cacheService.del('masters:customers');

        // Detailed Console Log for Accounting Entry
        console.log('\n======================================================');
        console.log(`[ACCOUNTING LOG] SALES RECEIPT Recorded Successfully`);
        console.log('======================================================');
        console.log(`Receipt Code   : ${code}`);
        console.log(`Date           : ${new Date().toLocaleString()}`);
        console.log(`Customer       : ${customerName}`);
        console.log(`Amount Paid    : ₹${parseFloat(String(amount)).toFixed(2)} ([${finalMode}])`);
        console.log(`Allocations    : ${(allocations || []).length} invoice(s) settled`);
        console.log(`Remarks        : ${useAdvanceReceipt ? 'Advance Adjusted' : 'Regular Receipt'}`);
        console.log('------------------------------------------------------\n');

        res.json(successResponse({
            receiptId: transactionId,
            message: 'Receipt created and allocated successfully'
        }));

        // Broadcast real-time update
        realtimeService.emit('sales_updated');
        realtimeService.emit('accounts_updated');
        realtimeService.emit('dashboard_updated');
        invalidateDashboardKPIs();
        cacheService.del('masters:customers');

    } catch (error) {
        next(error);
    }
});

// DELETE RECEIPT (Revert & Delete)
router.delete('/receipts/:id', async (req, res, next) => {
    try {
        const { id } = req.params;

        // 1. Fetch Receipt
        const receipt = (await db.select().from(paymentTransactions).where(eq(paymentTransactions.id, id)))[0];
        if (!receipt) throw createError('Receipt not found', 404);

        await db.transaction(async (tx) => {
            // 2. Revert Invoices (Fetch & Delete Allocations)
            const allocations = await tx.select().from(invoicePaymentAllocations).where(eq(invoicePaymentAllocations.paymentId, id));

            for (const allocation of allocations) {
                const invoice = (await tx.select().from(salesInvoices).where(eq(salesInvoices.id, allocation.invoiceId)))[0];
                if (invoice) {
                    const newPaid = parseFloat(invoice.paidAmount || '0') - parseFloat(allocation.amount);
                    const newBalance = parseFloat(invoice.grandTotal || '0') - newPaid;

                    await tx.update(salesInvoices)
                        .set({
                            paidAmount: newPaid.toString(),
                            balanceAmount: newBalance.toString(),
                            paymentStatus: newBalance >= parseFloat(invoice.grandTotal || '0') - 1 ? 'Unpaid' : (newBalance > 1 ? 'Partial' : 'Paid')
                        })
                        .where(eq(salesInvoices.id, allocation.invoiceId));
                }
            }
            // Delete allocations
            await tx.delete(invoicePaymentAllocations).where(eq(invoicePaymentAllocations.paymentId, id));

            // 3. Removed Revert Customer Outstanding from here because the DB row still exists during the query.

            // 4. Revert Bank Balance (Decrease it) - IF logic matches original receipt
            if (receipt.accountId) {
                const account = (await tx.select().from(bankCashAccounts).where(eq(bankCashAccounts.id, receipt.accountId)))[0];
                if (account) {
                    const newBalance = parseFloat(account.balance || '0') - parseFloat(receipt.amount);
                    await tx.update(bankCashAccounts)
                        .set({ balance: newBalance.toString() })
                        .where(eq(bankCashAccounts.id, receipt.accountId));
                }
            }

            // 5. Delete Ledger Entries
            await tx.delete(generalLedger).where(eq(generalLedger.referenceId, id));

            // 6. Delete Receipt Transaction
            await tx.delete(paymentTransactions).where(eq(paymentTransactions.id, id));

            // 7. Update Customer Outstanding AFTER the receipt is successfully wiped from DB
            if (receipt.partyId) {
                await syncCustomerOutstanding(receipt.partyId as string, tx);
            }
        });

        // Invalidate caches
        cacheService.del('dashboard:kpis');
        cacheService.del('finance:transactions');
        cacheService.del('masters:customers');

        res.json(successResponse({ message: 'Receipt deleted and financial impact reverted successfully' }));

        // Broadcast real-time update
        realtimeService.emit('sales_updated');
        realtimeService.emit('accounts_updated');
        realtimeService.emit('dashboard_updated');
        invalidateDashboardKPIs();

    } catch (error) {
        next(error);
    }
});

// UPDATE RECEIPT (Revert & Recreate)
router.put('/receipts/:id', async (req, res, next) => {
    try {
        const { id } = req.params;
        const {
            date,
            mode,
            accountId,
            bankReference,
            remarks,
            allocations,
            amount,
        } = req.body;

        const receipt = (await db.select().from(paymentTransactions).where(eq(paymentTransactions.id, id)))[0];
        if (!receipt) throw createError('Receipt not found', 404);

        const customerId = receipt.partyId;

        // Ensure date is valid or use existing/now
        const transactionDate = date ? new Date(date) : new Date(receipt.date || Date.now());

        await db.transaction(async (tx) => {
            // ==========================================
            // 1. REVERT OLD RECEIPT (Similar to DELETE)
            // ==========================================
            const oldAllocations = await tx.select().from(invoicePaymentAllocations).where(eq(invoicePaymentAllocations.paymentId, id));

            for (const allocation of oldAllocations) {
                const invoice = (await tx.select().from(salesInvoices).where(eq(salesInvoices.id, allocation.invoiceId)))[0];
                if (invoice) {
                    const newPaid = parseFloat(invoice.paidAmount || '0') - parseFloat(allocation.amount);
                    const newBalance = parseFloat(invoice.grandTotal || '0') - newPaid;

                    await tx.update(salesInvoices)
                        .set({
                            paidAmount: newPaid.toString(),
                            balanceAmount: newBalance.toString(),
                            paymentStatus: newBalance >= parseFloat(invoice.grandTotal || '0') - 1 ? 'Unpaid' : (newBalance > 1 ? 'Partial' : 'Paid')
                        })
                        .where(eq(salesInvoices.id, allocation.invoiceId));
                }
            }
            await tx.delete(invoicePaymentAllocations).where(eq(invoicePaymentAllocations.paymentId, id));

            // Revert Bank Balance 
            if (receipt.accountId) {
                const account = (await tx.select().from(bankCashAccounts).where(eq(bankCashAccounts.id, receipt.accountId)))[0];
                if (account) {
                    const newBalance = parseFloat(account.balance || '0') - parseFloat(receipt.amount);
                    await tx.update(bankCashAccounts)
                        .set({ balance: newBalance.toString() })
                        .where(eq(bankCashAccounts.id, receipt.accountId));
                }
            }

            await tx.delete(generalLedger).where(eq(generalLedger.referenceId, id));

            // ==========================================
            // 2. RECREATE NEW RECEIPT
            // ==========================================
            let finalMode = mode || receipt.mode;
            let finalAccountId = accountId !== undefined ? accountId : receipt.accountId;
            let finalAmount = amount !== undefined ? amount.toString() : receipt.amount;

            const isAdvance = (parseFloat(finalAmount) - allocations.reduce((sum: number, a: any) => sum + Number(a.amount), 0)) > 0;
            const advanceBalance = String(Math.max(0, parseFloat(finalAmount) - allocations.reduce((sum: number, a: any) => sum + Number(a.amount), 0)));

            await tx.update(paymentTransactions).set({
                date: transactionDate,
                mode: finalMode,
                accountId: finalAccountId,
                amount: finalAmount,
                bankReference: bankReference !== undefined ? bankReference : receipt.bankReference,
                remarks: remarks !== undefined ? remarks : receipt.remarks,
                isAdvance,
                advanceBalance,
            }).where(eq(paymentTransactions.id, id));

            // Create New Allocations
            for (const allocation of allocations) {
                await tx.insert(invoicePaymentAllocations).values({
                    paymentId: id,
                    invoiceId: allocation.invoiceId,
                    amount: allocation.amount.toString(),
                });

                // Update Invoice
                const invoice = (await tx.select().from(salesInvoices).where(eq(salesInvoices.id, allocation.invoiceId)))[0];
                if (invoice) {
                    const newPaid = parseFloat(invoice.paidAmount || '0') + Number(allocation.amount);
                    const newBalance = parseFloat(invoice.grandTotal || '0') - newPaid;

                    await tx.update(salesInvoices)
                        .set({
                            paidAmount: newPaid.toString(),
                            balanceAmount: newBalance.toString(),
                            paymentStatus: newBalance <= 1 ? 'Paid' : 'Partial'
                        })
                        .where(eq(salesInvoices.id, allocation.invoiceId));
                }
            }

            // Update Bank/Cash Balance
            if (finalAccountId) {
                const account = (await tx.select().from(bankCashAccounts).where(eq(bankCashAccounts.id, finalAccountId)))[0];
                if (account) {
                    const newAccountBalance = parseFloat(account.balance || '0') + parseFloat(finalAmount);
                    await tx.update(bankCashAccounts)
                        .set({ balance: newAccountBalance.toString() })
                        .where(eq(bankCashAccounts.id, finalAccountId));
                }
            }

            // General Ledger
            if (finalAccountId) {
                await tx.insert(generalLedger).values({
                    transactionDate: transactionDate,
                    voucherNumber: receipt.code,
                    voucherType: 'RECEIPT',
                    ledgerId: finalAccountId,
                    ledgerType: finalMode === 'Cash' ? 'CASH' : 'BANK',
                    debitAmount: finalAmount,
                    creditAmount: '0',
                    description: `Receipt from ${receipt.partyName}`,
                    referenceId: id
                });
            }

            await tx.insert(generalLedger).values({
                transactionDate: transactionDate,
                voucherNumber: receipt.code,
                voucherType: 'RECEIPT',
                ledgerId: customerId,
                ledgerType: 'CUSTOMER',
                debitAmount: '0',
                creditAmount: finalAmount,
                description: `Payment received in ${finalMode}`,
                referenceId: id
            });

            // Customer outstanding sync
            await syncCustomerOutstanding(customerId as string, tx);
        });

        cacheService.del('dashboard:kpis');
        cacheService.del('finance:transactions');
        cacheService.del('masters:customers');

        res.json(successResponse({
            receiptId: id,
            message: 'Receipt updated successfully'
        }));

        // Broadcast real-time update
        realtimeService.emit('sales_updated');
        realtimeService.emit('accounts_updated');
        realtimeService.emit('dashboard_updated');
        invalidateDashboardKPIs();

    } catch (error) {
        next(error);
    }
});
