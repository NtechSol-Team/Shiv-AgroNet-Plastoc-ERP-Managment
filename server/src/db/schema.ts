import { pgTable, text, decimal, timestamp, boolean, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ==================== MASTERS ====================

export const rawMaterials = pgTable('raw_materials', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    code: text('code').notNull().unique(),
    name: text('name').notNull(),
    size: text('size').default('Standard'),
    color: text('color').notNull(),
    unit: text('unit').default('kg'),
    hsnCode: text('hsn_code').default('3901'),
    gstPercent: decimal('gst_percent', { precision: 5, scale: 2 }).default('18'),
    reorderLevel: decimal('reorder_level', { precision: 10, scale: 2 }).default('100'),
    // NOTE: Price removed - comes from purchase bill only
    // NOTE: Stock removed - calculated from stock movements
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const finishedProducts = pgTable('finished_products', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    code: text('code').notNull().unique(),
    name: text('name').notNull(),
    length: text('length').notNull(),
    width: text('width').notNull(),
    gsm: text('gsm').notNull(),
    unit: text('unit').default('kg'),
    hsnCode: text('hsn_code').default('5608'),
    gstPercent: decimal('gst_percent', { precision: 5, scale: 2 }).default('18'),
    ratePerKg: decimal('rate_per_kg', { precision: 10, scale: 2 }).default('0'), // Selling rate
    // NOTE: Stock removed - calculated from stock movements
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const machines = pgTable('machines', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    code: text('code').notNull().unique(),
    name: text('name').notNull(),
    type: text('type').default('Net Extrusion'),
    capacity: text('capacity'),
    status: text('status').default('Active'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const customers = pgTable('customers', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    code: text('code').notNull().unique(),
    name: text('name').notNull(),
    gstNo: text('gst_no'),
    stateCode: text('state_code').default('27'), // Maharashtra = 27
    email: text('email'),
    phone: text('phone').notNull(),
    address: text('address'),
    outstanding: decimal('outstanding', { precision: 10, scale: 2 }).default('0'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const suppliers = pgTable('suppliers', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    code: text('code').notNull().unique(),
    name: text('name').notNull(),
    gstNo: text('gst_no'),
    stateCode: text('state_code').default('27'), // For CGST/SGST vs IGST logic
    contact: text('contact').notNull(),
    address: text('address'),
    outstanding: decimal('outstanding', { precision: 10, scale: 2 }).default('0'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const expenseHeads = pgTable('expense_heads', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    code: text('code').notNull().unique(),
    name: text('name').notNull(),
    category: text('category').default('Variable'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const bankCashAccounts = pgTable('bank_cash_accounts', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    code: text('code').notNull().unique(),
    name: text('name').notNull(),
    accountNo: text('account_no'),
    type: text('type').default('Bank'), // Bank, Cash
    balance: decimal('balance', { precision: 12, scale: 2 }).default('0'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const employees = pgTable('employees', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    code: text('code').notNull().unique(),
    name: text('name').notNull(),
    designation: text('designation').notNull(),
    contact: text('contact').notNull(),
    salary: decimal('salary', { precision: 10, scale: 2 }).notNull(),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// ==================== PURCHASE (RAW MATERIAL PURCHASE) ====================

export const purchaseBills = pgTable('purchase_bills', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    code: text('code').notNull().unique(),
    invoiceNumber: text('invoice_number').notNull().default('PENDING'), // Added: Mandatory Invoice Number
    type: text('type').default('RAW_MATERIAL'), // RAW_MATERIAL, GENERAL, FINISHED_GOODS
    date: timestamp('date').notNull(),
    supplierId: text('supplier_id').notNull().references(() => suppliers.id),
    supplierGST: text('supplier_gst'),
    billingAddress: text('billing_address'),
    // Totals
    subtotal: decimal('subtotal', { precision: 12, scale: 2 }).default('0'),
    discountAmount: decimal('discount_amount', { precision: 10, scale: 2 }).default('0'),
    cgst: decimal('cgst', { precision: 10, scale: 2 }).default('0'),
    sgst: decimal('sgst', { precision: 10, scale: 2 }).default('0'),
    igst: decimal('igst', { precision: 10, scale: 2 }).default('0'),
    totalTax: decimal('total_tax', { precision: 10, scale: 2 }).default('0'),
    total: decimal('total', { precision: 12, scale: 2 }).notNull(),
    roundOff: decimal('round_off', { precision: 5, scale: 2 }).default('0'),
    grandTotal: decimal('grand_total', { precision: 12, scale: 2 }).notNull(),
    // Payment
    paidAmount: decimal('paid_amount', { precision: 12, scale: 2 }).default('0'),
    balanceAmount: decimal('balance_amount', { precision: 12, scale: 2 }).default('0'),
    paymentStatus: text('payment_status').default('Unpaid'), // Unpaid, Partial, Paid
    status: text('status').default('Draft'), // Draft, Confirmed, Cancelled
    // Roll Entry Tracking
    rollEntryStatus: text('roll_entry_status').default('Pending'), // Pending, Partial, Completed
    totalRollWeight: decimal('total_roll_weight', { precision: 12, scale: 2 }).default('0'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
    supplierIdx: index('purchase_bills_supplier_idx').on(table.supplierId),
    dateIdx: index('purchase_bills_date_idx').on(table.date),
    statusIdx: index('purchase_bills_status_idx').on(table.status),
}));

export const purchaseBillItems = pgTable('purchase_bill_items', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    billId: text('bill_id').notNull().references(() => purchaseBills.id, { onDelete: 'cascade' }),
    rawMaterialId: text('raw_material_id').references(() => rawMaterials.id), // Nullable for General/FG Purchase
    finishedProductId: text('finished_product_id').references(() => finishedProducts.id), // For FG Purchase
    expenseHeadId: text('expense_head_id').references(() => expenseHeads.id), // For General Purchase
    materialName: text('material_name').notNull(),
    hsnCode: text('hsn_code').default('3901'),
    quantity: decimal('quantity', { precision: 10, scale: 2 }).notNull(),
    rate: decimal('rate', { precision: 10, scale: 2 }).notNull(),
    amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
    gstPercent: decimal('gst_percent', { precision: 5, scale: 2 }).default('18'),
    cgst: decimal('cgst', { precision: 10, scale: 2 }).default('0'),
    sgst: decimal('sgst', { precision: 10, scale: 2 }).default('0'),
    igst: decimal('igst', { precision: 10, scale: 2 }).default('0'),
    totalAmount: decimal('total_amount', { precision: 12, scale: 2 }).notNull(),
    createdAt: timestamp('created_at').defaultNow(),
});


// NEW: Raw Material Batches (Traceable Inventory)
export const rawMaterialBatches = pgTable('raw_material_batches', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    batchCode: text('batch_code').notNull().unique(), // RMB-2024-001
    rawMaterialId: text('raw_material_id').notNull().references(() => rawMaterials.id),
    purchaseBillId: text('purchase_bill_id').references(() => purchaseBills.id),
    invoiceNumber: text('invoice_number'),
    quantity: decimal('quantity', { precision: 10, scale: 2 }).notNull(),
    quantityUsed: decimal('quantity_used', { precision: 10, scale: 2 }).default('0'),
    rate: decimal('rate', { precision: 10, scale: 2 }).default('0'),
    status: text('status').default('Active'), // Active, Exhausted
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
    materialIdx: index('rm_batches_material_idx').on(table.rawMaterialId),
    statusIdx: index('rm_batches_status_idx').on(table.status),
}));

// ==================== PRODUCTION ====================

export const productionBatches = pgTable('production_batches', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    code: text('code').notNull().unique(),
    allocationDate: timestamp('allocation_date').notNull(),
    completionDate: timestamp('completion_date'),
    machineId: text('machine_id').notNull().references(() => machines.id),
    rawMaterialId: text('raw_material_id').references(() => rawMaterials.id),
    finishedProductId: text('finished_product_id').references(() => finishedProducts.id),
    inputQuantity: decimal('input_quantity', { precision: 10, scale: 2 }),
    outputQuantity: decimal('output_quantity', { precision: 10, scale: 2 }),
    lossQuantity: decimal('loss_quantity', { precision: 10, scale: 2 }),
    lossPercentage: decimal('loss_percentage', { precision: 5, scale: 2 }),
    lossExceeded: boolean('loss_exceeded').default(false),
    status: text('status').default('in-progress'), // in-progress, completed
    remarks: text('remarks'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
    machineIdx: index('production_batches_machine_idx').on(table.machineId),
    statusIdx: index('production_batches_status_idx').on(table.status),
}));

export const productionBatchInputs = pgTable('production_batch_inputs', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    batchId: text('batch_id').notNull().references(() => productionBatches.id, { onDelete: 'cascade' }),
    materialBatchId: text('material_batch_id').references(() => rawMaterialBatches.id), // NEW: Link to specific batch
    rawMaterialId: text('raw_material_id').notNull().references(() => rawMaterials.id),
    quantity: decimal('quantity', { precision: 10, scale: 2 }).notNull(),
    createdAt: timestamp('created_at').defaultNow(),
});

export const productionBatchOutputs = pgTable('production_batch_outputs', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    batchId: text('batch_id').notNull().references(() => productionBatches.id, { onDelete: 'cascade' }),
    finishedProductId: text('finished_product_id').notNull().references(() => finishedProducts.id),
    outputQuantity: decimal('output_quantity', { precision: 10, scale: 2 }), // Filled at completion
    createdAt: timestamp('created_at').defaultNow(),
});

// ==================== SALES ====================

export const salesInvoices = pgTable('sales_invoices', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    invoiceNumber: text('invoice_number').notNull().unique(),
    invoiceDate: timestamp('invoice_date').notNull(),
    dueDate: timestamp('due_date'),
    customerId: text('customer_id').references(() => customers.id), // Nullable for B2C
    customerName: text('customer_name').notNull(), // For B2C walk-in
    customerGST: text('customer_gst'),
    billingAddress: text('billing_address'),
    shippingAddress: text('shipping_address'),
    placeOfSupply: text('place_of_supply').default('Maharashtra'),
    invoiceType: text('invoice_type').default('B2B'), // B2B, B2C
    // Totals
    subtotal: decimal('subtotal', { precision: 12, scale: 2 }).default('0'),
    discountAmount: decimal('discount_amount', { precision: 10, scale: 2 }).default('0'),
    taxableAmount: decimal('taxable_amount', { precision: 12, scale: 2 }).default('0'),
    cgst: decimal('cgst', { precision: 10, scale: 2 }).default('0'),
    sgst: decimal('sgst', { precision: 10, scale: 2 }).default('0'),
    igst: decimal('igst', { precision: 10, scale: 2 }).default('0'),
    totalTax: decimal('total_tax', { precision: 10, scale: 2 }).default('0'),
    roundOff: decimal('round_off', { precision: 5, scale: 2 }).default('0'),
    grandTotal: decimal('grand_total', { precision: 12, scale: 2 }).notNull(),
    // Payment tracking
    paidAmount: decimal('paid_amount', { precision: 12, scale: 2 }).default('0'),
    balanceAmount: decimal('balance_amount', { precision: 12, scale: 2 }).default('0'),
    paymentStatus: text('payment_status').default('Unpaid'), // Unpaid, Partial, Paid
    status: text('status').default('Draft'), // Draft, Confirmed, Cancelled
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
    customerIdx: index('sales_invoices_customer_idx').on(table.customerId),
    invoiceDateIdx: index('sales_invoices_date_idx').on(table.invoiceDate),
    statusIdx: index('sales_invoices_status_idx').on(table.status),
}));


export const invoiceItems = pgTable('invoice_items', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    invoiceId: text('invoice_id').notNull().references(() => salesInvoices.id, { onDelete: 'cascade' }),
    finishedProductId: text('finished_product_id').notNull().references(() => finishedProducts.id),
    productName: text('product_name').notNull(),
    hsnCode: text('hsn_code').default('5608'),
    quantity: decimal('quantity', { precision: 10, scale: 2 }).notNull(),
    rate: decimal('rate', { precision: 10, scale: 2 }).notNull(),
    amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
    discountPercent: decimal('discount_percent', { precision: 5, scale: 2 }).default('0'),
    discountAmount: decimal('discount_amount', { precision: 10, scale: 2 }).default('0'),
    taxableAmount: decimal('taxable_amount', { precision: 12, scale: 2 }).notNull(),
    gstPercent: decimal('gst_percent', { precision: 5, scale: 2 }).default('18'),
    cgst: decimal('cgst', { precision: 10, scale: 2 }).default('0'),
    sgst: decimal('sgst', { precision: 10, scale: 2 }).default('0'),
    igst: decimal('igst', { precision: 10, scale: 2 }).default('0'),
    totalAmount: decimal('total_amount', { precision: 12, scale: 2 }).notNull(),
    bellItemId: text('bell_item_id').references(() => bellItems.id),
    createdAt: timestamp('created_at').defaultNow(),
});

// ==================== PAYMENTS ====================

export const paymentTransactions = pgTable('payment_transactions', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    code: text('code').notNull().unique(),
    date: timestamp('date').notNull(),
    type: text('type').notNull(), // RECEIPT (from customer), PAYMENT (to supplier)
    referenceType: text('reference_type').notNull(), // purchase, sales
    referenceId: text('reference_id').notNull(),
    referenceCode: text('reference_code').notNull(),
    partyType: text('party_type').notNull(), // customer, supplier
    partyId: text('party_id').notNull(),
    partyName: text('party_name').notNull(),
    mode: text('mode').notNull(), // Cash, Bank, Cheque, UPI
    accountId: text('account_id').references(() => bankCashAccounts.id),
    amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
    bankReference: text('bank_reference'), // Cheque no, UTR, etc.
    remarks: text('remarks'),
    isAdvance: boolean('is_advance').default(false), // NEW: Track if this is an advance
    advanceBalance: decimal('advance_balance', { precision: 12, scale: 2 }).default('0'), // NEW: Unused advance amount
    status: text('status').default('Completed'), // Completed, Reversed
    reversedBy: text('reversed_by'), // ID of the reversal transaction
    createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
    typeIdx: index('payment_transactions_type_idx').on(table.type),
    dateIdx: index('payment_transactions_date_idx').on(table.date),
    partyIdx: index('payment_transactions_party_idx').on(table.partyId),
    accountIdx: index('payment_transactions_account_idx').on(table.accountId),
}));

// ==================== STOCK MOVEMENTS (CORE LEDGER) ====================

export const stockMovements = pgTable('stock_movements', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    date: timestamp('date').notNull(),
    movementType: text('movement_type').notNull(), // RAW_IN, RAW_OUT, FG_IN, FG_OUT, ADJUSTMENT
    itemType: text('item_type').notNull(), // raw_material, finished_product
    rawMaterialId: text('raw_material_id').references(() => rawMaterials.id),
    finishedProductId: text('finished_product_id').references(() => finishedProducts.id),
    quantityIn: decimal('quantity_in', { precision: 10, scale: 2 }).default('0'),
    quantityOut: decimal('quantity_out', { precision: 10, scale: 2 }).default('0'),
    runningBalance: decimal('running_balance', { precision: 10, scale: 2 }).default('0'),
    referenceType: text('reference_type').notNull(), // purchase, production, sales, adjustment
    referenceCode: text('reference_code').notNull(),
    referenceId: text('reference_id'),
    reason: text('reason').notNull(),
    createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
    rawMaterialIdx: index('stock_movements_raw_material_idx').on(table.rawMaterialId),
    finishedProductIdx: index('stock_movements_finished_product_idx').on(table.finishedProductId),
    itemTypeIdx: index('stock_movements_item_type_idx').on(table.itemType),
    dateIdx: index('stock_movements_date_idx').on(table.date),
}));

