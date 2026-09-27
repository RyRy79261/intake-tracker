ALTER TABLE "blood_pressure_records" ADD COLUMN "source" text;--> statement-breakpoint
ALTER TABLE "defecation_records" ADD COLUMN "source" text;--> statement-breakpoint
ALTER TABLE "urination_records" ADD COLUMN "source" text;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "field_updated_at" jsonb;--> statement-breakpoint
ALTER TABLE "weight_records" ADD COLUMN "source" text;