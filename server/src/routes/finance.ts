import { Router, Request, Response, NextFunction } from 'express';
import { successResponse } from '../types/api';
import { createError } from '../middleware/errorHandler';
import { validateRequest } from '../middleware/validation';
import { createEntitySchema, createTransactionSchema } from '../schemas/finance';
import { db } from '../db/index';
import {
    financialEntities,
    financialTransactions,
    financialTransactionLedger,
    bankCashAccounts,
    generalLedger,
    customers,
    suppliers,
    invoices,
    purchaseBills
} from '../db/schema';
import { cache as cacheService } from '../services/cache.service';
import { eq, desc, sql, count as countFn, and, ne, gte, lte } from 'drizzle-orm';

const router = Router();

/**
 * GET /finance/dashboard-stats
 * Get aggregated stats for dashboard
 */
router.get('/dashboard-stats', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const [stats] = await db.select({
            totalLoansTaken: sql<string>`coalesce(sum(case when ${financialTransactions.transactionType} = 'LOAN_TAKEN' then ${financialTransactions.amount} else 0 end), 0)`,
            totalLoansGiven: sql<string>`coalesce(sum(case when ${financialTransactions.transactionType} = 'LOAN_GIVEN' then ${financialTransactions.amount} else 0 end), 0)`,
            totalInvestments: sql<string>`coalesce(sum(case when ${financialTransactions.transactionType} = 'INVESTMENT_RECEIVED' then ${financialTransactions.amount} else 0 end), 0)`,
        }).from(financialTransactions);

        res.json(successResponse({
            totalLoansTaken: parseFloat(stats.totalLoansTaken),
            totalLoansGiven: parseFloat(stats.totalLoansGiven),
            totalInvestments: parseFloat(stats.totalInvestments)
        }));
    } catch (error) {
        next(error);
    }
});

/**
 * GET /finance/entities
 * List all Financial Entities (Lenders, Borrowers, Investors)
 */
router.get('/entities', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const entities = await db.select().from(financialEntities).orderBy(desc(financialEntities.createdAt));
        res.json(successResponse(entities));
    } catch (error) {
        next(error);
    }
});

/**
 * POST /finance/entities
 * Create a new Financial Entity
 */
router.post('/entities', validateRequest(createEntitySchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { name, type, contact, email } = req.body;

        const [entity] = await db.insert(financialEntities).values({
            name,
            type,
            contact,
            email
        }).returning();

        res.json(successResponse(entity));
    } catch (error) {
        next(error);
    }
});

/**
 * PUT /finance/entities/:id
 * Update a Financial Entity
 */
router.put('/entities/:id', validateRequest(createEntitySchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const { name, type, contact, email } = req.body;

        const [entity] = await db.update(financialEntities)
            .set({ name, type, contact, email, updatedAt: new Date() })
            .where(eq(financialEntities.id, id))
            .returning();

        if (!entity) throw createError('Entity not found', 404);

        // Clear cache
        cacheService.del('finance_entities');

        res.json(successResponse(entity));
    } catch (error) {
        next(error);
    }
});

/**
 * DELETE /finance/entities/:id
 * Delete a Financial Entity
 */
router.delete('/entities/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;

        // Check for transactions
        const transactions = await db.select({ count: countFn() })
            .from(financialTransactions)
            .where(eq(financialTransactions.partyId, id));

        if (transactions[0].count > 0) {
            throw createError('Cannot delete entity with existing transactions', 400);
        }

        const [deleted] = await db.delete(financialEntities)
            .where(eq(financialEntities.id, id))
            .returning();

        if (!deleted) throw createError('Entity not found', 404);

        // Clear cache
        cacheService.del('finance_entities');

        res.json(successResponse({ message: 'Entity deleted successfully' }));
    } catch (error) {
        next(error);
    }
});

/**
 * GET /finance/entities/:id/stats
 * Get Financial Stats for a specific Entity (Total Taken, Paid, Interest)
 */
