ALTER TABLE "inventory_items" ADD COLUMN "compounds" jsonb;--> statement-breakpoint
ALTER TABLE "prescriptions" ADD COLUMN "compounds" jsonb;