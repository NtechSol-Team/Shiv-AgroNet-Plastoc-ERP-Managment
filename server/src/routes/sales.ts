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
import { invoices, invoiceItems, customers, finishedProducts, stockMovements, paymentTransactions, invoicePaymentAllocations, bankCashAccounts, salesInvoices, generalLedger, bellItems } from '../db/schema';
import { eq, desc, sql, count as countFn, and, inArray } from 'drizzle-orm';
import { successResponse } from '../types/api';
import { createError } from '../middleware/errorHandler';
import { createStockMovement, validateFinishedProductStock, getFinishedProductStock } from '../services/inventory.service';
import { cache as cacheService } from '../services/cache.service';

const router = Router();

// Company state code for GST calculation (Maharashtra)
const COMPANY_STATE_CODE = '27';

// ============================================================
// TYPE DEFINITIONS
// ============================================================

interface InvoiceItem {
    finishedProductId: string;
    bellItemId?: string; // Added bellItemId
    quantity: number;
    rate: number;
    discount?: number;
    gstPercent: number;
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

        // 1. Get total count
        const totalResult = await db.select({ count: countFn() }).from(invoices);
        const total = Number(totalResult[0]?.count || 0);

        // 2. Get invoices (paginated)
        const allInvoices = await db
            .select()
            .from(invoices)
            .leftJoin(customers, eq(invoices.customerId, customers.id))
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
            .where(inArray(invoiceItems.invoiceId, invoiceIds));

