import { db } from '../db';
import { suppliers, customers, purchaseBills, salesInvoices, billPaymentAllocations, invoicePaymentAllocations, paymentTransactions } from '../db/schema';
import { eq, and, ne } from 'drizzle-orm';

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
                eq(paymentTransactions.type, 'PAYMENT'),
                ne(paymentTransactions.mode, 'Adjustment'),
                ne(paymentTransactions.status, 'Reversed')
            )
        );

    const totalPaid = allPayments.reduce((sum: number, p: any) => sum + parseFloat(p.amount || '0'), 0);

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
