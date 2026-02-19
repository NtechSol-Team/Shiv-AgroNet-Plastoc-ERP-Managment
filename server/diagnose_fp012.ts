/**
 * Diagnostic script for FP-012 zero stock issue
 * Run with: npx ts-node diagnose_fp012.ts
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

neonConfig.webSocketConstructor = ws;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function diagnose() {
    const client = await pool.connect();
    try {
        console.log('\n=== 1. Find Finished Products with code like FP-012 ===');
        const fp = await client.query(`
      SELECT id, code, name FROM finished_products WHERE code = 'FP-012'
    `);
        console.table(fp.rows);

        if (fp.rows.length === 0) {
            console.log('No FP-012 found!');
            return;
        }
        const fpId = fp.rows[0].id;
        console.log(`\nFP-012 ID: ${fpId}`);

        console.log('\n=== 2. Stock Movements for FP-012 ===');
        const movements = await client.query(`
      SELECT id, movement_type, item_type, finished_product_id, quantity_in, quantity_out, running_balance, reference_code, reference_id, reason
      FROM stock_movements 
      WHERE finished_product_id = $1
      ORDER BY date DESC
      LIMIT 20
    `, [fpId]);
        console.table(movements.rows);
        console.log(`Total movements: ${movements.rowCount}`);

        console.log('\n=== 3. Total FG_IN vs FG_OUT from stock_movements for FP-012 ===');
        const stockCalc = await client.query(`
      SELECT 
        COALESCE(SUM(quantity_in::numeric), 0) as total_in,
        COALESCE(SUM(quantity_out::numeric), 0) as total_out,
        COALESCE(SUM(quantity_in::numeric), 0) - COALESCE(SUM(quantity_out::numeric), 0) as net_stock
      FROM stock_movements
      WHERE item_type = 'finished_product' AND finished_product_id = $1
    `, [fpId]);
        console.table(stockCalc.rows);

        console.log('\n=== 4. Production Batch Outputs for FP-012 ===');
        const batchOutputs = await client.query(`
      SELECT 
        pbo.id, pbo.batch_id, pbo.finished_product_id, pbo.output_quantity,
        pb.code as batch_code, pb.status as batch_status
      FROM production_batch_outputs pbo
      JOIN production_batches pb ON pb.id = pbo.batch_id
      WHERE pbo.finished_product_id = $1
    `, [fpId]);
        console.table(batchOutputs.rows);
        console.log(`Total batch outputs: ${batchOutputs.rowCount}`);

        console.log('\n=== 5. Completed Production Batches where FP-012 is the finishedProductId header ===');
        const batches = await client.query(`
      SELECT id, code, status, output_quantity, finished_product_id
      FROM production_batches
      WHERE finished_product_id = $1
    `, [fpId]);
        console.table(batches.rows);

        console.log('\n=== 6. All stock_movements with itemType = finished_product (as a sanity check, first 10) ===');
        const allFGMovements = await client.query(`
      SELECT sm.finished_product_id, fp.code, sm.quantity_in, sm.movement_type
      FROM stock_movements sm
      LEFT JOIN finished_products fp ON fp.id = sm.finished_product_id
      WHERE sm.item_type = 'finished_product'
      LIMIT 10
    `);
        console.table(allFGMovements.rows);

    } finally {
        client.release();
        await pool.end();
    }
}

diagnose().catch(console.error);
