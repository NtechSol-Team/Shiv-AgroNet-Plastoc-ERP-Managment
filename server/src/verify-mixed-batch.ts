
import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(__dirname, '../.env') });

// Dynamic imports are needed because imports are hoisted
async function main() {
    // Import DB and Schema after dotenv config
    const { db } = await import('./db/index');
    const { finishedProducts, bellBatches, bellItems, stockMovements } = await import('./db/schema');
    const { eq } = await import('drizzle-orm');
    const { createStockMovement } = await import('./services/inventory.service');

    console.log('🧪 Starting Mixed Bell Batch Verification...');

    const p1Code = `P1-${Date.now()}`;
    const p2Code = `P2-${Date.now()}`;
    const batchCode = `BB-MIX-${Date.now()}`;

    try {
        // 1. Create 2 Test Finished Products
        console.log('1. Creating Test Products...');
        const [prod1] = await db.insert(finishedProducts).values({
            code: p1Code,
            name: `Product A (${p1Code})`,
            gsm: '100',
            width: '50',
            length: '50',
            // status removed
        }).returning();

        const [prod2] = await db.insert(finishedProducts).values({
            code: p2Code,
            name: `Product B (${p2Code})`,
            gsm: '200',
            width: '100',
            length: '100',
            // status removed
        }).returning();

        // 2. Add Stock (1000kg each)
        console.log('2. Adding Stock (1000kg each)...');
        await createStockMovement({
            date: new Date(),
            movementType: 'FG_IN',
            itemType: 'finished_product',
            finishedProductId: prod1.id,
            quantityIn: 1000,
            referenceType: 'Test Init',
            referenceCode: 'INIT-P1',
            referenceId: '001',
            reason: 'Initial Stock P1'
        });
        await createStockMovement({
            date: new Date(),
            movementType: 'FG_IN',
            itemType: 'finished_product',
            finishedProductId: prod2.id,
            quantityIn: 1000,
            referenceType: 'Test Init',
            referenceCode: 'INIT-P2',
            referenceId: '002',
            reason: 'Initial Stock P2'
        });

        // 3. Create Mixed Batch (P1: 50kg, P2: 30kg)
        console.log('3. Creating Mixed Bell Batch...');
        const itemsData = [
            { finishedProductId: prod1.id, gsm: '100', size: '50x50', pieceCount: '1', netWeight: '20' }, // P1
            { finishedProductId: prod1.id, gsm: '100', size: '50x50', pieceCount: '1', netWeight: '30' }, // P1
            { finishedProductId: prod2.id, gsm: '200', size: '100x100', pieceCount: '1', netWeight: '30' } // P2
        ];
        // Total P1: 50, Total P2: 30. Batch Total: 80.

        let batchId = '';

        // Simulate API Logic
        const productTotals = new Map<string, number>();
        let grandTotalWeight = 0;
        itemsData.forEach(item => {
            const w = parseFloat(item.netWeight);
            grandTotalWeight += w;
            const cur = productTotals.get(item.finishedProductId) || 0;
            productTotals.set(item.finishedProductId, cur + w);
        });

        await db.transaction(async (tx) => {
            // A. Insert Batch
            const [newBatch] = await tx.insert(bellBatches).values({
                code: batchCode,
                totalWeight: String(grandTotalWeight),
                status: 'Active'
            }).returning();
            batchId = newBatch.id;

            // B. Insert Items
            for (let i = 0; i < itemsData.length; i++) {
                const item = itemsData[i];
                await tx.insert(bellItems).values({
                    code: `MIX-${i}-${Date.now()}`,
                    batchId: newBatch.id,
                    finishedProductId: item.finishedProductId,
                    gsm: item.gsm,
                    size: item.size,
                    pieceCount: item.pieceCount,
                    netWeight: item.netWeight,
                    status: 'Available'
                });
            }

            // C. Deduct Stock
            for (const [pid, totalW] of productTotals.entries()) {
                await createStockMovement({
                    date: new Date(),
                    movementType: 'FG_OUT',
                    itemType: 'finished_product',
                    finishedProductId: pid,
                    quantityOut: totalW,
                    referenceType: 'Bell Production',
                    referenceCode: batchCode,
                    referenceId: newBatch.id,
                    reason: 'Mixed Batch Test'
                });
            }
        });
        console.log('✅ Mixed Batch Created:', batchId);

        // 4. Verify Stock Deduction
        console.log('4. Verifying Stock Deduction...');

        async function getStock(pid: string) {
            const movements = await db.select().from(stockMovements).where(eq(stockMovements.finishedProductId, pid));
            const totalIn = movements.reduce((sum, m) => sum + (m.quantityIn ? parseFloat(m.quantityIn) : 0), 0);
            const totalOut = movements.reduce((sum, m) => sum + (m.quantityOut ? parseFloat(m.quantityOut) : 0), 0);
            return totalIn - totalOut;
        }

        const stockP1 = await getStock(prod1.id);
        const stockP2 = await getStock(prod2.id);

        console.log(`   P1 Stock: ${stockP1} (Exp: 950)`);
        console.log(`   P2 Stock: ${stockP2} (Exp: 970)`);

        if (stockP1 === 950 && stockP2 === 970) {
            console.log('✅ Stock Validation Passed');
        } else {
            console.error('❌ Stock Validation Failed!');
            process.exit(1);
        }

        // 5. Cleanup
        console.log('5. Cleanup (Deleting Batch)...');
        await db.delete(bellItems).where(eq(bellItems.batchId, batchId));
        await db.delete(bellBatches).where(eq(bellBatches.id, batchId));
        await db.delete(stockMovements).where(eq(stockMovements.finishedProductId, prod1.id));
        await db.delete(stockMovements).where(eq(stockMovements.finishedProductId, prod2.id));
        await db.delete(finishedProducts).where(eq(finishedProducts.id, prod1.id));
        await db.delete(finishedProducts).where(eq(finishedProducts.id, prod2.id));
        console.log('✅ Cleanup Complete');

    } catch (err) {
        console.error('❌ Error:', err);
        process.exit(1);
    }

    process.exit(0);
}

main();
