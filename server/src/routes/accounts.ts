/**
 * Accounts Routes
 * 
 * Industry-grade accounting module with full ledger support:
 * 
 * LEDGERS MAINTAINED:
 * - Cash Ledger (petty cash, counter cash)
 * - Bank Ledger (all bank accounts)
 * - Supplier Ledger (payables tracking)
 * - Customer Ledger (receivables tracking)
 * 
 * ACCOUNTING IMPACTS:
 * - Purchase → Supplier Ledger + Inventory
 * - Sale → Customer Ledger + Revenue + GST
 * - Receipt → Customer Ledger + Cash/Bank
 * - Payment → Supplier Ledger + Cash/Bank
 * 
 * FEATURES:
 * - Partial payments supported
 * - Running balance tracking
 * - Transaction audit trail
 * - Expense management
 */

import { Router, Request, Response, NextFunction } from 'express';
import { db } from '../db/index';
import {
    bankCashAccounts, paymentTransactions, expenses, expenseHeads,
    customers, suppliers, invoices, purchaseBills, paymentAdjustments
} from '../db/schema';
import { eq, desc, sql, and, count as countFn } from 'drizzle-orm';
import { successResponse } from '../types/api';
import { createError } from '../middleware/errorHandler';
import { validateRequest } from '../middleware/validation';
import { createExpenseSchema, recordPaymentSchema } from '../schemas/accounts';

const router = Router();

// ============================================================
// TYPE DEFINITIONS
// ============================================================

interface RecordPaymentRequest {
    type: 'RECEIPT' | 'PAYMENT';  // RECEIPT from customer, PAYMENT to supplier
    partyType: 'customer' | 'supplier';
    partyId: string;
    referenceType: 'sales' | 'purchase';
    referenceId: string;
    amount: number;
    mode: 'Cash' | 'Bank' | 'Cheque' | 'UPI';
    accountId: string;
    bankReference?: string;
    remarks?: string;
    isAdvance?: boolean; // New
}

interface CreateExpenseRequest {
    date: string;
    expenseHeadId: string;
    accountId: string;
    amount: number;
    paymentMode: 'Cash' | 'Bank' | 'Cheque' | 'UPI';
    description?: string;
    reference?: string;
}

// ============================================================
// CASH LEDGER
// ============================================================

/**
 * GET /accounts/cash-ledger
 * Get cash ledger with all cash account transactions
 */
router.get('/cash-ledger', async (req: Request, res: Response, next: NextFunction) => {
    try {
        // Get all cash accounts
        const cashAccounts = await db
            .select()
            .from(bankCashAccounts)
            .where(eq(bankCashAccounts.type, 'Cash'));

        const cashAccountIds = cashAccounts.map(a => a.id);

        // Get transactions for cash accounts
        const transactions = await db
            .select()
            .from(paymentTransactions)
            .where(
                cashAccountIds.length > 0
                    ? sql`${paymentTransactions.accountId} IN (${sql.raw(cashAccountIds.map(id => `'${id}'`).join(','))})`
                    : sql`1=0`
            )
            .orderBy(desc(paymentTransactions.createdAt));

        // Calculate totals
        const totalCashBalance = cashAccounts.reduce((sum, acc) => sum + parseFloat(acc.balance || '0'), 0);

        res.json(successResponse({
            accounts: cashAccounts,
            transactions,
            summary: {
                totalBalance: totalCashBalance.toFixed(2),
                accountCount: cashAccounts.length,
            }
        }));
    } catch (error) {
        next(error);
    }
});

// ============================================================
// BANK LEDGER
// ============================================================

/**
 * GET /accounts/bank-ledger
 * Get bank ledger with all bank account transactions
 */