router.get('/entities/:id/stats', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;

        // 1. Calculate Total Taken (Liabilities/Capital Raised)
        // LOAN_TAKEN, INVESTMENT_RECEIVED, BORROWING
        const takenResult = await db.select({
            total: sql<string>`coalesce(sum(${financialTransactions.amount}), 0)`
        })
            .from(financialTransactions)
            .where(
                sql`${financialTransactions.partyId} = ${id} 
            AND ${financialTransactions.transactionType} IN ('LOAN_TAKEN', 'INVESTMENT_RECEIVED', 'BORROWING')`
            );

        const totalTaken = parseFloat(takenResult[0].total);

        // 2. Calculate Total Repaid Gross (Cash Flow Out)
        // REPAYMENT, LOAN_GIVEN (if we gave back?), INVESTMENT_MADE (buyback?)
        // For now, strictly 'REPAYMENT' matches the use case.
        const repaidGrossResult = await db.select({
            total: sql<string>`coalesce(sum(${financialTransactions.amount}), 0)`
        })
            .from(financialTransactions)
            .where(
                sql`${financialTransactions.partyId} = ${id} 
            AND ${financialTransactions.transactionType} = 'REPAYMENT'`
            );

        const totalRepaidGross = parseFloat(repaidGrossResult[0].total);

        // 3. Calculate Principal Repaid
        // This comes from the Ledger where we Debited the Party (reducing Liability)
        const principalRepaidResult = await db.select({
            total: sql<string>`coalesce(sum(${financialTransactionLedger.debit}), 0)`
        })
            .from(financialTransactionLedger)
            .where(
                sql`${financialTransactionLedger.ledgerAccountId} = ${id}
            AND ${financialTransactionLedger.ledgerType} IN ('LIABILITY', 'CAPITAL', 'ASSET')`
            );
        // Note: For Repayment, we Debit the Liability Account (The Party).

        const totalPrincipalRepaid = parseFloat(principalRepaidResult[0].total);

        // 4. Derived Interest Paid
        const totalInterestPaid = totalRepaidGross - totalPrincipalRepaid;

        res.json(successResponse({
            totalTaken,
            totalRepaidGross,
            totalPrincipalRepaid,
            totalInterestPaid: Math.max(0, totalInterestPaid) // Avoid floating point negatives
        }));

    } catch (error) {
        next(error);
    }
});

/**
 * GET /finance/transactions
 * List all Financial Transactions (Paginated)
 */
router.get('/transactions', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const offset = (page - 1) * limit;

        const { type, partyId, startDate, endDate } = req.query;

        // Build Filters
        const conditions = [];
        if (type) conditions.push(eq(financialTransactions.transactionType, type as string));
        if (partyId) conditions.push(eq(financialTransactions.partyId, partyId as string));
        if (startDate) conditions.push(gte(financialTransactions.transactionDate, new Date(startDate as string)));
        if (endDate) conditions.push(lte(financialTransactions.transactionDate, new Date(endDate as string)));

        const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

        // Get Total Count & Total Amount (Filtered)
        const [stats] = await db.select({
            count: countFn(),
            totalAmount: sql<string>`coalesce(sum(${financialTransactions.amount}), 0)`
        })
            .from(financialTransactions)
            .where(whereClause);

        const total = Number(stats.count);
        const totalAmount = parseFloat(stats.totalAmount);

        // Fetch Data
        const txs = await db.query.financialTransactions.findMany({
            where: whereClause,
            orderBy: [desc(financialTransactions.transactionDate)],
            limit: limit,
            offset: offset,
            with: {
                party: true,
                account: true,
            }
        });

        res.json(successResponse({
            data: txs,
            meta: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
                totalFilteredAmount: totalAmount // New Field
            }
        }));
    } catch (error) {
        next(error);
    }
});

/**
 * POST /finance/transactions
 * Create a new Financial Transaction (Double Entry Logic)
 */
