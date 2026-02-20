/**
 * Purchase Routes
 * 
 * Handles raw material purchase management with:
 * - Multi-line item support
 * - CGST/SGST/IGST calculation based on supplier state
 * - Stock movements (RAW_IN) on confirmation
 * - Supplier ledger updates
 * - Payment tracking
 * 
 * GST Logic:
 * - Intra-state (same state): CGST + SGST (50% each)
 * - Inter-state (different state): IGST (100%)
 */

import { Router, Request, Response, NextFunction } from 'express';
import { db } from '../db/index';
import { createStockMovement, getPendingBillQuantity } from '../services/inventory.service';
import { cache as cacheService } from '../services/cache.service';

// ... (imports remain)
import {
    purchaseBills, purchaseBillItems, suppliers, rawMaterials, paymentTransactions,
    billPaymentAllocations, bankCashAccounts, generalLedger, rawMaterialBatches,
    finishedProducts, expenseHeads, productionBatchInputs, rawMaterialRolls,
    purchaseBillAdjustments, generalItems, stockMovements
} from '../db/schema';

// ... (inside the route)


import { eq, desc, asc, sql, count as countFn, and, inArray } from 'drizzle-orm';
import { successResponse } from '../types/api';
import { createError } from '../middleware/errorHandler';

const router = Router();

// Company state code for GST calculation (Maharashtra)
const COMPANY_STATE_CODE = '27';

// ============================================================
// TYPE DEFINITIONS
// ============================================================

interface CreateBillRequest {
    date: string;
    invoiceNumber: string; // Mandatory
    supplierId: string;
    status: 'Draft' | 'Confirmed';
    items: {
        rawMaterialId?: string;
        finishedProductId?: string;
        generalItemId?: string;
        generalItemName?: string;
        expenseHeadId?: string;
        quantity: number;
        unit?: string;
        rate: number;
        gstPercent: number;
    }[];
}

// ============================================================
// GET ALL BILLS
// ============================================================

/**
 * GET /purchase/bills
 * Retrieve all purchase bills with supplier and items
 */
