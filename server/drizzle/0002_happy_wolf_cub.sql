CREATE TABLE "cc_account_details" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"sanctioned_limit" numeric(12, 2) NOT NULL,
	"interest_rate" numeric(5, 2) NOT NULL,
	"interest_calculation_method" text DEFAULT 'Daily Outstanding',
	"drawing_power_mode" text DEFAULT 'Automatic',
	"stock_margin" numeric(5, 2) DEFAULT '25',
	"receivables_margin" numeric(5, 2) DEFAULT '40',
	"validity_period" timestamp,
	"security_type" text,
	"last_interest_calculated_date" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "cc_daily_balances" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"date" timestamp NOT NULL,
	"outstanding_amount" numeric(12, 2) NOT NULL,
	"drawing_power" numeric(12, 2) NOT NULL,
	"interest_accrued" numeric(12, 2) DEFAULT '0',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "cc_interest_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"month" timestamp NOT NULL,
	"total_interest" numeric(12, 2) NOT NULL,
	"is_posted" boolean DEFAULT false,
	"ledger_entry_id" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "financial_entities" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"contact" text,
	"email" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "financial_transaction_ledger" (
	"id" text PRIMARY KEY NOT NULL,
	"transaction_id" text NOT NULL,
	"ledger_account_id" text NOT NULL,
	"ledger_type" text NOT NULL,
	"debit" numeric(12, 2) DEFAULT '0',
	"credit" numeric(12, 2) DEFAULT '0',
	"transaction_date" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "financial_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"transaction_type" text NOT NULL,
	"party_id" text,
	"amount" numeric(12, 2) NOT NULL,
	"payment_mode" text DEFAULT 'Bank',
	"account_id" text,
	"transaction_date" timestamp NOT NULL,
	"reference" text,
	"remarks" text,
	"interest_rate" numeric(5, 2),
	"principal_amount" numeric(12, 2) DEFAULT '0',
	"interest_amount" numeric(12, 2) DEFAULT '0',
	"tenure" numeric(5, 2),
	"due_date" timestamp,
	"repayment_type" text,
	"status" text DEFAULT 'Active',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "general_items" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"default_expense_head_id" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "general_items_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "payment_adjustments" (
	"id" text PRIMARY KEY NOT NULL,
	"payment_id" text NOT NULL,
	"reference_type" text NOT NULL,
	"reference_id" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"adjustment_date" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "product_samples" (
	"id" text PRIMARY KEY NOT NULL,
	"party_id" text,
	"finished_product_id" text NOT NULL,
	"quantity" numeric(10, 2) NOT NULL,
	"date" timestamp DEFAULT now() NOT NULL,
	"batch_code" text,
	"purpose" text,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "production_batch_inputs" (
	"id" text PRIMARY KEY NOT NULL,
	"batch_id" text NOT NULL,
	"material_batch_id" text,
	"raw_material_id" text NOT NULL,
	"quantity" numeric(10, 2) NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "production_batch_outputs" (
	"id" text PRIMARY KEY NOT NULL,
	"batch_id" text NOT NULL,
	"finished_product_id" text NOT NULL,
	"output_quantity" numeric(10, 2),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "purchase_bill_adjustments" (
	"id" text PRIMARY KEY NOT NULL,
	"source_bill_id" text NOT NULL,
	"target_bill_id" text NOT NULL,
	"raw_material_id" text NOT NULL,
	"quantity" numeric(10, 2) NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "raw_material_batches" (
	"id" text PRIMARY KEY NOT NULL,
	"batch_code" text NOT NULL,
	"raw_material_id" text NOT NULL,
	"purchase_bill_id" text,
	"invoice_number" text,
	"quantity" numeric(10, 2) NOT NULL,
	"quantity_used" numeric(10, 2) DEFAULT '0',
	"rate" numeric(10, 2) DEFAULT '0',
	"status" text DEFAULT 'Active',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "raw_material_batches_batch_code_unique" UNIQUE("batch_code")
);
--> statement-breakpoint
CREATE TABLE "raw_material_rolls" (
	"id" text PRIMARY KEY NOT NULL,
	"purchase_bill_id" text NOT NULL,
	"raw_material_id" text NOT NULL,
	"roll_code" text NOT NULL,
	"gross_weight" numeric(10, 2),
	"pipe_weight" numeric(10, 2),
	"net_weight" numeric(10, 2) NOT NULL,
	"gsm" numeric(10, 2),
	"length" numeric(10, 2),
	"status" text DEFAULT 'In Stock',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "raw_material_rolls_roll_code_unique" UNIQUE("roll_code")
);
--> statement-breakpoint
ALTER TABLE "bell_batches" DROP CONSTRAINT "bell_batches_finished_product_id_finished_products_id_fk";
--> statement-breakpoint
DROP INDEX "bell_batches_finished_product_idx";--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "state_code" SET DEFAULT '24';--> statement-breakpoint
ALTER TABLE "finished_products" ALTER COLUMN "hsn_code" SET DEFAULT '60059000';--> statement-breakpoint
ALTER TABLE "finished_products" ALTER COLUMN "gst_percent" SET DEFAULT '5';--> statement-breakpoint
ALTER TABLE "sales_invoices" ALTER COLUMN "place_of_supply" SET DEFAULT 'Gujarat';--> statement-breakpoint
ALTER TABLE "production_batches" ALTER COLUMN "raw_material_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "production_batches" ALTER COLUMN "input_quantity" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_bill_items" ALTER COLUMN "raw_material_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "raw_materials" ALTER COLUMN "hsn_code" SET DEFAULT '39012000';--> statement-breakpoint
ALTER TABLE "raw_materials" ALTER COLUMN "reorder_level" SET DEFAULT '0';--> statement-breakpoint
ALTER TABLE "suppliers" ALTER COLUMN "state_code" SET DEFAULT '24';--> statement-breakpoint
ALTER TABLE "bell_items" ADD COLUMN "finished_product_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "bell_items" ADD COLUMN "gross_weight" numeric(10, 2) NOT NULL;--> statement-breakpoint
ALTER TABLE "bell_items" ADD COLUMN "weight_loss" numeric(10, 2) DEFAULT '0';--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "opening_balance" numeric(10, 2) DEFAULT '0';--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "gst_verified_at" timestamp;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD COLUMN "bell_item_id" text;--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD COLUMN "is_advance" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD COLUMN "advance_balance" numeric(12, 2) DEFAULT '0';--> statement-breakpoint
ALTER TABLE "purchase_bill_items" ADD COLUMN "finished_product_id" text;--> statement-breakpoint
ALTER TABLE "purchase_bill_items" ADD COLUMN "expense_head_id" text;--> statement-breakpoint
ALTER TABLE "purchase_bill_items" ADD COLUMN "general_item_id" text;--> statement-breakpoint
ALTER TABLE "purchase_bill_items" ADD COLUMN "unit" text DEFAULT 'kg';--> statement-breakpoint
ALTER TABLE "purchase_bills" ADD COLUMN "invoice_number" text DEFAULT 'PENDING' NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_bills" ADD COLUMN "type" text DEFAULT 'RAW_MATERIAL';--> statement-breakpoint
ALTER TABLE "purchase_bills" ADD COLUMN "roll_entry_status" text DEFAULT 'Pending';--> statement-breakpoint
ALTER TABLE "purchase_bills" ADD COLUMN "total_roll_weight" numeric(12, 2) DEFAULT '0';--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "gst_verified_at" timestamp;--> statement-breakpoint
ALTER TABLE "cc_account_details" ADD CONSTRAINT "cc_account_details_account_id_bank_cash_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."bank_cash_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cc_daily_balances" ADD CONSTRAINT "cc_daily_balances_account_id_bank_cash_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."bank_cash_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cc_interest_logs" ADD CONSTRAINT "cc_interest_logs_account_id_bank_cash_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."bank_cash_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cc_interest_logs" ADD CONSTRAINT "cc_interest_logs_ledger_entry_id_general_ledger_id_fk" FOREIGN KEY ("ledger_entry_id") REFERENCES "public"."general_ledger"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_transaction_ledger" ADD CONSTRAINT "financial_transaction_ledger_transaction_id_financial_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."financial_transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_party_id_financial_entities_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."financial_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_account_id_bank_cash_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."bank_cash_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "general_items" ADD CONSTRAINT "general_items_default_expense_head_id_expense_heads_id_fk" FOREIGN KEY ("default_expense_head_id") REFERENCES "public"."expense_heads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_adjustments" ADD CONSTRAINT "payment_adjustments_payment_id_payment_transactions_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payment_transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_samples" ADD CONSTRAINT "product_samples_party_id_suppliers_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_samples" ADD CONSTRAINT "product_samples_finished_product_id_finished_products_id_fk" FOREIGN KEY ("finished_product_id") REFERENCES "public"."finished_products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_batch_inputs" ADD CONSTRAINT "production_batch_inputs_batch_id_production_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."production_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_batch_inputs" ADD CONSTRAINT "production_batch_inputs_raw_material_id_raw_materials_id_fk" FOREIGN KEY ("raw_material_id") REFERENCES "public"."raw_materials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_batch_outputs" ADD CONSTRAINT "production_batch_outputs_batch_id_production_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."production_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_batch_outputs" ADD CONSTRAINT "production_batch_outputs_finished_product_id_finished_products_id_fk" FOREIGN KEY ("finished_product_id") REFERENCES "public"."finished_products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_bill_adjustments" ADD CONSTRAINT "purchase_bill_adjustments_source_bill_id_purchase_bills_id_fk" FOREIGN KEY ("source_bill_id") REFERENCES "public"."purchase_bills"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_bill_adjustments" ADD CONSTRAINT "purchase_bill_adjustments_target_bill_id_purchase_bills_id_fk" FOREIGN KEY ("target_bill_id") REFERENCES "public"."purchase_bills"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_bill_adjustments" ADD CONSTRAINT "purchase_bill_adjustments_raw_material_id_raw_materials_id_fk" FOREIGN KEY ("raw_material_id") REFERENCES "public"."raw_materials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_material_batches" ADD CONSTRAINT "raw_material_batches_raw_material_id_raw_materials_id_fk" FOREIGN KEY ("raw_material_id") REFERENCES "public"."raw_materials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_material_batches" ADD CONSTRAINT "raw_material_batches_purchase_bill_id_purchase_bills_id_fk" FOREIGN KEY ("purchase_bill_id") REFERENCES "public"."purchase_bills"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_material_rolls" ADD CONSTRAINT "raw_material_rolls_purchase_bill_id_purchase_bills_id_fk" FOREIGN KEY ("purchase_bill_id") REFERENCES "public"."purchase_bills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_material_rolls" ADD CONSTRAINT "raw_material_rolls_raw_material_id_raw_materials_id_fk" FOREIGN KEY ("raw_material_id") REFERENCES "public"."raw_materials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cc_details_account_idx" ON "cc_account_details" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "cc_daily_balances_acc_date_idx" ON "cc_daily_balances" USING btree ("account_id","date");--> statement-breakpoint
CREATE INDEX "cc_interest_logs_acc_month_idx" ON "cc_interest_logs" USING btree ("account_id","month");--> statement-breakpoint
CREATE INDEX "financial_ledger_account_idx" ON "financial_transaction_ledger" USING btree ("ledger_account_id");--> statement-breakpoint
CREATE INDEX "financial_ledger_date_idx" ON "financial_transaction_ledger" USING btree ("transaction_date");--> statement-breakpoint
CREATE INDEX "financial_transactions_date_idx" ON "financial_transactions" USING btree ("transaction_date");--> statement-breakpoint
CREATE INDEX "financial_transactions_type_idx" ON "financial_transactions" USING btree ("transaction_type");--> statement-breakpoint
CREATE INDEX "financial_transactions_party_idx" ON "financial_transactions" USING btree ("party_id");--> statement-breakpoint
CREATE INDEX "financial_transactions_account_idx" ON "financial_transactions" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "payment_adjustments_payment_idx" ON "payment_adjustments" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "payment_adjustments_ref_idx" ON "payment_adjustments" USING btree ("reference_id");--> statement-breakpoint
CREATE INDEX "production_batch_outputs_batch_idx" ON "production_batch_outputs" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "production_batch_outputs_product_idx" ON "production_batch_outputs" USING btree ("finished_product_id");--> statement-breakpoint
CREATE INDEX "pb_adjustments_source_idx" ON "purchase_bill_adjustments" USING btree ("source_bill_id");--> statement-breakpoint
CREATE INDEX "pb_adjustments_target_idx" ON "purchase_bill_adjustments" USING btree ("target_bill_id");--> statement-breakpoint
CREATE INDEX "pb_adjustments_material_idx" ON "purchase_bill_adjustments" USING btree ("raw_material_id");--> statement-breakpoint
CREATE INDEX "rm_batches_material_idx" ON "raw_material_batches" USING btree ("raw_material_id");--> statement-breakpoint
CREATE INDEX "rm_batches_status_idx" ON "raw_material_batches" USING btree ("status");--> statement-breakpoint
CREATE INDEX "rm_rolls_bill_idx" ON "raw_material_rolls" USING btree ("purchase_bill_id");--> statement-breakpoint
CREATE INDEX "rm_rolls_material_idx" ON "raw_material_rolls" USING btree ("raw_material_id");--> statement-breakpoint
CREATE INDEX "rm_rolls_status_idx" ON "raw_material_rolls" USING btree ("status");--> statement-breakpoint
CREATE INDEX "rm_rolls_roll_code_idx" ON "raw_material_rolls" USING btree ("roll_code");--> statement-breakpoint
CREATE INDEX "rm_rolls_net_weight_idx" ON "raw_material_rolls" USING btree ("net_weight");--> statement-breakpoint
ALTER TABLE "bell_items" ADD CONSTRAINT "bell_items_finished_product_id_finished_products_id_fk" FOREIGN KEY ("finished_product_id") REFERENCES "public"."finished_products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_bell_item_id_bell_items_id_fk" FOREIGN KEY ("bell_item_id") REFERENCES "public"."bell_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_bill_items" ADD CONSTRAINT "purchase_bill_items_finished_product_id_finished_products_id_fk" FOREIGN KEY ("finished_product_id") REFERENCES "public"."finished_products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_bill_items" ADD CONSTRAINT "purchase_bill_items_expense_head_id_expense_heads_id_fk" FOREIGN KEY ("expense_head_id") REFERENCES "public"."expense_heads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_bill_items" ADD CONSTRAINT "purchase_bill_items_general_item_id_general_items_id_fk" FOREIGN KEY ("general_item_id") REFERENCES "public"."general_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_transactions_account_idx" ON "account_transactions" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "account_transactions_date_idx" ON "account_transactions" USING btree ("date");--> statement-breakpoint
CREATE INDEX "bell_items_finished_product_idx" ON "bell_items" USING btree ("finished_product_id");--> statement-breakpoint
CREATE INDEX "bill_alloc_payment_idx" ON "bill_payment_allocations" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "bill_alloc_bill_idx" ON "bill_payment_allocations" USING btree ("bill_id");--> statement-breakpoint
CREATE INDEX "expenses_date_idx" ON "expenses" USING btree ("date");--> statement-breakpoint
CREATE INDEX "expenses_head_idx" ON "expenses" USING btree ("expense_head_id");--> statement-breakpoint
CREATE INDEX "expenses_account_idx" ON "expenses" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "general_ledger_idx" ON "general_ledger" USING btree ("ledger_id");--> statement-breakpoint
CREATE INDEX "general_ledger_date_idx" ON "general_ledger" USING btree ("transaction_date");--> statement-breakpoint
CREATE INDEX "general_ledger_voucher_type_idx" ON "general_ledger" USING btree ("voucher_type");--> statement-breakpoint
CREATE INDEX "invoice_items_invoice_idx" ON "invoice_items" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "invoice_items_product_idx" ON "invoice_items" USING btree ("finished_product_id");--> statement-breakpoint
CREATE INDEX "inv_alloc_payment_idx" ON "invoice_payment_allocations" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "inv_alloc_invoice_idx" ON "invoice_payment_allocations" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "sales_invoices_invoice_no_idx" ON "sales_invoices" USING btree ("invoice_number");--> statement-breakpoint
CREATE INDEX "sales_invoices_customer_name_idx" ON "sales_invoices" USING btree ("customer_name");--> statement-breakpoint
CREATE INDEX "payment_transactions_account_idx" ON "payment_transactions" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "production_batches_finished_product_idx" ON "production_batches" USING btree ("finished_product_id");--> statement-breakpoint
CREATE INDEX "production_batches_allocation_date_idx" ON "production_batches" USING btree ("allocation_date");--> statement-breakpoint
CREATE INDEX "production_batches_completion_date_idx" ON "production_batches" USING btree ("completion_date");--> statement-breakpoint
CREATE INDEX "purchase_bills_invoice_no_idx" ON "purchase_bills" USING btree ("invoice_number");--> statement-breakpoint
ALTER TABLE "bell_batches" DROP COLUMN "finished_product_id";