router.post('/transactions', validateRequest(createTransactionSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const {
            transactionType,
            partyId,
            amount,
            paymentMode,
            accountId, // Bank/Cash Account
            transactionDate,
            reference,
            remarks,
            interestRate,
            tenure,
            dueDate,
            repaymentType,
            principalAmount,
            interestAmount
        } = req.body;

        const amt = parseFloat(amount);
        // Additional business logic validation
        if (amt <= 0) throw createError('Invalid amount', 400);

        await db.transaction(async (tx) => {
            // 1. Validate Bank Account exists (if applicable) using TX to be safe, though ID check is enough usually
            if (paymentMode !== 'Cash' && accountId) {
                const bankAccount = await tx.query.bankCashAccounts.findFirst({
                    where: eq(bankCashAccounts.id, accountId)
                });
                if (!bankAccount) throw createError('Invalid Bank Account', 400);

                // CC VALIDATION: Check Limit/DP for Outgoing Transactions (CC Utilization)
                if (bankAccount.type === 'CC' && ['LOAN_GIVEN', 'INVESTMENT_MADE', 'REPAYMENT'].includes(transactionType)) {
                    const { validateCCTransaction } = await import('../services/cc-account.service');
                    const validation = await validateCCTransaction(accountId, amt);
                    if (!validation.allowed) {
                        throw createError(validation.message || 'CC Logic Error', 400);
                    }
                }
            }

            // 2. Create Transaction Header
            const [newTx] = await tx.insert(financialTransactions).values({
                transactionType,
                partyId,
                amount: String(amt),
                paymentMode,
                accountId,
                transactionDate: new Date(transactionDate),
                reference,
                remarks,
                interestRate: interestRate ? String(interestRate) : null,
                tenure: tenure ? String(tenure) : null,
                dueDate: dueDate ? new Date(dueDate) : null,
                repaymentType,
                principalAmount: principalAmount ? String(principalAmount) : null,
                interestAmount: interestAmount ? String(interestAmount) : null,
                status: 'Active'
            }).returning();

            // 3. Double Entry Logic
            let bankDr = 0;
            let bankCr = 0;
            let partyDr = 0;
            let partyCr = 0;
            let ledgerType = ''; // ASSET, LIABILITY, CAPITAL

            switch (transactionType) {
                case 'LOAN_TAKEN': // Liability Cr, Bank Dr
                    bankDr = amt;
                    partyCr = amt;
                    ledgerType = 'LIABILITY';
                    break;
                case 'LOAN_GIVEN': // Asset Dr, Bank Cr
                    partyDr = amt;
                    bankCr = amt;
                    ledgerType = 'ASSET';
                    break;
                case 'INVESTMENT_RECEIVED': // Capital Cr, Bank Dr
                    bankDr = amt;
                    partyCr = amt;
                    ledgerType = 'CAPITAL';
                    break;
                case 'INVESTMENT_MADE': // Asset Dr, Bank Cr
                    partyDr = amt;
                    bankCr = amt;
                    ledgerType = 'ASSET';
                    break;
                case 'BORROWING': // Liability Cr, Bank Dr
                    bankDr = amt;
                    partyCr = amt;
                    ledgerType = 'LIABILITY';
                    break;
                case 'REPAYMENT':
                    // Split Repayment Logic
                    const principal = principalAmount ? parseFloat(principalAmount) : amt;
                    const interest = interestAmount ? parseFloat(interestAmount) : 0;

                    if (Math.abs((principal + interest) - amt) > 0.01) {
                        throw createError('Principal + Interest does not match Total Amount', 400);
                    }

                    bankCr = amt;
                    partyDr = principal;
                    ledgerType = 'LIABILITY';
                    break;
                default:
                    throw createError('Invalid Transaction Type', 400);
            }

            // 4. Update Bank Balance ATOMICALLY
            if (accountId) {
                const balanceChange = bankDr - bankCr;
                if (balanceChange !== 0) {
                    await tx.update(bankCashAccounts)
                        .set({
                            balance: sql`${bankCashAccounts.balance} + ${balanceChange}`, // Atomic Update
                            updatedAt: new Date()
                        })
                        .where(eq(bankCashAccounts.id, accountId));
                }
            }

            // 5. Create Ledger Entries (Audit Trail)

            // A. Bank/Cash Side
            if (accountId) {
                await tx.insert(financialTransactionLedger).values({
                    transactionId: newTx.id,
                    ledgerAccountId: accountId,
                    ledgerType: 'BANK',
                    debit: String(bankDr),
                    credit: String(bankCr),
                    transactionDate: new Date(transactionDate)
                });
            }

            // B. Party Side (Principal Component)
            if (partyId && (partyDr > 0 || partyCr > 0)) {
                await tx.insert(financialTransactionLedger).values({
                    transactionId: newTx.id,
                    ledgerAccountId: partyId,
                    ledgerType: ledgerType,
                    debit: String(partyDr),
                    credit: String(partyCr),
                    transactionDate: new Date(transactionDate)
                });
            }

            // C. Interest Expense Side
            if (transactionType === 'REPAYMENT' && interestAmount && parseFloat(interestAmount) > 0) {
                const interest = parseFloat(interestAmount);
                await tx.insert(financialTransactionLedger).values({
                    transactionId: newTx.id,
                    ledgerAccountId: 'EXPENSE-INTEREST',
                    ledgerType: 'EXPENSE',
                    debit: String(interest),
                    credit: '0',
                    transactionDate: new Date(transactionDate)
                });
            }

            // 6. Post to General Ledger
            const voucherNo = `FIN-${Date.now().toString().slice(-6)}`;

            // Bank Leg
            if (accountId) {
                await tx.insert(generalLedger).values({
                    transactionDate: new Date(transactionDate),
                    voucherNumber: voucherNo,
                    voucherType: 'PAYMENT',
                    ledgerId: accountId,
                    ledgerType: 'BANK',
                    debitAmount: String(bankDr),
                    creditAmount: String(bankCr),
                    description: `${transactionType} - ${remarks || ''}`,
                    referenceId: newTx.id
                });
            }

            // Party Leg
            if (partyId) {
                await tx.insert(generalLedger).values({
                    transactionDate: new Date(transactionDate),
                    voucherNumber: voucherNo,
                    voucherType: 'JOURNAL',
                    ledgerId: partyId,
                    ledgerType: ledgerType,
                    debitAmount: String(partyDr),
                    creditAmount: String(partyCr),
                    description: `${transactionType} - ${remarks || ''}`,
                    referenceId: newTx.id
                });
            }

            res.json(successResponse(newTx));
        });

    } catch (error) {
        next(error);
    }
});