router.get('/bills', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const offset = (page - 1) * limit;

        const { sortBy = 'createdAt', sortOrder = 'desc', type } = req.query;

        // 1. Build where clause
        const conditions = [];
        if (type) conditions.push(eq(purchaseBills.type, type as string));

        const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

        // 2. Total count
        const totalResult = await db.select({ count: countFn() })
            .from(purchaseBills)
            .where(whereClause);
        const total = Number(totalResult[0]?.count || 0);

        // 3. Sorting
        let orderByClause;
        const sortDirection = sortOrder === 'asc' ? asc : desc;

        switch (sortBy) {
            case 'date':
                orderByClause = sortDirection(purchaseBills.date);
                break;
            case 'code':
                orderByClause = sortDirection(purchaseBills.code);
                break;
            default:
                orderByClause = sortDirection(purchaseBills.createdAt);
        }

        // 4. Get bills (paginated)
        const bills = await db
            .select()
            .from(purchaseBills)
            .leftJoin(suppliers, eq(purchaseBills.supplierId, suppliers.id))
            .where(whereClause)
            .orderBy(orderByClause)
            .limit(limit)
            .offset(offset);

        if (bills.length === 0) {
            return res.json(successResponse({
                data: [],
                meta: { total, page, limit, totalPages: Math.ceil(total / limit) }
            }));
        }

        // 3. Batch fetch items for these bills
        const billIds = bills.map(b => b.purchase_bills.id);

        const allItems = await db
            .select()
            .from(purchaseBillItems)
            .leftJoin(rawMaterials, eq(purchaseBillItems.rawMaterialId, rawMaterials.id))
            .leftJoin(finishedProducts, eq(purchaseBillItems.finishedProductId, finishedProducts.id))
            .leftJoin(generalItems, eq(purchaseBillItems.generalItemId, generalItems.id))
            .leftJoin(expenseHeads, eq(purchaseBillItems.expenseHeadId, expenseHeads.id))
            .where(inArray(purchaseBillItems.billId, billIds));

        // Group items by billId
        const itemsMap = new Map<string, any[]>();
        allItems.forEach(row => {
            const bId = row.purchase_bill_items.billId;
            if (!itemsMap.has(bId)) itemsMap.set(bId, []);
            itemsMap.get(bId)?.push({
                ...row.purchase_bill_items,
                rawMaterial: row.raw_materials,
                finishedProduct: row.finished_products,
                generalItem: row.general_items,
                expenseHead: row.expense_heads,
            });
        });

        // 4. Merge
        const result = bills.map(row => ({
            ...row.purchase_bills,
            supplier: row.suppliers,
            items: itemsMap.get(row.purchase_bills.id) || [],
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
// CREATE PURCHASE BILL
// ============================================================

/**
 * POST /purchase/bills
 * Create a new purchase bill with items
 * 
 * Features:
 * - Multi-line item support
 * - GST calculation (CGST/SGST or IGST)
 * - Stock movements on confirm
 * - Supplier outstanding update
 */
router.post('/bills', async (req: Request, res: Response, next: NextFunction) => {
    try {
        console.log('================================');
        console.log('POST /purchase/bills - START');
        console.log('Request body:', JSON.stringify(req.body, null, 2));

        const { date, invoiceNumber, supplierId, status = 'Draft', items, type = 'RAW_MATERIAL' } = req.body;

        // Validate inputs
        if (!invoiceNumber || !supplierId || !items || items.length === 0) {
            console.log('❌ Validation failed: Missing invoice number, supplier or items');
            throw createError('Invoice Number, Supplier and at least one item required', 400);
        }

        console.log(`✓ Validation passed: ${items.length} items to process. Type: ${type}`);

        // Get supplier for GST calculation
        const [supplier] = await db.select().from(suppliers).where(eq(suppliers.id, supplierId));
        if (!supplier) {
            console.log('❌ Supplier not found:', supplierId);
            throw createError('Supplier not found', 404);
        }

        console.log(`✓ Supplier found: ${supplier.name} (${supplier.code})`);
        const isInterState = (supplier.stateCode || '27') !== COMPANY_STATE_CODE;

        // Generate bill code by finding the maximum existing code
        const allBills = await db.select({ code: purchaseBills.code }).from(purchaseBills);
        let maxSeq = 0;
        for (const b of allBills) {
            const match = b.code.match(/PB-(\d+)/);
            if (match) {
                const seq = parseInt(match[1], 10);
                if (seq > maxSeq) maxSeq = seq;
            }
        }
        const billCode = `PB-${String(maxSeq + 1).padStart(3, '0')}`;

        // Calculate totals from items
        let subtotal = 0;
        let totalCgst = 0;
        let totalSgst = 0;
        let totalIgst = 0;
        const discountAmount = parseFloat(req.body.discountAmount || '0');

        console.log('\n--- Processing Items ---');
        const processedItems = items.map((item: any, index: number) => {
            const quantity = parseFloat(item.quantity) || 0;
            const rate = parseFloat(item.rate) || 0;
            const gstPercent = parseFloat(item.gstPercent) || 0;
            const amount = quantity * rate;
            const gstAmount = (amount * gstPercent) / 100;

            subtotal += amount;

            if (isInterState) {
                totalIgst += gstAmount;
            } else {
                totalCgst += gstAmount / 2;
                totalSgst += gstAmount / 2;
            }

            const processed = {
                ...item,
                quantity,
                unit: item.unit || 'kg',
                rate,
                amount,
                gstPercent,
                cgst: isInterState ? 0 : gstAmount / 2,
                sgst: isInterState ? 0 : gstAmount / 2,
                igst: isInterState ? gstAmount : 0,
                total: amount + gstAmount,
            };

            return processed;
        });

        const totalTax = totalCgst + totalSgst + totalIgst;
        const grandTotal = Math.round(subtotal + totalTax - discountAmount);

        // Create bill
        console.log('\n--- Creating Purchase Bill ---');
        const [bill] = await db.insert(purchaseBills).values({
            code: billCode,
            invoiceNumber,
            type,
            date: new Date(date),
            supplierId,
            supplierGST: supplier.gstNo,
            billingAddress: supplier.address,
            subtotal: String(subtotal),
            discountAmount: String(discountAmount),
            cgst: String(totalCgst),
            sgst: String(totalSgst),
            igst: String(totalIgst),
            totalTax: String(totalTax),
            total: String(subtotal + totalTax - discountAmount),
            roundOff: '0',
            grandTotal: String(grandTotal),
            paidAmount: '0',
            balanceAmount: String(grandTotal),
            paymentStatus: 'Unpaid',
            status,
        }).returning();

        console.log(`✓ Bill created: ID=${bill.id}, Code=${bill.code}`);

        // Insert line items
        console.log('\n--- Inserting Line Items ---');
        const insertedItems = await Promise.all(
            processedItems.map(async (item: any, index: number) => {
                console.log(`\nInserting item ${index + 1}...`);

                let materialName = '';
                let color = '';
                let hsnCode = '';
                let rawMaterialId = null;
                let finishedProductId = null;
                let expenseHeadId = null;
                let generalItemId = null;

                // Validate and Fetch Details based on Type
                if (type === 'RAW_MATERIAL') {
                    const [material] = await db.select().from(rawMaterials).where(eq(rawMaterials.id, item.rawMaterialId));
                    if (!material) throw createError(`Material not found: ${item.rawMaterialId}`, 404);
                    materialName = material.name;
                    color = material.color || '';
                    hsnCode = material.hsnCode || '3901';
                    rawMaterialId = item.rawMaterialId;
                } else if (type === 'FINISHED_GOODS') {
                    let product: any = null;

                    // Try by exact ID first
                    [product] = await db.select().from(finishedProducts).where(eq(finishedProducts.id, item.finishedProductId));

                    if (!product) {
                        // The ID might be stale (e.g. product was deleted/recreated).
                        // List available products to help diagnose.
                        const available = await db.select({ id: finishedProducts.id, name: finishedProducts.name, code: finishedProducts.code })
                            .from(finishedProducts);
                        const names = available.map(p => `${p.name} (${p.code})`).join(', ');
                        throw createError(
                            `Finished product not found. The selected product may have been deleted and recreated. ` +
                            `Please close this form, refresh the page, and re-select the product. ` +
                            `Available products: ${names || 'none'}`,
                            404
                        );
                    }

                    materialName = product.name;
                    hsnCode = product.hsnCode || '5608';
                    finishedProductId = item.finishedProductId;

                } else if (type === 'GENERAL') {
                    let gItemId = item.generalItemId;
                    if (!gItemId && item.generalItemName) {
                        const [existing] = await db.select().from(generalItems).where(eq(generalItems.name, item.generalItemName));
                        if (existing) {
                            gItemId = existing.id;
                        } else {
                            const [newItem] = await db.insert(generalItems).values({
                                name: item.generalItemName,
                                defaultExpenseHeadId: item.expenseHeadId
                            }).returning();
                            gItemId = newItem.id;
                            cacheService.del('masters:general-items');
                        }
                    }

                    if (gItemId) {
                        const [gItem] = await db.select().from(generalItems).where(eq(generalItems.id, gItemId));
                        if (gItem) {
                            materialName = gItem.name;
                            generalItemId = gItemId;
                        }
                    } else {
                        materialName = item.generalItemName || item.materialName || 'General Item';
                    }

                    expenseHeadId = item.expenseHeadId || null;
                    hsnCode = '';
                }

                const itemData = {
                    billId: bill.id,
                    rawMaterialId,
                    finishedProductId,
                    generalItemId,
                    expenseHeadId,
                    materialName,
                    hsnCode,
                    quantity: String(item.quantity),
                    unit: item.unit || 'kg',
                    rate: String(item.rate),
                    amount: String(item.amount),
                    gstPercent: String(item.gstPercent),
                    cgst: String(item.cgst),
                    sgst: String(item.sgst),
                    igst: String(item.igst),
                    totalAmount: String(item.total),
                };

                const [insertedItem] = await db.insert(purchaseBillItems).values(itemData).returning();

                // Create stock movement if confirmed
                if (status === 'Confirmed') {
                    if (type === 'RAW_MATERIAL') {
                        // NEW LOGIC: DO NOT create stock movement here.
                        // Stock will be added via "Add Rolls" later.
                        // We strictly only track financial data here.
                        console.log('ℹ️ RAW_MATERIAL Purchase: Skipping automatic stock movement. Awaiting Roll Entry.');

                    } else if (type === 'FINISHED_GOODS') {
                        // Finished Goods Trading Stock (Still automatic for now as requested context focused on Raw Material Rolls)
                        await createStockMovement({
                            date: new Date(),
                            movementType: 'FG_IN', // Represents Stock In (Purchased)
                            itemType: 'finished_product',
                            finishedProductId: finishedProductId!,
                            quantityIn: parseFloat(String(item.quantity)),
                            quantityOut: 0,
                            referenceType: 'purchase', // Tag as purchased
                            referenceCode: billCode,
                            referenceId: bill.id,
                            reason: `Trading Purchase from ${supplier.name}`
                        });
                    }
                    // GENERAL Purchase creates NO stock movement.
                }

                return insertedItem;
            })
        );

        console.log(`\n✓ All ${insertedItems.length} items inserted successfully`);

        // Update supplier outstanding if confirmed
        if (status === 'Confirmed') {
            const currentOutstanding = parseFloat(supplier.outstanding || '0');
            const newOutstanding = currentOutstanding + grandTotal;

            await db.update(suppliers)
                .set({ outstanding: String(newOutstanding) })
                .where(eq(suppliers.id, supplierId));

            cacheService.del('masters:suppliers');
        }

        console.log('\n✅ POST /purchase/bills - SUCCESS');
        console.log('================================\n');

        res.json(successResponse({
            ...bill,
            supplier,
            items: insertedItems,
        }));
    } catch (error) {
        console.log('\n❌ POST /purchase/bills - ERROR');
        console.error('Error details:', error);
        console.log('================================\n');
        next(error);
    }
});

// ============================================================
// ROLL MANAGEMENT
// ============================================================

/**
 * GET /purchase/next-roll-seq
 * Get the next available global roll sequence number
 */
router.get('/next-roll-seq', async (req: Request, res: Response, next: NextFunction) => {
    try {
        // Get all roll codes to find the maximum sequence number
        const allRolls = await db.select({ rollCode: rawMaterialRolls.rollCode }).from(rawMaterialRolls);

        let maxSeq = 0;

        // Parse all roll codes and find the maximum numeric sequence
        for (const roll of allRolls) {
            // Extract number from ROLL-XXXX format
            const match = roll.rollCode.match(/ROLL-(\d+)/);
            if (match) {
                const seq = parseInt(match[1], 10);
                if (seq > maxSeq) {
                    maxSeq = seq;
                }
            }
        }

        // Return next sequence number (max + 1)
        // This ensures the sequence continues from the highest existing roll code
        res.json(successResponse({ nextSeq: maxSeq + 1 }));
    } catch (error) {
        next(error);
    }
});

// ============================================================
// PENDING QUANTITY MANAGEMENT
// ============================================================

/**
 * GET /purchase/pending-qty
 * Get pending quantity for a specific supplier and material
 */
router.get('/pending-qty', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { supplierId, rawMaterialId } = req.query;

        if (!supplierId || !rawMaterialId) {
            throw createError('Supplier ID and Raw Material ID are required', 400);
        }

        // 1. Find confirm bills for this supplier that have this material
        // We only care about bills that might have pending qty
        const bills = await db
            .select({
                id: purchaseBills.id,
                code: purchaseBills.code,
                date: purchaseBills.date,
                quantity: purchaseBillItems.quantity
            })
            .from(purchaseBills)
            .innerJoin(purchaseBillItems, eq(purchaseBills.id, purchaseBillItems.billId))
            .where(and(
                eq(purchaseBills.supplierId, String(supplierId)),
                eq(purchaseBills.status, 'Confirmed'),
                eq(purchaseBillItems.rawMaterialId, String(rawMaterialId))
            ))
            .orderBy(desc(purchaseBills.date));

        // 2. Calculate pending for each and filter > 0
        const pendingBills = [];
        for (const bill of bills) {
            const pending = await getPendingBillQuantity(bill.id, String(rawMaterialId));
            if (pending > 0.01) { // Tolerance for float precision
                pendingBills.push({
                    ...bill,
                    pendingQuantity: pending
                });
            }
        }

        res.json(successResponse(pendingBills));
    } catch (error) {
        next(error);
    }
});

/**
 * POST /purchase/adjust-qty
 * Adjust pending quantity from an old bill to a new one (or just mark as adjusted)
 */
router.post('/adjust-qty', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { sourceBillId, targetBillId, rawMaterialId, quantity } = req.body;

        if (!sourceBillId || !targetBillId || !rawMaterialId || !quantity) {
            throw createError('Missing required fields for adjustment', 400);
        }

        const qty = parseFloat(quantity);
        if (qty <= 0) throw createError('Quantity must be positive', 400);

        // Validate source has enough pending
        const currentPending = await getPendingBillQuantity(sourceBillId, rawMaterialId);
        if (qty > currentPending + 0.01) { // Tolerance
            throw createError(`Cannot adjust ${qty}kg. Only ${currentPending.toFixed(2)}kg pending.`, 400);
        }

        // Create adjustment record
        const [adjustment] = await db.insert(purchaseBillAdjustments).values({
            sourceBillId,
            targetBillId,
            rawMaterialId,
            quantity: String(qty)
        }).returning();

        res.json(successResponse({
            message: 'Pending quantity adjusted successfully',
            adjustment
        }));

    } catch (error) {
        next(error);
    }
});

