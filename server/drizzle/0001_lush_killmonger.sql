DROP TABLE IF EXISTS "bell_inventory" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "bell_items" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "bell_batches" CASCADE;
--> statement-breakpoint
CREATE TABLE "bell_batches" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"finished_product_id" text NOT NULL,
	"total_weight" numeric(10, 2) NOT NULL,
	"status" text DEFAULT 'Active',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "bell_batches_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "bell_items" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"batch_id" text NOT NULL,
	"gsm" text NOT NULL,
	"size" text NOT NULL,
	"piece_count" numeric(10, 2) DEFAULT '1',
	"net_weight" numeric(10, 2) NOT NULL,
	"status" text DEFAULT 'Available',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "bell_items_code_unique" UNIQUE("code")
);
--> statement-breakpoint

ALTER TABLE "bell_batches" ADD CONSTRAINT "bell_batches_finished_product_id_finished_products_id_fk" FOREIGN KEY ("finished_product_id") REFERENCES "public"."finished_products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bell_items" ADD CONSTRAINT "bell_items_batch_id_bell_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."bell_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bell_batches_finished_product_idx" ON "bell_batches" USING btree ("finished_product_id");--> statement-breakpoint
CREATE INDEX "bell_items_batch_idx" ON "bell_items" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "bell_items_status_idx" ON "bell_items" USING btree ("status");