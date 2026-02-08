
import { config } from 'dotenv';
import { resolve } from 'path';

// Load env vars from server/.env if running from root
config({ path: resolve(process.cwd(), 'server/.env') });
// Fallback
config();

async function verifyTransactions() {
    try {
        console.log('Verifying GET /transactions logic...');

        // Dynamic imports to ensure env vars are loaded first
        const { db } = await import('../src/db');
        const { paymentTransactions, bankCashAccounts } = await import('../src/db/schema');
        const { eq, desc } = await import('drizzle-orm');

        const { isNotNull } = await import('drizzle-orm');

        // Simulate the query logic matching server/src/routes/accounts.ts
        const payments = await db.select()
            .from(paymentTransactions)
            .leftJoin(bankCashAccounts, eq(paymentTransactions.accountId, bankCashAccounts.id))
            .where(isNotNull(paymentTransactions.accountId))
            .orderBy(desc(paymentTransactions.date))
            .limit(1);

        console.log('Payment Query Result (First Item):', payments[0]);

        if (payments.length > 0) {
            const p = payments[0];
            // Check if joined correctly
            if (p.bank_cash_accounts) {
                console.log('SUCCESS: Bank Account joined correctly:', p.bank_cash_accounts.name);
            } else {
                console.log('WARNING: Transaction found but no associated bank account (might be unlinked or data issue).');
                if (p.payment_transactions) {
                    console.log('Account ID in transaction:', p.payment_transactions.accountId);
                }
            }
        } else {
            console.log('WARNING: No transactions found to verify.');
        }

    } catch (error) {
        console.error('Verification Failed:', error);
    } finally {
        process.exit();
    }
}

verifyTransactions();