/**
 * PUT /finance/transactions/:id
 * Update a Financial Transaction
 * CRITICAL: Reverts old balance/ledger and applies new one.
 */
router.put('/transactions/:id', validateRequest(createTransactionSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const {
            transactionType,
            partyId,
            amount,
            paymentMode,
            accountId,
            transactionDate,
            reference,
            remarks,
            interestRate,
            tenure,
            dueDate,
            repaymentType,
            principalAmount,
            interestAmount
        } = req.body;

        const newAmt = parseFloat(amount);
        if (newAmt <= 0) throw createError('Invalid amount', 400);

        const updatedTx = await db.transaction(async (tx) => {
            // 1. Fetch Existing Transaction
            const [oldTx] = await tx.select().from(financialTransactions).where(eq(financialTransactions.id, id));
            if (!oldTx) throw createError('Transaction not found', 404);

            // 2. Revert Old Bank Balance (if applicable)
            if (oldTx.accountId) {
                let reverseAmount = 0;
                const oldAmt = parseFloat(oldTx.amount);

                switch (oldTx.transactionType) {
                    case 'LOAN_TAKEN': // Original: Dr Bank (Increase). Revert: Decrease (-).
                    case 'INVESTMENT_RECEIVED':
                    case 'BORROWING':
                        reverseAmount = -oldAmt;
                        break;
                    case 'LOAN_GIVEN': // Original: Cr Bank (Decrease). Revert: Increase (+).
                    case 'INVESTMENT_MADE':
                    case 'REPAYMENT':
                        reverseAmount = oldAmt;
                        break;
                }

                if (reverseAmount !== 0) {
                    await tx.update(bankCashAccounts)
                        .set({
                            balance: sql`${bankCashAccounts.balance} + ${reverseAmount}`,
                            updatedAt: new Date()
                        })
                        .where(eq(bankCashAccounts.id, oldTx.accountId));
                }
            }

            // 3. Update Transaction Record
            const [updated] = await tx.update(financialTransactions)
                .set({
                    transactionType,
                    partyId,
                    amount: String(newAmt),
                    paymentMode,
                    accountId,
                    transactionDate: new Date(transactionDate),
                    reference,
                    remarks,
                    interestRate: interestRate ? String(interestRate) : null,
                    tenure: tenure ? String(tenure) : null,
                    dueDate: dueDate ? new Date(dueDate) : null,
                    repaymentType,
                    principalAmount: principalAmount ? String(principalAmount) : null,
                    interestAmount: interestAmount ? String(interestAmount) : null,
                    updatedAt: new Date()
                })
                .where(eq(financialTransactions.id, id))
                .returning();

            // 4. Ledger Calculations for NEW values
            let bankDr = 0;
            let bankCr = 0;
            let partyDr = 0;
            let partyCr = 0;
            let ledgerType = '';

            switch (transactionType) {
                case 'LOAN_TAKEN':
                    bankDr = newAmt;
                    partyCr = newAmt;
                    ledgerType = 'LIABILITY';
                    break;
                case 'LOAN_GIVEN':
                    partyDr = newAmt;
                    bankCr = newAmt;
                    ledgerType = 'ASSET';
                    break;
                case 'INVESTMENT_RECEIVED':
                    bankDr = newAmt;
                    partyCr = newAmt;
                    ledgerType = 'CAPITAL';
                    break;
                case 'INVESTMENT_MADE':
                    partyDr = newAmt;
                    bankCr = newAmt;
                    ledgerType = 'ASSET';
                    break;
                case 'BORROWING':
                    bankDr = newAmt;
                    partyCr = newAmt;
                    ledgerType = 'LIABILITY';
                    break;
                case 'REPAYMENT':
                    const principal = principalAmount ? parseFloat(principalAmount) : newAmt;
                    const interest = interestAmount ? parseFloat(interestAmount) : 0;
                    if (Math.abs((principal + interest) - newAmt) > 0.01) {
                        throw createError('Principal + Interest does not match Total Amount', 400);
                    }
                    bankCr = newAmt;
                    partyDr = principal;
                    ledgerType = 'LIABILITY';
                    break;
                default:
                    throw createError('Invalid Transaction Type', 400);
            }

            // 5. Apply New Bank Balance
            if (accountId) {
                const balanceChange = bankDr - bankCr;
                if (balanceChange !== 0) {
                    await tx.update(bankCashAccounts)
                        .set({
                            balance: sql`${bankCashAccounts.balance} + ${balanceChange}`,
                            updatedAt: new Date()
                        })
                        .where(eq(bankCashAccounts.id, accountId));
                }
            }

            // 6. UPDATE Ledger Entries (In-Place to preserve IDs)
            // Strategy: Verify consistency. If complex, delete/recreate might be safer, but user requested Update.
            // We will update entries based on type.

            // A. Bank Leg
            if (accountId) {
                // Check if existing bank ledger entry exists
                const existingBankLedger = await tx.select().from(financialTransactionLedger)
                    .where(and(
                        eq(financialTransactionLedger.transactionId, id),
                        eq(financialTransactionLedger.ledgerType, 'BANK')
                    ));

                if (existingBankLedger.length > 0) {
                    await tx.update(financialTransactionLedger)
                        .set({
                            ledgerAccountId: accountId,
                            debit: String(bankDr),
                            credit: String(bankCr),
                            transactionDate: new Date(transactionDate)
                        })
                        .where(eq(financialTransactionLedger.id, existingBankLedger[0].id));
                } else {
                    // Insert if missing (e.g. was Cash before, now Bank?)
                    await tx.insert(financialTransactionLedger).values({
                        transactionId: id,
                        ledgerAccountId: accountId,
                        ledgerType: 'BANK',
                        debit: String(bankDr),
                        credit: String(bankCr),
                        transactionDate: new Date(transactionDate)
                    });
                }
            }

            // B. Party Leg
            if (partyId) {
                const existingPartyLedger = await tx.select().from(financialTransactionLedger)
                    .where(and(
                        eq(financialTransactionLedger.transactionId, id),
                        ne(financialTransactionLedger.ledgerType, 'BANK'),
                        ne(financialTransactionLedger.ledgerType, 'EXPENSE') // Exclude interest leg
                    ));

                if (existingPartyLedger.length > 0) {
                    await tx.update(financialTransactionLedger)
                        .set({
                            ledgerAccountId: partyId,
                            ledgerType: ledgerType,
                            debit: String(partyDr),
                            credit: String(partyCr),
                            transactionDate: new Date(transactionDate)
                        })
                        .where(eq(financialTransactionLedger.id, existingPartyLedger[0].id));
                } else {
                    await tx.insert(financialTransactionLedger).values({
                        transactionId: id,
                        ledgerAccountId: partyId,
                        ledgerType: ledgerType,
                        debit: String(partyDr),
                        credit: String(partyCr),
                        transactionDate: new Date(transactionDate)
                    });
                }
            }

            // C. General Ledger Update
            // Delete and Recreate GL entries is often safer for GL specifically due to voucher numbering/structure,
            // or we can update. User asked to "update".
            // Let's update the BANK and JOURNAL entries.

            // Update GL - Bank Leg
            if (accountId) {
                await tx.update(generalLedger)
                    .set({
                        transactionDate: new Date(transactionDate),
                        ledgerId: accountId,
                        debitAmount: String(bankDr),
                        creditAmount: String(bankCr),
                        description: `${transactionType} - ${remarks || ''} (Edited)`
                    })
                    .where(and(
                        eq(generalLedger.referenceId, id),
                        eq(generalLedger.ledgerType, 'BANK')
                    ));
            }

            // Update GL - Party Leg
            if (partyId) {
                await tx.update(generalLedger)
                    .set({
                        transactionDate: new Date(transactionDate),
                        ledgerId: partyId,
                        debitAmount: String(partyDr),
                        creditAmount: String(partyCr),
                        description: `${transactionType} - ${remarks || ''} (Edited)`
                    })
                    .where(and(
                        eq(generalLedger.referenceId, id),
                        ne(generalLedger.ledgerType, 'BANK')
                    ));
            }

            return updated;
        });

        // Invalidate caches
        cacheService.del('masters:accounts');

        res.json(successResponse(updatedTx));
    } catch (error) {
        next(error);
    }
});
/**
 * DELETE /finance/transactions/:id
 * Delete a financial transaction and revert its effects
 */
