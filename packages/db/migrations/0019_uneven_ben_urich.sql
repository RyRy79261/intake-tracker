ALTER TABLE "dose_logs" ALTER COLUMN "phase_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "dose_logs" ALTER COLUMN "schedule_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "dose_logs" ADD COLUMN "kind" text DEFAULT 'scheduled' NOT NULL;--> statement-breakpoint
ALTER TABLE "dose_logs" ADD COLUMN "dose_mg" real;--> statement-breakpoint
ALTER TABLE "dose_logs" ADD CONSTRAINT "dose_logs_kind_check" CHECK ("dose_logs"."kind" IN ('scheduled','prn'));--> statement-breakpoint
ALTER TABLE "dose_logs" ADD CONSTRAINT "dose_logs_kind_fields_check" CHECK ("dose_logs"."kind" = 'prn' OR ("dose_logs"."phase_id" IS NOT NULL AND "dose_logs"."schedule_id" IS NOT NULL));