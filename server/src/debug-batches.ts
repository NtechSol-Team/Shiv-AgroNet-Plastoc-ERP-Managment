import { db } from './db/index';
import { rawMaterialBatches, rawMaterialRolls } from './db/schema';

async function debugBatch() {
    console.log('\n=== ALL RAW MATERIAL BATCHES ===');
    const batches = await db.query.rawMaterialBatches.findMany({
        with: {
            rawMaterial: true
        },
        orderBy: (batches, { desc }) => [desc(batches.createdAt)]
    });

    console.log(`Found ${batches.length} batches:`);
    batches.forEach(b => {
        console.log(`- ${b.batchCode}: ${b.rawMaterial?.name} | Qty: ${b.quantity}kg | Used: ${b.quantityUsed}kg | Status: ${b.status}`);
        console.log(`  ID: ${b.id}`);
    });

    console.log('\n=== ALL RAW MATERIAL ROLLS ===');
    const rolls = await db.query.rawMaterialRolls.findMany({
        with: {
            rawMaterial: true
        },
        orderBy: (rolls, { desc }) => [desc(rolls.createdAt)]
    });

    console.log(`Found ${rolls.length} rolls:`);
    rolls.forEach(r => {
        console.log(`- ${r.rollCode}: ${r.rawMaterial?.name} | Weight: ${r.netWeight}kg | Status: ${r.status}`);
        console.log(`  ID: ${r.id}`);
    });

    console.log('\n=== SEARCHING FOR SPECIFIC ID ===');
    const searchId = '10257c6a-fb22-4458-b166-b47cb2f650b0';

    const batchById = await db.query.rawMaterialBatches.findFirst({
        where: (batches, { eq }) => eq(batches.id, searchId)
    });

    const rollById = await db.query.rawMaterialRolls.findFirst({
        where: (rolls, { eq }) => eq(rolls.id, searchId)
    });

    console.log(`Batch with ID ${searchId}:`, batchById ? 'FOUND' : 'NOT FOUND');
    console.log(`Roll with ID ${searchId}:`, rollById ? 'FOUND' : 'NOT FOUND');

    process.exit(0);
}

debugBatch().catch(console.error);
