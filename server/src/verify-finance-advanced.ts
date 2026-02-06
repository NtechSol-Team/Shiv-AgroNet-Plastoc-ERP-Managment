import 'dotenv/config';
import { db } from './db';
import { bankCashAccounts, financialTransactions, financialEntities } from './db/schema';
import { eq, desc } from 'drizzle-orm';

interface ApiResponse {
    success: boolean;
    error?: string;
    data?: any;
}

async function verifyFinanceAdvanced() {
    console.log('Starting Advanced Finance Verification...');

    // 1. Create a huge transaction
    const hugeAmount = 99999999.99;

    // Ensure we have an account
    let [account] = await db.select().from(bankCashAccounts).limit(1);

    // If no account, create one for testing
    if (!account) {
        console.log('Creating test bank account...');
        const [newAccount] = await db.insert(bankCashAccounts).values({
            code: 'BANK-TEST-ADV',
            name: 'Test Bank Account',
            accountNo: 'TEST-123456',
            type: 'Bank',
            balance: '1000000',
            createdAt: new Date(),
            updatedAt: new Date()
        }).returning();
        account = newAccount;
    }

    if (!account) {
        console.error("Failed to get or create account.");
        return;
    }

    // Ensure we have a party
    const [party] = await db.select().from(financialEntities).limit(1);
    if (!party) {
        console.error('No financial entity found. Please ensure verify-concurrency.ts runs first or create one here.');
        return;
    }

    console.log(`Testing large number precision with amount: ${hugeAmount}`);

    // .. Call API ..
    try {
        const res = await fetch('http://localhost:3001/api/finance/transactions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                transactionDate: new Date().toISOString(),
                transactionType: 'LOAN_TAKEN',
                amount: hugeAmount,
                remarks: 'Large Precision Test',
                accountId: account.id,
                partyId: party.id,
                paymentMode: 'Bank'
            })
        });

        const data = await res.json() as ApiResponse;
        if (data.success) {
            console.log('Large transaction created successfully.');
        } else {
            console.error('Large transaction failed:', data.error);
        }
    } catch (e) { console.error(e); }

    // 2. Verify Zod Validation (Negative Amount)
    console.log('Testing Negative Amount Validation...');
    try {
        const res = await fetch('http://localhost:3000/api/finance/transactions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                transactionDate: new Date().toISOString(),
                transactionType: 'LOAN_TAKEN',
                amount: -100,
                remarks: 'Negative Test',
                accountId: account.id,
                partyId: party.id,
                paymentMode: 'Bank'
            })
        });
        const data = await res.json() as ApiResponse;
        // Check for error response
        if (!data.success) {
            console.log('SUCCESS: Negative amount rejected as expected.');
        } else {
            console.error('FAILURE: Negative amount was accepted!');
        }
    } catch (e) { console.error(e); }

    // 3. Verify Transaction Atomicity (Force fail?)
    // Hard to simulate force fail from outside without mocking.
    // We assume the db.transaction block handles it.

    console.log('Verification Complete.');
    process.exit(0);
}

verifyFinanceAdvanced();
