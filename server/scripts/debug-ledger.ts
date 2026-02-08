
import "dotenv/config";
import { db } from "../src/db";
import { customers, paymentTransactions, invoices } from "../src/db/schema";
import { eq, sql } from "drizzle-orm";

async function main() {
    console.log("🔍 Inspecting Customer Ledgers...");

    const allCustomers = await db.select().from(customers);

    for (const customer of allCustomers) {
        // Get actual sum of Invoices
        const invoiceResult = await db
            .select({ total: sql<string>`COALESCE(SUM(${invoices.grandTotal}), 0)` })
            .from(invoices)
            .where(eq(invoices.customerId, customer.id));

        // Get actual sum of Receipts
        const receiptResult = await db
            .select({ total: sql<string>`COALESCE(SUM(${paymentTransactions.amount}), 0)` })
            .from(paymentTransactions)
            .where(eq(paymentTransactions.partyId, customer.id));

        const totalInvoiced = parseFloat(invoiceResult[0]?.total || '0');
        const totalReceived = parseFloat(receiptResult[0]?.total || '0');
        const calculatedOutstanding = totalInvoiced - totalReceived;
        const currentOutstanding = parseFloat(customer.outstanding || '0');

        if (currentOutstanding !== 0 || calculatedOutstanding !== 0) {
            console.log(`\nCustomer: ${customer.name} (ID: ${customer.id})`);
            console.log(`   Stored Outstanding: ${currentOutstanding}`);
            console.log(`   Calculated:         ${calculatedOutstanding} (Inv: ${totalInvoiced} - Rec: ${totalReceived})`);

            if (currentOutstanding !== calculatedOutstanding) {
                console.log(`   ❌ MISMATCH DETECTED! Difference: ${currentOutstanding - calculatedOutstanding}`);
            } else {
                console.log(`   ✅ Data is Consistent`);
            }
        }
    }
    process.exit(0);
}

main().catch(err => console.error(err));
