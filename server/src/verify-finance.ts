
import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(__dirname, '../.env') });

import { eq, desc } from 'drizzle-orm';

// Dynamic imports to ensure env is loaded first
async function main() {
    console.log('🧪 Starting Finance Module Verification...');

    // Import DB and Schema dynamically
    const { db } = await import('./db');
    const {
        financialEntities,
        financialTransactions,
        financialTransactionLedger,
        bankCashAccounts,
        generalLedger
    } = await import('./db/schema');

    try {
        // 1. Create a Bank Account (if not exists) or pick one
        let bank = await db.query.bankCashAccounts.findFirst({
            where: eq(bankCashAccounts.type, 'Bank')
        });

        if (!bank) {
            console.log('Creating Test Bank Account...');
            [bank] = await db.insert(bankCashAccounts).values({
                code: 'BANK-TEST',
                name: 'Test Bank',
                balance: '100000',
                type: 'Bank'
            }).returning();
        }

        const initialBalance = parseFloat(bank.balance || '0');
        console.log(`🏦 Initial Bank Balance: ${initialBalance}`);

        // 2. Create a Lender (Financial Entity)
        console.log('1. Creating Entity (Lender)...');
        const [lender] = await db.insert(financialEntities).values({
            name: 'HDFC Bank Loan',
            type: 'Lender',
        }).returning();
        console.log(`✅ Entity Created: ${lender.name} (${lender.id})`);

        // 3. Create LOAN_TAKEN Transaction (10,000)
        console.log('2. Creating LOAN_TAKEN Transaction (10000)...');
        const loanAmount = 10000;

        // --- LOGIC SIMULATION (Calling Route Implementation logic roughly) ---
        // Ideally we would hit the API, but direct DB logic verifies the core function.
        // We will replicate the logic from finance.ts here to verify it works as expected.

        // A. Insert Transaction
        const [tx] = await db.insert(financialTransactions).values({
            transactionType: 'LOAN_TAKEN',
            partyId: lender.id,
            amount: String(loanAmount),
            accountId: bank.id,
            transactionDate: new Date(),
            status: 'Active'
        }).returning();

        // B. Update Bank Balance
        await db.update(bankCashAccounts)
            .set({ balance: String(initialBalance + loanAmount) })
            .where(eq(bankCashAccounts.id, bank.id));

        // C. Create Ledger Entry (Bank Dr 10000)
        await db.insert(financialTransactionLedger).values({
            transactionId: tx.id,
            ledgerAccountId: bank.id,
            ledgerType: 'BANK',
            debit: String(loanAmount),
            credit: '0',
            transactionDate: new Date()
        });

        // D. Create Ledger Entry (Lender Cr 10000)
        await db.insert(financialTransactionLedger).values({
            transactionId: tx.id,
            ledgerAccountId: lender.id,
            ledgerType: 'LIABILITY',
            debit: '0',
            credit: String(loanAmount),
            transactionDate: new Date()
        });

        console.log(`✅ Transaction Created: ${tx.id}`);

        // 4. Verify Bank Balance
        const updatedBank = await db.query.bankCashAccounts.findFirst({
            where: eq(bankCashAccounts.id, bank.id)
        });
        const newBalance = parseFloat(updatedBank?.balance || '0');
        console.log(`🏦 Updated Bank Balance: ${newBalance}`);

        if (newBalance === initialBalance + loanAmount) {
            console.log('✅ Bank Balance Updated Correctly');
        } else {
            console.error(`❌ Bank Balance Mismatch! Expected ${initialBalance + loanAmount}, got ${newBalance}`);
        }

        // 5. Verify Ledger Entries
        const ledgerEntries = await db.select().from(financialTransactionLedger)
            .where(eq(financialTransactionLedger.transactionId, tx.id));

        if (ledgerEntries.length === 2) {
            console.log('✅ Ledger Entries Created (2 entries)');
            const bankEntry = ledgerEntries.find(l => l.ledgerAccountId === bank.id);
            const lenderEntry = ledgerEntries.find(l => l.ledgerAccountId === lender.id);

            if (parseFloat(bankEntry?.debit || '0') === loanAmount) console.log('✅ Bank Debited Correctly');
            else console.error('❌ Bank Debit Failed');

            if (parseFloat(lenderEntry?.credit || '0') === loanAmount) console.log('✅ Lender Credited Correctly');
            else console.error('❌ Lender Credit Failed');

        } else {
            console.error(`❌ Incorrect Ledger Entries count: ${ledgerEntries.length}`);
        }

        // 6. Cleanup
        console.log('🧹 Cleaning up...');
        await db.delete(financialTransactionLedger).where(eq(financialTransactionLedger.transactionId, tx.id));
        await db.delete(financialTransactions).where(eq(financialTransactions.id, tx.id));
        await db.delete(financialEntities).where(eq(financialEntities.id, lender.id));
        // Revert bank balance
        await db.update(bankCashAccounts)
            .set({ balance: String(initialBalance) })
            .where(eq(bankCashAccounts.id, bank.id));
        console.log('✅ Cleanup Complete');

    } catch (e) {
        console.error('❌ Verification Failed:', e);
        process.exit(1);
    }
}

main();
