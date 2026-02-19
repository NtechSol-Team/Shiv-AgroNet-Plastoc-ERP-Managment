/**
 * Backfill script: Creates missing FG_IN stock movements 
 * for production_batch_outputs that have no corresponding stock movement.
 * 
 * Run with: npx tsx backfill_fg_stock.ts
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

neonConfig.webSocketConstructor = ws;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function backfill() {
    const client = await pool.connect();
    try {
        console.log('\n=== Backfilling FG_IN stock movements ===\n');

        // Find all production_batch_outputs for completed/partially-completed batches
        // where NO stock movement exists for that batch+product pair
        const { rows: missingOutputs } = await client.query(`
            SELECT 
                pbo.id as output_id,
                pbo.batch_id,
                pbo.finished_product_id,
                pbo.output_quantity,
                pb.code as batch_code,
                pb.status as batch_status,
                pb.completion_date,
                fp.code as product_code
            FROM production_batch_outputs pbo
            JOIN production_batches pb ON pb.id = pbo.batch_id
            JOIN finished_products fp ON fp.id = pbo.finished_product_id
            WHERE pb.status IN ('completed', 'partially-completed')
            AND pbo.output_quantity IS NOT NULL
            AND pbo.output_quantity::numeric > 0
            AND NOT EXISTS (
                SELECT 1 FROM stock_movements sm
                WHERE sm.reference_id = pbo.batch_id
                AND sm.finished_product_id = pbo.finished_product_id
                AND sm.movement_type = 'FG_IN'
            )
            ORDER BY pb.completion_date ASC
        `);

        console.log(`Found ${missingOutputs.length} production outputs missing stock movements:\n`);

        if (missingOutputs.length === 0) {
            console.log('Nothing to backfill!');
            return;
        }

        for (const output of missingOutputs) {
            console.log(`  - ${output.product_code} | Batch ${output.batch_code} | Qty: ${output.output_quantity}`);
        }

        console.log('\nCreating stock movements...');

        let created = 0;
        for (const output of missingOutputs) {
            const movementDate = output.completion_date ? new Date(output.completion_date) : new Date();

            // Calculate running balance for this product (sum of all FG_IN so far)
            const { rows: [balRow] } = await client.query(`
                SELECT COALESCE(SUM(quantity_in::numeric), 0) - COALESCE(SUM(quantity_out::numeric), 0) as balance
                FROM stock_movements
                WHERE item_type = 'finished_product' AND finished_product_id = $1
            `, [output.finished_product_id]);

            const currentBalance = parseFloat(balRow.balance || '0');
            const outputQty = parseFloat(output.output_quantity);
            const newBalance = currentBalance + outputQty;

            await client.query(`
                INSERT INTO stock_movements (
                    id, date, movement_type, item_type, finished_product_id,
                    quantity_in, quantity_out, running_balance,
                    reference_type, reference_code, reference_id, reason
                ) VALUES (
                    gen_random_uuid(),
                    $1, 'FG_IN', 'finished_product', $2,
                    $3, '0', $4,
                    'production', $5, $6,
                    $7
                )
            `, [
                movementDate,
                output.finished_product_id,
                String(outputQty),
                String(newBalance),
                output.batch_code,
                output.batch_id,
                `[BACKFILL] Production completed from batch ${output.batch_code}`
            ]);

            created++;
            console.log(`  ✓ Created FG_IN movement: ${output.product_code} +${outputQty}kg (batch ${output.batch_code})`);
        }

        console.log(`\n✅ Done! Created ${created} stock movements.`);

        // Verify
        console.log('\n=== Verification: Current FG stock after backfill ===');
        const { rows: stockCheck } = await client.query(`
            SELECT 
                fp.code,
                fp.name,
                COALESCE(SUM(sm.quantity_in::numeric), 0) as total_in,
                COALESCE(SUM(sm.quantity_out::numeric), 0) as total_out,
                COALESCE(SUM(sm.quantity_in::numeric), 0) - COALESCE(SUM(sm.quantity_out::numeric), 0) as net_stock
            FROM finished_products fp
            LEFT JOIN stock_movements sm ON sm.finished_product_id = fp.id AND sm.item_type = 'finished_product'
            GROUP BY fp.id, fp.code, fp.name
            HAVING COALESCE(SUM(sm.quantity_in::numeric), 0) > 0
            ORDER BY fp.code
        `);
        console.table(stockCheck);

    } finally {
        client.release();
        await pool.end();
    }
}

backfill().catch(console.error);
