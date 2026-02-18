
import 'dotenv/config';
import { db } from './src/db/index';
import { expenseHeads } from './src/db/schema';

async function checkExpenseHeads() {
    console.log('Fetching expense heads...');
    const heads = await db.select().from(expenseHeads).orderBy(expenseHeads.code);
    console.log('Found', heads.length, 'expense heads.');
    heads.forEach(h => console.log(`${h.code}: ${h.name} (${h.category})`));
}

checkExpenseHeads().catch(console.error).then(() => process.exit());