router.get('/bank-ledger', async (req: Request, res: Response, next: NextFunction) => {
    try {
        // Get all bank accounts
        const bankAccounts = await db
            .select()
            .from(bankCashAccounts)
            .where(eq(bankCashAccounts.type, 'Bank'));

        const bankAccountIds = bankAccounts.map(a => a.id);

        // Get transactions for bank accounts
        const transactions = await db
            .select()
            .from(paymentTransactions)
            .where(
                bankAccountIds.length > 0
                    ? sql`${paymentTransactions.accountId} IN (${sql.raw(bankAccountIds.map(id => `'${id}'`).join(','))})`
                    : sql`1=0`
            )
            .orderBy(desc(paymentTransactions.createdAt));

        // Calculate totals
        const totalBankBalance = bankAccounts.reduce((sum, acc) => sum + parseFloat(acc.balance || '0'), 0);

        res.json(successResponse({
            accounts: bankAccounts,
            transactions,
            summary: {
                totalBalance: totalBankBalance.toFixed(2),
                accountCount: bankAccounts.length,
            }
        }));
    } catch (error) {
        next(error);
    }
});

// ============================================================
// CUSTOMER LEDGER (RECEIVABLES)
// ============================================================

/**
 * GET /accounts/customer-ledger
 * Get customer-wise outstanding and payment history
 */
router.get('/customer-ledger', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const customerId = req.query.customerId as string;

        // Get customer(s) with outstanding
        const customerData = customerId
            ? await db.select().from(customers).where(eq(customers.id, customerId))
            : await db.select().from(customers);

        // Get customer invoices
        const customerInvoices = await db
            .select()
            .from(invoices)
            .where(customerId ? eq(invoices.customerId, customerId) : sql`${invoices.customerId} IS NOT NULL`)
            .orderBy(desc(invoices.invoiceDate));

        // Get customer payments (receipts)
        const customerPayments = await db
            .select()
            .from(paymentTransactions)
            .where(
                customerId
                    ? and(eq(paymentTransactions.partyType, 'customer'), eq(paymentTransactions.partyId, customerId))
                    : eq(paymentTransactions.partyType, 'customer')
            )
            .orderBy(desc(paymentTransactions.createdAt));

        // Calculate summary
        const totalOutstanding = customerData.reduce((sum, c) => sum + parseFloat(c.outstanding || '0'), 0);
        const totalReceived = customerPayments.reduce((sum, p) => sum + parseFloat(p.amount || '0'), 0);
        const totalInvoiced = customerInvoices.reduce((sum, i) => sum + parseFloat(i.grandTotal || '0'), 0);

        res.json(successResponse({
            customers: customerData.map(c => ({
                ...c,
                outstandingAmount: parseFloat(c.outstanding || '0'),
            })),
            invoices: customerInvoices,
            payments: customerPayments,
            summary: {
                totalCustomers: customerData.length,
                totalInvoiced: totalInvoiced.toFixed(2),
                totalReceived: totalReceived.toFixed(2),
                totalOutstanding: totalOutstanding.toFixed(2),
            }
        }));
    } catch (error) {
        next(error);
    }
});

// ============================================================
// SUPPLIER LEDGER (PAYABLES)
// ============================================================

/**
 * GET /accounts/supplier-ledger
 * Get supplier-wise outstanding and payment history
 */
router.get('/supplier-ledger', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const supplierId = req.query.supplierId as string;

        // Get supplier(s) with outstanding
        const supplierData = supplierId
            ? await db.select().from(suppliers).where(eq(suppliers.id, supplierId))
            : await db.select().from(suppliers);

        // Get supplier bills
        const supplierBills = await db
            .select()
            .from(purchaseBills)
            .where(supplierId ? eq(purchaseBills.supplierId, supplierId) : sql`1=1`)
            .orderBy(desc(purchaseBills.date));

        // Get supplier payments
        const supplierPayments = await db
            .select()
            .from(paymentTransactions)
            .where(
                supplierId
                    ? and(eq(paymentTransactions.partyType, 'supplier'), eq(paymentTransactions.partyId, supplierId))
                    : eq(paymentTransactions.partyType, 'supplier')
            )
            .orderBy(desc(paymentTransactions.createdAt));

        // Calculate summary
        const totalOutstanding = supplierData.reduce((sum, s) => sum + parseFloat(s.outstanding || '0'), 0);
        const totalPaid = supplierPayments.reduce((sum, p) => sum + parseFloat(p.amount || '0'), 0);
        const totalPurchased = supplierBills.reduce((sum, b) => sum + parseFloat(b.grandTotal || '0'), 0);

        res.json(successResponse({
            suppliers: supplierData.map(s => ({
                ...s,
                outstandingAmount: parseFloat(s.outstanding || '0'),
            })),
            bills: supplierBills,
            payments: supplierPayments,
            summary: {
                totalSuppliers: supplierData.length,
                totalPurchased: totalPurchased.toFixed(2),
                totalPaid: totalPaid.toFixed(2), totalOutstanding: totalOutstanding.toFixed(2),
            }
        }));
    } catch (error) {
        next(error);
    }
});

