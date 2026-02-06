import 'dotenv/config';
import { db } from './db';
import { bankCashAccounts, financialEntities } from './db/schema';
import { eq } from 'drizzle-orm';

async function testConcurrency() {
    console.log('Starting Concurrency Test on Bank Balance Updates...');

    // 1. Setup: Get a bank account
    let [account] = await db.select().from(bankCashAccounts).limit(1);

    // Create test account if missing
    if (!account) {
        console.log('Creating test bank account for concurrency test...');
        const [newAccount] = await db.insert(bankCashAccounts).values({
            code: 'BANK-TEST-CONC',
            name: 'Concurrency Test Bank',
            accountNo: 'CONC-999',
            type: 'Bank',
            balance: '1000000',
            createdAt: new Date(),
            updatedAt: new Date()
        }).returning();
        account = newAccount;
    }

    if (!account) {
        console.error('No bank account found and failed to create one.');
        return;
    }

    const accountId = account.id;
    const initialBalance = parseFloat(account.balance || '0');
    console.log(`Initial Balance: ${initialBalance}`);

    // 2. Setup: Get a Party (Lender)
    let [party] = await db.select().from(financialEntities).where(eq(financialEntities.type, 'Lender')).limit(1);

    if (!party) {
        console.log('Creating test lender...');
        const [newParty] = await db.insert(financialEntities).values({
            name: 'Concurrency Lender',
            type: 'Lender',
            email: 'test@lender.com'
        }).returning();
        party = newParty;
    }

    console.log(`Using Lender: ${party.name}`);

    // 3. Simulate concurrent requests
    const concurrentRequests = 5;
    const amountPerRequest = 100;

    console.log(`Launching ${concurrentRequests} concurrent requests of amount ${amountPerRequest}...`);

    const requests = Array(concurrentRequests).fill(0).map(async (_, i) => {
        try {
            const res = await fetch('http://localhost:3001/api/finance/transactions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    transactionDate: new Date().toISOString(),
                    transactionType: 'LOAN_TAKEN', // Increases Bank Balance
                    amount: amountPerRequest,
                    remarks: `Concurrency Test ${i}`,
                    accountId: accountId,
                    partyId: party.id,
                    paymentMode: 'Bank'
                })
            });

            if (!res.ok) {
                const text = await res.text();
                throw new Error(`HTTP ${res.status}: ${text}`);
            }
            return await res.json();
        } catch (e: any) {
            console.error(`Request ${i} failed:`, e.message);
            throw e;
        }
    });

    try {
        await Promise.all(requests);
        console.log('All requests completed.');
    } catch (e) {
        console.error('Error during requests:', e);
    }

    // 4. Verify
    const [updatedAccount] = await db.select().from(bankCashAccounts).where(eq(bankCashAccounts.id, accountId));
    const finalBalance = parseFloat(updatedAccount.balance || '0');
    const expectedBalance = initialBalance + (concurrentRequests * amountPerRequest);

    console.log(`Final Balance: ${finalBalance}`);
    console.log(`Expected Balance: ${expectedBalance}`);

    if (Math.abs(finalBalance - expectedBalance) < 0.01) {
        console.log('SUCCESS: Concurrency handled correctly.');
    } else {
        console.error(`FAILURE: Race condition detected! Expected ${expectedBalance}, got ${finalBalance}`);
    }

    process.exit(0);
}

testConcurrency();
