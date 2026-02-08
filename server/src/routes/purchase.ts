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
import { createStockMovement } from '../services/inventory.service';

// ... (imports remain)
import { purchaseBills, purchaseBillItems, suppliers, rawMaterials, paymentTransactions, billPaymentAllocations, bankCashAccounts, generalLedger, rawMaterialBatches, finishedProducts, expenseHeads, productionBatchInputs } from '../db/schema';
// Removed stockMovements from imports as we use the service now

// ... (inside the route)


import { eq, desc, sql, count as countFn, and, inArray } from 'drizzle-orm';
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
        rawMaterialId: string;
        quantity: number;
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

        // 1. Get total count
        const totalResult = await db.select({ count: countFn() }).from(purchaseBills);
        const total = Number(totalResult[0]?.count || 0);

        // 2. Get bills (paginated)
        const bills = await db
            .select()
            .from(purchaseBills)
            .leftJoin(suppliers, eq(purchaseBills.supplierId, suppliers.id))
            .orderBy(desc(purchaseBills.createdAt))
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
            .where(inArray(purchaseBillItems.billId, billIds));

        // Group items by billId
        const itemsMap = new Map<string, any[]>();
        allItems.forEach(row => {
            const bId = row.purchase_bill_items.billId;
            if (!itemsMap.has(bId)) itemsMap.set(bId, []);
            itemsMap.get(bId)?.push({
                ...row.purchase_bill_items,
                rawMaterial: row.raw_materials,
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

        // Generate bill code
        const countResult = await db.select({ cnt: countFn() }).from(purchaseBills);
        const billCount = Number(countResult[0]?.cnt || 0);
        const billCode = `PB-${String(billCount + 1).padStart(3, '0')}`;

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
                let hsnCode = '';
                let rawMaterialId = null;
                let finishedProductId = null;
                let expenseHeadId = null;

                // Validate and Fetch Details based on Type
                if (type === 'RAW_MATERIAL') {
                    const [material] = await db.select().from(rawMaterials).where(eq(rawMaterials.id, item.rawMaterialId));
                    if (!material) throw createError(`Material not found: ${item.rawMaterialId}`, 404);
                    materialName = material.name;
                    hsnCode = material.hsnCode || '3901';
                    rawMaterialId = item.rawMaterialId;
                } else if (type === 'FINISHED_GOODS') {
                    const [product] = await db.select().from(finishedProducts).where(eq(finishedProducts.id, item.finishedProductId));
                    if (!product) throw createError(`Product not found: ${item.finishedProductId}`, 404);
                    materialName = product.name;
                    hsnCode = product.hsnCode || '5608';
                    finishedProductId = item.finishedProductId;
                } else if (type === 'GENERAL') {
                    if (item.expenseHeadId) {
                        const [head] = await db.select().from(expenseHeads).where(eq(expenseHeads.id, item.expenseHeadId));
                        if (!head) throw createError(`Expense Head not found: ${item.expenseHeadId}`, 404);
                        materialName = head.name;
                        expenseHeadId = item.expenseHeadId;
                    } else if (item.expenseHeadName) {
                        // Check if exists by name
                        const [existing] = await db.select().from(expenseHeads).where(eq(expenseHeads.name, item.expenseHeadName));
                        if (existing) {
                            materialName = existing.name;
                            expenseHeadId = existing.id;
                        } else {
                            // Create new Expense Head
                            const [newHead] = await db.insert(expenseHeads).values({
                                name: item.expenseHeadName,
                                code: `EXP-${Date.now()}-${Math.floor(Math.random() * 1000)}`, // Simple auto-code
                                category: 'Variable'
                            }).returning();
                            materialName = newHead.name;
                            expenseHeadId = newHead.id;
                        }
                    } else {
                        throw createError('Expense Head ID or Name required for General Purchase', 400);
                    }
                    hsnCode = ''; // Expenses usually don't have HSN in this context
                }

                const itemData = {
                    billId: bill.id,
                    rawMaterialId,
                    finishedProductId,
                    expenseHeadId,
                    materialName,
                    hsnCode,
                    quantity: String(item.quantity),
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
                        await createStockMovement({
                            date: new Date(),
                            movementType: 'RAW_IN',
                            itemType: 'raw_material',
                            rawMaterialId: rawMaterialId!,
                            quantityIn: parseFloat(String(item.quantity)),
                            quantityOut: 0,
                            referenceType: 'purchase',
                            referenceCode: billCode,
                            referenceId: bill.id,
                            reason: `Purchase from ${supplier.name} (Inv: ${invoiceNumber})`
                        });

                        // Traceability Batch
                        const batchCode = `RMB-${billCode}-${index + 1}`;
                        await db.insert(rawMaterialBatches).values({
                            batchCode,
                            rawMaterialId: rawMaterialId!,
                            purchaseBillId: bill.id,
                            invoiceNumber: invoiceNumber,
                            quantity: String(item.quantity),
                            quantityUsed: '0',
                            rate: String(item.rate),
                            status: 'Active'
                        });

                    } else if (type === 'FINISHED_GOODS') {
                        // Finished Goods Trading Stock
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
        const { amount, paymentMode = 'Bank', reference } = req.body;

        if (!amount || amount <= 0) {
            throw createError('Valid payment amount required', 400);
        }

        // Get current bill
        const [bill] = await db.select().from(purchaseBills).where(eq(purchaseBills.id, id));
        if (!bill) throw createError('Bill not found', 404);

        const currentPaid = parseFloat(bill.paidAmount || '0');
        const grandTotal = parseFloat(bill.grandTotal || '0');
        const newPaid = currentPaid + parseFloat(amount);
        const newBalance = grandTotal - newPaid;

        // Determine payment status
        let paymentStatus = 'Unpaid';
        if (newPaid >= grandTotal) paymentStatus = 'Paid';
        else if (newPaid > 0) paymentStatus = 'Partial';

        // Update bill
        await db.update(purchaseBills)
            .set({
                paidAmount: String(newPaid),
                balanceAmount: String(newBalance),
                paymentStatus,
                updatedAt: new Date(),
            })
            .where(eq(purchaseBills.id, id));

        // Get supplier info for payment transaction
        const [supplier] = await db.select().from(suppliers).where(eq(suppliers.id, bill.supplierId));
        if (!supplier) {
            throw createError('Supplier not found', 404);
        }

        // Record payment transaction
        const paymentCode = `PAY-${String(Date.now()).slice(-6)}`;
        await db.insert(paymentTransactions).values({
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
            accountId: null,
            amount: String(amount),
            bankReference: reference || null,
            remarks: null,
        });

        // Update supplier outstanding
        const newOutstanding = parseFloat(supplier.outstanding || '0') - parseFloat(amount);
        await db.update(suppliers)
            .set({ outstanding: String(Math.max(0, newOutstanding)) })
            .where(eq(suppliers.id, bill.supplierId));

        res.json(successResponse({
            message: 'Payment recorded',
            paidAmount: newPaid,
            balanceAmount: newBalance,
            paymentStatus,
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
                if (item.expenseHeadId) {
                    const [head] = await db.select().from(expenseHeads).where(eq(expenseHeads.id, item.expenseHeadId));
                    if (head) {
                        materialName = head.name;
                        expenseHeadId = item.expenseHeadId;
                    }
                }
            }

            await db.insert(purchaseBillItems).values({
                billId: id,
                rawMaterialId,
                finishedProductId,
                expenseHeadId,
                materialName,
                hsnCode,
                quantity: String(item.quantity),
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

        // Delete items
        await db.delete(purchaseBillItems).where(eq(purchaseBillItems.billId, id));

        // Delete the bill
        await db.delete(purchaseBills).where(eq(purchaseBills.id, id));

        // If bill was confirmed, reverse stock movements and supplier outstanding
        if (bill.status === 'Confirmed') {
            // Reverse stock for each item
            for (const item of billItems) {
                if (bill.type === 'RAW_MATERIAL' && item.rawMaterialId) {
                    await createStockMovement({
                        date: new Date(),
                        movementType: 'RAW_OUT',
                        itemType: 'raw_material',
                        rawMaterialId: item.rawMaterialId,
                        quantityOut: parseFloat(item.quantity || '0'),
                        referenceType: 'purchase_delete',
                        referenceCode: bill.code,
                        referenceId: id,
                        reason: `Reversed: Bill ${bill.code} deleted`
                    });
                } else if (bill.type === 'FINISHED_GOODS' && item.finishedProductId) {
                    await createStockMovement({
                        date: new Date(),
                        movementType: 'FG_OUT',
                        itemType: 'finished_product',
                        finishedProductId: item.finishedProductId,
                        quantityOut: parseFloat(item.quantity || '0'),
                        referenceType: 'purchase_delete',
                        referenceCode: bill.code,
                        referenceId: id,
                        reason: `Reversed: Bill ${bill.code} deleted`
                    });
                }
            }

            // Update supplier outstanding
            const [supplier] = await db.select().from(suppliers).where(eq(suppliers.id, bill.supplierId));
            if (supplier) {
                const newOutstanding = parseFloat(supplier.outstanding || '0') - parseFloat(bill.grandTotal || '0');
                await db.update(suppliers)
                    .set({ outstanding: String(Math.max(0, newOutstanding)) })
                    .where(eq(suppliers.id, bill.supplierId));
            }
        }

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

// REVERSE PAYMENT
router.post('/payments/:id/reverse', async (req, res, next) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;

        const payment = (await db.select().from(paymentTransactions).where(eq(paymentTransactions.id, id)))[0];
        if (!payment) throw createError('Payment not found', 404);
        if (payment.status === 'Reversed') throw createError('Payment is already reversed', 400);

        // 1. Mark as Reversed
        await db.update(paymentTransactions)
            .set({
                status: 'Reversed',
                remarks: (payment.remarks || '') + ` | Reversed: ${reason || 'No reason provided'}`
            })
            .where(eq(paymentTransactions.id, id));

        // 2. Revert Bills (Fetch allocations)
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

        // 3. Revert Supplier Outstanding (INCREASE it back)
        const supplier = (await db.select().from(suppliers).where(eq(suppliers.id, payment.partyId)))[0];
        const newOutstanding = parseFloat(supplier.outstanding || '0') + parseFloat(payment.amount);
        await db.update(suppliers)
            .set({ outstanding: newOutstanding.toString() })
            .where(eq(suppliers.id, payment.partyId));

        // 4. Revert Bank Balance (INCREASE it back - Money In)
        if (payment.accountId) {
            const account = (await db.select().from(bankCashAccounts).where(eq(bankCashAccounts.id, payment.accountId)))[0];
            if (account) {
                const newBalance = parseFloat(account.balance || '0') + parseFloat(payment.amount);
                await db.update(bankCashAccounts)
                    .set({ balance: newBalance.toString() })
                    .where(eq(bankCashAccounts.id, payment.accountId));
            }
        }

        // 5. Create Reversal GL Entries
        const reversalCode = `REV-PAY-${Date.now()}`;

        // REVERSAL ENTRY 1: Debit Bank (Undo Credit)
        await db.insert(generalLedger).values({
            transactionDate: new Date(),
            voucherNumber: reversalCode,
            voucherType: 'CONTRA',
            ledgerId: payment.accountId!,
            ledgerType: payment.mode === 'Cash' ? 'CASH' : 'BANK',
            debitAmount: payment.amount.toString(),
            creditAmount: '0',
            description: `Reversal of Payment ${payment.code}`,
            referenceId: payment.id,
            isReversal: true
        });

        // REVERSAL ENTRY 2: Credit Supplier (Undo Debit)
        await db.insert(generalLedger).values({
            transactionDate: new Date(),
            voucherNumber: reversalCode,
            voucherType: 'CONTRA',
            ledgerId: payment.partyId,
            ledgerType: 'SUPPLIER',
            debitAmount: '0',
            creditAmount: payment.amount.toString(),
            description: `Reversal of Payment ${payment.code}`,
            referenceId: payment.id,
            isReversal: true
        });

        res.json(successResponse({ message: 'Payment reversed successfully' }));

    } catch (error) {
        next(error);
    }
});

export default router;