// ============================================================
// RECORD PAYMENT/RECEIPT
// ============================================================

/**
 * POST /accounts/transactions
 * Record a payment or receipt
 * 
 * Payment Flow:
 * 1. Validate party and reference
 * 2. Update party outstanding
 * 3. Update account balance
 * 4. Create payment transaction record
 */
router.post('/transactions', validateRequest(recordPaymentSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const {
            type,
            partyType,
            partyId,
            referenceType,
            referenceId,
            amount,
            mode,
            accountId,
            bankReference,
            remarks,
            isAdvance,
        } = req.body as RecordPaymentRequest;

        await db.transaction(async (tx) => {
            let partyNewOutstanding = '0';
            let newBalance = '0';
            let newTx = null;

            // 1. Update Party Outstanding
            if (partyType === 'customer') {
                const [updatedCustomer] = await tx.update(customers)
                    .set({
                        outstanding: sql`GREATEST(0, ${customers.outstanding} - ${amount})`,
                        updatedAt: new Date()
                    })
                    .where(eq(customers.id, partyId))
                    .returning({ newOutstanding: customers.outstanding });
                partyNewOutstanding = updatedCustomer?.newOutstanding || '0';
            } else {
                const [updatedSupplier] = await tx.update(suppliers)
                    .set({
                        outstanding: sql`GREATEST(0, ${suppliers.outstanding} - ${amount})`, // For Supplier: Payment reduces outstanding (Payable)
                        updatedAt: new Date()
                    })
                    .where(eq(suppliers.id, partyId))
                    .returning({ newOutstanding: suppliers.outstanding });
                partyNewOutstanding = updatedSupplier?.newOutstanding || '0';
            }

            // 2. Update Reference (Invoice/Bill) if exists
            let referenceCode = isAdvance ? 'ADVANCE' : 'Direct';

            if (referenceId && !isAdvance) {
                if (partyType === 'customer') {
                    const [invoice] = await tx.select({ num: invoices.invoiceNumber }).from(invoices).where(eq(invoices.id, referenceId));
                    if (invoice) referenceCode = invoice.num;

                    await tx.update(invoices)
                        .set({
                            paidAmount: sql`${invoices.paidAmount} + ${amount}`,
                            balanceAmount: sql`GREATEST(0, ${invoices.grandTotal} - (${invoices.paidAmount} + ${amount}))`,
                            paymentStatus: sql`CASE WHEN (${invoices.paidAmount} + ${amount}) >= ${invoices.grandTotal} THEN 'Paid' ELSE 'Partial' END`,
                            updatedAt: new Date(),
                        })
                        .where(eq(invoices.id, referenceId));
                } else {
                    const [bill] = await tx.select({ code: purchaseBills.code }).from(purchaseBills).where(eq(purchaseBills.id, referenceId));
                    if (bill) referenceCode = bill.code;

                    await tx.update(purchaseBills)
                        .set({
                            paidAmount: sql`${purchaseBills.paidAmount} + ${amount}`,
                            balanceAmount: sql`GREATEST(0, ${purchaseBills.grandTotal} - (${purchaseBills.paidAmount} + ${amount}))`,
                            paymentStatus: sql`CASE WHEN (${purchaseBills.paidAmount} + ${amount}) >= ${purchaseBills.grandTotal} THEN 'Paid' ELSE 'Partial' END`,
                            updatedAt: new Date(),
                        })
                        .where(eq(purchaseBills.id, referenceId));
                }
            }

            // 3. Update Account Balance
            const balanceChange = type === 'RECEIPT' ? amount : -amount;
            const [updatedAccount] = await tx.update(bankCashAccounts)
                .set({
                    balance: sql`${bankCashAccounts.balance} + ${balanceChange}`,
                    updatedAt: new Date(),
                })
                .where(eq(bankCashAccounts.id, accountId))
                .returning({ newBalance: bankCashAccounts.balance });
            newBalance = updatedAccount?.newBalance || '0';

            // 4. Create Transaction Record
            const countResult = await tx.select({ cnt: countFn() }).from(paymentTransactions);
            const txnCount = Number(countResult[0]?.cnt || 0);
            const transactionCode = type === 'RECEIPT'
                ? `REC-${String(txnCount + 1).padStart(4, '0')}`
                : `PAY-${String(txnCount + 1).padStart(4, '0')}`;

            let partyName = '';
            if (partyType === 'customer') {
                const [p] = await tx.select({ name: customers.name }).from(customers).where(eq(customers.id, partyId));
                partyName = p?.name || 'Unknown';
            } else {
                const [p] = await tx.select({ name: suppliers.name }).from(suppliers).where(eq(suppliers.id, partyId));
                partyName = p?.name || 'Unknown';
            }

            const [createdTx] = await tx.insert(paymentTransactions).values({
                code: transactionCode,
                date: new Date(),
                type,
                referenceType,
                referenceId,
                referenceCode,
                partyType,
                partyId,
                partyName,
                mode,
                accountId,
                amount: String(amount),
                bankReference: bankReference || null,
                remarks: remarks || null,
                isAdvance: Boolean(isAdvance),
                advanceBalance: isAdvance ? String(amount) : '0',
            }).returning();
            newTx = createdTx;

            res.json(successResponse({
                transaction: newTx,
                accountNewBalance: parseFloat(newBalance).toFixed(2),
                partyNewOutstanding: parseFloat(partyNewOutstanding).toFixed(2),
            }));
        });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /accounts/adjust-advance
 * Adjust an existing advance payment against a bill/invoice
 */
router.post('/adjust-advance', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { paymentId, referenceType, referenceId, amount } = req.body;

        if (!paymentId || !referenceId || !amount || amount <= 0) {
            throw createError('Invalid adjustment request', 400);
        }

        await db.transaction(async (tx) => {
            // 1. Get Payment (Advance)
            const [payment] = await tx.select().from(paymentTransactions).where(eq(paymentTransactions.id, paymentId));
            if (!payment) throw createError('Payment transaction not found', 404);
            if (!payment.isAdvance) throw createError('Selected transaction is not an advance', 400);

            const advanceBalance = parseFloat(payment.advanceBalance || '0');
            const adjAmount = parseFloat(amount);

            if (adjAmount > advanceBalance) {
                throw createError(`Insufficient advance balance. Available: ${advanceBalance}`, 400);
            }

            // 2. Adjust Reference (Invoice/Bill)
            let referenceCode = '';
            if (referenceType === 'sales') {
                const [invoice] = await tx.select().from(invoices).where(eq(invoices.id, referenceId));
                if (!invoice) throw createError('Invoice not found', 404);
                referenceCode = invoice.invoiceNumber;

                // For Customer: Outstanding reduces when invoice is paid/adjusted
                // Update Customer Outstanding
                await tx.update(customers)
                    .set({
                        outstanding: sql`GREATEST(0, ${customers.outstanding} - ${amount})`,
                        updatedAt: new Date()
                    })
                    .where(eq(customers.id, invoice.customerId || ''));

                await tx.update(invoices)
                    .set({
                        paidAmount: sql`${invoices.paidAmount} + ${amount}`,
                        balanceAmount: sql`GREATEST(0, ${invoices.grandTotal} - (${invoices.paidAmount} + ${amount}))`,
                        paymentStatus: sql`CASE WHEN (${invoices.paidAmount} + ${amount}) >= ${invoices.grandTotal} THEN 'Paid' ELSE 'Partial' END`,
                        updatedAt: new Date(),
                    })
                    .where(eq(invoices.id, referenceId));
            } else {
                const [bill] = await tx.select().from(purchaseBills).where(eq(purchaseBills.id, referenceId));
                if (!bill) throw createError('Purchase bill not found', 404);
                referenceCode = bill.code;

                // For Supplier: Outstanding reduces when bill is paid/adjusted
                await tx.update(suppliers)
                    .set({
                        outstanding: sql`GREATEST(0, ${suppliers.outstanding} - ${amount})`,
                        updatedAt: new Date()
                    })
                    .where(eq(suppliers.id, bill.supplierId));

                await tx.update(purchaseBills)
                    .set({
                        paidAmount: sql`${purchaseBills.paidAmount} + ${amount}`,
                        balanceAmount: sql`GREATEST(0, ${purchaseBills.grandTotal} - (${purchaseBills.paidAmount} + ${amount}))`,
                        paymentStatus: sql`CASE WHEN (${purchaseBills.paidAmount} + ${amount}) >= ${purchaseBills.grandTotal} THEN 'Paid' ELSE 'Partial' END`,
                        updatedAt: new Date(),
                    })
                    .where(eq(purchaseBills.id, referenceId));
            }

            // 3. Update Payment Advance Balance
            await tx.update(paymentTransactions)
                .set({
                    advanceBalance: String(advanceBalance - adjAmount),
                })
                .where(eq(paymentTransactions.id, paymentId));

            // 4. Create History Entry (paymentAdjustments)
            await tx.insert(paymentAdjustments).values({
                paymentId,
                referenceType,
                referenceId,
                amount: String(amount)
            });

            // 5. Create "Adjustment" Payment Transaction for Ledger Visibility?
            // Actually, the money already moved. This is just allocation.
            // But we should record it so it shows up in history as "Adjusted against Inv X"
            // Or maybe just the adjustment table is enough?
            // User requirement: "All adjustments are reflected... preventing over-adjustments"
            // The paymentAdjustments table tracks this.
        });

        res.json(successResponse({ message: 'Advance adjusted successfully' }));

    } catch (error) {
        next(error);
    }
});