// ============================================================
// GET PURCHASE SUMMARY
// ============================================================

/**
 * GET /purchase/summary
 * Get purchase summary for dashboard cards
 */
router.get('/summary', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const result = await db
            .select({
                totalPurchases: sql<string>`COALESCE(SUM(${purchaseBills.grandTotal}::numeric), 0)`,
                paidAmount: sql<string>`COALESCE(SUM(${purchaseBills.paidAmount}::numeric), 0)`,
                billCount: sql<number>`COUNT(*)`,
                unpaidCount: sql<number>`COUNT(*) FILTER (WHERE ${purchaseBills.paymentStatus} = 'Unpaid')`,
                partialCount: sql<number>`COUNT(*) FILTER (WHERE ${purchaseBills.paymentStatus} = 'Partial')`,
            })
            .from(purchaseBills);

        const summary = result[0];
        const totalPurchases = parseFloat(summary?.totalPurchases || '0');
        const paidAmount = parseFloat(summary?.paidAmount || '0');

        res.json(successResponse({
            totalPurchases,
            paidAmount,
            pendingPayments: totalPurchases - paidAmount,
            billCount: Number(summary?.billCount || 0),
            unpaidCount: Number(summary?.unpaidCount || 0),
            partialCount: Number(summary?.partialCount || 0),
        }));
    } catch (error) {
        next(error);
    }
});

// ============================================================
// RECORD PAYMENT
// ============================================================

/**
 * POST /purchase/bills/:id/payment
 * Record a payment against a purchase bill
 */
router.post('/bills/:id/payment', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const { amount, paymentMode = 'Bank', reference, accountId } = req.body;

        if (!amount || amount <= 0) {
            throw createError('Valid payment amount required', 400);
        }

        // Get current bill
        const [bill] = await db.select().from(purchaseBills).where(eq(purchaseBills.id, id));
        if (!bill) throw createError('Bill not found', 404);

        const result = await db.transaction(async (tx) => {
            // 1. Bank Account & CC Validation
            if (paymentMode !== 'Cash' && accountId) {
                const bankAccount = await tx.query.bankCashAccounts.findFirst({
                    where: eq(bankCashAccounts.id, accountId)
                });
                if (!bankAccount) throw createError('Invalid Bank Account', 400);

                // CC VALIDATION
                if (bankAccount.type === 'CC') {
                    const { validateCCTransaction } = await import('../services/cc-account.service');
                    const validation = await validateCCTransaction(accountId, parseFloat(amount));
                    if (!validation.allowed) {
                        throw createError(validation.message || 'CC Logic Error', 400);
                    }
                }

                // Update Bank Balance (Credit Bank -> Decrease Balance)
                await tx.update(bankCashAccounts)
                    .set({
                        balance: sql`${bankCashAccounts.balance} - ${amount}`,
                        updatedAt: new Date()
                    })
                    .where(eq(bankCashAccounts.id, accountId));
            }

            const currentPaid = parseFloat(bill.paidAmount || '0');
            const grandTotal = parseFloat(bill.grandTotal || '0');
            const newPaid = currentPaid + parseFloat(amount);
            const newBalance = grandTotal - newPaid;

            // Determine payment status
            let paymentStatus = 'Unpaid';
            if (newPaid >= grandTotal) paymentStatus = 'Paid';
            else if (newPaid > 0) paymentStatus = 'Partial';

            // Update bill
            await tx.update(purchaseBills)
                .set({
                    paidAmount: String(newPaid),
                    balanceAmount: String(newBalance),
                    paymentStatus,
                    updatedAt: new Date(),
                })
                .where(eq(purchaseBills.id, id));

            // Get supplier info for payment transaction
            const [supplier] = await tx.select().from(suppliers).where(eq(suppliers.id, bill.supplierId));
            if (!supplier) {
                throw createError('Supplier not found', 404);
            }

            // Record payment transaction
            const paymentCode = `PAY-${String(Date.now()).slice(-6)}`;
            await tx.insert(paymentTransactions).values({
                code: paymentCode,
                date: new Date(),
                type: 'PAYMENT',
                referenceType: 'purchase',
                referenceId: id,
                referenceCode: bill.code,
                partyType: 'supplier',
                partyId: bill.supplierId,
                partyName: supplier.name,
                mode: paymentMode,
                accountId: accountId || null,
                amount: String(amount),
                bankReference: reference || null,
                remarks: null,
            });

            // Update supplier outstanding
            const newOutstanding = parseFloat(supplier.outstanding || '0') - parseFloat(amount);
            await tx.update(suppliers)
                .set({ outstanding: String(Math.max(0, newOutstanding)) })
                .where(eq(suppliers.id, bill.supplierId));

            return { newPaid, newBalance, paymentStatus };
        });

        res.json(successResponse({
            message: 'Payment recorded',
            paidAmount: result.newPaid,
            balanceAmount: result.newBalance,
            paymentStatus: result.paymentStatus,
        }));
    } catch (error) {
        next(error);
    }
});

// ============================================================
// UPDATE PURCHASE BILL
// ============================================================

/**
 * PUT /purchase/bills/:id
 * Update a purchase bill
 */
