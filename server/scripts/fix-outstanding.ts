/**
 * One-time script: Recalculates and fixes outstanding for all customers.
 * Fixes stale outstanding where invoice was deleted but balance wasn't cleared.
 * Run: cd server && npx tsx scripts/fix-outstanding.ts
 */
import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import * as schema from '../src/db/schema';
import ws from 'ws';
import { eq } from 'drizzle-orm';

neonConfig.webSocketConstructor = ws;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });

const { customers, salesInvoices, invoicePaymentAllocations } = schema;

async function fixAllOutstanding() {
    console.log('🔧 Recalculating outstanding for all customers...');

    const allCustomers = await db.select().from(customers);

    for (const customer of allCustomers) {
        const customerInvoices = await db.select().from(salesInvoices)
            .where(eq(salesInvoices.customerId, customer.id));

        const confirmedInvoices = customerInvoices.filter(inv => {
            const s = (inv.status || '').toLowerCase();
            return s !== 'draft' && s !== 'cancelled' && s !== '';
        });

        const totalInvoiceAmount = confirmedInvoices.reduce(
            (sum, inv) => sum + parseFloat(inv.grandTotal || '0'), 0
        );

        const allocations = await db.select()
            .from(invoicePaymentAllocations)
            .innerJoin(salesInvoices, eq(invoicePaymentAllocations.invoiceId, salesInvoices.id))
            .where(eq(salesInvoices.customerId, customer.id));

        const totalAllocated = allocations.reduce(
            (sum, a) => sum + parseFloat((a.invoice_payment_allocations as any).amount || '0'), 0
        );

        const correctOutstanding = Math.max(0, totalInvoiceAmount - totalAllocated);
        const previousOutstanding = parseFloat(customer.outstanding || '0');

        if (Math.abs(correctOutstanding - previousOutstanding) > 0.01) {
            await db.update(customers)
                .set({ outstanding: correctOutstanding.toFixed(2) })
                .where(eq(customers.id, customer.id));
            console.log(`  ✅ ${customer.name}: ₹${previousOutstanding} → ₹${correctOutstanding.toFixed(2)}`);
        } else {
            console.log(`  ✓  ${customer.name}: ₹${previousOutstanding} (no change needed)`);
        }
    }

    console.log('\n✅ Done! All customer outstanding balances are now correct.');
    await pool.end();
}

fixAllOutstanding().catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
});
