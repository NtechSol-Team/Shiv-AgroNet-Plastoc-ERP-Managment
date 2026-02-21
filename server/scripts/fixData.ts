import { db } from '../src/db/index';
import { customers, suppliers, purchaseBills, purchaseBillItems, salesInvoices, invoiceItems } from '../src/db/schema';
import { eq } from 'drizzle-orm';

async function main() {
    console.log("Fixing Customers...");
    const allCustomers = await db.select().from(customers);
    for (const c of allCustomers) {
        if (c.gstNo && c.gstNo.length >= 2) {
            const stateCode = c.gstNo.substring(0, 2);
            if (c.stateCode !== stateCode) {
                await db.update(customers).set({ stateCode }).where(eq(customers.id, c.id));
                console.log(`Updated Customer ${c.name} stateCode to ${stateCode}`);
            }
        }
    }

    console.log("Fixing Suppliers...");
    const allSuppliers = await db.select().from(suppliers);
    for (const s of allSuppliers) {
        if (s.gstNo && s.gstNo.length >= 2) {
            const stateCode = s.gstNo.substring(0, 2);
            if (s.stateCode !== stateCode) {
                await db.update(suppliers).set({ stateCode }).where(eq(suppliers.id, s.id));
                console.log(`Updated Supplier ${s.name} stateCode to ${stateCode}`);
            }
        }
    }

    console.log("Fixing Purchase Bills...");
    // Refetch suppliers to get updated state codes
    const updatedSuppliers = await db.select().from(suppliers);
    const supplierStateMap = new Map(updatedSuppliers.map(s => [s.id, s.stateCode]));

    const allPBills = await db.select().from(purchaseBills);
    for (const pb of allPBills) {
        const sCode = supplierStateMap.get(pb.supplierId) || '24';
        if (sCode === '24') {
            // Should be CGST / SGST
            const igstVal = parseFloat(pb.igst || '0');
            const cgstVal = parseFloat(pb.cgst || '0');
            if (igstVal > 0 && cgstVal === 0) {
                const half = (igstVal / 2).toFixed(2);
                await db.update(purchaseBills).set({
                    cgst: half,
                    sgst: half,
                    igst: '0'
                }).where(eq(purchaseBills.id, pb.id));
                console.log(`Updated Purchase Bill ${pb.code} IGST ${igstVal} -> CGST/SGST ${half}`);
            }
        } else {
            // Should be IGST
            const cgstVal = parseFloat(pb.cgst || '0');
            const sgstVal = parseFloat(pb.sgst || '0');
            if (cgstVal > 0) {
                const total = (cgstVal + sgstVal).toFixed(2);
                await db.update(purchaseBills).set({
                    cgst: '0',
                    sgst: '0',
                    igst: total
                }).where(eq(purchaseBills.id, pb.id));
                console.log(`Updated Purchase Bill ${pb.code} CGST/SGST -> IGST ${total}`);
            }
        }
    }

    console.log("Fixing Purchase Bill Items...");
    const allPBItems = await db.select().from(purchaseBillItems);
    for (const pbi of allPBItems) {
        // Find its bill to know the supplier
        const bill = allPBills.find(b => b.id === pbi.billId);
        if (!bill) continue;
        const sCode = supplierStateMap.get(bill.supplierId) || '24';
        if (sCode === '24') {
            const igstVal = parseFloat(pbi.igst || '0');
            if (igstVal > 0) {
                const half = (igstVal / 2).toFixed(2);
                await db.update(purchaseBillItems).set({
                    cgst: half,
                    sgst: half,
                    igst: '0'
                }).where(eq(purchaseBillItems.id, pbi.id));
            }
        } else {
            const cgstVal = parseFloat(pbi.cgst || '0');
            const sgstVal = parseFloat(pbi.sgst || '0');
            if (cgstVal > 0) {
                const total = (cgstVal + sgstVal).toFixed(2);
                await db.update(purchaseBillItems).set({
                    cgst: '0',
                    sgst: '0',
                    igst: total
                }).where(eq(purchaseBillItems.id, pbi.id));
            }
        }
    }

    console.log("Fixing Sales Invoices...");
    const allInvoices = await db.select().from(salesInvoices);
    for (const inv of allInvoices) {
        const sCode = inv.placeOfSupply || '24';
        if (sCode === '24' || sCode.toLowerCase() === 'gujarat') {
            const igstVal = parseFloat(inv.igst || '0');
            if (igstVal > 0) {
                const half = (igstVal / 2).toFixed(2);
                await db.update(salesInvoices).set({
                    cgst: half,
                    sgst: half,
                    igst: '0'
                }).where(eq(salesInvoices.id, inv.id));
                console.log(`Updated Sales Invoice ${inv.invoiceNumber} IGST -> CGST/SGST ${half}`);
            }
        } else {
            const cgstVal = parseFloat(inv.cgst || '0');
            const sgstVal = parseFloat(inv.sgst || '0');
            if (cgstVal > 0) {
                const total = (cgstVal + sgstVal).toFixed(2);
                await db.update(salesInvoices).set({
                    cgst: '0',
                    sgst: '0',
                    igst: total
                }).where(eq(salesInvoices.id, inv.id));
                console.log(`Updated Sales Invoice ${inv.invoiceNumber} CGST/SGST -> IGST ${total}`);
            }
        }
    }

    console.log("Fixing Invoice Items...");
    const allInvItems = await db.select().from(invoiceItems);
    for (const invItem of allInvItems) {
        const inv = allInvoices.find(i => i.id === invItem.invoiceId);
        if (!inv) continue;
        const sCode = inv.placeOfSupply || '24';
        if (sCode === '24' || sCode.toLowerCase() === 'gujarat') {
            const igstVal = parseFloat(invItem.igst || '0');
            if (igstVal > 0) {
                const half = (igstVal / 2).toFixed(2);
                await db.update(invoiceItems).set({
                    cgst: half,
                    sgst: half,
                    igst: '0'
                }).where(eq(invoiceItems.id, invItem.id));
            }
        } else {
            const cgstVal = parseFloat(invItem.cgst || '0');
            const sgstVal = parseFloat(invItem.sgst || '0');
            if (cgstVal > 0) {
                const total = (cgstVal + sgstVal).toFixed(2);
                await db.update(invoiceItems).set({
                    cgst: '0',
                    sgst: '0',
                    igst: total
                }).where(eq(invoiceItems.id, invItem.id));
            }
        }
    }

    console.log("Saving complete!");
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