router.put('/bills/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const { date, invoiceNumber, supplierId, status, items, type = 'RAW_MATERIAL', discountAmount } = req.body;

        // Get the existing bill
        const [existingBill] = await db.select().from(purchaseBills).where(eq(purchaseBills.id, id));
        if (!existingBill) throw createError('Bill not found', 404);

        // Get supplier for GST calculation
        const [supplier] = await db.select().from(suppliers).where(eq(suppliers.id, supplierId));
        if (!supplier) throw createError('Supplier not found', 404);

        const isInterState = (supplier.stateCode || '27') !== COMPANY_STATE_CODE;

        // Calculate totals from items
        let subtotal = 0;
        let totalCgst = 0;
        let totalSgst = 0;
        let totalIgst = 0;
        const discount = parseFloat(discountAmount || '0');

        const processedItems = items.map((item: any) => {
            const quantity = parseFloat(item.quantity) || 0;
            const rate = parseFloat(item.rate) || 0;
            const gstPercent = parseFloat(item.gstPercent) || 0;
            const amount = quantity * rate;
            const gstAmount = (amount * gstPercent) / 100;

            subtotal += amount;

            if (isInterState) {
                totalIgst += gstAmount;
            } else {
                totalCgst += gstAmount / 2;
                totalSgst += gstAmount / 2;
            }

            return {
                ...item,
                quantity,
                unit: item.unit || 'kg',
                rate,
                amount,
                gstPercent,
                cgst: isInterState ? 0 : gstAmount / 2,
                sgst: isInterState ? 0 : gstAmount / 2,
                igst: isInterState ? gstAmount : 0,
                total: amount + gstAmount,
            };
        });

        const totalTax = totalCgst + totalSgst + totalIgst;
        const grandTotal = Math.round(subtotal + totalTax - discount);

        // Update bill
        await db.update(purchaseBills)
            .set({
                invoiceNumber,
                type,
                date: new Date(date),
                supplierId,
                supplierGST: supplier.gstNo,
                billingAddress: supplier.address,
                subtotal: String(subtotal),
                discountAmount: String(discount),
                cgst: String(totalCgst),
                sgst: String(totalSgst),
                igst: String(totalIgst),
                totalTax: String(totalTax),
                total: String(subtotal + totalTax - discount),
                grandTotal: String(grandTotal),
                balanceAmount: String(grandTotal - parseFloat(existingBill.paidAmount || '0')),
                status,
                updatedAt: new Date(),
            })
            .where(eq(purchaseBills.id, id));

        // Delete existing items and recreate
        await db.delete(purchaseBillItems).where(eq(purchaseBillItems.billId, id));

        // Insert updated items
        for (const item of processedItems) {
            let materialName = '';
            let hsnCode = '';
            let rawMaterialId = null;
            let finishedProductId = null;
            let expenseHeadId = null;
            let generalItemId = null;

            if (type === 'RAW_MATERIAL' && item.rawMaterialId) {
                const [material] = await db.select().from(rawMaterials).where(eq(rawMaterials.id, item.rawMaterialId));
                if (material) {
                    materialName = material.name;
                    hsnCode = material.hsnCode || '3901';
                    rawMaterialId = item.rawMaterialId;
                }
            } else if (type === 'FINISHED_GOODS' && item.finishedProductId) {
                const [product] = await db.select().from(finishedProducts).where(eq(finishedProducts.id, item.finishedProductId));
                if (product) {
                    materialName = product.name;
                    hsnCode = product.hsnCode || '5608';
                    finishedProductId = item.finishedProductId;
                }
            } else if (type === 'GENERAL') {
                let gItemId = item.generalItemId;
                if (!gItemId && item.generalItemName) {
                    const [existing] = await db.select().from(generalItems).where(eq(generalItems.name, item.generalItemName));
                    if (existing) {
                        gItemId = existing.id;
                    } else {
                        const [newItem] = await db.insert(generalItems).values({
                            name: item.generalItemName,
                            defaultExpenseHeadId: item.expenseHeadId
                        }).returning();
                        gItemId = newItem.id;
                        cacheService.del('masters:general-items');
                    }
                }

                if (gItemId) {
                    const [gItem] = await db.select().from(generalItems).where(eq(generalItems.id, gItemId));
                    if (gItem) {
                        materialName = gItem.name;
                        generalItemId = gItemId;
                    }
                } else {
                    materialName = item.generalItemName || item.materialName || 'General Item';
                }

                expenseHeadId = item.expenseHeadId || null;
                hsnCode = '';
            }

            await db.insert(purchaseBillItems).values({
                billId: id,
                rawMaterialId,
                finishedProductId,
                generalItemId,
                expenseHeadId,
                materialName,
                hsnCode,
                quantity: String(item.quantity),
                unit: item.unit || 'kg',
                rate: String(item.rate),
                amount: String(item.amount),
                gstPercent: String(item.gstPercent),
                cgst: String(item.cgst),
                sgst: String(item.sgst),
                igst: String(item.igst),
                totalAmount: String(item.total),
            });
        }

        // Fetch updated bill with items
        const [updatedBill] = await db.select().from(purchaseBills).where(eq(purchaseBills.id, id));
        const updatedItems = await db.select().from(purchaseBillItems).where(eq(purchaseBillItems.billId, id));

        res.json(successResponse({
            ...updatedBill,
            supplier,
            items: updatedItems,
        }));
    } catch (error) {
        next(error);
    }
});

// ============================================================
// DELETE PURCHASE BILL
// ============================================================

/**
 * DELETE /purchase/bills/:id
 * Delete a purchase bill
 */
router.delete('/bills/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;

        // Get the bill with items
        const [bill] = await db.select().from(purchaseBills).where(eq(purchaseBills.id, id));
        if (!bill) throw createError('Bill not found', 404);

        // Check if any payments have been made
        if (parseFloat(bill.paidAmount || '0') > 0) {
            throw createError('Cannot delete bill with payments. Reverse payments first.', 400);
        }

        // Get bill items for stock reversal
        const billItems = await db.select().from(purchaseBillItems).where(eq(purchaseBillItems.billId, id));

        // Get raw material batches linked to this bill
        const batchesToDelete = await db.select().from(rawMaterialBatches).where(eq(rawMaterialBatches.purchaseBillId, id));
        const batchIds = batchesToDelete.map(b => b.id);

        // Delete production batch inputs that reference these raw material batches
        if (batchIds.length > 0) {
            await db.delete(productionBatchInputs).where(inArray(productionBatchInputs.materialBatchId, batchIds));
        }

        // Delete raw material batches linked to this bill
        await db.delete(rawMaterialBatches).where(eq(rawMaterialBatches.purchaseBillId, id));

        // Delete adjustments where this bill is source or target
        await db.delete(purchaseBillAdjustments).where(eq(purchaseBillAdjustments.sourceBillId, id));
        await db.delete(purchaseBillAdjustments).where(eq(purchaseBillAdjustments.targetBillId, id));

        // Get rolls linked to this bill for stock reversal
        const billRolls = await db.select().from(rawMaterialRolls).where(eq(rawMaterialRolls.purchaseBillId, id));

        // Reverse stock movements for each roll before deletion
        for (const roll of billRolls) {
            await createStockMovement({
                date: new Date(),
                movementType: 'RAW_OUT',
                itemType: 'raw_material',
                rawMaterialId: roll.rawMaterialId,
                quantityOut: parseFloat(roll.netWeight || '0'),
                referenceType: 'purchase_roll_delete',
                referenceCode: roll.rollCode,
                referenceId: roll.id,
                reason: `Reversed: Roll ${roll.rollCode} deleted (Bill ${bill.code} removed)`
            });
            console.log(`✓ Reversed stock for roll ${roll.rollCode}: -${roll.netWeight}kg`);
        }

        // Delete rolls linked to this bill
        await db.delete(rawMaterialRolls).where(eq(rawMaterialRolls.purchaseBillId, id));

        // Delete items
        await db.delete(purchaseBillItems).where(eq(purchaseBillItems.billId, id));

        // Delete the bill
        await db.delete(purchaseBills).where(eq(purchaseBills.id, id));

        // If bill was confirmed, reverse stock movements and supplier outstanding
        if (bill.status === 'Confirmed') {
            // If bill was FINISHED_GOODS, remove the original FG_IN stock movement.
            // We NEVER create a FG_OUT reversal blindly — that causes negative stock
            // if the original FG_IN was already deleted (e.g. by Reset Production).
            // Instead, directly delete the original FG_IN movement for this bill.
            if (bill.type === 'FINISHED_GOODS') {
                for (const item of billItems) {
                    if (item.finishedProductId) {
                        // Delete the original FG_IN that this bill created
                        const deleted = await db.delete(stockMovements)
                            .where(
                                sql`${stockMovements.referenceType} = 'purchase'
                                        AND ${stockMovements.referenceId} = ${id}
                                        AND ${stockMovements.finishedProductId} = ${item.finishedProductId}
                                        AND ${stockMovements.movementType} = 'FG_IN'`
                            )
                            .returning({ id: stockMovements.id });

                        console.log(`✓ Removed ${deleted.length} FG_IN stock movement(s) for ${item.finishedProductId} (bill ${bill.code})`);
                    }
                }
            }


            // Update supplier outstanding
            const [supplier] = await db.select().from(suppliers).where(eq(suppliers.id, bill.supplierId));
            if (supplier) {
                const newOutstanding = parseFloat(supplier.outstanding || '0') - parseFloat(bill.grandTotal || '0');
                await db.update(suppliers)
                    .set({ outstanding: String(Math.max(0, newOutstanding)) })
                    .where(eq(suppliers.id, bill.supplierId));

                cacheService.del('masters:suppliers');
            }
        }
        // Invalidate dashboard cache
        cacheService.del('dashboard:kpis');

        res.json(successResponse({ message: 'Bill deleted successfully' }));
    } catch (error) {
        next(error);
    }
});

