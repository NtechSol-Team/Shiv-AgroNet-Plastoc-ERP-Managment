
import 'dotenv/config';
import { db } from './db/index';
import { purchaseBills, purchaseBillItems } from './db/schema';
import { getPendingBillQuantity } from './services/inventory.service';
import { eq, and } from 'drizzle-orm';

async function main() {
    const supplierId = 'bbb9fe24-4a28-4ab3-a468-e5a252a14761';
    const rawMaterialId = '3602ec0d-a314-42d6-b5b0-80f8ad3c9657';

    console.log('--- Debugging Pending Quantity ---');
    console.log(`Supplier: ${supplierId}`);
    console.log(`Material: ${rawMaterialId}`);

    const bills = await db
        .select({
            id: purchaseBills.id,
            code: purchaseBills.code,
            date: purchaseBills.date,
            quantity: purchaseBillItems.quantity
        })
        .from(purchaseBills)
        .innerJoin(purchaseBillItems, eq(purchaseBills.id, purchaseBillItems.billId))
        .where(and(
            eq(purchaseBills.supplierId, supplierId),
            eq(purchaseBillItems.rawMaterialId, rawMaterialId)
        ));

    console.log(`Found ${bills.length} bills.`);

    let totalPending = 0;

    for (const bill of bills) {
        const pending = await getPendingBillQuantity(bill.id, rawMaterialId);
        console.log(`Bill ${bill.code} (${bill.date}): Qty=${bill.quantity}, Pending=${pending}`);
        if (pending > 0.01) {
            totalPending += pending;
        }
    }

    console.log('--------------------------------');
    console.log(`Total Pending Reported by logic: ${totalPending}`);
}

main().catch(console.error);