/**
 * GET /accounts/advances/:partyId
 * Get available advance payments for a party
 */
router.get('/advances/:partyId', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { partyId } = req.params;

        const advances = await db
            .select()
            .from(paymentTransactions)
            .where(and(
                eq(paymentTransactions.partyId, partyId),
                eq(paymentTransactions.isAdvance, true),
                sql`${paymentTransactions.advanceBalance} > 0`
            ))
            .orderBy(desc(paymentTransactions.createdAt));

        res.json(successResponse(advances));
    } catch (error) {
        next(error);
    }
});

// ============================================================
// GET ALL TRANSACTIONS
// ============================================================

/**
 * GET /accounts/transactions
 * Get all payment transactions with filters
 */
router.get('/transactions', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { type, partyType, accountId } = req.query;

        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const offset = (page - 1) * limit;

        // 1. Get total count
        let countQuery = db.select({ count: countFn() }).from(paymentTransactions);
        const countConditions = [];
        if (type) countConditions.push(eq(paymentTransactions.type, type as string));
        if (partyType) countConditions.push(eq(paymentTransactions.partyType, partyType as string));
        if (accountId) countConditions.push(eq(paymentTransactions.accountId, accountId as string));

        if (countConditions.length > 0) {
            countQuery = countQuery.where(and(...countConditions)) as any;
        }

        const countResult = await countQuery;
        const total = Number(countResult[0]?.count || 0);

        // 2. Get transactions (paginated)
        let query = db.select().from(paymentTransactions)
            .limit(limit)
            .offset(offset);

        // Apply filters
        const conditions = [];
        if (type) conditions.push(eq(paymentTransactions.type, type as string));
        if (partyType) conditions.push(eq(paymentTransactions.partyType, partyType as string));
        if (accountId) conditions.push(eq(paymentTransactions.accountId, accountId as string));

        const transactions = conditions.length > 0
            ? await query.where(and(...conditions)).orderBy(desc(paymentTransactions.createdAt))
            : await query.orderBy(desc(paymentTransactions.createdAt));

        res.json(successResponse({
            data: transactions,
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) }
        }));
    } catch (error) {
        next(error);
    }
});

