import { db } from '../db';
import { suppliers, customers, purchaseBills, salesInvoices, billPaymentAllocations, invoicePaymentAllocations } from '../db/schema';
import { eq, and } from 'drizzle-orm';

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

    // 2. Calculate Total Allocated Payment Amount
    const allocations = await client.select()
        .from(billPaymentAllocations)
        .innerJoin(purchaseBills, eq(billPaymentAllocations.billId, purchaseBills.id))
        .where(eq(purchaseBills.supplierId, supplierId));

    const totalAllocated = allocations.reduce((sum: number, a: any) => sum + parseFloat(a.bill_payment_allocations.amount || '0'), 0);

    const correctOutstanding = Math.max(0, totalBillAmount - totalAllocated);

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

    // 1. Calculate Total Confirmed Invoice Amount
    const invoices = await client.select().from(salesInvoices).where(
        eq(salesInvoices.customerId, customerId)
    );

    // Filter for confirmed-like states
    const confirmedInvoices = invoices.filter((inv: any) => {
        const s = (inv.status || '').toLowerCase();
        return s !== 'draft' && s !== 'cancelled' && s !== '';
    });

    const totalInvoiceAmount = confirmedInvoices.reduce((sum: number, inv: any) => sum + parseFloat(inv.grandTotal || '0'), 0);

    // 2. Calculate Total Allocated Receipt Amount
    const allocations = await client.select()
        .from(invoicePaymentAllocations)
        .innerJoin(salesInvoices, eq(invoicePaymentAllocations.invoiceId, salesInvoices.id))
        .where(eq(salesInvoices.customerId, customerId));

    const totalAllocated = allocations.reduce((sum: number, a: any) => sum + parseFloat(a.invoice_payment_allocations.amount || '0'), 0);

    const correctOutstanding = Math.max(0, totalInvoiceAmount - totalAllocated);

    // 3. Update Customer Record
    await client.update(customers)
        .set({ outstanding: correctOutstanding.toFixed(2) })
        .where(eq(customers.id, customerId));

    console.log(`[Sync] Customer ${customerId} Outstanding set to ${correctOutstanding.toFixed(2)}`);
}
