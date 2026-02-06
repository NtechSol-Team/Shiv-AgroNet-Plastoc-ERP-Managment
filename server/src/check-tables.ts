import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';
dotenv.config();

const sql = neon(process.env.DATABASE_URL!);

async function main() {
    console.log('Checking tables in database...');
    const tables = await sql`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
    `;
    console.log('Checking columns for bell_batches and bell_items...');
    const targetTables = ['bell_batches', 'bell_items'];
    for (const t of targetTables) {
        console.log(`\nTable: ${t}`);
        const columns = await sql`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = ${t}
        `;
        console.log(columns);
    }
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
