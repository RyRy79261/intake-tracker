ALTER TABLE "dose_logs" ALTER COLUMN "prescription_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "dose_logs" ADD COLUMN "medicine_name" text;--> statement-breakpoint
ALTER TABLE "dose_logs" ADD CONSTRAINT "dose_logs_medicine_check" CHECK ("dose_logs"."prescription_id" IS NOT NULL OR ("dose_logs"."kind" = 'prn' AND "dose_logs"."medicine_name" IS NOT NULL AND btrim("dose_logs"."medicine_name") <> '')) NOT VALID;--> statement-breakpoint
ALTER TABLE "dose_logs" VALIDATE CONSTRAINT "dose_logs_medicine_check";