// ==================== ACCOUNTING & GENERAL LEDGER ====================

export const generalLedger = pgTable('general_ledger', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    transactionDate: timestamp('transaction_date').notNull(),
    voucherNumber: text('voucher_number').notNull(), // RCPT-001, INV-001
    voucherType: text('voucher_type').notNull(), // INVOICE, RECEIPT, PAYMENT, JOURNAL, CONTRA
    ledgerId: text('ledger_id').notNull(), // References Customer, Supplier, Bank, etc. (Generic ID)
    ledgerType: text('ledger_type').notNull(), // CUSTOMER, SUPPLIER, BANK, CASH, INCOME, EXPENSE, TAX
    debitAmount: decimal('debit_amount', { precision: 12, scale: 2 }).default('0'),
    creditAmount: decimal('credit_amount', { precision: 12, scale: 2 }).default('0'),
    description: text('description'),
    referenceId: text('reference_id'), // ID of source doc (invoice id, payment id)
    isReversal: boolean('is_reversal').default(false),
    createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
    ledgerIdx: index('general_ledger_idx').on(table.ledgerId),
    dateIdx: index('general_ledger_date_idx').on(table.transactionDate),
    voucherTypeIdx: index('general_ledger_voucher_type_idx').on(table.voucherType),
}));

export const accountTransactions = pgTable('account_transactions', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    date: timestamp('date').notNull(),
    accountId: text('account_id').notNull().references(() => bankCashAccounts.id),
    particular: text('particular').notNull(),
    referenceType: text('reference_type'), // purchase, sales, expense
    referenceCode: text('reference_code'),
    debit: decimal('debit', { precision: 12, scale: 2 }).default('0'),
    credit: decimal('credit', { precision: 12, scale: 2 }).default('0'),
    balance: decimal('balance', { precision: 12, scale: 2 }).notNull(),
    createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
    accountIdx: index('account_transactions_account_idx').on(table.accountId),
    dateIdx: index('account_transactions_date_idx').on(table.date),
}));

