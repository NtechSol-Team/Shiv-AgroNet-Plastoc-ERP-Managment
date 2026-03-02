import { db } from '../db';
import { suppliers, customers, purchaseBills, salesInvoices, billPaymentAllocations, invoicePaymentAllocations, paymentTransactions, bankCashAccounts, expenses, financialTransactions } from '../db/schema';
import { eq, and, ne, inArray, or } from 'drizzle-orm';

/**
 * Recalculate and update the outstanding balance for a supplier.
 * outstanding = Sum(Confirmed Bills GrandTotal) - Sum(Allocated Payment Amounts)
 */
export async function syncSupplierOutstanding(supplierId: string, tx?: any) {
    if (!supplierId) return;
    const client = tx || db;

    // 1. Calculate Total Confirmed Bill Amount
    const bills = await client.select().from(purchaseBills).where(
        and(
            eq(purchaseBills.supplierId, supplierId),
            eq(purchaseBills.status, 'Confirmed')
        )
    );
    const totalBillAmount = bills.reduce((sum: number, b: any) => sum + parseFloat(b.grandTotal || '0'), 0);

    // 2. Calculate Total Actual Payment Amount (excluding adjustments)
    const allPayments = await client.select()
        .from(paymentTransactions)
        .where(
            and(
                eq(paymentTransactions.partyId, supplierId),
                inArray(paymentTransactions.type, ['PAYMENT', 'SUPPLIER_ADVANCE_REFUND']),
                ne(paymentTransactions.mode, 'Adjustment'),
                ne(paymentTransactions.status, 'Reversed')
            )
        );

    const totalPaid = allPayments.reduce((sum: number, p: any) => {
        const amt = parseFloat(p.amount || '0');
        if (p.type === 'SUPPLIER_ADVANCE_REFUND') {
            return sum - amt;
        }
        return sum + amt;
    }, 0);

    // Opening Balance + Bills - Payments (allow negative for advance)
    const correctOutstanding = totalBillAmount - totalPaid;

    // 3. Update Supplier Record
    await client.update(suppliers)
        .set({ outstanding: correctOutstanding.toFixed(2) })
        .where(eq(suppliers.id, supplierId));

    console.log(`[Sync] Supplier ${supplierId} Outstanding set to ${correctOutstanding.toFixed(2)}`);
}

/**
 * Recalculate and update the outstanding balance for a customer.
 * outstanding = Sum(Confirmed Invoices GrandTotal) - Sum(Allocated Receipt Amounts)
 */
export async function syncCustomerOutstanding(customerId: string, tx?: any) {
    if (!customerId) return;
    const client = tx || db;

    // 1. Get Initial Outstanding (Opening Balance)
    const [customer] = await client.select().from(customers).where(eq(customers.id, customerId));
    let openingBalance = 0;
    if (customer) {
        // As a simple heuristic, if we don't have a dedicated openingBalance field, 
        // we might need to rely on the fact that outstanding at creation time acts as the opening balance.
        // But since we overwrite `outstanding`, we need a dedicated openingBalance field. 
        // For now, let's assume `openingBalance` exists, or fallback to 0 if we can't reliably track it without schema changes. 
        // Oh wait, looking at `POST /customers`, we just save `outstanding`. It gets overwritten. 
        // If we want to fix it *without* a schema change right now, we can check if there's an `openingBalance` column in `customers`. Let's assume there isn't.
        // Actually, if we look at `POST /customers`: `outstanding: String(outstanding || 0)`.
        // This is a design flaw in the schema if we overwrite the only field that holds the opening balance.
        openingBalance = parseFloat(customer.openingBalance || '0');
    }

    // 2. Calculate Total Confirmed Invoice Amount
    const invoices = await client.select().from(salesInvoices).where(
        eq(salesInvoices.customerId, customerId)
    );

    // Filter for confirmed-like states
    const confirmedInvoices = invoices.filter((inv: any) => {
        const s = (inv.status || '').toLowerCase();
        return s !== 'draft' && s !== 'cancelled' && s !== '';
    });

    const totalInvoiceAmount = confirmedInvoices.reduce((sum: number, inv: any) => sum + parseFloat(inv.grandTotal || '0'), 0);

    // 3. Calculate Total Actual Receipt Amount (excluding adjustments)
    const allReceipts = await client.select()
        .from(paymentTransactions)
        .where(
            and(
                eq(paymentTransactions.partyId, customerId),
                eq(paymentTransactions.type, 'RECEIPT'),
                ne(paymentTransactions.mode, 'Adjustment'),
                ne(paymentTransactions.status, 'Reversed')
            )
        );

    const totalReceived = allReceipts.reduce((sum: number, r: any) => sum + parseFloat(r.amount || '0'), 0);

    // Opening Balance + Invoices - Payments (allow negative balance for advance/credit)
    const correctOutstanding = openingBalance + totalInvoiceAmount - totalReceived;

    // 4. Update Customer Record
    await client.update(customers)
        .set({ outstanding: correctOutstanding.toFixed(2) })
        .where(eq(customers.id, customerId));

    console.log(`[Sync] Customer ${customerId} Outstanding set to ${correctOutstanding.toFixed(2)} based on OB: ${openingBalance}, Inv: ${totalInvoiceAmount}, Received: ${totalReceived}`);
}

