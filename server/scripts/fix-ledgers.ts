
import "dotenv/config";
import { db } from "../src/db";
import { customers, suppliers, invoices, purchaseBills, paymentTransactions } from "../src/db/schema";
import { eq, sql, and, ne } from "drizzle-orm";

async function main() {
    console.log("🔄 Starting Ledger Reconciliation...");

    // ============================================================
    // 1. RECALCULATE CUSTOMER OUTSTANDING
    // ============================================================
    console.log("\n👥 Processing Customers...");
    const allCustomers = await db.select().from(customers);

    for (const customer of allCustomers) {
        // Total Invoiced (Confirmed)
        const invoiceResult = await db
            .select({ total: sql<string>`COALESCE(SUM(${invoices.grandTotal}), 0)` })
            .from(invoices)
            .where(and(
                eq(invoices.customerId, customer.id),
                inArray(invoices.status, ['Confirmed', 'Approved'])
            ));

        const totalInvoiced = parseFloat(invoiceResult[0]?.total || '0');

        // Total Received (Receipts - Not Reversed)
        const receiptResult = await db
            .select({ total: sql<string>`COALESCE(SUM(${paymentTransactions.amount}), 0)` })
            .from(paymentTransactions)
            .where(and(
                eq(paymentTransactions.partyId, customer.id),
                eq(paymentTransactions.type, 'RECEIPT'),
                ne(paymentTransactions.status, 'Reversed')
            ));

        const totalReceived = parseFloat(receiptResult[0]?.total || '0');
        const newOutstanding = totalInvoiced - totalReceived;

        if (parseFloat(customer.outstanding || '0') !== newOutstanding) {
            console.log(`   🔸 Updating ${customer.name}: Old ${customer.outstanding} -> New ${newOutstanding.toFixed(2)}`);
            await db.update(customers)
                .set({ outstanding: newOutstanding.toString() })
                .where(eq(customers.id, customer.id));
        } else {
            // console.log(`   ✅ ${customer.name} is correct.`);
        }
    }

    // ============================================================
    // 2. RECALCULATE SUPPLIER OUTSTANDING
    // ============================================================
    console.log("\n🏭 Processing Suppliers...");
    const allSuppliers = await db.select().from(suppliers);

    for (const supplier of allSuppliers) {
        // Total Billed (Confirmed)
        const billResult = await db
            .select({ total: sql<string>`COALESCE(SUM(${purchaseBills.grandTotal}), 0)` })
            .from(purchaseBills)
            .where(and(
                eq(purchaseBills.supplierId, supplier.id),
                eq(purchaseBills.status, 'Confirmed')
            ));

        const totalBilled = parseFloat(billResult[0]?.total || '0');

        // Total Paid (Payments - Not Reversed)
        const paymentResult = await db
            .select({ total: sql<string>`COALESCE(SUM(${paymentTransactions.amount}), 0)` })
            .from(paymentTransactions)
            .where(and(
                eq(paymentTransactions.partyId, supplier.id),
                eq(paymentTransactions.type, 'PAYMENT'),
                ne(paymentTransactions.status, 'Reversed')
            ));

        const totalPaid = parseFloat(paymentResult[0]?.total || '0');
        const newOutstanding = totalBilled - totalPaid;

        if (parseFloat(supplier.outstanding || '0') !== newOutstanding) {
            console.log(`   🔸 Updating ${supplier.name}: Old ${supplier.outstanding} -> New ${newOutstanding.toFixed(2)}`);
            await db.update(suppliers)
                .set({ outstanding: newOutstanding.toString() })
                .where(eq(suppliers.id, supplier.id));
        } else {
            // console.log(`   ✅ ${supplier.name} is correct.`);
        }
    }

    console.log("\n✅ Reconciliation Complete!");
    process.exit(0);
}

// Helper needed because 'inArray' import might be missing in scope if I don't import it
import { inArray } from "drizzle-orm";

main().catch((err) => {
    console.error("❌ Error:", err);
    process.exit(1);
});
