CREATE TABLE "insight_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"generated_at" bigint NOT NULL,
	"range_start" bigint NOT NULL,
	"range_end" bigint NOT NULL,
	"narrative" text NOT NULL,
	"observations" text[] NOT NULL,
	"personalised" boolean NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"deleted_at" bigint,
	"device_id" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "insight_reports" ADD CONSTRAINT "insight_reports_user_id_users_sync_id_fk" FOREIGN KEY ("user_id") REFERENCES "neon_auth"."users_sync"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_insight_reports_user_updated" ON "insight_reports" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_insight_reports_generated" ON "insight_reports" USING btree ("generated_at");