export const invoicePaymentAllocations = pgTable('invoice_payment_allocations', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    paymentId: text('payment_id').notNull().references(() => paymentTransactions.id, { onDelete: 'cascade' }),
    invoiceId: text('invoice_id').notNull().references(() => salesInvoices.id, { onDelete: 'cascade' }),
    amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
    createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
    paymentIdx: index('inv_alloc_payment_idx').on(table.paymentId),
    invoiceIdx: index('inv_alloc_invoice_idx').on(table.invoiceId),
}));

export const billPaymentAllocations = pgTable('bill_payment_allocations', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    paymentId: text('payment_id').notNull().references(() => paymentTransactions.id, { onDelete: 'cascade' }),
    billId: text('bill_id').notNull().references(() => purchaseBills.id, { onDelete: 'cascade' }),
    amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
    createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
    paymentIdx: index('bill_alloc_payment_idx').on(table.paymentId),
    billIdx: index('bill_alloc_bill_idx').on(table.billId),
}));

// NEW: Payment Adjustments (Linking Advances to Bills/Invoices)
export const paymentAdjustments = pgTable('payment_adjustments', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    paymentId: text('payment_id').notNull().references(() => paymentTransactions.id), // The Advance Payment
    referenceType: text('reference_type').notNull(), // invoice, bill
    referenceId: text('reference_id').notNull(), // Invoice ID or Bill ID
    amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
    adjustmentDate: timestamp('adjustment_date').defaultNow(),
}, (table) => ({
    paymentIdx: index('payment_adjustments_payment_idx').on(table.paymentId),
    refIdx: index('payment_adjustments_ref_idx').on(table.referenceId),
}));