// ============================================================
// EXPENSES
// ============================================================

/**
 * GET /accounts/expenses
 * Get all expenses
 */
router.get('/expenses', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const allExpenses = await db
            .select()
            .from(expenses)
            .leftJoin(expenseHeads, eq(expenses.expenseHeadId, expenseHeads.id))
            .leftJoin(bankCashAccounts, eq(expenses.accountId, bankCashAccounts.id))
            .orderBy(desc(expenses.createdAt));

        const formattedExpenses = allExpenses.map(row => ({
            ...row.expenses,
            expenseHead: row.expense_heads,
            account: row.bank_cash_accounts,
        }));

        res.json(successResponse(formattedExpenses));
    } catch (error) {
        next(error);
    }
});

/**
 * POST /accounts/expenses
 * Create a new expense
 */
router.post('/expenses', validateRequest(createExpenseSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const {
            date,
            expenseHeadId,
            accountId,
            amount,
            paymentMode,
            description,
            reference,
        } = req.body as CreateExpenseRequest;

        // Get expense head for name
        const [expenseHead] = await db.select().from(expenseHeads).where(eq(expenseHeads.id, expenseHeadId));
        if (!expenseHead) throw createError('Expense head not found', 404);

        await db.transaction(async (tx) => {
            // Generate expense code
            const countResult = await tx.select({ cnt: countFn() }).from(expenses);
            const expenseCode = `EXP-${String(Number(countResult[0]?.cnt || 0) + 1).padStart(4, '0')}`;

            // 1. Update Account Balance (Reduce)
            const [accountUpdate] = await tx.update(bankCashAccounts)
                .set({
                    balance: sql`${bankCashAccounts.balance} - ${amount}`,
                    updatedAt: new Date(),
                })
                .where(eq(bankCashAccounts.id, accountId))
                .returning({ newBalance: bankCashAccounts.balance });

            // 2. Create Expense
            const [expenseCreate] = await tx.insert(expenses).values({
                code: expenseCode,
                date: new Date(date || Date.now()),
                expenseHeadId,
                accountId,
                amount: String(amount),
                paymentMode: paymentMode || 'Cash',
                description: description || `Expense for ${expenseHead.name}`, // Default description to prevent null error
            }).returning();

            res.json(successResponse({
                expense: expenseCreate,
                accountNewBalance: parseFloat(accountUpdate?.newBalance || '0').toFixed(2),
            }));
        });
    } catch (error) {
        next(error);
    }
});

