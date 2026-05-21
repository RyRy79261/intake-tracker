-- Idempotent by hand: an earlier revision of this branch shipped user_profile
-- as migration 0006_complete_the_fallen, which got renumbered to 0007 when
-- main was merged. Environments that deployed that earlier revision already
-- have the table. IF NOT EXISTS + the duplicate_object guard make a re-run a
-- no-op while staying a clean create on a fresh database.
CREATE TABLE IF NOT EXISTS "user_profile" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"conditions" text[] NOT NULL,
	"share_conditions_with_ai" boolean NOT NULL,
	"ai_insights_consent_at" bigint,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"deleted_at" bigint,
	"device_id" text NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_profile" ADD CONSTRAINT "user_profile_user_id_users_sync_id_fk" FOREIGN KEY ("user_id") REFERENCES "neon_auth"."users_sync"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_user_profile_user_updated" ON "user_profile" USING btree ("user_id","updated_at");