export const expenses = pgTable('expenses', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    code: text('code').notNull().unique(),
    date: timestamp('date').notNull(),
    expenseHeadId: text('expense_head_id').notNull().references(() => expenseHeads.id),
    description: text('description').notNull(),
    amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
    paymentMode: text('payment_mode').default('Bank'),
    accountId: text('account_id').references(() => bankCashAccounts.id),
    status: text('status').default('Paid'),
    createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
    dateIdx: index('expenses_date_idx').on(table.date),
    headIdx: index('expenses_head_idx').on(table.expenseHeadId),
    accountIdx: index('expenses_account_idx').on(table.accountId),
}));

// ==================== RELATIONS ====================

export const suppliersRelations = relations(suppliers, ({ many }) => ({
    purchaseBills: many(purchaseBills),
}));

export const rawMaterialsRelations = relations(rawMaterials, ({ many }) => ({
    purchaseBillItems: many(purchaseBillItems),
    productionBatches: many(productionBatches),
    stockMovements: many(stockMovements),
}));

export const finishedProductsRelations = relations(finishedProducts, ({ many }) => ({
    invoiceItems: many(invoiceItems),
    productionBatches: many(productionBatches),
    stockMovements: many(stockMovements),
}));

export const machinesRelations = relations(machines, ({ many }) => ({
    productionBatches: many(productionBatches),
}));