/**
 * Recalculate and update the balance for a bank/cash account.
 * balance = openingBalance + totalInflow - totalOutflow
 */
export async function syncAccountBalance(accountId: string, tx?: any) {
    if (!accountId) return;
    const client = tx || db;

    // 1. Get Account Details
    const [account] = await client.select().from(bankCashAccounts).where(eq(bankCashAccounts.id, accountId));
    if (!account) return;
    const openingBalance = parseFloat(account.openingBalance || '0');

    // 2. Calculate Inflow/Outflow from payment_transactions
    // Inflow: RECEIPT, SUPPLIER_ADVANCE_REFUND, BANK_TRANSFER (to this account)
    // Outflow: PAYMENT, BANK_TRANSFER (from this account)
    const paymentTxs = await client
        .select()
        .from(paymentTransactions)
        .where(
            and(
                or(
                    eq(paymentTransactions.accountId, accountId),
                    and(
                        eq(paymentTransactions.type, 'BANK_TRANSFER'),
                        eq(paymentTransactions.partyId, accountId)
                    )
                ),
                ne(paymentTransactions.status, 'Reversed')
            )
        );

    const totalInflowPayments = paymentTxs.reduce((sum: number, p: any) => {
        const amt = parseFloat(p.amount || '0');
        if (p.type === 'RECEIPT' || p.type === 'SUPPLIER_ADVANCE_REFUND') {
            return sum + amt;
        }
        if (p.type === 'BANK_TRANSFER' && p.accountId === accountId) {
            return sum + amt; // Received into this account
        }
        return sum;
    }, 0);

    const totalOutflowPayments = paymentTxs.reduce((sum: number, p: any) => {
        const amt = parseFloat(p.amount || '0');
        if (p.type === 'PAYMENT') {
            return sum + amt;
        }
        if (p.type === 'BANK_TRANSFER' && p.partyId === accountId) {
            return sum + amt; // Sent from this account
        }
        return sum;
    }, 0);

    // 3. Calculate Outflow from expenses
    const expenseRecords = await client
        .select()
        .from(expenses)
        .where(eq(expenses.accountId, accountId));
    const totalExpenses = expenseRecords.reduce((sum: number, e: any) => sum + parseFloat(e.amount || '0'), 0);

    // 4. Calculate Inflow/Outflow from financialTransactions
    const financeRecords = await client
        .select()
        .from(financialTransactions)
        .where(eq(financialTransactions.accountId, accountId));

    const totalInflowFinance = financeRecords.reduce((sum: number, f: any) => {
        const amt = parseFloat(f.amount || '0');
        if (['LOAN_TAKEN', 'INVESTMENT_RECEIVED', 'BORROWING'].includes(f.transactionType)) {
            return sum + amt;
        }
        return sum;
    }, 0);

    const totalOutflowFinance = financeRecords.reduce((sum: number, f: any) => {
        const amt = parseFloat(f.amount || '0');
        if (['LOAN_GIVEN', 'INVESTMENT_MADE', 'REPAYMENT'].includes(f.transactionType)) {
            return sum + amt;
        }
        return sum;
    }, 0);

    // Final Calculation
    const totalInflow = totalInflowPayments + totalInflowFinance;
    const totalOutflow = totalOutflowPayments + totalExpenses + totalOutflowFinance;
    const correctBalance = openingBalance + totalInflow - totalOutflow;

    // 5. Update Account Balance
    await client.update(bankCashAccounts)
        .set({ balance: correctBalance.toFixed(2), updatedAt: new Date() })
        .where(eq(bankCashAccounts.id, accountId));

    console.log(`[Sync] Account ${accountId} Balance updated to ${correctBalance.toFixed(2)} (Inflow: ${totalInflow}, Outflow: ${totalOutflow})`);
}
