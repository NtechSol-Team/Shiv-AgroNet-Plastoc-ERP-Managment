
import { db } from './db';
import { stockMovements, finishedProducts } from './db/schema';
import { eq, desc, sql } from 'drizzle-orm';

async function debugStock() {
    console.log("--- Finished Goods Stock Debug ---");

    const products = await db.select().from(finishedProducts);

    for (const prod of products) {
        const movement = await db.select()
            .from(stockMovements)
            .where(eq(stockMovements.finishedProductId, prod.id))
            .orderBy(desc(stockMovements.date), desc(stockMovements.createdAt))
            .limit(1);

        const balance = movement[0]?.runningBalance || 0;
        console.log(`Product: ${prod.name} (${prod.code}) | Rate: ${prod.ratePerKg} | Balance: ${balance}`);
    }

    process.exit(0);
}

debugStock().catch(err => {
    console.error(err);
    process.exit(1);
});
