CREATE TABLE "insight_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"batch_id" text NOT NULL,
	"status" text NOT NULL,
	"request_payload" jsonb NOT NULL,
	"result_report_id" text,
	"error" text,
	"created_at" bigint NOT NULL,
	"completed_at" bigint,
	CONSTRAINT "insight_jobs_status_check" CHECK ("insight_jobs"."status" IN ('pending','completed','failed','expired'))
);
--> statement-breakpoint
ALTER TABLE "insight_reports" ADD COLUMN "mode" text;--> statement-breakpoint
ALTER TABLE "insight_jobs" ADD CONSTRAINT "insight_jobs_user_id_users_sync_id_fk" FOREIGN KEY ("user_id") REFERENCES "neon_auth"."users_sync"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "insight_jobs_one_pending_per_user_uq" ON "insight_jobs" USING btree ("user_id") WHERE status = 'pending';--> statement-breakpoint
CREATE INDEX "idx_insight_jobs_user_created" ON "insight_jobs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_insight_jobs_batch" ON "insight_jobs" USING btree ("batch_id");--> statement-breakpoint
ALTER TABLE "insight_reports" ADD CONSTRAINT "insight_reports_mode_check" CHECK ("insight_reports"."mode" IS NULL OR "insight_reports"."mode" IN ('fast','deep'));