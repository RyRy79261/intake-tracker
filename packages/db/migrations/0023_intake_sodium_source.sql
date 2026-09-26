ALTER TABLE "intake_records" ADD COLUMN "sodium_source" text;--> statement-breakpoint
ALTER TABLE "intake_records" ADD COLUMN "source_amount" real;--> statement-breakpoint
ALTER TABLE "intake_records" ADD COLUMN "source_unit" text;--> statement-breakpoint
ALTER TABLE "intake_records" ADD CONSTRAINT "intake_records_sodium_source_check" CHECK ("intake_records"."sodium_source" IS NULL OR "intake_records"."sodium_source" IN ('sodium','salt','msg'));--> statement-breakpoint
ALTER TABLE "intake_records" ADD CONSTRAINT "intake_records_source_unit_check" CHECK ("intake_records"."source_unit" IS NULL OR "intake_records"."source_unit" IN ('mg','g'));