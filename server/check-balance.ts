import 'dotenv/config';
import { db } from './src/db';
import { customers, invoices } from './src/db/schema';
import { eq, sql } from 'drizzle-orm';

async function checkBalance() {
    try {
        console.log("Searching for VARDAN POLYMERS...");
        const customerList = await db.select().from(customers);
        const vardan = customerList.find(c => c.name.includes('VARDAN'));

        if (!vardan) {
            console.log("Customer not found!");
            return;
        }

        console.log(`Customer Found: ${vardan.name} (ID: ${vardan.id})`);
        console.log(`Current 'outstanding' in DB Table: ${vardan.outstanding}`);

        console.log("\n--- Checking Invoices ---");
        const customerInvoices = await db.select().from(invoices).where(eq(invoices.customerId, vardan.id));

        let calculatedOutstanding = 0;
        customerInvoices.forEach(inv => {
            console.log(`Invoice: ${inv.invoiceNumber} | Date: ${inv.invoiceDate} | Status: ${inv.status} | Payment: ${inv.paymentStatus} | GrandTotal: ${inv.grandTotal} | Paid: ${inv.paidAmount} | Balance: ${inv.balanceAmount}`);
            if (inv.status === 'Confirmed') {
                calculatedOutstanding += parseFloat(inv.balanceAmount || '0');
            }
        });

        console.log(`\nCalculated Sum of Invoice Balances: ${calculatedOutstanding}`);

        if (Math.abs(calculatedOutstanding - parseFloat(vardan.outstanding || '0')) > 1) {
            console.log("❌ MISMATCH DETECTED!");
        } else {
            console.log("✅ Data is Consistent (DB Table Matches Invoice Sum)");
        }

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

checkBalance();
