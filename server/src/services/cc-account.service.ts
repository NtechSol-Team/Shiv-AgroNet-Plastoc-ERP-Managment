
import { db } from '../db/index';
import {
    ccAccountDetails,
    ccDailyBalances,
    ccInterestLogs,
    bankCashAccounts,
    generalLedger,
    expenseHeads,
    customers,
    rawMaterials,
    finishedProducts,
    purchaseBills,
    purchaseBillItems,
    stockMovements,
    productionBatches
} from '../db/schema';
import { eq, and, sql, desc, lt, gt } from 'drizzle-orm';
import { getAllRawMaterialsWithStock, getAllFinishedProductsWithStock } from './inventory.service';
import { createError } from '../middleware/errorHandler';

// ============================================================
// TYPES
// ============================================================

export interface CCStatus {
    accountId: string;
    outstandingAmount: number;
    sanctionedLimit: number;
    drawingPower: number;
    availableDrawingPower: number; // DP - Outstanding
    availableLimit: number;        // Limit - Outstanding
    stockValue: number;
    receivables: number;
    stockMargin: number;
    receivablesMargin: number;
    isOverdrawn: boolean;
}

// ============================================================
// CORE LOGIC
// ============================================================

/**
 * Calculate Drawing Power (DP) and Current Status for a CC Account
 * DP = (Eligible Stock + Eligible Receivables) - Margins
 */
export async function getCCAccountStatus(accountId: string): Promise<CCStatus> {
    // 1. Get CC Details
    const accountDetails = await db.query.ccAccountDetails.findFirst({
        where: eq(ccAccountDetails.accountId, accountId),
        with: {
            account: true
        }
    });

    if (!accountDetails) {
        throw createError('CC Account Details not found', 404);
    }

    // 2. Get Current Outstanding (Liability)
    // In our system, Bank Balance is stored. For CC (Liability), 
    // a POSITIVE 'balance' in bank_cash_accounts usually means Cash-in-Hand (Asset).
    // But for CC, we treated it as:
    // - Utilization (Cr Account) -> Increases Liability.
    // - Repayment (Dr Account) -> Decreases Liability.
    // 
    // However, existing `bankCashAccounts.balance` logic in `finance.routes` is:
    // Update: `balance + (Dr - Cr)`.
    // If I utilize CC (Payment): Dr Vendor, Cr Bank. Bank Balance reduces.
    // If I start with 0. Pay 100. Balance becomes -100.
    // So "Outstanding" = -1 * Balance (if Balance is negative).
    // Let's verify this interpretation.
    // User requested: "CC balance represents amount utilized, not available cash".
    // "Outstanding Amount" should be Positive.
    // If I use standard logic: 
    // initial = 0.
    // Payment 10k -> Cr Bank. Balance = -10k.
    // So Outstanding = 10k.

    const rawBalance = parseFloat(accountDetails.account.balance || '0');
    const outstandingAmount = rawBalance < 0 ? Math.abs(rawBalance) : 0;
    // Note: If balance is positive, it means we have surplus funds (Asset), so Outstanding Liability is 0.

    // 3. Calculate Stock Value (RM + FG)
    // RM Value
    const rmList = await getAllRawMaterialsWithStock();
    const rmValue = rmList.reduce((sum, item) => sum + (parseFloat(item.stock) * parseFloat(item.averagePrice)), 0);

    // FG Value (Using Rate Per Kg)
    const fgList = await getAllFinishedProductsWithStock();
    const fgValue = fgList.reduce((sum, item) => sum + (parseFloat(item.stock) * parseFloat(item.ratePerKg || '0')), 0);

    const totalStockValue = rmValue + fgValue;

    // 4. Calculate Receivables (Total Customer Outstanding)
    // We assume all 'outstanding' is eligible for now. 
    // Real-world would filter by age (e.g. < 90 days), but strictly per requirements: "Pull receivables from accounts receivable"
    const [receivablesResult] = await db
        .select({
            total: sql<string>`COALESCE(SUM(${customers.outstanding}), 0)`
        })
        .from(customers);

    const totalReceivables = parseFloat(receivablesResult?.total || '0');

    // 5. Apply Margins
    const stockMargin = parseFloat(accountDetails.stockMargin || '0');
    const receivablesMargin = parseFloat(accountDetails.receivablesMargin || '0');

    const eligibleStock = totalStockValue * (1 - (stockMargin / 100));
    const eligibleReceivables = totalReceivables * (1 - (receivablesMargin / 100));

    // 6. Calculate DP
    let drawingPower = 0;
    if (accountDetails.drawingPowerMode === 'Manual') {
        // We need a field for Manual DP? 
        // The schema doesn't have a 'manualDrawingPower' field, relying on 'drawingPowerMode'.
        // Wait, if mode is manual, where do we get the value?
        // Maybe we just don't limit by Stock/Receivables, but purely Sanctioned Limit?
        // Or we should have added a field. 
        // Logic: If Manual, DP = Sanctioned Limit (effectively).
        drawingPower = parseFloat(accountDetails.sanctionedLimit);
    } else {
        drawingPower = eligibleStock + eligibleReceivables;
    }

    // DP cannot exceed Sanctioned Limit
    // "Outstanding can never exceed Drawing Power or Sanctioned Limit"
    // So Effective Limit = Min(Sanctioned, DP)
    const sanctionedLimit = parseFloat(accountDetails.sanctionedLimit);
    const effectiveLimit = Math.min(sanctionedLimit, drawingPower);

    return {
        accountId,
        outstandingAmount,
        sanctionedLimit,
        drawingPower: effectiveLimit, // The effective limit is the DP in banking terms often
        availableDrawingPower: Math.max(0, effectiveLimit - outstandingAmount),
        availableLimit: Math.max(0, sanctionedLimit - outstandingAmount),
        stockValue: totalStockValue,
        receivables: totalReceivables,
        stockMargin,
        receivablesMargin,
        isOverdrawn: outstandingAmount > effectiveLimit
    };
}