// ============================================================
// PURCHASE PAYMENT HANDLING (MIRRORING SALES RECEIPTS)
// ============================================================

/**
 * GET /purchase/outstanding/:supplierId
 * Get all unpaid purchase bills for a supplier
 */
router.get('/outstanding/:supplierId', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { supplierId } = req.params;

        // Get confirmed bills with outstanding balance
        const outstandingBills = await db
            .select()
            .from(purchaseBills)
            .where(
                and(
                    eq(purchaseBills.supplierId, supplierId),
                    eq(purchaseBills.status, 'Confirmed'),
                    sql`${purchaseBills.paymentStatus} != 'Paid'`
                )
            )
            .orderBy(purchaseBills.date);

        res.json(successResponse(outstandingBills));
    } catch (error) {
        next(error);
    }
});

interface BillAllocation {
    billId: string;
    amount: number;
}

/**
 * POST /purchase/payments
 * Record a payment to a supplier with bill allocations
 */
router.post('/payments', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const {
            supplierId,
            amount,
            mode, // Cash, Bank, Cheque, UPI
            accountId, // Bank/Cash account ID
            bankReference,
            remarks,
            allocations, // Array of { billId, amount }
            useAdvancePayment,
            selectedAdvanceId
        } = req.body;

        const transactionId = crypto.randomUUID();
        const code = `PAY-${Date.now()}`;

        // Get supplier for details
        const supplier = (await db.select().from(suppliers).where(eq(suppliers.id, supplierId)))[0];
        if (!supplier) {
            res.status(404).json({ message: 'Supplier not found' });
            return;
        }

        let finalMode = mode;
        let finalAccountId = accountId;

        // HANDLE ADVANCE ADJUSTMENT
        if (useAdvancePayment && selectedAdvanceId) {
            finalMode = 'Adjustment';
            finalAccountId = null; // No bank account involved

            // 1. Fetch Advance
            const [advance] = await db.select().from(paymentTransactions).where(eq(paymentTransactions.id, selectedAdvanceId));
            if (!advance) throw createError('Selected advance not found', 404);

            const currentAdvanceBalance = parseFloat(advance.advanceBalance || '0');
            const adjustmentAmount = parseFloat(amount);

            if (currentAdvanceBalance < adjustmentAmount) {
                throw createError('Insufficient advance balance', 400);
            }

            // Validation: Ensure adjustment amount equals total allocated amount
            // We don't want to move money from "Advance Balance" to "Unallocated Payment Balance" without purpose.
            const totalAllocated = (allocations || []).reduce((sum: number, a: { amount: string | number }) => sum + Number(a.amount), 0);
            if (Math.abs(adjustmentAmount - totalAllocated) > 0.01) {
                throw createError('For advance adjustment, the adjustment amount must exactly match the total allocated amount.', 400);
            }

            // 2. Reduce Advance Balance
            await db.update(paymentTransactions)
                .set({
                    advanceBalance: String(currentAdvanceBalance - adjustmentAmount),
                    // If fully adjusted, maybe update status? 
                    // But status 'Completed' is usually final.
                })
                .where(eq(paymentTransactions.id, selectedAdvanceId));

            console.log(`✓ Adjusted Advance ${advance.code}: -${adjustmentAmount}, New Bal: ${currentAdvanceBalance - adjustmentAmount}`);
        }

        // 1. Create Payment Transaction
        const isAdvance = req.body.isAdvance || false;

        await db.insert(paymentTransactions).values({
            id: transactionId,
            code,
            date: new Date(),
            type: 'PAYMENT',
            referenceType: 'purchase',
            referenceId: transactionId, // Self-reference for multi-bill payments
            referenceCode: useAdvancePayment ? 'ADJUSTMENT' : 'MULTIPLE',
            partyType: 'supplier',
            partyId: supplierId,
            partyName: supplier.name,
            mode: finalMode,
            accountId: finalAccountId,
            amount: amount.toString(),
            bankReference: bankReference,
            remarks: useAdvancePayment ? `Adjusted against ${selectedAdvanceId}` : remarks,
            status: 'Completed',
            isAdvance: isAdvance,
            advanceBalance: isAdvance ? amount.toString() : '0'
        });

        // 2. Process Allocations (Updates Bills)
        if (allocations && allocations.length > 0) {
            for (const allocation of allocations) {
                await db.insert(billPaymentAllocations).values({
                    paymentId: transactionId,
                    billId: allocation.billId,
                    amount: allocation.amount.toString(),
                });

                // Update Bill
                const bill = (await db.select().from(purchaseBills).where(eq(purchaseBills.id, allocation.billId)))[0];
                if (bill) {
                    const newPaid = parseFloat(bill.paidAmount || '0') + Number(allocation.amount);
                    const newBalance = parseFloat(bill.grandTotal || '0') - newPaid;

                    await db.update(purchaseBills)
                        .set({
                            paidAmount: newPaid.toString(),
                            balanceAmount: newBalance.toString(),
                            paymentStatus: newBalance <= 1 ? 'Paid' : 'Partial'
                        })
                        .where(eq(purchaseBills.id, allocation.billId));
                }
            }
        }

        // 3. Update Supplier Outstanding 
        // SKIP if Adjustment (Net effect is zero on outstanding as it was prepaid)
        if (!useAdvancePayment) {
            const currentOutstanding = parseFloat(supplier.outstanding || '0');
            const newOutstanding = Math.max(0, currentOutstanding - parseFloat(amount));

            await db.update(suppliers)
                .set({ outstanding: newOutstanding.toString() })
                .where(eq(suppliers.id, supplierId));
        }

        // 4. Update Bank/Cash Balance 
        // SKIP if Adjustment
        if (finalAccountId && !useAdvancePayment) {
            const account = (await db.select().from(bankCashAccounts).where(eq(bankCashAccounts.id, finalAccountId)))[0];
            if (account) {
                const newAccountBalance = parseFloat(account.balance || '0') - parseFloat(amount);
                await db.update(bankCashAccounts)
                    .set({ balance: newAccountBalance.toString() })
                    .where(eq(bankCashAccounts.id, finalAccountId));
            }
        }

        // 5. Create General Ledger Entries (Double Entry)
        // DEBIT: Supplier Account (Liability Decrease) - Always happen as Bill is Paid
        await db.insert(generalLedger).values({
            transactionDate: new Date(),
            voucherNumber: code,
            voucherType: 'PAYMENT',
            ledgerId: supplierId,
            ledgerType: 'SUPPLIER',
            debitAmount: amount.toString(),
            creditAmount: '0',
            description: `Payment to ${supplier.name} (${finalMode})`,
            referenceId: transactionId
        });

        // CREDIT: Bank/Cash Account OR Advance Adjustment
        if (useAdvancePayment) {
            // For adjustment, we Credit the Supplier (Advance) logic?
            // Actually, if we use one ledger for Supplier, we Debit Supplier (Bill) and Credit Supplier (Advance).
            // So we insert a Credit entry for Supplier as well?
            // Yes, this reflects moving money from 'Advance' to 'Bill' within the same party ledger.
            await db.insert(generalLedger).values({
                transactionDate: new Date(),
                voucherNumber: code,
                voucherType: 'PAYMENT', // Or JOURNAL?
                ledgerId: supplierId,
                ledgerType: 'SUPPLIER',
                debitAmount: '0',
                creditAmount: amount.toString(),
                description: `Adjustment from Advance`,
                referenceId: transactionId
            });
        } else {
            // Standard Payment: Credit Bank
            await db.insert(generalLedger).values({
                transactionDate: new Date(),
                voucherNumber: code,
                voucherType: 'PAYMENT',
                ledgerId: finalAccountId || 'cash',
                ledgerType: finalMode === 'Cash' ? 'CASH' : 'BANK',
                debitAmount: '0',
                creditAmount: amount.toString(),
                description: `Payment to ${supplier.name}`,
                referenceId: transactionId
            });
        }

        res.json(successResponse({
            paymentId: transactionId,
            message: 'Payment recorded and allocated successfully'
        }));

    } catch (error) {
        next(error);
    }
});


