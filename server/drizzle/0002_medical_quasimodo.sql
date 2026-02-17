DROP TABLE IF EXISTS "cc_account_details" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "cc_daily_balances" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "cc_interest_logs" CASCADE;
--> statement-breakpoint
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


ALTER TABLE "cc_account_details" ADD CONSTRAINT "cc_account_details_account_id_bank_cash_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."bank_cash_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cc_daily_balances" ADD CONSTRAINT "cc_daily_balances_account_id_bank_cash_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."bank_cash_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cc_interest_logs" ADD CONSTRAINT "cc_interest_logs_account_id_bank_cash_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."bank_cash_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cc_interest_logs" ADD CONSTRAINT "cc_interest_logs_ledger_entry_id_general_ledger_id_fk" FOREIGN KEY ("ledger_entry_id") REFERENCES "public"."general_ledger"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "cc_details_account_idx" ON "cc_account_details" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "cc_daily_balances_acc_date_idx" ON "cc_daily_balances" USING btree ("account_id","date");--> statement-breakpoint
CREATE INDEX "cc_interest_logs_acc_month_idx" ON "cc_interest_logs" USING btree ("account_id","month");--> statement-breakpoint
