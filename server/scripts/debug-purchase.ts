import "dotenv/config";
import { db } from '../src/db/index';
import { purchaseBills, purchaseBillItems, suppliers, rawMaterials, rawMaterialBatches, stockMovements } from '../src/db/schema';
import { eq } from 'drizzle-orm';

async function debugPurchase() {
    console.log('Starting debug script...');
    try {
        // 1. Get a supplier
        const [supplier] = await db.select().from(suppliers).limit(1);
        if (!supplier) {
            console.error('No suppliers found!');
            return;
        }
        console.log('Found supplier:', supplier.name);

        // 2. Get a raw material
        const [material] = await db.select().from(rawMaterials).limit(1);
        if (!material) {
            console.error('No raw materials found!');
            return;
        }
        console.log('Found material:', material.name);

        // 3. Create a Bill
        const invoiceNumber = `DEBUG-INV-${Date.now()}`;
        console.log('Creating bill with invoice:', invoiceNumber);

        const [bill] = await db.insert(purchaseBills).values({
            code: `DEBUG-BILL-${Date.now()}`,
            invoiceNumber: invoiceNumber,
            type: 'RAW_MATERIAL',
            date: new Date(),
            supplierId: supplier.id,
            total: '100',
            grandTotal: '100',
            status: 'Confirmed'
        }).returning();
        console.log('Bill created:', bill.id);

        // 4. Create an Item
        console.log('Creating item...');
        await db.insert(purchaseBillItems).values({
            billId: bill.id,
            rawMaterialId: material.id,
            materialName: material.name,
            quantity: '10',
            rate: '10',
            amount: '100',
            totalAmount: '100',
            gstPercent: '0'
        });
        console.log('Item created.');

        // 5. Create Stock Movement (Manual Simulation of Purchase Route Logic)
        console.log('Creating Stock Movement...');
        await db.insert(stockMovements).values({
            date: new Date(),
            movementType: 'RAW_IN',
            itemType: 'raw_material',
            rawMaterialId: material.id,
            quantityIn: '10',
            quantityOut: '0',
            runningBalance: '10', // Dummy
            referenceType: 'purchase',
            referenceCode: bill.code,
            referenceId: bill.id,
            reason: 'Debug Purchase'
        });
        console.log('Stock Movement created.');

        // 6. Create Batch (Manual Simulation)
        console.log('Creating Batch...');
        await db.insert(rawMaterialBatches).values({
            batchCode: `DEBUG-BATCH-${Date.now()}`,
            rawMaterialId: material.id,
            purchaseBillId: bill.id,
            invoiceNumber: invoiceNumber,
            quantity: '10',
            quantityUsed: '0',
            rate: '10',
            status: 'Active'
        });
        console.log('Batch created.');

        console.log('SUCCESS: Debug Purchase Flow Completed without Error.');

    } catch (error) {
        console.error('ERROR CAUGHT IN DEBUG SCRIPT:');
        console.error(error);
    } finally {
        process.exit();
    }
}

debugPurchase();