/**
 * GET /purchase/payments/:id
 * Get single payment with allocations
 */
router.get('/payments/:id', async (req, res, next) => {
    try {
        const { id } = req.params;
        const payment = await db.query.paymentTransactions.findFirst({
            where: eq(paymentTransactions.id, id),
            with: {
                account: true
            }
        });

        if (!payment) throw createError('Payment not found', 404);

        const allocations = await db.select({
            billId: billPaymentAllocations.billId,
            amount: billPaymentAllocations.amount,
            billCode: purchaseBills.code,
            billDate: purchaseBills.date,
            billTotal: purchaseBills.grandTotal,
            currBalance: purchaseBills.balanceAmount // This is current balance, but for editing we might show (Balance + Allocated) as "Outstanding before this payment" logic in UI?
            // Actually UI usually calculates "Outstanding" as Current Balance + Allocated Amount (if we are editing this payment)
        })
            .from(billPaymentAllocations)
            .leftJoin(purchaseBills, eq(purchaseBills.id, billPaymentAllocations.billId))
            .where(eq(billPaymentAllocations.paymentId, id));

        res.json(successResponse({
            ...payment,
            allocations
        }));
    } catch (error) {
        next(error);
    }
});

/**
 * PUT /purchase/payments/:id
 * Update a payment transaction
 */
router.put('/payments/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const {
            supplierId,
            amount,
            mode, // Cash, Bank, Cheque, UPI
            accountId, // Bank/Cash account ID
            bankReference,
            remarks,
            allocations, // Array of { billId, amount }
            date
        } = req.body;

        await db.transaction(async (tx) => {
            // 1. Get existing payment
            const [existingPayment] = await tx.select().from(paymentTransactions).where(eq(paymentTransactions.id, id));
            if (!existingPayment) throw createError('Payment not found', 404);

            // ================= REVERSAL PHASE =================

            // A. Revert Bills (Fetch allocations)
            const existingAllocations = await tx.select().from(billPaymentAllocations).where(eq(billPaymentAllocations.paymentId, id));

            for (const allocation of existingAllocations) {
                const [bill] = await tx.select().from(purchaseBills).where(eq(purchaseBills.id, allocation.billId));
                if (bill) {
                    const newPaid = parseFloat(bill.paidAmount || '0') - parseFloat(allocation.amount);
                    const newBalance = parseFloat(bill.grandTotal || '0') - newPaid;

                    await tx.update(purchaseBills)
                        .set({
                            paidAmount: newPaid.toString(),
                            balanceAmount: newBalance.toString(),
                            paymentStatus: newBalance >= parseFloat(bill.grandTotal || '0') - 1 ? 'Unpaid' : (newBalance > 1 ? 'Partial' : 'Paid')
                        })
                        .where(eq(purchaseBills.id, allocation.billId));
                }
            }

            // B. Revert Supplier Outstanding (INCREASE it back)
            if (existingPayment.partyId && existingPayment.partyType === 'supplier') {
                const [supplier] = await tx.select().from(suppliers).where(eq(suppliers.id, existingPayment.partyId));
                if (supplier) {
                    const newOutstanding = parseFloat(supplier.outstanding || '0') + parseFloat(existingPayment.amount);
                    await tx.update(suppliers)
                        .set({ outstanding: newOutstanding.toString() })
                        .where(eq(suppliers.id, existingPayment.partyId));
                }
            }

            // C. Revert Bank Balance (INCREASE it back - Money In)
            if (existingPayment.accountId) {
                const [account] = await tx.select().from(bankCashAccounts).where(eq(bankCashAccounts.id, existingPayment.accountId));
                if (account) {
                    const newBalance = parseFloat(account.balance || '0') + parseFloat(existingPayment.amount);
                    await tx.update(bankCashAccounts)
                        .set({ balance: newBalance.toString() })
                        .where(eq(bankCashAccounts.id, existingPayment.accountId));
                }
            }

            // D. Delete Old Allocations
            await tx.delete(billPaymentAllocations).where(eq(billPaymentAllocations.paymentId, id));

            // E. Delete Old Ledger Entries
            await tx.delete(generalLedger).where(eq(generalLedger.referenceId, id));


            // ================= APPLICATION PHASE =================

            // 2. Update Payment Transaction
            await tx.update(paymentTransactions)
                .set({
                    date: new Date(date),
                    amount: String(amount),
                    mode,
                    accountId,
                    bankReference,
                    remarks,
                    partyId: supplierId, // In case supplier changed (rare but possible)
                })
                .where(eq(paymentTransactions.id, id));

            // 3. Update Supplier Outstanding (DECREASE it - We paid them)
            const [supplier] = await tx.select().from(suppliers).where(eq(suppliers.id, supplierId));
            if (!supplier) throw createError('Supplier not found', 404);

            const newSupplierOutstanding = parseFloat(supplier.outstanding || '0') - parseFloat(amount);
            await tx.update(suppliers)
                .set({ outstanding: newSupplierOutstanding.toString() })
                .where(eq(suppliers.id, supplierId));

            // 4. Update Bank Balance (DECREASE it - Money Out)
            if (accountId) {
                const [account] = await tx.select().from(bankCashAccounts).where(eq(bankCashAccounts.id, accountId));
                if (!account) throw createError('Bank Account not found', 404);

                const newBankBalance = parseFloat(account.balance || '0') - parseFloat(amount);
                await tx.update(bankCashAccounts)
                    .set({ balance: newBankBalance.toString() })
                    .where(eq(bankCashAccounts.id, accountId));

                // 5. Ledger: Bank/Cash Credit (Asset Decrease)
                await tx.insert(generalLedger).values({
                    transactionDate: new Date(date),
                    voucherNumber: existingPayment.code,
                    voucherType: 'PAYMENT',
                    ledgerId: accountId,
                    ledgerType: account.type || 'Bank',
                    debitAmount: '0',
                    creditAmount: String(amount),
                    description: `Payment to ${supplier.name} (${remarks || ''})`,
                    referenceId: id,
                });
            }

            // 6. Ledger: Supplier Debit (Liability Decrease)
            await tx.insert(generalLedger).values({
                transactionDate: new Date(date),
                voucherNumber: existingPayment.code,
                voucherType: 'PAYMENT',
                ledgerId: supplierId,
                ledgerType: 'SUPPLIER',
                debitAmount: String(amount),
                creditAmount: '0',
                description: `Payment made via ${mode}`,
                referenceId: id,
            });

            // 7. Process Allocations
            if (allocations && allocations.length > 0) {
                for (const alloc of allocations) { // { billId, amount }
                    const allocAmount = parseFloat(alloc.amount);
                    if (allocAmount <= 0) continue;

                    // Create Allocation Record
                    await tx.insert(billPaymentAllocations).values({
                        paymentId: id,
                        billId: alloc.billId,
                        amount: String(allocAmount)
                    });

                    // Update Bill Balance
                    const [bill] = await tx.select().from(purchaseBills).where(eq(purchaseBills.id, alloc.billId));
                    if (bill) {
                        const billPaid = parseFloat(bill.paidAmount || '0') + allocAmount;
                        const billBalance = parseFloat(bill.grandTotal || '0') - billPaid;

                        await tx.update(purchaseBills)
                            .set({
                                paidAmount: billPaid.toString(),
                                balanceAmount: billBalance.toString(),
                                paymentStatus: billBalance <= 1 ? 'Paid' : (billPaid > 0 ? 'Partial' : 'Unpaid')
                            })
                            .where(eq(purchaseBills.id, alloc.billId));
                    }
                }
            }

            // Invalidate cache
            cacheService.del('dashboard:kpis');
            cacheService.del('masters:suppliers');
            cacheService.del('masters:accounts');

            res.json(successResponse({
                message: 'Payment updated successfully',
                paymentId: id
            }));
        });
    } catch (error) {
        next(error);
    }
});

