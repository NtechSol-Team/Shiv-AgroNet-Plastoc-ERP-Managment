-- Performance Indexes Migration
-- Adds composite indexes for common query patterns to eliminate full-table scans

-- ==================== PURCHASE BILLS ====================
CREATE INDEX IF NOT EXISTS purchase_bills_supplier_date_idx
    ON purchase_bills (supplier_id, date);

CREATE INDEX IF NOT EXISTS purchase_bills_supplier_payment_status_idx
    ON purchase_bills (supplier_id, payment_status);

CREATE INDEX IF NOT EXISTS purchase_bills_type_status_idx
    ON purchase_bills (type, status);

-- ==================== PURCHASE BILL ITEMS ====================
CREATE INDEX IF NOT EXISTS purchase_bill_items_bill_idx
    ON purchase_bill_items (bill_id);

CREATE INDEX IF NOT EXISTS purchase_bill_items_raw_material_idx
    ON purchase_bill_items (raw_material_id);

CREATE INDEX IF NOT EXISTS purchase_bill_items_finished_product_idx
    ON purchase_bill_items (finished_product_id);

CREATE INDEX IF NOT EXISTS purchase_bill_items_bill_rm_idx
    ON purchase_bill_items (bill_id, raw_material_id);

-- ==================== SALES INVOICES ====================
CREATE INDEX IF NOT EXISTS sales_invoices_customer_date_idx
    ON sales_invoices (customer_id, invoice_date);

CREATE INDEX IF NOT EXISTS sales_invoices_customer_payment_status_idx
    ON sales_invoices (customer_id, payment_status);

CREATE INDEX IF NOT EXISTS sales_invoices_status_date_idx
    ON sales_invoices (status, invoice_date);

-- ==================== PAYMENT TRANSACTIONS ====================
CREATE INDEX IF NOT EXISTS payment_transactions_party_type_idx
    ON payment_transactions (party_id, type);

CREATE INDEX IF NOT EXISTS payment_transactions_party_date_idx
    ON payment_transactions (party_id, date);

CREATE INDEX IF NOT EXISTS payment_transactions_status_date_idx
    ON payment_transactions (status, date);

-- ==================== STOCK MOVEMENTS ====================
CREATE INDEX IF NOT EXISTS stock_movements_rm_date_idx
    ON stock_movements (raw_material_id, date);

CREATE INDEX IF NOT EXISTS stock_movements_fp_date_idx
    ON stock_movements (finished_product_id, date);

CREATE INDEX IF NOT EXISTS stock_movements_item_type_date_idx
    ON stock_movements (item_type, date);

-- ==================== GENERAL LEDGER ====================
CREATE INDEX IF NOT EXISTS general_ledger_ledger_date_idx
    ON general_ledger (ledger_id, transaction_date);

CREATE INDEX IF NOT EXISTS general_ledger_ledger_type_date_idx
    ON general_ledger (ledger_type, transaction_date);

-- ==================== ACCOUNT TRANSACTIONS ====================
CREATE INDEX IF NOT EXISTS account_transactions_account_date_idx
    ON account_transactions (account_id, date);

CREATE INDEX IF NOT EXISTS account_transactions_account_ref_type_idx
    ON account_transactions (account_id, reference_type);

-- ==================== BELL ITEMS ====================
CREATE INDEX IF NOT EXISTS bell_items_product_status_idx
    ON bell_items (finished_product_id, status);

CREATE INDEX IF NOT EXISTS bell_items_batch_status_idx
    ON bell_items (batch_id, status);

-- ==================== RAW MATERIAL ROLLS ====================
CREATE INDEX IF NOT EXISTS rm_rolls_material_status_idx
    ON raw_material_rolls (raw_material_id, status);

CREATE INDEX IF NOT EXISTS rm_rolls_bill_status_idx
    ON raw_material_rolls (purchase_bill_id, status);