// ============================================================
// ACCOUNT SUMMARY
// ============================================================

/**
 * GET /accounts/summary
 * Get overall accounts summary
 */
router.get('/summary', async (req: Request, res: Response, next: NextFunction) => {
    try {
        // Account balances
        const accountsResult = await db
            .select({
                bankBalance: sql<string>`COALESCE(SUM(${bankCashAccounts.balance}::numeric) FILTER (WHERE ${bankCashAccounts.type} = 'Bank'), 0)`,
                cashBalance: sql<string>`COALESCE(SUM(${bankCashAccounts.balance}::numeric) FILTER (WHERE ${bankCashAccounts.type} = 'Cash'), 0)`,
            })
            .from(bankCashAccounts);

        // Customer outstanding
        const customerResult = await db
            .select({
                total: sql<string>`COALESCE(SUM(${customers.outstanding}::numeric), 0)`,
                count: sql<number>`COUNT(*)`,
            })
            .from(customers);

        // Supplier outstanding
        const supplierResult = await db
            .select({
                total: sql<string>`COALESCE(SUM(${suppliers.outstanding}::numeric), 0)`,
                count: sql<number>`COUNT(*)`,
            })
            .from(suppliers);

        // Total expenses
        const expenseResult = await db
            .select({
                total: sql<string>`COALESCE(SUM(${expenses.amount}::numeric), 0)`,
                count: sql<number>`COUNT(*)`,
            })
            .from(expenses);

        // Receipts and payments
        const txnResult = await db
            .select({
                totalReceipts: sql<string>`COALESCE(SUM(${paymentTransactions.amount}::numeric) FILTER (WHERE ${paymentTransactions.type} = 'RECEIPT'), 0)`,
                totalPayments: sql<string>`COALESCE(SUM(${paymentTransactions.amount}::numeric) FILTER (WHERE ${paymentTransactions.type} = 'PAYMENT'), 0)`,
                receiptCount: sql<number>`COUNT(*) FILTER (WHERE ${paymentTransactions.type} = 'RECEIPT')`,
                paymentCount: sql<number>`COUNT(*) FILTER (WHERE ${paymentTransactions.type} = 'PAYMENT')`,
            })
            .from(paymentTransactions);

        const bankBalance = parseFloat(accountsResult[0]?.bankBalance || '0');
        const cashBalance = parseFloat(accountsResult[0]?.cashBalance || '0');
        const customerOutstanding = parseFloat(customerResult[0]?.total || '0');
        const supplierOutstanding = parseFloat(supplierResult[0]?.total || '0');
        const totalExpenses = parseFloat(expenseResult[0]?.total || '0');
        const totalReceipts = parseFloat(txnResult[0]?.totalReceipts || '0');
        const totalPayments = parseFloat(txnResult[0]?.totalPayments || '0');

        res.json(successResponse({
            accounts: {
                bankBalance: bankBalance.toFixed(2),
                cashBalance: cashBalance.toFixed(2),
                totalBalance: (bankBalance + cashBalance).toFixed(2),
            },
            receivables: {
                total: customerOutstanding.toFixed(2),
                customerCount: Number(customerResult[0]?.count || 0),
            },
            payables: {
                total: supplierOutstanding.toFixed(2),
                supplierCount: Number(supplierResult[0]?.count || 0),
            },
            transactions: {
                totalReceipts: totalReceipts.toFixed(2),
                totalPayments: totalPayments.toFixed(2),
                receiptCount: Number(txnResult[0]?.receiptCount || 0),
                paymentCount: Number(txnResult[0]?.paymentCount || 0),
            },
            expenses: {
                total: totalExpenses.toFixed(2),
                count: Number(expenseResult[0]?.count || 0),
            },
            netPosition: (customerOutstanding - supplierOutstanding).toFixed(2),
        }));
    } catch (error) {
        next(error);
    }
});