// REVERSE PAYMENT
// DELETE PAYMENT
router.delete('/payments/:id', async (req, res, next) => {
    try {
        const { id } = req.params;

        const payment = (await db.select().from(paymentTransactions).where(eq(paymentTransactions.id, id)))[0];
        if (!payment) throw createError('Payment not found', 404);

        // 1. Revert Bills (Fetch allocations)
        const allocations = await db.select().from(billPaymentAllocations).where(eq(billPaymentAllocations.paymentId, id));

        for (const allocation of allocations) {
            const bill = (await db.select().from(purchaseBills).where(eq(purchaseBills.id, allocation.billId)))[0];
            if (bill) {
                const newPaid = parseFloat(bill.paidAmount || '0') - parseFloat(allocation.amount);
                const newBalance = parseFloat(bill.grandTotal || '0') - newPaid;

                await db.update(purchaseBills)
                    .set({
                        paidAmount: newPaid.toString(),
                        balanceAmount: newBalance.toString(),
                        paymentStatus: newBalance >= parseFloat(bill.grandTotal || '0') - 1 ? 'Unpaid' : (newBalance > 1 ? 'Partial' : 'Paid')
                    })
                    .where(eq(purchaseBills.id, allocation.billId));
            }
        }

        // 2. Revert Supplier Outstanding (INCREASE it back)
        if (payment.partyId && payment.partyType === 'supplier') {
            const supplier = (await db.select().from(suppliers).where(eq(suppliers.id, payment.partyId)))[0];
            if (supplier) {
                const newOutstanding = parseFloat(supplier.outstanding || '0') + parseFloat(payment.amount);
                await db.update(suppliers)
                    .set({ outstanding: newOutstanding.toString() })
                    .where(eq(suppliers.id, payment.partyId));
            }
        }

        // 3. Revert Bank Balance (INCREASE it back - Money In)
        if (payment.accountId) {
            const account = (await db.select().from(bankCashAccounts).where(eq(bankCashAccounts.id, payment.accountId)))[0];
            if (account) {
                const newBalance = parseFloat(account.balance || '0') + parseFloat(payment.amount);
                await db.update(bankCashAccounts)
                    .set({ balance: newBalance.toString() })
                    .where(eq(bankCashAccounts.id, payment.accountId));
            }
        }

        // 4. Delete Allocations
        await db.delete(billPaymentAllocations).where(eq(billPaymentAllocations.paymentId, id));

        // 5. Delete Ledger Entries
        await db.delete(generalLedger).where(eq(generalLedger.referenceId, id));

        // 6. Delete Payment Transaction
        await db.delete(paymentTransactions).where(eq(paymentTransactions.id, id));

        // Invalidate cache
        cacheService.del('dashboard:kpis');
        cacheService.del('masters:suppliers');
        cacheService.del('masters:accounts');

        res.json(successResponse({ message: 'Payment deleted physically' }));

    } catch (error) {
        next(error);
    }
});

// ============================================================
// ROLL MANAGEMENT ENDPOINTS
// ============================================================

/**
 * GET /purchase/bills/:id/rolls
 * Get rolls for a purchase bill
 */
router.get('/bills/:id/rolls', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const rolls = await db.select().from(rawMaterialRolls).where(eq(rawMaterialRolls.purchaseBillId, id));
        res.json(successResponse(rolls));
    } catch (error) {
        next(error);
    }
});

/**
 * POST /purchase/bills/:id/rolls
 * Add rolls to a purchase bill and update stock
 */
router.post('/bills/:id/rolls', async (req: Request, res: Response, next: NextFunction) => {
    try {
        console.log('POST /bills/:id/rolls hit');
        const { id } = req.params;
        const { rolls } = req.body; // Array of { rollCode, netWeight, rawMaterialId, gsm, length }
        console.log('Body:', JSON.stringify(req.body, null, 2));

        if (!rolls || !Array.isArray(rolls) || rolls.length === 0) {
            console.log('Validation failed: No rolls provided');
            throw createError('No rolls provided', 400);
        }

        const [bill] = await db.select().from(purchaseBills).where(eq(purchaseBills.id, id));
        if (!bill) throw createError('Bill not found', 404);

        // Get supplier for stock movement reference
        const [supplier] = await db.select().from(suppliers).where(eq(suppliers.id, bill.supplierId));

        // Helper to safely parse decimal values, returning null for empty/invalid
        const safeDecimal = (val: any) => {
            if (val === null || val === undefined || val === '' || String(val).trim() === '') return null;
            const num = parseFloat(String(val));
            return isNaN(num) ? null : String(num);
        };

        const insertedRolls = [];

        for (const roll of rolls) {
            // Check for existing roll code to avoid unhandled promise rejection
            const existingRoll = await db.select().from(rawMaterialRolls).where(eq(rawMaterialRolls.rollCode, roll.rollCode));
            if (existingRoll.length > 0) {
                console.log(`Skipping duplicate roll code: ${roll.rollCode}`);
                continue; // Skip or throw error? For now, let's skip to processing others, or maybe generate a new code?
                // Ideally we should throw, but let's try to proceed.
                // Actually, if we skip, the stock logic might be off. Let's throw a clear error.
                throw createError(`Roll Code ${roll.rollCode} already exists. Please use unique roll codes.`, 409);
            }

            // 1. Create Roll Record
            const [newRoll] = await db.insert(rawMaterialRolls).values({
                purchaseBillId: id,
                rawMaterialId: roll.rawMaterialId,
                rollCode: roll.rollCode,
                netWeight: String(roll.netWeight),
                gsm: safeDecimal(roll.gsm),
                length: safeDecimal(roll.width) || safeDecimal(roll.length), // Accept width or length from frontend
                status: 'In Stock'
            }).returning();

            insertedRolls.push(newRoll);

            // 2. Add Stock Movement (RAW_IN)
            await createStockMovement({
                date: new Date(),
                movementType: 'RAW_IN',
                itemType: 'raw_material',
                rawMaterialId: roll.rawMaterialId,
                quantityIn: parseFloat(String(roll.netWeight)),
                quantityOut: 0,
                referenceType: 'purchase_roll',
                referenceCode: roll.rollCode,
                referenceId: newRoll.id,
                reason: `Roll Entry for Bill ${bill.code} from ${supplier?.name || 'Supplier'}`
            });

            // 3. Create Traceability Batch (Optional, keeping consistent with old logic if needed, but rolls act as batches now)
            // We can skip creating 'rawMaterialBatches' if 'rawMaterialRolls' serves the purpose. 
            // Ideally we should unify, but for now let's stick to rolls as the source of truth for tracking.
        }

        // 4. Update Bill Totals and Status
        const allRolls = await db.select().from(rawMaterialRolls).where(eq(rawMaterialRolls.purchaseBillId, id));
        const totalWeight = allRolls.reduce((sum, r) => sum + parseFloat(r.netWeight || '0'), 0);

        // --- NEW LOGIC: FIFO ADJUSTMENT FOR EXCESS ROLLS ---
        // Group new rolls by Raw Material to check for excess per material
        const newRollsByMaterial = rolls.reduce((acc: any, roll: any) => {
            acc[roll.rawMaterialId] = (acc[roll.rawMaterialId] || 0) + parseFloat(String(roll.netWeight));
            return acc;
        }, {});

        for (const [rawMaterialId, newWeight] of Object.entries(newRollsByMaterial)) {
            // Get Bill Item Qty
            const [billItem] = await db.select().from(purchaseBillItems).where(and(
                eq(purchaseBillItems.billId, id),
                eq(purchaseBillItems.rawMaterialId, rawMaterialId)
            ));

            if (billItem) {
                const billQty = parseFloat(billItem.quantity || '0');

                // Get Total Received for this Material (Existing + New are already in DB now)
                const materialRolls = allRolls.filter(r => r.rawMaterialId === rawMaterialId);
                const totalReceived = materialRolls.reduce((sum, r) => sum + parseFloat(r.netWeight || '0'), 0);

                // Check for Excess
                let excess = totalReceived - billQty;

                if (excess > 0.01) {
                    // Find pending bills for this supplier & material (Direct DB Query)
                    const potentialPendingBills = await db
                        .select({
                            id: purchaseBills.id,
                            code: purchaseBills.code,
                            date: purchaseBills.date,
                            quantity: purchaseBillItems.quantity
                        })
                        .from(purchaseBills)
                        .innerJoin(purchaseBillItems, eq(purchaseBills.id, purchaseBillItems.billId))
                        .where(and(
                            eq(purchaseBills.supplierId, bill.supplierId),
                            eq(purchaseBills.status, 'Confirmed'),
                            eq(purchaseBillItems.rawMaterialId, rawMaterialId)
                        )); // Removed orderBy here, will sort in memory

                    const pendingBills = [];
                    for (const b of potentialPendingBills) {
                        const pending = await getPendingBillQuantity(b.id, rawMaterialId);
                        if (pending > 0.01) {
                            pendingBills.push({ ...b, pendingQuantity: pending });
                        }
                    }

                    if (pendingBills.length > 0) {
                        // Sort by date ascending (FIFO - oldest first)
                        pendingBills.sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());

                        for (const pendingBill of pendingBills) {
                            if (excess <= 0.01) break;
                            if (pendingBill.id === id) continue; // Skip current bill

                            const adjustmentQty = Math.min(excess, pendingBill.pendingQuantity);

                            if (adjustmentQty > 0) {
                                // Create Adjustment
                                await db.insert(purchaseBillAdjustments).values({
                                    sourceBillId: pendingBill.id,
                                    targetBillId: id,
                                    rawMaterialId,
                                    quantity: String(adjustmentQty.toFixed(2))
                                });

                                console.log(`✓ Auto-adjusted ${adjustmentQty}kg from Bill ${pendingBill.code} to ${bill.code}`);
                                excess -= adjustmentQty;
                            }
                        }
                    }
                }
            }
        }
        // ---------------------------------------------------

        // Determine Status based on invoice qty vs roll weight? 
        // Logic: If user says it's done, it's done. But we can just set to 'Partial' if some weight exists.
        // For now, let's just update the weight. Status management can be explicit or inferred.

        await db.update(purchaseBills)
            .set({
                totalRollWeight: String(totalWeight),
                rollEntryStatus: totalWeight > 0 ? 'Partial' : 'Pending', // Simple logic
                updatedAt: new Date()
            })
            .where(eq(purchaseBills.id, id));

        res.json(successResponse({
            message: `${insertedRolls.length} rolls added`,
            rolls: insertedRolls,
            totalRollWeight: totalWeight
        }));

    } catch (error) {
        next(error);
    }
});

