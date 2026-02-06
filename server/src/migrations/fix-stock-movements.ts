/**
 * Migration Script to fix stock_movements table
 * Run this with: npx ts-node src/migrations/fix-stock-movements.ts
 */

import 'dotenv/config';
import { db } from '../db/index';
import { sql } from 'drizzle-orm';

async function fixStockMovementsTable() {
    console.log('🔧 Starting stock_movements table fix...');

    try {
        // Check if 'type' column exists (old schema)
        const checkType = await db.execute(sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'stock_movements' AND column_name = 'type'
    `);

        const hasOldTypeColumn = checkType.rows.length > 0;
        console.log(`Old 'type' column exists: ${hasOldTypeColumn}`);

        // Check if 'movement_type' column exists (new schema)
        const checkMovementType = await db.execute(sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'stock_movements' AND column_name = 'movement_type'
    `);

        const hasNewMovementTypeColumn = checkMovementType.rows.length > 0;
        console.log(`New 'movement_type' column exists: ${hasNewMovementTypeColumn}`);

        // If old 'type' exists but not 'movement_type', rename
        if (hasOldTypeColumn && !hasNewMovementTypeColumn) {
            console.log('Renaming type → movement_type...');
            await db.execute(sql`ALTER TABLE stock_movements RENAME COLUMN type TO movement_type`);
        }

        // Check if 'quantity' column exists (old schema - single column)
        const checkQuantity = await db.execute(sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'stock_movements' AND column_name = 'quantity'
    `);

        const hasOldQuantityColumn = checkQuantity.rows.length > 0;
        console.log(`Old 'quantity' column exists: ${hasOldQuantityColumn}`);

        // Check if quantity_in column exists
        const checkQuantityIn = await db.execute(sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'stock_movements' AND column_name = 'quantity_in'
    `);

        const hasQuantityIn = checkQuantityIn.rows.length > 0;
        console.log(`New 'quantity_in' column exists: ${hasQuantityIn}`);

        if (hasOldQuantityColumn && !hasQuantityIn) {
            console.log('Creating quantity_in and quantity_out columns...');
            await db.execute(sql`ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS quantity_in DECIMAL(10,2) DEFAULT '0'`);
            await db.execute(sql`ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS quantity_out DECIMAL(10,2) DEFAULT '0'`);

            // Migrate data: if movement is IN type, set quantity_in, else quantity_out
            await db.execute(sql`
        UPDATE stock_movements 
        SET quantity_in = quantity 
        WHERE movement_type IN ('RAW_IN', 'FG_IN', 'ADJUSTMENT')
      `);
            await db.execute(sql`
        UPDATE stock_movements 
        SET quantity_out = quantity 
        WHERE movement_type IN ('RAW_OUT', 'FG_OUT')
      `);

            // Drop old quantity column
            // await db.execute(sql`ALTER TABLE stock_movements DROP COLUMN quantity`);
        }

        // Check if running_balance column exists
        const checkRunningBalance = await db.execute(sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'stock_movements' AND column_name = 'running_balance'
    `);

        if (checkRunningBalance.rows.length === 0) {
            console.log('Adding running_balance column...');
            await db.execute(sql`ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS running_balance DECIMAL(10,2) DEFAULT '0'`);
        }

        console.log('✅ Migration complete!');

        // List current columns
        const columns = await db.execute(sql`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'stock_movements'
      ORDER BY ordinal_position
    `);

        console.log('\n📋 Current columns in stock_movements:');
        columns.rows.forEach((row: any) => {
            console.log(`  - ${row.column_name}: ${row.data_type}`);
        });

    } catch (error) {
        console.error('❌ Migration failed:', error);
    }

    process.exit(0);
}

fixStockMovementsTable();