export const customersRelations = relations(customers, ({ many }) => ({
    salesInvoices: many(salesInvoices),
}));

export const purchaseBillsRelations = relations(purchaseBills, ({ one, many }) => ({
    supplier: one(suppliers, { fields: [purchaseBills.supplierId], references: [suppliers.id] }),
    items: many(purchaseBillItems),
    rolls: many(rawMaterialRolls),
    allocations: many(billPaymentAllocations),
    adjustmentsSource: many(purchaseBillAdjustments, { relationName: 'adjustmentsSource' }),
    adjustmentsTarget: many(purchaseBillAdjustments, { relationName: 'adjustmentsTarget' }),
}));

export const purchaseBillItemsRelations = relations(purchaseBillItems, ({ one }) => ({
    bill: one(purchaseBills, { fields: [purchaseBillItems.billId], references: [purchaseBills.id] }),
    rawMaterial: one(rawMaterials, { fields: [purchaseBillItems.rawMaterialId], references: [rawMaterials.id] }),
    finishedProduct: one(finishedProducts, { fields: [purchaseBillItems.finishedProductId], references: [finishedProducts.id] }),
    expenseHead: one(expenseHeads, { fields: [purchaseBillItems.expenseHeadId], references: [expenseHeads.id] }),
}));

export const productionBatchesRelations = relations(productionBatches, ({ one, many }) => ({
    machine: one(machines, { fields: [productionBatches.machineId], references: [machines.id] }),
    rawMaterial: one(rawMaterials, { fields: [productionBatches.rawMaterialId], references: [rawMaterials.id] }),
    finishedProduct: one(finishedProducts, { fields: [productionBatches.finishedProductId], references: [finishedProducts.id] }),
    inputs: many(productionBatchInputs),
    outputs: many(productionBatchOutputs),
}));

