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
    customers, suppliers, invoices, purchaseBills, paymentAdjustments,
    financialTransactions, financialEntities, billPaymentAllocations, invoicePaymentAllocations,
    generalLedger
} from '../db/schema';
import { eq, desc, sql, and, count as countFn, inArray } from 'drizzle-orm';
import { successResponse } from '../types/api';
import { createError } from '../middleware/errorHandler';
import { validateRequest } from '../middleware/validation';
import { createExpenseSchema, recordPaymentSchema } from '../schemas/accounts';
import { cache } from '../services/cache.service';

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

        if (cashAccountIds.length === 0) {
            return res.json(successResponse({
                accounts: [],
                transactions: [],
                summary: { totalBalance: '0.00', accountCount: 0 }
            }));
        }

        // 1. Payment Transactions
        const payments = await db
            .select()
            .from(paymentTransactions)
            .where(sql`${paymentTransactions.accountId} IN (${sql.raw(cashAccountIds.map(id => `'${id}'`).join(','))})`);

        // 2. Expenses
        const expenseRecords = await db
            .select({
                id: expenses.id,
                date: expenses.date,
                amount: expenses.amount,
                description: expenses.description,
                accountId: expenses.accountId,
                // Add discriminator fields
                type: sql<string>`'EXPENSE'`,
                partyName: sql<string>`'Expense'`, // Placeholder
                mode: expenses.paymentMode,
            })
            .from(expenses)
            .where(sql`${expenses.accountId} IN (${sql.raw(cashAccountIds.map(id => `'${id}'`).join(','))})`);

        // 3. Financial Transactions (Loans, etc.)
        const financeRecords = await db
            .select({
                id: financialTransactions.id,
                date: financialTransactions.transactionDate,
                amount: financialTransactions.amount,
                description: financialTransactions.remarks,
                accountId: financialTransactions.accountId,
                type: financialTransactions.transactionType,
                partyName: sql<string>`'Financial'`,
                mode: financialTransactions.paymentMode,
            })
            .from(financialTransactions)
            .where(sql`${financialTransactions.accountId} IN (${sql.raw(cashAccountIds.map(id => `'${id}'`).join(','))})`);

        // 4. General Ledger (Interest, Adjustments)
        const glRecords = await db
            .select({
                id: generalLedger.id,
                date: generalLedger.transactionDate,
                amount: sql<string>`CASE WHEN ${generalLedger.creditAmount} > 0 THEN ${generalLedger.creditAmount} ELSE ${generalLedger.debitAmount} END`,
                description: generalLedger.description,
                accountId: generalLedger.ledgerId,
                type: sql<string>`CASE WHEN ${generalLedger.creditAmount} > 0 THEN 'PAYMENT' ELSE 'RECEIPT' END`, // Credit reduces asset (Payment-like), Debit increases (Receipt-like)
                partyName: sql<string>`'System'`,
                mode: sql<string>`'System'`,
                voucherType: generalLedger.voucherType
            })
            .from(generalLedger)
            .where(
                and(
                    sql`${generalLedger.ledgerId} IN (${sql.raw(cashAccountIds.map(id => `'${id}'`).join(','))})`,
                )
            );

        // Merge and Normalize
        const allTransactions = [
            ...payments.map(p => ({
                id: p.id,
                date: p.date,
                amount: p.amount,
                type: p.type, // RECEIPT/PAYMENT
                description: p.remarks || `${p.type} - ${p.partyName}`,
                partyName: p.partyName,
                mode: p.mode,
                category: 'Trade'
            })),
            ...expenseRecords.map(e => ({
                id: e.id,
                date: new Date(e.date),
                amount: e.amount,
                type: 'PAYMENT', // Expenses are payments
                description: e.description || 'Expense',
                partyName: e.partyName,
                mode: e.mode,
                category: 'Expense'
            })),
            ...financeRecords.map(f => ({
                id: f.id,
                date: new Date(f.date),
                amount: f.amount,
                type: ['LOAN_GIVEN', 'REPAYMENT_GIVEN', 'INVESTMENT_MADE'].includes(f.type) ? 'PAYMENT' : 'RECEIPT',
                description: f.description || f.type,
                partyName: f.partyName,
                mode: f.mode,
                category: 'Financial'
            })),
            ...glRecords.map(g => ({
                id: g.id,
                date: new Date(g.date),
                amount: g.amount,
                type: g.type,
                description: g.description,
                partyName: g.partyName,
                mode: g.mode,
                category: 'General'
            }))
        ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        // Calculate totals
        const totalCashBalance = cashAccounts.reduce((sum, acc) => sum + parseFloat(acc.balance || '0'), 0);

        res.json(successResponse({
            accounts: cashAccounts,
            transactions: allTransactions,
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

        if (bankAccountIds.length === 0) {
            return res.json(successResponse({
                accounts: [],
                transactions: [],
                summary: { totalBalance: '0.00', accountCount: 0 }
            }));
        }

        // 1. Payment Transactions
        const payments = await db
            .select()
            .from(paymentTransactions)
            .where(sql`${paymentTransactions.accountId} IN (${sql.raw(bankAccountIds.map(id => `'${id}'`).join(','))})`);

        // 2. Expenses
        const expenseRecords = await db
            .select({
                id: expenses.id,
                date: expenses.date,
                amount: expenses.amount,
                description: expenses.description,
                accountId: expenses.accountId,
                type: sql<string>`'EXPENSE'`,
                partyName: sql<string>`'Expense'`,
                mode: expenses.paymentMode,
            })
            .from(expenses)
            .where(sql`${expenses.accountId} IN (${sql.raw(bankAccountIds.map(id => `'${id}'`).join(','))})`);

        // 3. Financial Transactions
        const financeRecords = await db
            .select({
                id: financialTransactions.id,
                date: financialTransactions.transactionDate,
                amount: financialTransactions.amount,
                description: financialTransactions.remarks,
                accountId: financialTransactions.accountId,
                type: financialTransactions.transactionType,
                partyName: sql<string>`'Financial'`,
                mode: financialTransactions.paymentMode,
            })
            .from(financialTransactions)
            .where(sql`${financialTransactions.accountId} IN (${sql.raw(bankAccountIds.map(id => `'${id}'`).join(','))})`);

        // 4. General Ledger (Interest, Adjustments)
        const glRecords = await db
            .select({
                id: generalLedger.id,
                date: generalLedger.transactionDate,
                amount: sql<string>`CASE WHEN ${generalLedger.creditAmount} > 0 THEN ${generalLedger.creditAmount} ELSE ${generalLedger.debitAmount} END`,
                description: generalLedger.description,
                accountId: generalLedger.ledgerId,
                type: sql<string>`CASE WHEN ${generalLedger.creditAmount} > 0 THEN 'PAYMENT' ELSE 'RECEIPT' END`, // Credit reduces asset
                partyName: sql<string>`'System'`,
                mode: sql<string>`'System'`,
                voucherType: generalLedger.voucherType
            })
            .from(generalLedger)
            .where(
                and(
                    sql`${generalLedger.ledgerId} IN (${sql.raw(bankAccountIds.map(id => `'${id}'`).join(','))})`,
                )
            );

        // Merge and Normalize
        const allTransactions = [
            ...payments.map(p => ({
                id: p.id,
                date: p.date,
                amount: p.amount,
                type: p.type,
                description: p.remarks || `${p.type} - ${p.partyName}`,
                partyName: p.partyName,
                mode: p.mode,
                category: 'Trade'
            })),
            ...expenseRecords.map(e => ({
                id: e.id,
                date: new Date(e.date),
                amount: e.amount,
                type: 'PAYMENT',
                description: e.description || 'Expense',
                partyName: e.partyName,
                mode: e.mode,
                category: 'Expense'
            })),
            ...financeRecords.map(f => ({
                id: f.id,
                date: new Date(f.date),
                amount: f.amount,
                type: ['LOAN_GIVEN', 'REPAYMENT_GIVEN', 'INVESTMENT_MADE'].includes(f.type) ? 'PAYMENT' : 'RECEIPT',
                description: f.description || f.type,
                partyName: f.partyName,
                mode: f.mode,
                category: 'Financial'
            })),
            ...glRecords.map(g => ({
                id: g.id,
                date: new Date(g.date),
                amount: g.amount,
                type: g.type,
                description: g.description,
                partyName: g.partyName,
                mode: g.mode,
                category: 'General'
            }))
        ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        // Calculate totals
        const totalBankBalance = bankAccounts.reduce((sum, acc) => sum + parseFloat(acc.balance || '0'), 0);

        res.json(successResponse({
            accounts: bankAccounts,
            transactions: allTransactions,
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
 * OPTIMIZED: Uses SQL aggregation and pagination
 */
router.get('/customer-ledger', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const customerId = req.query.customerId as string;
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const offset = (page - 1) * limit;

        if (customerId) {
            // 1. Specific Customer Details
            const [customer] = await db.select().from(customers).where(eq(customers.id, customerId));
            if (!customer) throw createError('Customer not found', 404);

            // 2. Aggregates for this customer
            const [invoiceStats] = await db
                .select({
                    total: sql<string>`coalesce(sum(${invoices.grandTotal}), 0)`,
                    count: countFn()
                })
                .from(invoices)
                .where(eq(invoices.customerId, customerId));

            const [paymentStats] = await db
                .select({
                    total: sql<string>`coalesce(sum(${paymentTransactions.amount}), 0)`,
                    count: countFn()
                })
                .from(paymentTransactions)
                .where(and(eq(paymentTransactions.partyType, 'customer'), eq(paymentTransactions.partyId, customerId)));

            // 3. Paginated Lists
            const customerInvoices = await db
                .select()
                .from(invoices)
                .where(eq(invoices.customerId, customerId))
                .orderBy(desc(invoices.invoiceDate))
                .limit(limit)
                .offset(offset);

            const customerPayments = await db
                .select()
                .from(paymentTransactions)
                .where(and(eq(paymentTransactions.partyType, 'customer'), eq(paymentTransactions.partyId, customerId)))
                .orderBy(desc(paymentTransactions.createdAt))
                .limit(limit)
                .offset(offset);

            res.json(successResponse({
                customer: {
                    ...customer,
                    outstandingAmount: parseFloat(customer.outstanding || '0'),
                },
                invoices: customerInvoices,
                payments: customerPayments,
                summary: {
                    totalInvoiced: parseFloat(invoiceStats.total),
                    totalReceived: parseFloat(paymentStats.total),
                    totalOutstanding: parseFloat(customer.outstanding || '0'),
                    invoiceCount: Number(invoiceStats.count),
                    paymentCount: Number(paymentStats.count)
                },
                meta: { page, limit }
            }));
        } else {
            // 2. Global Customer List (Overview)

            // Global Aggregates (Fast)
            const [customerStats] = await db.select({
                totalOutstanding: sql<string>`coalesce(sum(${customers.outstanding}), 0)`,
                count: countFn()
            }).from(customers);

            // We only calculate global Invoiced/Received if needed, but it's good for dashboard
            const [invoiceGlobal] = await db.select({ total: sql<string>`coalesce(sum(${invoices.grandTotal}), 0)` }).from(invoices);
            const [paymentGlobal] = await db.select({ total: sql<string>`coalesce(sum(${paymentTransactions.amount}), 0)` }).from(paymentTransactions).where(eq(paymentTransactions.partyType, 'customer'));

            // Paginated Customers
            const paginatedCustomers = await db
                .select()
                .from(customers)
                .orderBy(desc(customers.outstanding)) // Show highest outstanding first
                .limit(limit)
                .offset(offset);

            res.json(successResponse({
                customers: paginatedCustomers.map(c => ({
                    ...c,
                    outstandingAmount: parseFloat(c.outstanding || '0'),
                })),
                summary: {
                    totalCustomers: Number(customerStats.count),
                    totalInvoiced: parseFloat(invoiceGlobal.total),
                    totalReceived: parseFloat(paymentGlobal.total),
                    totalOutstanding: parseFloat(customerStats.totalOutstanding),
                },
                meta: { page, limit, total: Number(customerStats.count) }
            }));
        }
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
 * OPTIMIZED: Uses SQL aggregation and pagination
 */
router.get('/supplier-ledger', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const supplierId = req.query.supplierId as string;
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const offset = (page - 1) * limit;

        if (supplierId) {
            // 1. Specific Supplier Details
            const [supplier] = await db.select().from(suppliers).where(eq(suppliers.id, supplierId));
            if (!supplier) throw createError('Supplier not found', 404);

            // 2. Aggregates
            const [billStats] = await db
                .select({
                    total: sql<string>`coalesce(sum(${purchaseBills.grandTotal}), 0)`,
                    count: countFn()
                })
                .from(purchaseBills)
                .where(eq(purchaseBills.supplierId, supplierId));

            const [paymentStats] = await db
                .select({
                    total: sql<string>`coalesce(sum(${paymentTransactions.amount}), 0)`,
                    count: countFn()
                })
                .from(paymentTransactions)
                .where(and(eq(paymentTransactions.partyType, 'supplier'), eq(paymentTransactions.partyId, supplierId)));

            // 3. Paginated Lists
            const supplierBills = await db
                .select()
                .from(purchaseBills)
                .where(eq(purchaseBills.supplierId, supplierId))
                .orderBy(desc(purchaseBills.date))
                .limit(limit)
                .offset(offset);

            const supplierPayments = await db
                .select()
                .from(paymentTransactions)
                .where(and(eq(paymentTransactions.partyType, 'supplier'), eq(paymentTransactions.partyId, supplierId)))
                .orderBy(desc(paymentTransactions.createdAt))
                .limit(limit)
                .offset(offset);

            res.json(successResponse({
                supplier: {
                    ...supplier,
                    outstandingAmount: parseFloat(supplier.outstanding || '0'),
                },
                bills: supplierBills,
                payments: supplierPayments,
                summary: {
                    totalPurchased: parseFloat(billStats.total),
                    totalPaid: parseFloat(paymentStats.total),
                    totalOutstanding: parseFloat(supplier.outstanding || '0'),
                    billCount: Number(billStats.count),
                    paymentCount: Number(paymentStats.count)
                },
                meta: { page, limit }
            }));
        } else {
            // 2. Global Supplier List (Overview)

            const [supplierStats] = await db.select({
                totalOutstanding: sql<string>`coalesce(sum(${suppliers.outstanding}), 0)`,
                count: countFn()
            }).from(suppliers);

            const [billGlobal] = await db.select({ total: sql<string>`coalesce(sum(${purchaseBills.grandTotal}), 0)` }).from(purchaseBills);
            const [paymentGlobal] = await db.select({ total: sql<string>`coalesce(sum(${paymentTransactions.amount}), 0)` }).from(paymentTransactions).where(eq(paymentTransactions.partyType, 'supplier'));

            const paginatedSuppliers = await db
                .select()
                .from(suppliers)
                .orderBy(desc(suppliers.outstanding))
                .limit(limit)
                .offset(offset);

            res.json(successResponse({
                suppliers: paginatedSuppliers.map(s => ({
                    ...s,
                    outstandingAmount: parseFloat(s.outstanding || '0'),
                })),
                summary: {
                    totalSuppliers: Number(supplierStats.count),
                    totalPurchased: parseFloat(billGlobal.total),
                    totalPaid: parseFloat(paymentGlobal.total),
                    totalOutstanding: parseFloat(supplierStats.totalOutstanding),
                },
                meta: { page, limit, total: Number(supplierStats.count) }
            }));
        }
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

            // Invalidate accounts cache
            cache.del('masters:accounts');
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
// ============================================================
// GET ALL TRANSACTIONS (Unified)
// ============================================================

/**
 * GET /accounts/transactions
 * Get all payment transactions, expenses, and financial transactions
 */
router.get('/transactions', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { type, partyType, accountId } = req.query;

        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const offset = (page - 1) * limit;

        const fetchLimit = limit * page;

        // Build conditions array for payment query
        const paymentConditions = [];
        if (type) {
            paymentConditions.push(eq(paymentTransactions.type, type as string));
        }
        if (partyType) {
            paymentConditions.push(eq(paymentTransactions.partyType, partyType as string));
        }

        // 1. Fetch Payment Transactions (with optional type and partyType filters)
        let paymentQuery = db.select()
            .from(paymentTransactions)
            .leftJoin(bankCashAccounts, eq(paymentTransactions.accountId, bankCashAccounts.id))
            .where(paymentConditions.length > 0 ? and(...paymentConditions) : undefined)
            .orderBy(desc(paymentTransactions.date))
            .limit(fetchLimit);

        // 2. Fetch Expenses (skip if filtering by type=RECEIPT or partyType)
        let expenseQuery = (type === 'RECEIPT' || partyType) ? Promise.resolve([]) : db.select()
            .from(expenses)
            .leftJoin(expenseHeads, eq(expenses.expenseHeadId, expenseHeads.id))
            .leftJoin(bankCashAccounts, eq(expenses.accountId, bankCashAccounts.id))
            .orderBy(desc(expenses.date))
            .limit(fetchLimit);

        // 3. Fetch Financial Transactions (skip if partyType is specified - those are trade payments, not finance)
        let financeQuery = partyType ? Promise.resolve([]) : db.select()
            .from(financialTransactions)
            .leftJoin(financialEntities, eq(financialTransactions.partyId, financialEntities.id))
            .leftJoin(bankCashAccounts, eq(financialTransactions.accountId, bankCashAccounts.id))
            .orderBy(desc(financialTransactions.transactionDate))
            .limit(fetchLimit);


        // Apply Account Filter
        if (accountId) {
            paymentQuery = db.select()
                .from(paymentTransactions)
                .leftJoin(bankCashAccounts, eq(paymentTransactions.accountId, bankCashAccounts.id))
                .where(eq(paymentTransactions.accountId, accountId as string))
                .orderBy(desc(paymentTransactions.date))
                .limit(fetchLimit) as any;

            expenseQuery = db.select()
                .from(expenses)
                .leftJoin(expenseHeads, eq(expenses.expenseHeadId, expenseHeads.id))
                .leftJoin(bankCashAccounts, eq(expenses.accountId, bankCashAccounts.id))
                .where(eq(expenses.accountId, accountId as string))
                .orderBy(desc(expenses.date))
                .limit(fetchLimit) as any;

            financeQuery = db.select()
                .from(financialTransactions)
                .leftJoin(financialEntities, eq(financialTransactions.partyId, financialEntities.id))
                .leftJoin(bankCashAccounts, eq(financialTransactions.accountId, bankCashAccounts.id))
                .where(eq(financialTransactions.accountId, accountId as string))
                .orderBy(desc(financialTransactions.transactionDate))
                .limit(fetchLimit) as any;
        }

        // 4. Fetch General Ledger (Contra, Journal, Adjustments)
        // Exclude RECEIPT/PAYMENT as they are already in paymentTransactions
        let glQuery = db.select()
            .from(generalLedger)
            .leftJoin(bankCashAccounts, eq(generalLedger.ledgerId, bankCashAccounts.id))
            .where(
                and(
                    inArray(generalLedger.voucherType, ['CONTRA', 'JOURNAL', 'ADJUSTMENT', 'SYSTEM']),
                    accountId ? eq(generalLedger.ledgerId, accountId as string) : undefined
                )
            )
            .orderBy(desc(generalLedger.transactionDate))
            .limit(fetchLimit);

        const [payments, expenseRecords, financeRecords, glRecords] = await Promise.all([
            paymentQuery,
            expenseQuery,
            financeQuery,
            glQuery
        ]);

        // FETCH ALLOCATIONS
        // Note: With select(), payments are { payment_transactions: ..., bank_cash_accounts: ... }
        const paymentIds = payments.map(row => row.payment_transactions.id);
        let allocationsMap: Record<string, any[]> = {};

        if (paymentIds.length > 0) {
            // 1. Fetch Purchase Allocations
            const billAllocations = await db.query.billPaymentAllocations.findMany({
                where: inArray(billPaymentAllocations.paymentId, paymentIds),
                with: {
                    bill: true
                }
            });

            // 2. Fetch Sales Allocations
            const invoiceAllocations = await db.query.invoicePaymentAllocations.findMany({
                where: inArray(invoicePaymentAllocations.paymentId, paymentIds),
                with: {
                    invoice: true
                }
            });

            // Merge into Map
            billAllocations.forEach(a => {
                if (!allocationsMap[a.paymentId]) allocationsMap[a.paymentId] = [];
                allocationsMap[a.paymentId].push({
                    billNumber: a.bill?.invoiceNumber || a.bill?.code,
                    amount: a.amount,
                    type: 'Purchase'
                });
            });

            invoiceAllocations.forEach(a => {
                if (!allocationsMap[a.paymentId]) allocationsMap[a.paymentId] = [];
                allocationsMap[a.paymentId].push({
                    billNumber: a.invoice?.invoiceNumber,
                    amount: a.amount,
                    type: 'Sales'
                });
            });
        }

        // Normalize and Merge
        const unified = [
            ...payments.map(row => {
                const p = row.payment_transactions;
                const acc = row.bank_cash_accounts;
                return {
                    id: p.id,
                    date: p.date,
                    type: p.type, // RECEIPT / PAYMENT
                    category: 'Trade',
                    partyName: p.partyName,
                    description: p.remarks || `Payment ${p.type === 'RECEIPT' ? 'from' : 'to'} ${p.partyName}`,
                    amount: parseFloat(p.amount),
                    mode: p.mode,
                    status: p.status,
                    isAdvance: p.isAdvance,
                    advanceBalance: p.advanceBalance,
                    code: p.code,
                    allocations: allocationsMap[p.id] || [],
                    accountName: acc?.name,
                    details: p
                };
            }),
            ...expenseRecords.map(row => {
                const e = row.expenses;
                const head = row.expense_heads;
                const acc = row.bank_cash_accounts;
                return {
                    id: e.id,
                    date: e.date,
                    type: 'EXPENSE',
                    category: 'Expense',
                    partyName: head?.name || 'General Expense',
                    description: e.description,
                    amount: parseFloat(e.amount),
                    mode: e.paymentMode,
                    status: e.status,
                    accountName: acc?.name,
                    details: e
                };
            }),
            ...financeRecords.map(row => {
                const f = row.financial_transactions;
                const entity = row.financial_entities;
                const acc = row.bank_cash_accounts;
                return {
                    id: f.id,
                    date: f.transactionDate,
                    type: f.transactionType,
                    category: 'Finance',
                    partyName: entity?.name || 'Financial Entity',
                    description: f.remarks || (f.transactionType as string).replace(/_/g, ' '),
                    amount: parseFloat(f.amount),
                    mode: f.paymentMode,
                    status: f.status,
                    accountName: acc?.name,
                    details: f
                };
            }),
            ...glRecords.map(row => {
                const g = row.general_ledger;
                const acc = row.bank_cash_accounts;
                const isCredit = Number(g.creditAmount) > 0;
                return {
                    id: g.id,
                    date: g.transactionDate,
                    type: g.voucherType, // CONTRA, JOURNAL
                    category: 'General',
                    partyName: 'System / Contra',
                    description: g.description,
                    amount: isCredit ? parseFloat(g.creditAmount || '0') : parseFloat(g.debitAmount || '0'),
                    mode: 'System', // Usually internal
                    status: 'Completed',
                    accountName: acc?.name,
                    details: g,
                    // UI Helpers: Credit in Bank = Payment (Out), Debit = Receipt (In)
                    // But for Contra, it depends.
                    // If it's a Reversal:
                    // Original Receipt: Debit Bank, Credit Customer.
                    // Reversal: Credit Bank, Debit Customer.
                    // So Credit Bank = Payment-like effect (Balance decreases).
                    // We map it to standard types for UI color coding if needed.
                    uiType: isCredit ? 'PAYMENT' : 'RECEIPT' // For color coding red/green
                };
            })
        ];

        // Sort by Date Descending
        unified.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        // Paginate
        const total = unified.length;
        const paginatedData = unified.slice(offset, offset + limit);

        res.json(successResponse({
            data: paginatedData,
            meta: {
                total: 1000,
                page,
                limit,
                totalPages: 10
            }
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

        // 1. Get Payment Transactions (Receipts/Payments)
        const paymentTxs = await db
            .select()
            .from(paymentTransactions)
            .where(eq(paymentTransactions.accountId, accountId))
            .orderBy(desc(paymentTransactions.createdAt));

        // 2. Get Expenses
        const expenseTxs = await db
            .select()
            .from(expenses)
            .leftJoin(expenseHeads, eq(expenses.expenseHeadId, expenseHeads.id))
            .where(eq(expenses.accountId, accountId))
            .orderBy(desc(expenses.createdAt));

        // 3. Get Financial Transactions
        const financeTxs = await db
            .select()
            .from(financialTransactions)
            .leftJoin(financialEntities, eq(financialTransactions.partyId, financialEntities.id))
            .where(eq(financialTransactions.accountId, accountId))
            .orderBy(desc(financialTransactions.transactionDate));

        // 4. Calculate Summary (Inflow/Outflow)

        // Payments
        const paymentsInflow = paymentTxs
            .filter(t => t.type === 'RECEIPT')
            .reduce((sum, t) => sum + parseFloat(t.amount || '0'), 0);

        const paymentsOutflow = paymentTxs
            .filter(t => t.type === 'PAYMENT')
            .reduce((sum, t) => sum + parseFloat(t.amount || '0'), 0);

        // Expenses (Always Outflow)
        const expensesOutflow = expenseTxs
            .reduce((sum, row) => sum + parseFloat(row.expenses.amount || '0'), 0);

        // Finance
        // Inflow: LOAN_TAKEN, INVESTMENT_RECEIVED, BORROWING
        // Outflow: LOAN_GIVEN, INVESTMENT_MADE, REPAYMENT
        const financeInflow = financeTxs
            .filter(row => ['LOAN_TAKEN', 'INVESTMENT_RECEIVED', 'BORROWING'].includes(row.financial_transactions.transactionType))
            .reduce((sum, row) => sum + parseFloat(row.financial_transactions.amount || '0'), 0);

        const financeOutflow = financeTxs
            .filter(row => ['LOAN_GIVEN', 'INVESTMENT_MADE', 'REPAYMENT'].includes(row.financial_transactions.transactionType))
            .reduce((sum, row) => sum + parseFloat(row.financial_transactions.amount || '0'), 0);

        const totalInflow = paymentsInflow + financeInflow;
        const totalOutflow = paymentsOutflow + expensesOutflow + financeOutflow;

        // 5. Unified History
        const history = [
            ...paymentTxs.map(p => ({
                id: p.id,
                date: p.date,
                type: p.type, // RECEIPT / PAYMENT
                category: 'Trade',
                description: p.remarks || (p.type === 'RECEIPT' ? `Receipt from ${p.partyName}` : `Payment to ${p.partyName}`),
                amount: parseFloat(p.amount),
                isCredit: p.type === 'RECEIPT', // Credit to Bank = Inflow
                isDebit: p.type === 'PAYMENT',  // Debit to Bank = Outflow
                partyName: p.partyName,
                mode: p.mode,
                details: p
            })),
            ...expenseTxs.map(row => {
                const e = row.expenses;
                const head = row.expense_heads;
                return {
                    id: e.id,
                    date: e.date,
                    type: 'EXPENSE',
                    category: 'Expense',
                    description: e.description,
                    amount: parseFloat(e.amount),
                    isCredit: false,
                    isDebit: true, // Expense is Outflow
                    partyName: head?.name || 'General Expense',
                    mode: e.paymentMode,
                    details: e
                };
            }),
            ...financeTxs.map(row => {
                const f = row.financial_transactions;
                const entity = row.financial_entities;
                const type = f.transactionType as string;
                const isInflow = ['LOAN_TAKEN', 'INVESTMENT_RECEIVED', 'BORROWING'].includes(type);
                return {
                    id: f.id,
                    date: f.transactionDate,
                    type: type,
                    category: 'Finance',
                    description: f.remarks || type.replace(/_/g, ' '),
                    amount: parseFloat(f.amount),
                    isCredit: isInflow,
                    isDebit: !isInflow,
                    partyName: entity?.name || 'Financial Entity',
                    mode: f.paymentMode,
                    details: f
                };
            })
        ];

        // Sort by Date Descending
        history.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        res.json(successResponse({
            account,
            history, // Unified List
            summary: {
                currentBalance: account.balance,
                totalInflow: totalInflow.toFixed(2),
                totalOutflow: totalOutflow.toFixed(2),
                transactionCount: history.length,
            }
        }));
    } catch (error) {
        next(error);
    }
});

export default router;
