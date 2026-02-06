CREATE TABLE "bell_inventory" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"finished_product_id" text NOT NULL,
	"gsm" text NOT NULL,
	"size" text NOT NULL,
	"piece_count" numeric(10, 2) DEFAULT '1',
	"net_weight" numeric(10, 2) NOT NULL,
	"status" text DEFAULT 'Available',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "bell_inventory_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "bell_inventory" ADD CONSTRAINT "bell_inventory_finished_product_id_finished_products_id_fk" FOREIGN KEY ("finished_product_id") REFERENCES "public"."finished_products"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "bell_inventory_finished_product_idx" ON "bell_inventory" USING btree ("finished_product_id");
--> statement-breakpoint
CREATE INDEX "bell_inventory_status_idx" ON "bell_inventory" USING btree ("status");