export const productionBatchInputsRelations = relations(productionBatchInputs, ({ one }) => ({
    batch: one(productionBatches, { fields: [productionBatchInputs.batchId], references: [productionBatches.id] }),
    materialBatch: one(rawMaterialBatches, { fields: [productionBatchInputs.materialBatchId], references: [rawMaterialBatches.id] }),
    rawMaterial: one(rawMaterials, { fields: [productionBatchInputs.rawMaterialId], references: [rawMaterials.id] }),
}));

export const productionBatchOutputsRelations = relations(productionBatchOutputs, ({ one }) => ({
    batch: one(productionBatches, { fields: [productionBatchOutputs.batchId], references: [productionBatches.id] }),
    finishedProduct: one(finishedProducts, { fields: [productionBatchOutputs.finishedProductId], references: [finishedProducts.id] }),
}));

export const salesInvoicesRelations = relations(salesInvoices, ({ one, many }) => ({
    customer: one(customers, { fields: [salesInvoices.customerId], references: [customers.id] }),
    items: many(invoiceItems),
    allocations: many(invoicePaymentAllocations),
}));

export const invoiceItemsRelations = relations(invoiceItems, ({ one }) => ({
    invoice: one(salesInvoices, { fields: [invoiceItems.invoiceId], references: [salesInvoices.id] }),
    finishedProduct: one(finishedProducts, { fields: [invoiceItems.finishedProductId], references: [finishedProducts.id] }),
}));

export const bankCashAccountsRelations = relations(bankCashAccounts, ({ many }) => ({
    transactions: many(accountTransactions),
    expenses: many(expenses),
    payments: many(paymentTransactions),
}));

export const accountTransactionsRelations = relations(accountTransactions, ({ one }) => ({
    account: one(bankCashAccounts, { fields: [accountTransactions.accountId], references: [bankCashAccounts.id] }),
}));

export const paymentTransactionsRelations = relations(paymentTransactions, ({ one, many }) => ({
    account: one(bankCashAccounts, { fields: [paymentTransactions.accountId], references: [bankCashAccounts.id] }),
    allocations: many(invoicePaymentAllocations),
    billAllocations: many(billPaymentAllocations),
}));

export const expenseHeadsRelations = relations(expenseHeads, ({ many }) => ({
    expenses: many(expenses),
}));

export const expensesRelations = relations(expenses, ({ one }) => ({
    expenseHead: one(expenseHeads, { fields: [expenses.expenseHeadId], references: [expenseHeads.id] }),
    account: one(bankCashAccounts, { fields: [expenses.accountId], references: [bankCashAccounts.id] }),
}));

export const stockMovementsRelations = relations(stockMovements, ({ one }) => ({
    rawMaterial: one(rawMaterials, { fields: [stockMovements.rawMaterialId], references: [rawMaterials.id] }),
    finishedProduct: one(finishedProducts, { fields: [stockMovements.finishedProductId], references: [finishedProducts.id] }),
}));

export const invoicePaymentAllocationsRelations = relations(invoicePaymentAllocations, ({ one }) => ({
    payment: one(paymentTransactions, { fields: [invoicePaymentAllocations.paymentId], references: [paymentTransactions.id] }),
    invoice: one(salesInvoices, { fields: [invoicePaymentAllocations.invoiceId], references: [salesInvoices.id] }),
}));

export const billPaymentAllocationsRelations = relations(billPaymentAllocations, ({ one }) => ({
    payment: one(paymentTransactions, { fields: [billPaymentAllocations.paymentId], references: [paymentTransactions.id] }),
    bill: one(purchaseBills, { fields: [billPaymentAllocations.billId], references: [purchaseBills.id] }),
}));

// ==================== SAMPLE MANAGEMENT ====================

export const productSamples = pgTable('product_samples', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    partyId: text('party_id').references(() => suppliers.id), // Can be null if generic sample
    finishedProductId: text('finished_product_id').notNull().references(() => finishedProducts.id),
    quantity: decimal('quantity', { precision: 10, scale: 2 }).notNull(),
    date: timestamp('date').defaultNow().notNull(),
    batchCode: text('batch_code'), // Optional link to specific batch
    purpose: text('purpose'), // Marketing, Testing, etc.
    notes: text('notes'),
    createdAt: timestamp('created_at').defaultNow(),
});

export const productSamplesRelations = relations(productSamples, ({ one }) => ({
    party: one(suppliers, { fields: [productSamples.partyId], references: [suppliers.id] }),
    finishedProduct: one(finishedProducts, { fields: [productSamples.finishedProductId], references: [finishedProducts.id] }),
}));

// ==================== BELL INVENTORY ====================

