CREATE TABLE "journal_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"timestamp" bigint NOT NULL,
	"time_precision" text NOT NULL,
	"words" text NOT NULL,
	"finding" text NOT NULL,
	"kind" text NOT NULL,
	"places" text[] NOT NULL,
	"severity" integer,
	"source" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"deleted_at" bigint,
	"device_id" text NOT NULL,
	"timezone" text NOT NULL,
	"server_updated_at" bigint DEFAULT (floor(extract(epoch from now()) * 1000))::bigint NOT NULL,
	CONSTRAINT "journal_entries_kind_check" CHECK ("journal_entries"."kind" IN ('symptom','sign','event')),
	CONSTRAINT "journal_entries_time_precision_check" CHECK ("journal_entries"."time_precision" IN ('exact','approx','day')),
	CONSTRAINT "journal_entries_severity_check" CHECK ("journal_entries"."severity" IS NULL OR "journal_entries"."severity" BETWEEN 0 AND 10)
);
--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_user_id_users_sync_id_fk" FOREIGN KEY ("user_id") REFERENCES "neon_auth"."users_sync"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_journal_entries_user_updated" ON "journal_entries" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_journal_entries_user_server_updated" ON "journal_entries" USING btree ("user_id","server_updated_at","id");