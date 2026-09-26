CREATE TABLE "user_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"water_limit" integer NOT NULL,
	"salt_limit" integer NOT NULL,
	"sugar_limit" integer NOT NULL,
	"potassium_limit" integer NOT NULL,
	"water_extended_buffer" integer NOT NULL,
	"salt_extended_buffer" integer NOT NULL,
	"sugar_extended_buffer" integer NOT NULL,
	"optional_trackers" jsonb NOT NULL,
	"day_start_hour" integer NOT NULL,
	"liquid_presets" jsonb NOT NULL,
	"primary_region" text NOT NULL,
	"secondary_region" text NOT NULL,
	"reminder_follow_up_count" integer NOT NULL,
	"reminder_follow_up_interval" integer NOT NULL,
	"home_timezone" text,
	"home_timezone_confirmed_at" bigint,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"deleted_at" bigint,
	"device_id" text NOT NULL,
	"server_updated_at" bigint DEFAULT (floor(extract(epoch from now()) * 1000))::bigint NOT NULL,
	CONSTRAINT "user_settings_day_start_hour_check" CHECK ("user_settings"."day_start_hour" BETWEEN 0 AND 23)
);
--> statement-breakpoint
ALTER TABLE "ai_usage" ADD COLUMN "web_search_requests" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD COLUMN "is_batch" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_users_sync_id_fk" FOREIGN KEY ("user_id") REFERENCES "neon_auth"."users_sync"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_user_settings_user_updated" ON "user_settings" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_user_settings_user_server_updated" ON "user_settings" USING btree ("user_id","server_updated_at","id");