// Bell Batches (Headers)
export const bellBatches = pgTable('bell_batches', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    code: text('code').notNull().unique(), // Batch Code e.g. BB-2024-001
    // finishedProductId removed - Batches can be mixed
    totalWeight: decimal('total_weight', { precision: 10, scale: 2 }).notNull(),
    status: text('status').default('Active'), // Active, Deleted
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const bellBatchesRelations = relations(bellBatches, ({ many }) => ({
    items: many(bellItems),
}));

// Bell Items (Individual Bells)
export const bellItems = pgTable('bell_items', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    code: text('code').notNull().unique(), // Bell Code e.g. BEL-001
    batchId: text('batch_id').notNull().references(() => bellBatches.id, { onDelete: 'cascade' }),
    finishedProductId: text('finished_product_id').notNull().references(() => finishedProducts.id), // Moved here
    gsm: text('gsm').notNull(),
    size: text('size').notNull(),
    pieceCount: decimal('piece_count', { precision: 10, scale: 2 }).default('1'),
    grossWeight: decimal('gross_weight', { precision: 10, scale: 2 }).notNull(), // What customer receives
    weightLoss: decimal('weight_loss', { precision: 10, scale: 2 }).default('0'), // In grams
    netWeight: decimal('net_weight', { precision: 10, scale: 2 }).notNull(), // grossWeight - (weightLoss/1000), used for stock deduction
    status: text('status').default('Available'), // Available, Issued, Deleted
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
    batchIdx: index('bell_items_batch_idx').on(table.batchId),
    statusIdx: index('bell_items_status_idx').on(table.status),
    finishedProductIdx: index('bell_items_finished_product_idx').on(table.finishedProductId),
}));

// ==================== FINANCE MODULE ====================

export const financialEntities = pgTable('financial_entities', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    name: text('name').notNull(),
    type: text('type').notNull(), // Lender, Borrower, Investor, Other
    contact: text('contact'),
    email: text('email'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const financialTransactions = pgTable('financial_transactions', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    transactionType: text('transaction_type').notNull(), // LOAN_TAKEN, LOAN_GIVEN, INVESTMENT_RECEIVED, INVESTMENT_MADE, BORROWING, REPAYMENT
    partyId: text('party_id').references(() => financialEntities.id), // Can be null (e.g. self investment)
    amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
    paymentMode: text('payment_mode').default('Bank'),
    accountId: text('account_id').references(() => bankCashAccounts.id),
    transactionDate: timestamp('transaction_date').notNull(),
    reference: text('reference'),
    remarks: text('remarks'),
    interestRate: decimal('interest_rate', { precision: 5, scale: 2 }),
    principalAmount: decimal('principal_amount', { precision: 12, scale: 2 }).default('0'),
    interestAmount: decimal('interest_amount', { precision: 12, scale: 2 }).default('0'),
    tenure: decimal('tenure', { precision: 5, scale: 2 }), // Months
    dueDate: timestamp('due_date'),
    repaymentType: text('repayment_type'), // PROMISED_DATE, EMI
    status: text('status').default('Active'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
    dateIdx: index('financial_transactions_date_idx').on(table.transactionDate),
    typeIdx: index('financial_transactions_type_idx').on(table.transactionType),
    partyIdx: index('financial_transactions_party_idx').on(table.partyId),
    accountIdx: index('financial_transactions_account_idx').on(table.accountId),
}));

export const financialTransactionLedger = pgTable('financial_transaction_ledger', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    transactionId: text('transaction_id').notNull().references(() => financialTransactions.id, { onDelete: 'cascade' }),
    ledgerAccountId: text('ledger_account_id').notNull(), // References ID of Entity or Bank
    ledgerType: text('ledger_type').notNull(), // ENTITY, BANK, INCOME, EXPENSE
    debit: decimal('debit', { precision: 12, scale: 2 }).default('0'),
    credit: decimal('credit', { precision: 12, scale: 2 }).default('0'),
    transactionDate: timestamp('transaction_date').notNull(),
    createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
    ledgerAccountIdx: index('financial_ledger_account_idx').on(table.ledgerAccountId),
    dateIdx: index('financial_ledger_date_idx').on(table.transactionDate),
}));

// ==================== RELATIONS ====================

export const financialEntitiesRelations = relations(financialEntities, ({ many }) => ({
    transactions: many(financialTransactions),
}));

export const financialTransactionsRelations = relations(financialTransactions, ({ one, many }) => ({
    party: one(financialEntities, { fields: [financialTransactions.partyId], references: [financialEntities.id] }),
    account: one(bankCashAccounts, { fields: [financialTransactions.accountId], references: [bankCashAccounts.id] }),
    ledgerEntries: many(financialTransactionLedger),
}));