        // Group items by invoiceId
        const itemsMap = new Map<string, any[]>();
        allItems.forEach(row => {
            const iId = row.invoice_items.invoiceId;
            if (!itemsMap.has(iId)) itemsMap.set(iId, []);
            itemsMap.get(iId)?.push({
                ...row.invoice_items,
                finishedProduct: row.finished_products,
            });
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

router.post('/invoices', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const {
            invoiceDate,
            customerId,
            customerName,
            invoiceType = 'B2B',
            status = 'Draft',
            items
        } = req.body as CreateInvoiceRequest & { items: (InvoiceItem & { bellItemId?: string })[] };

        // Validate items
        if (!items || items.length === 0) {
            throw createError('At least one item required', 400);
        }

        // Get customer if B2B
        let customer = null;
        let isInterState = false;
        let finalCustomerName = customerName || 'Walk-in Customer';

        if (invoiceType === 'B2B') {
            if (!customerId) throw createError('Customer required for B2B invoice', 400);
            [customer] = await db.select().from(customers).where(eq(customers.id, customerId));
            if (!customer) throw createError('Customer not found', 404);
            isInterState = (customer.stateCode || '27') !== COMPANY_STATE_CODE;
            finalCustomerName = customer.name;
        }

        // Generate invoice number
        const countResult = await db.select({ cnt: countFn() }).from(invoices);
        const invCount = Number(countResult[0]?.cnt || 0);
        const invoiceNumber = `INV-${String(invCount + 1).padStart(4, '0')}`;

        // If confirming, validate all stock first
        if (status === 'Confirmed') {
            for (const item of items) {
                if (item.bellItemId) {
                    // Start Update: Bell Item Logic
                    const [bell] = await db.select().from(bellItems).where(eq(bellItems.id, item.bellItemId));
                    if (!bell) throw createError(`Bell item not found not found`, 404);
                    if (bell.status !== 'Available') throw createError(`Bell item ${bell.code} is already ${bell.status}`, 400);
                    // End Update
                } else {
                    const validation = await validateFinishedProductStock(item.finishedProductId, item.quantity);
                    if (!validation.isValid) {
                        const [product] = await db.select().from(finishedProducts).where(eq(finishedProducts.id, item.finishedProductId));
                        throw createError(`Insufficient stock for ${product?.name || 'product'}: ${validation.message}`, 400);
                    }
                }
            }
        }

        // Calculate totals from items
        let subtotal = 0;
        let totalDiscount = 0;
        let totalCgst = 0;
        let totalSgst = 0;
        let totalIgst = 0;

        const processedItems = await Promise.all(items.map(async item => {
            // Get product for name
            const [product] = await db.select().from(finishedProducts).where(eq(finishedProducts.id, item.finishedProductId));

            // Start Update: Get Bell Name if applicable
            let productName = product?.name || 'Unknown Product';
            if (item.bellItemId) {
                const [bell] = await db.select().from(bellItems).where(eq(bellItems.id, item.bellItemId));
                if (bell) productName = `${bell.code} - ${productName}`;
            }
            // End Update

            const amount = item.quantity * item.rate;
            // Frontend passes total discount amount for the line item
            const discount = item.discount || 0;
            const taxableAmount = amount - discount;
            const gstAmount = (taxableAmount * item.gstPercent) / 100;

            subtotal += amount;
            totalDiscount += discount; // Summing up all item-level discount amounts

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
                product,
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
        // Grand Total = Taxable Total + Total Tax
        const grandTotal = Math.round(taxableTotal + totalTax);

        // Create invoice
        const [invoice] = await db.insert(invoices).values({
            invoiceNumber,
            invoiceDate: new Date(invoiceDate),
            customerId: customer?.id || null,
            customerName: finalCustomerName,
            customerGST: customer?.gstNo || null,
            invoiceType,
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

        // Insert items
        const insertedItems = await Promise.all(
            processedItems.map(async (item) => {
                const [insertedItem] = await db.insert(invoiceItems).values({
                    invoiceId: invoice.id,
                    finishedProductId: item.finishedProductId,
                    productName: item.productName,
                    hsnCode: item.product?.hsnCode || '5608',
                    quantity: String(item.quantity),
                    rate: String(item.rate),
                    amount: String(item.amount),
                    discountAmount: String(item.discount || 0),
                    bellItemId: item.bellItemId, // Start Update: Added bellItemId

                    taxableAmount: String(item.taxableAmount),
                    gstPercent: String(item.gstPercent),
                    cgst: String(item.cgst),
                    sgst: String(item.sgst),
                    igst: String(item.igst),
                    totalAmount: String(item.total),
                }).returning();

                // Create FG_OUT movement if confirmed
                if (status === 'Confirmed') {
                    if (item.bellItemId) {
                        // Start Update: Update Bell Status
                        await db.update(bellItems)
                            .set({ status: 'Issued' })
                            .where(eq(bellItems.id, item.bellItemId));
                        // End Update
                    }

                    const currentStock = await getFinishedProductStock(item.finishedProductId);
                    await db.insert(stockMovements).values({
                        date: new Date(),
                        movementType: 'FG_OUT',
                        itemType: 'finished_product',
                        finishedProductId: item.finishedProductId,
                        quantityIn: '0',
                        quantityOut: String(item.quantity),
                        runningBalance: String(currentStock - item.quantity),
                        referenceType: 'sales',
                        referenceCode: invoiceNumber,
                        referenceId: invoice.id,
                        reason: `Sold to ${finalCustomerName}`,
                    });
                }

                return { ...insertedItem, finishedProduct: item.product };
            })
        );

        // Update customer outstanding if confirmed and B2B
        if (status === 'Confirmed' && customer) {
            const currentOutstanding = parseFloat(customer.outstanding || '0');
            await db.update(customers)
                .set({ outstanding: String(currentOutstanding + grandTotal) })
                .where(eq(customers.id, customer.id));

            cacheService.del('masters:customers');
        }

        res.json(successResponse({
            ...invoice,
            customer,
            items: insertedItems,
        }));
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
router.post('/invoices/:id/payment', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const { amount, paymentMode = 'Cash', reference } = req.body;

        if (!amount || amount <= 0) {
            throw createError('Valid payment amount required', 400);
        }

        // Get current invoice
        const [invoice] = await db.select().from(invoices).where(eq(invoices.id, id));
        if (!invoice) throw createError('Invoice not found', 404);

        const currentPaid = parseFloat(invoice.paidAmount || '0');
        const grandTotal = parseFloat(invoice.grandTotal || '0');
        const newPaid = currentPaid + parseFloat(amount);
        const newBalance = grandTotal - newPaid;

        // Determine payment status
        let paymentStatus = 'Unpaid';
        if (newPaid >= grandTotal) paymentStatus = 'Paid';
        else if (newPaid > 0) paymentStatus = 'Partial';

        // Update invoice
        await db.update(invoices)
            .set({
                paidAmount: String(newPaid),
                balanceAmount: String(newBalance),
                paymentStatus,
                updatedAt: new Date(),
            })
            .where(eq(invoices.id, id));

        // Generate payment code
        const paymentCountResult = await db.select({ cnt: countFn() }).from(paymentTransactions);
        const paymentCode = `REC-${String(Number(paymentCountResult[0]?.cnt || 0) + 1).padStart(4, '0')}`;

        // Record payment transaction
        await db.insert(paymentTransactions).values({
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

        // Update customer outstanding
        if (invoice.customerId) {
            const [customer] = await db.select().from(customers).where(eq(customers.id, invoice.customerId));
            if (customer) {
                const newOutstanding = parseFloat(customer.outstanding || '0') - parseFloat(amount);
                await db.update(customers)
                    .set({ outstanding: String(Math.max(0, newOutstanding)) })
                    .where(eq(customers.id, invoice.customerId));

                cacheService.del('masters:customers');
            }
        }

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

        if (invoice.status === 'Confirmed' && invoice.paymentStatus !== 'Paid') {
            const outstandingAmount = Number(invoice.balanceAmount || 0);

            if (outstandingAmount > 0 && invoice.customerId) {
                const [customer] = await db.select().from(customers).where(eq(customers.id, invoice.customerId));
                if (customer) {
                    const currentOutstanding = Number(customer.outstanding || 0);
                    const newOutstanding = Math.max(0, currentOutstanding - outstandingAmount);

                    await db.update(customers)
                        .set({ outstanding: String(newOutstanding) })
                        .where(eq(customers.id, invoice.customerId));
                }
            }
        }

        await db.transaction(async (tx) => {
            // 1. Restore bell items to Available status
            for (const item of invoice.items || []) {
                if (item.bellItemId) {
                    await tx.update(bellItems)
                        .set({ status: 'Available' })
                        .where(eq(bellItems.id, item.bellItemId));
                }
            }

            // 2. Create reversal stock movements for FG items
            for (const item of invoice.items || []) {
                if (item.finishedProductId) {
                    await tx.insert(stockMovements).values({
                        id: crypto.randomUUID(),
                        date: new Date(),
                        movementType: 'SI_REVERSAL',
                        itemType: 'finished_product',
                        finishedProductId: item.finishedProductId,
                        quantityIn: String(item.quantity), // Restore stock
                        quantityOut: '0',
                        referenceType: 'sales_invoice_reversal',
                        referenceId: invoice.id,
                        referenceCode: invoice.invoiceNumber,
                        reason: `Reversal of deleted invoice ${invoice.invoiceNumber}`,
                    });
                }
            }

            // 3. Delete invoice items
            await tx.delete(invoiceItems).where(eq(invoiceItems.invoiceId, id));

            // 4. Delete the invoice
            await tx.delete(salesInvoices).where(eq(salesInvoices.id, id));
        });

        // Invalidate dashboard cache
        cacheService.del('dashboard:kpis');

        res.json(successResponse({ message: 'Invoice deleted successfully' }));
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

        res.json(successResponse(outstandingInvoices));
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

        // Get customer for details
        const customer = (await db.select().from(customers).where(eq(customers.id, customerId)))[0];
        if (!customer) {
            res.status(404).json({ message: 'Customer not found' });
            return;
        }

        let finalMode = mode;
        let finalAccountId = accountId;

        // HANDLE ADVANCE ADJUSTMENT
        if (useAdvanceReceipt && selectedAdvanceId) {
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

            // 2. Reduce Advance Balance
            await db.update(paymentTransactions)
                .set({
                    advanceBalance: String(currentAdvanceBalance - adjustmentAmount),
                })
                .where(eq(paymentTransactions.id, selectedAdvanceId));
        } else {
            // Standard Receipt: Bank/Cash validation
            // If it's NOT an adjustment, we expect an accountId (unless it's some other non-bank mode, but UI forces it)
            if (!accountId && !useAdvanceReceipt) {
                // throw createError('Deposit account required', 400); 
                // Permissive for now if frontend doesn't send it for valid reasons, but good to enforce.
            }
        }

        // 3. Create Payment Transaction (The Receipt)
        // If Adjustment, we label it as such.
        await db.insert(paymentTransactions).values({
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
            isAdvance: (parseFloat(amount) - allocations.reduce((sum: number, a: any) => sum + Number(a.amount), 0)) > 0,
            advanceBalance: String(Math.max(0, parseFloat(amount) - allocations.reduce((sum: number, a: any) => sum + Number(a.amount), 0))),
            remarks: useAdvanceReceipt ? `Adjusted from Advance` : req.body.remarks
        });

        // 4. Process Allocations
        for (const allocation of allocations) {
            await db.insert(invoicePaymentAllocations).values({
                paymentId: transactionId,
                invoiceId: allocation.invoiceId,
                amount: allocation.amount.toString(),
            });

            // Update Invoice
            const invoice = (await db.select().from(salesInvoices).where(eq(salesInvoices.id, allocation.invoiceId)))[0];
            if (invoice) {
                const newPaid = parseFloat(invoice.paidAmount || '0') + Number(allocation.amount);
                const newBalance = parseFloat(invoice.grandTotal || '0') - newPaid;

                await db.update(salesInvoices)
                    .set({
                        paidAmount: newPaid.toString(),
                        balanceAmount: newBalance.toString(),
                        paymentStatus: newBalance <= 1 ? 'Paid' : 'Partial'
                    })
                    .where(eq(salesInvoices.id, allocation.invoiceId));
            }
        }

        // 5. Update Customer Outstanding
        // If Adjustment, we are reducing Outstanding (since we are paying invoices).
        // Is this correct?
        // Customer Outstanding = Receivables.
        // If we adjust advance, we reduce Receivables.
        // Yes, we reduce outstanding regardless of source (Bank or Advance).
        const newOutstanding = parseFloat(customer.outstanding || '0') - parseFloat(amount);
        await db.update(customers)
            .set({ outstanding: newOutstanding.toString() })
            .where(eq(customers.id, customerId));

        // 6. Update Bank/Cash Balance (only if NOT adjustment)
        if (finalAccountId && !useAdvanceReceipt) {
            const account = (await db.select().from(bankCashAccounts).where(eq(bankCashAccounts.id, finalAccountId)))[0];
            if (account) {
                const newAccountBalance = parseFloat(account.balance || '0') + parseFloat(amount);
                await db.update(bankCashAccounts)
                    .set({ balance: newAccountBalance.toString() })
                    .where(eq(bankCashAccounts.id, finalAccountId));
            }
        }

        // 7. Create General Ledger Entries
        if (useAdvanceReceipt) {
            // ADJUSTMENT ENTRIES
            // Debit: Customer (Liability Reduction / Advance Consumption)
            await db.insert(generalLedger).values({
                transactionDate: new Date(),
                voucherNumber: code,
                voucherType: 'JOURNAL', // Adjustment is a Journal?
                ledgerId: customerId,
                ledgerType: 'CUSTOMER',
                debitAmount: amount.toString(),
                creditAmount: '0',
                description: `Adjustment from Advance`,
                referenceId: transactionId
            });
            // Credit: Customer (Receivable Reduction) - Handled below?
        } else {
            // DEBIT: Bank/Cash Account
            if (finalAccountId) {
                await db.insert(generalLedger).values({
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
        // Always Credit Customer for Receipt
        await db.insert(generalLedger).values({
            transactionDate: new Date(),
            voucherNumber: code,
            voucherType: 'RECEIPT',
            ledgerId: customerId, // Customer
            ledgerType: 'CUSTOMER',
            debitAmount: '0',
            creditAmount: amount.toString(),
            description: useAdvanceReceipt ? `Invoice Adjusted with Advance` : `Payment received in ${mode}`,
            referenceId: transactionId
        });

        res.json(successResponse({
            receiptId: transactionId,
            message: 'Receipt created and allocated successfully'
        }));

    } catch (error) {
        next(error);
    }
});

// REVERSE RECEIPT
router.post('/receipts/:id/reverse', async (req, res, next) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;

        const receipt = (await db.select().from(paymentTransactions).where(eq(paymentTransactions.id, id)))[0];
        if (!receipt) throw createError('Receipt not found', 404);
        if (receipt.status === 'Reversed') throw createError('Receipt is already reversed', 400);

        // 1. Mark as Reversed
        await db.update(paymentTransactions)
            .set({
                status: 'Reversed',
                remarks: (receipt.remarks || '') + ` | Reversed: ${reason || 'No reason provided'}`
            })
            .where(eq(paymentTransactions.id, id));

        // 2. Revert Invoices (Fetch allocations)
        const allocations = await db.select().from(invoicePaymentAllocations).where(eq(invoicePaymentAllocations.paymentId, id));

        for (const allocation of allocations) {
            const invoice = (await db.select().from(salesInvoices).where(eq(salesInvoices.id, allocation.invoiceId)))[0];
            if (invoice) {
                const newPaid = parseFloat(invoice.paidAmount || '0') - parseFloat(allocation.amount);
                const newBalance = parseFloat(invoice.grandTotal || '0') - newPaid;

                await db.update(salesInvoices)
                    .set({
                        paidAmount: newPaid.toString(),
                        balanceAmount: newBalance.toString(),
                        paymentStatus: newBalance >= parseFloat(invoice.grandTotal || '0') - 1 ? 'Unpaid' : (newBalance > 1 ? 'Partial' : 'Paid')
                    })
                    .where(eq(salesInvoices.id, allocation.invoiceId));
            }
        }

        // 3. Revert Customer Outstanding (Increase it back)
        const customer = (await db.select().from(customers).where(eq(customers.id, receipt.partyId)))[0];
        const newOutstanding = parseFloat(customer.outstanding || '0') + parseFloat(receipt.amount);
        await db.update(customers)
            .set({ outstanding: newOutstanding.toString() })
            .where(eq(customers.id, receipt.partyId));

        // 4. Revert Bank Balance (Decrease it)
        if (receipt.accountId) {
            const account = (await db.select().from(bankCashAccounts).where(eq(bankCashAccounts.id, receipt.accountId)))[0];
            if (account) {
                const newBalance = parseFloat(account.balance || '0') - parseFloat(receipt.amount);
                await db.update(bankCashAccounts)
                    .set({ balance: newBalance.toString() })
                    .where(eq(bankCashAccounts.id, receipt.accountId));
            }
        }

        // 5. Create Reversal GL Entries
        const reversalCode = `REV-${Date.now()}`;

        // REVERSAL ENTRY 1: Credit Bank (Undo Debit) - IF it was debited
        await db.insert(generalLedger).values({
            transactionDate: new Date(),
            voucherNumber: reversalCode,
            voucherType: 'CONTRA',
            ledgerId: receipt.accountId!,
            ledgerType: receipt.mode === 'Cash' ? 'CASH' : 'BANK',
            debitAmount: '0',
            creditAmount: receipt.amount.toString(),
            description: `Reversal of Receipt ${receipt.code}`,
            referenceId: receipt.id, // Linking to original receipt
            isReversal: true
        });

        // REVERSAL ENTRY 2: Debit Customer (Undo Credit)
        await db.insert(generalLedger).values({
            transactionDate: new Date(),
            voucherNumber: reversalCode,
            voucherType: 'CONTRA',
            ledgerId: receipt.partyId,
            ledgerType: 'CUSTOMER',
            debitAmount: receipt.amount.toString(),
            creditAmount: '0',
            description: `Reversal of Receipt ${receipt.code}`,
            referenceId: receipt.id,
            isReversal: true
        });

        res.json(successResponse({ message: 'Receipt reversed successfully' }));

    } catch (error) {
        next(error);
    }
});
