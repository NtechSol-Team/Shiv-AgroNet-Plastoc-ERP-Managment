import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(__dirname, '../.env') });

const sql = neon(process.env.DATABASE_URL!);

async function main() {
    console.log('Dropping bell tables...');
    await sql`DROP TABLE IF EXISTS "bell_inventory" CASCADE`;
    await sql`DROP TABLE IF EXISTS "bell_items" CASCADE`;
    await sql`DROP TABLE IF EXISTS "bell_batches" CASCADE`;
    console.log('Tables dropped.');
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