router.delete('/transactions/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;

        await db.transaction(async (tx) => {
            // 1. Get Transaction
            const [transaction] = await tx.select().from(financialTransactions).where(eq(financialTransactions.id, id));
            if (!transaction) throw createError('Transaction not found', 404);

            // 2. Revert Bank Balance
            if (transaction.accountId) {
                // Determine direction based on transaction type
                let reverseAmount = 0;
                const amount = parseFloat(transaction.amount);

                switch (transaction.transactionType) {
                    case 'LOAN_TAKEN': // Original: Dr Bank (Increase). Revert: Decrease.
                        reverseAmount = -amount;
                        break;
                    case 'LOAN_GIVEN': // Original: Cr Bank (Decrease). Revert: Increase.
                        reverseAmount = amount;
                        break;
                    case 'INVESTMENT_RECEIVED': // Original: Dr Bank (Increase). Revert: Decrease.
                        reverseAmount = -amount;
                        break;
                    case 'INVESTMENT_MADE': // Original: Cr Bank (Decrease). Revert: Increase.
                        reverseAmount = amount;
                        break;
                    case 'BORROWING': // Original: Dr Bank (Increase). Revert: Decrease.
                        reverseAmount = -amount;
                        break;
                    case 'REPAYMENT': // Original: Cr Bank (Decrease). Revert: Increase.
                        reverseAmount = amount;
                        break;
                }

                if (reverseAmount !== 0) {
                    await tx.update(bankCashAccounts)
                        .set({
                            balance: sql`${bankCashAccounts.balance} + ${reverseAmount}`,
                            updatedAt: new Date()
                        })
                        .where(eq(bankCashAccounts.id, transaction.accountId));
                }
            }

            // 3. Delete Ledger Entries (Cascade usually handles this, but manual for safety)
            await tx.delete(financialTransactionLedger).where(eq(financialTransactionLedger.transactionId, id));
            await tx.delete(generalLedger).where(eq(generalLedger.referenceId, id));

            // 4. Delete Transaction
            await tx.delete(financialTransactions).where(eq(financialTransactions.id, id));
        });

        res.json(successResponse({ message: 'Transaction deleted successfully' }));
    } catch (error) {
        next(error);
    }
});