export const financialTransactionLedgerRelations = relations(financialTransactionLedger, ({ one }) => ({
    transaction: one(financialTransactions, { fields: [financialTransactionLedger.transactionId], references: [financialTransactions.id] }),
}));

export const bellItemsRelations = relations(bellItems, ({ one }) => ({
    batch: one(bellBatches, {
        fields: [bellItems.batchId],
        references: [bellBatches.id],
    }),
    finishedProduct: one(finishedProducts, {
        fields: [bellItems.finishedProductId],
        references: [finishedProducts.id],
    }),
}));

export const rawMaterialBatchesRelations = relations(rawMaterialBatches, ({ one }) => ({
    rawMaterial: one(rawMaterials, { fields: [rawMaterialBatches.rawMaterialId], references: [rawMaterials.id] }),
    purchaseBill: one(purchaseBills, { fields: [rawMaterialBatches.purchaseBillId], references: [purchaseBills.id] }),
}));

export const paymentAdjustmentsRelations = relations(paymentAdjustments, ({ one }) => ({
    payment: one(paymentTransactions, { fields: [paymentAdjustments.paymentId], references: [paymentTransactions.id] }),
}));


// ==================== ALIAS EXPORTS ====================
// For backward compatibility with route imports
export const invoices = salesInvoices;

// ==================== RAW MATERIAL ROLLS ====================

export const rawMaterialRolls = pgTable('raw_material_rolls', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    purchaseBillId: text('purchase_bill_id').notNull().references(() => purchaseBills.id, { onDelete: 'cascade' }),
    rawMaterialId: text('raw_material_id').notNull().references(() => rawMaterials.id),
    rollCode: text('roll_code').notNull().unique(), // e.g. ROLL-PB101-001
    grossWeight: decimal('gross_weight', { precision: 10, scale: 2 }), // Total weight with pipe
    pipeWeight: decimal('pipe_weight', { precision: 10, scale: 2 }), // Weight of pipe
    netWeight: decimal('net_weight', { precision: 10, scale: 2 }).notNull(), // Material weight (grossWeight - pipeWeight)
    gsm: decimal('gsm', { precision: 10, scale: 2 }),
    length: decimal('length', { precision: 10, scale: 2 }), // Displayed as "Width" in UI
    status: text('status').default('In Stock'), // In Stock, Consumed, Returned
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
    billIdx: index('rm_rolls_bill_idx').on(table.purchaseBillId),
    materialIdx: index('rm_rolls_material_idx').on(table.rawMaterialId),
    statusIdx: index('rm_rolls_status_idx').on(table.status),
}));

export const rawMaterialRollsRelations = relations(rawMaterialRolls, ({ one }) => ({
    purchaseBill: one(purchaseBills, { fields: [rawMaterialRolls.purchaseBillId], references: [purchaseBills.id] }),
    rawMaterial: one(rawMaterials, { fields: [rawMaterialRolls.rawMaterialId], references: [rawMaterials.id] }),
}));

// ==================== PURCHASE BILL ADJUSTMENTS (PENDING QTY) ====================

export const purchaseBillAdjustments = pgTable('purchase_bill_adjustments', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    sourceBillId: text('source_bill_id').notNull().references(() => purchaseBills.id), // The past bill with pending qty
    targetBillId: text('target_bill_id').notNull().references(() => purchaseBills.id), // The current bill absorbing the pending qty
    rawMaterialId: text('raw_material_id').notNull().references(() => rawMaterials.id),
    quantity: decimal('quantity', { precision: 10, scale: 2 }).notNull(),
    createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
    sourceBillIdx: index('pb_adjustments_source_idx').on(table.sourceBillId),
    targetBillIdx: index('pb_adjustments_target_idx').on(table.targetBillId),
    materialIdx: index('pb_adjustments_material_idx').on(table.rawMaterialId),
}));

export const purchaseBillAdjustmentsRelations = relations(purchaseBillAdjustments, ({ one }) => ({
    sourceBill: one(purchaseBills, { fields: [purchaseBillAdjustments.sourceBillId], references: [purchaseBills.id], relationName: 'adjustmentsSource' }),
    targetBill: one(purchaseBills, { fields: [purchaseBillAdjustments.targetBillId], references: [purchaseBills.id], relationName: 'adjustmentsTarget' }),
    rawMaterial: one(rawMaterials, { fields: [purchaseBillAdjustments.rawMaterialId], references: [rawMaterials.id] }),
}));