// ============================================================
// ACCOUNT LEDGER (Single Account View)
// ============================================================

/**
 * GET /accounts/ledger/:accountId
 * Get detailed ledger for a specific account
 */
router.get('/ledger/:accountId', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { accountId } = req.params;

        // Get account details
        const [account] = await db.select().from(bankCashAccounts).where(eq(bankCashAccounts.id, accountId));
        if (!account) throw createError('Account not found', 404);

        // Get all transactions for this account
        const transactions = await db
            .select()
            .from(paymentTransactions)
            .where(eq(paymentTransactions.accountId, accountId))
            .orderBy(desc(paymentTransactions.createdAt));

        // Get expenses from this account
        const accountExpenses = await db
            .select()
            .from(expenses)
            .leftJoin(expenseHeads, eq(expenses.expenseHeadId, expenseHeads.id))
            .where(eq(expenses.accountId, accountId))
            .orderBy(desc(expenses.createdAt));

        // Calculate inflow/outflow
        const totalInflow = transactions
            .filter(t => t.type === 'RECEIPT')
            .reduce((sum, t) => sum + parseFloat(t.amount || '0'), 0);

        const totalOutflow = transactions
            .filter(t => t.type === 'PAYMENT')
            .reduce((sum, t) => sum + parseFloat(t.amount || '0'), 0);

        const totalExpenseAmount = accountExpenses
            .reduce((sum, e) => sum + parseFloat(e.expenses.amount || '0'), 0);

        res.json(successResponse({
            account,
            transactions,
            expenses: accountExpenses.map(e => ({
                ...e.expenses,
                expenseHead: e.expense_heads,
            })),
            summary: {
                currentBalance: account.balance,
                totalInflow: totalInflow.toFixed(2),
                totalOutflow: (totalOutflow + totalExpenseAmount).toFixed(2),
                transactionCount: transactions.length,
                expenseCount: accountExpenses.length,
            }
        }));
    } catch (error) {
        next(error);
    }
});

export default router;