/**
 * Validate if a Transaction is allowed for a CC Account
 * @param accountId 
 * @param amount - Amount to be debited (Utilization)
 */
export async function validateCCTransaction(accountId: string, amount: number) {
    const status = await getCCAccountStatus(accountId);

    // FIX 5: Validate: newOutstandingAmount <= min(Sanctioned Limit, Drawing Power)
    const newOutstanding = status.outstandingAmount + amount;
    const limit = Math.min(status.sanctionedLimit, status.drawingPower);

    if (newOutstanding > limit) {
        return {
            allowed: false,
            message: `CC Utilization (${newOutstanding.toFixed(2)}) exceeds Drawing Power (${status.drawingPower.toFixed(2)}) or Limit (${status.sanctionedLimit.toFixed(2)})`
        };
    }

    return { allowed: true };
}

/**
 * Capture Daily Balance Snapshot (End of Day Process)
 * Should be called by a cron job or scheduled task
 */
export async function captureDailyCCBalance(accountId: string) {
    const status = await getCCAccountStatus(accountId);
    const now = new Date();

    // FIX 3: If outstandingAmount = 0, DO NOT create entry
    if (status.outstandingAmount <= 0) {
        return;
    }

    // Calculate Interest
    const details = await db.query.ccAccountDetails.findFirst({
        where: eq(ccAccountDetails.accountId, accountId)
    });

    if (!details) return;

    const rate = parseFloat(details.interestRate);
    // Formula: (Outstanding * Rate) / 36500 (Rate is %, so /100, then /365)
    // Wait, Rate is % p.a.
    // Interest = (Principal * Rate * Days) / (100 * 365)
    // Daily Interest = (Outstanding * Rate * 1) / 36500
    const interest = (status.outstandingAmount * rate) / 36500;

    await db.insert(ccDailyBalances).values({
        accountId,
        date: now,
        outstandingAmount: String(status.outstandingAmount),
        drawingPower: String(status.drawingPower),
        interestAccrued: String(interest)
    });
}

/**
 * Post Monthly Interest to Ledger
 * @param accountId 
 * @param monthDate - First day of the month to post for
 */
export async function postMonthlyInterest(accountId: string, monthDate: Date) {
    // AUTOMATED INTEREST POSTING DISABLED
    // User requested manual entry of interest expenses.
    console.log('Automated interest posting is disabled. Use manual expense entry.');
    return { posted: false, message: 'Automated posting disabled' };
}

/**
 * Create a new Cash Credit Account
 */
export async function createCCAccount(data: any) {
    return await db.transaction(async (tx) => {
        // 1. Create Base Bank Account
        const [account] = await tx.insert(bankCashAccounts).values({
            code: data.code, // Generate if needed? The Controller usually handles generation, but let's assume it's passed or generated here.
            name: data.name,
            accountNo: data.accountNo,
            type: 'CC', // Explicitly CC
            balance: '0' // Starts at 0
        }).returning();

        // 2. Create CC Details
        await tx.insert(ccAccountDetails).values({
            accountId: account.id,
            sanctionedLimit: String(data.sanctionedLimit),
            interestRate: String(data.interestRate),
            interestCalculationMethod: data.interestCalculationMethod || 'Daily Outstanding',
            drawingPowerMode: data.drawingPowerMode || 'Automatic',
            stockMargin: String(data.stockMargin || 25),
            receivablesMargin: String(data.receivablesMargin || 40),
            securityType: data.securityType,
            validityPeriod: data.validityPeriod ? new Date(data.validityPeriod) : null
        });

        return account;
    });
}