export default router;


// ============================================================
// DATA CONSISTENCY TOOLS
// ============================================================

/**
 * POST /finance/recalculate-ledgers
 * Admin tool to fix 'Ghost Debt'
 * Recalculates Customer and Supplier Outstanding from Invoices/Bills
 */
router.post('/recalculate-ledgers', async (req: Request, res: Response, next: NextFunction) => {
    try {
        console.log('🔄 Starting Ledger Recalculation...');
        const results = {
            customersUpdated: 0,
            suppliersUpdated: 0
        };

        await db.transaction(async (tx) => {
            // 1. Reset all Customers to 0
            // await tx.update(customers).set({ outstanding: '0' }); // Optional: safer to just overwrite

            // 2. Recalculate Customer Outstanding
            // Sum of (GrandTotal - PaidAmount) for all Confirmed/Overdue invoices
            // Note: We use balanceAmount which should be accurate, but let's recalculate from scratch if possible?
            // Trusting balanceAmount for now as it's transactional.
            // If balanceAmount is also wrong, we'd need to sum invoice items and payments.
            // Assuming invoice.balanceAmount is correct but customer.outstanding is wrong.

            const customerBalances = await tx
                .select({
                    customerId: invoices.customerId,
                    totalOutstanding: sql<string>`SUM(CAST(${invoices.balanceAmount} AS DECIMAL))`
                })
                .from(invoices)
                .where(
                    sql`${invoices.status} = 'Confirmed' AND ${invoices.customerId} IS NOT NULL`
                )
                .groupBy(invoices.customerId);

            // Update Customers
            // First set all to 0 to clear ghosts
            await tx.update(customers).set({ outstanding: '0' });

            for (const balance of customerBalances) {
                if (balance.customerId && balance.totalOutstanding) {
                    await tx.update(customers)
                        .set({ outstanding: String(balance.totalOutstanding) })
                        .where(eq(customers.id, balance.customerId));
                    results.customersUpdated++;
                }
            }

            // 3. Recalculate Supplier Outstanding
            const supplierBalances = await tx
                .select({
                    supplierId: purchaseBills.supplierId,
                    totalOutstanding: sql<string>`SUM(CAST(${purchaseBills.balanceAmount} AS DECIMAL))`
                })
                .from(purchaseBills)
                .where(
                    sql`${purchaseBills.status} = 'Confirmed'`
                )
                .groupBy(purchaseBills.supplierId);

            // Reset Suppliers
            await tx.update(suppliers).set({ outstanding: '0' });

            for (const balance of supplierBalances) {
                if (balance.supplierId && balance.totalOutstanding) {
                    await tx.update(suppliers)
                        .set({ outstanding: String(balance.totalOutstanding) })
                        .where(eq(suppliers.id, balance.supplierId));
                    results.suppliersUpdated++;
                }
            }
        });

        // 4. Clear Cache
        cacheService.del('masters:customers');
        cacheService.del('masters:suppliers');
        cacheService.del('dashboard:kpis');

        console.log('✅ Ledger Recalculation Complete', results);
        res.json(successResponse({ message: 'Ledgers recalculated successfully', results }));

    } catch (error) {
        next(error);
    }
});
