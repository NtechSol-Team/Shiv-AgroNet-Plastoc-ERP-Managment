/**
 * One-time fix: Rename incorrectly prefixed invoice numbers
 *
 * Wrong  : INV/2025-26/001, INV/2025-26/002, INV/2025-26/003
 * Correct: SA/25-26/017,   SA/25-26/018,    SA/25-26/019
 *
 * Tables updated:
 *   - sales_invoices        → invoice_number
 *   - stock_movements       → reference_code  (where reference_type = 'sales')
 *   - payment_transactions  → reference_code  (where reference_type = 'sales')
 *
 * Run: npx ts-node -r tsconfig-paths/register src/scripts/fix-invoice-numbers.ts
 */

import 'dotenv/config';
import { db } from '../db/index';
import { salesInvoices, stockMovements, paymentTransactions } from '../db/schema';
import { eq } from 'drizzle-orm';

const RENAMES: { from: string; to: string }[] = [
  { from: 'INV/2025-26/001', to: 'SA/25-26/017' },
  { from: 'INV/2025-26/002', to: 'SA/25-26/018' },
  { from: 'INV/2025-26/003', to: 'SA/25-26/019' },
];

async function main() {
  console.log('Starting invoice number fix...\n');

  for (const { from, to } of RENAMES) {
    console.log(`Processing: ${from} → ${to}`);

    await db.transaction(async (tx) => {
      // 1. Find the invoice
      const [invoice] = await tx
        .select({ id: salesInvoices.id })
        .from(salesInvoices)
        .where(eq(salesInvoices.invoiceNumber, from));

      if (!invoice) {
        console.log(`  ⚠️  Invoice "${from}" not found — skipping.`);
        return;
      }

      const invoiceId = invoice.id;
      console.log(`  Found invoice id: ${invoiceId}`);

      // 2. Rename in sales_invoices
      await tx
        .update(salesInvoices)
        .set({ invoiceNumber: to, updatedAt: new Date() })
        .where(eq(salesInvoices.id, invoiceId));
      console.log(`  ✅ sales_invoices updated`);

      // 3. Rename in stock_movements (referenceCode)
      const smResult = await tx
        .update(stockMovements)
        .set({ referenceCode: to })
        .where(eq(stockMovements.referenceCode, from))
        .returning({ id: stockMovements.id });
      console.log(`  ✅ stock_movements updated: ${smResult.length} row(s)`);

      // 4. Rename in payment_transactions (referenceCode)
      const ptResult = await tx
        .update(paymentTransactions)
        .set({ referenceCode: to })
        .where(eq(paymentTransactions.referenceCode, from))
        .returning({ id: paymentTransactions.id });
      console.log(`  ✅ payment_transactions updated: ${ptResult.length} row(s)`);
    });

    console.log('');
  }

  console.log('Done. All invoice numbers fixed.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