/**
 * DELETE /purchase/bills/:id/rolls/:rollId
 * Delete a roll and reverse stock
 */
router.delete('/bills/:id/rolls/:rollId', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id, rollId } = req.params;

        // Get the roll
        const [roll] = await db.select().from(rawMaterialRolls).where(eq(rawMaterialRolls.id, rollId));
        if (!roll) throw createError('Roll not found', 404);

        if (roll.status !== 'In Stock') {
            throw createError(`Cannot delete this roll because it is currently ${roll.status}. Please reverse the production batch or return first.`, 400);
        }

        // 1. Reverse Stock Movement (RAW_OUT)
        await createStockMovement({
            date: new Date(),
            movementType: 'RAW_OUT', // Removing the stock we added
            itemType: 'raw_material',
            rawMaterialId: roll.rawMaterialId,
            quantityOut: parseFloat(roll.netWeight || '0'),
            quantityIn: 0,
            referenceType: 'roll_delete',
            referenceCode: roll.rollCode,
            referenceId: rollId,
            reason: `Roll Deleted: ${roll.rollCode}`
        });

        // 2. Delete Roll
        await db.delete(rawMaterialRolls).where(eq(rawMaterialRolls.id, rollId));

        // 3. Update Bill Totals
        const allRolls = await db.select().from(rawMaterialRolls).where(eq(rawMaterialRolls.purchaseBillId, id));
        const totalWeight = allRolls.reduce((sum, r) => sum + parseFloat(r.netWeight || '0'), 0);

        await db.update(purchaseBills)
            .set({
                totalRollWeight: String(totalWeight),
                rollEntryStatus: totalWeight > 0 ? 'Partial' : 'Pending',
                updatedAt: new Date()
            })
            .where(eq(purchaseBills.id, id));

        res.json(successResponse({ message: 'Roll deleted and stock reversed', totalRollWeight: totalWeight }));

    } catch (error) {
        next(error);
    }
});

/**
 * PUT /purchase/bills/:id/rolls/:rollId
 * Update roll weight and width
 */
router.put('/bills/:id/rolls/:rollId', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id, rollId } = req.params;
        const { netWeight, width } = req.body;

        // Get the roll
        const [roll] = await db.select().from(rawMaterialRolls).where(eq(rawMaterialRolls.id, rollId));
        if (!roll) throw createError('Roll not found', 404);

        const oldWeight = parseFloat(roll.netWeight || '0');
        const newWeight = parseFloat(String(netWeight));
        const weightDiff = newWeight - oldWeight;

        // Validation: If roll is NOT In Stock, prevent weight changes
        if (roll.status !== 'In Stock') {
            if (Math.abs(weightDiff) > 0.01) {
                // Weight changed on a consumed roll -> BLOCK
                throw createError('Cannot change weight of a consumed/returned roll. Only width/other details can be updated.', 400);
            }
            // Weight is same, so it's a safe update (e.g. width correction) -> ALLOW
        }

        // 1. Update Roll
        await db.update(rawMaterialRolls)
            .set({
                netWeight: String(newWeight),
                length: width ? String(width) : roll.length,
            })
            .where(eq(rawMaterialRolls.id, rollId));

        // 2. Create Stock Movement to reflect the weight change
        if (Math.abs(weightDiff) > 0.01) {
            if (weightDiff > 0) {
                // Weight increased - add stock
                await createStockMovement({
                    date: new Date(),
                    movementType: 'RAW_IN',
                    itemType: 'raw_material',
                    rawMaterialId: roll.rawMaterialId,
                    quantityIn: Math.abs(weightDiff),
                    quantityOut: 0,
                    referenceType: 'roll_adjustment',
                    referenceCode: roll.rollCode,
                    referenceId: rollId,
                    reason: `Roll ${roll.rollCode} weight adjusted +${weightDiff.toFixed(2)}kg`
                });
            } else {
                // Weight decreased - remove stock
                await createStockMovement({
                    date: new Date(),
                    movementType: 'RAW_OUT',
                    itemType: 'raw_material',
                    rawMaterialId: roll.rawMaterialId,
                    quantityIn: 0,
                    quantityOut: Math.abs(weightDiff),
                    referenceType: 'roll_adjustment',
                    referenceCode: roll.rollCode,
                    referenceId: rollId,
                    reason: `Roll ${roll.rollCode} weight adjusted ${weightDiff.toFixed(2)}kg`
                });
            }
        }

        // 3. Update Bill Totals
        const allRolls = await db.select().from(rawMaterialRolls).where(eq(rawMaterialRolls.purchaseBillId, id));
        const totalWeight = allRolls.reduce((sum, r) => sum + parseFloat(r.netWeight || '0'), 0);

        await db.update(purchaseBills)
            .set({
                totalRollWeight: String(totalWeight),
                updatedAt: new Date()
            })
            .where(eq(purchaseBills.id, id));

        res.json(successResponse({
            message: 'Roll updated successfully',
            totalRollWeight: totalWeight,
            roll: { ...roll, netWeight: String(newWeight), length: width ? String(width) : roll.length }
        }));

    } catch (error) {
        next(error);
    }
});

export default router;

