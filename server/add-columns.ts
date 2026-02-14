import { config } from 'dotenv';
import { neon } from '@neondatabase/serverless';

// Load environment variables
config();

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
    console.error('❌ DATABASE_URL not found in environment variables');
    process.exit(1);
}

const sql = neon(databaseUrl);

async function addColumns() {
    try {
        console.log('Adding gross_weight and pipe_weight columns to raw_material_rolls...');

        await sql`
      ALTER TABLE raw_material_rolls 
      ADD COLUMN IF NOT EXISTS gross_weight NUMERIC(10,2),
      ADD COLUMN IF NOT EXISTS pipe_weight NUMERIC(10,2);
    `;

        console.log('✅ Columns added successfully!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error adding columns:', error);
        process.exit(1);
    }
}

addColumns();
