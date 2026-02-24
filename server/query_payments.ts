process.env.DATABASE_URL = "postgresql://neondb_owner:npg_td4THJpOgSY7@ep-raspy-wave-ahhelndo-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require";
import { db } from './src/db';
import { paymentTransactions } from './src/db/schema';
import { desc } from 'drizzle-orm';

async function main() {
  const res = await db.select().from(paymentTransactions).orderBy(desc(paymentTransactions.createdAt)).limit(5);
  console.log(JSON.stringify(res.map(p => ({
    code: p.code,
    date: p.date,
    createdAt: p.createdAt
  })), null, 2));
  process.exit(0);
}
main();
