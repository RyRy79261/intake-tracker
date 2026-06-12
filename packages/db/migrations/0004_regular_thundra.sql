CREATE TABLE "ai_usage" (
	"id" serial PRIMARY KEY NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" text NOT NULL,
	"key_owner_id" text,
	"key_source" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"route" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cache_read_tokens" integer DEFAULT 0 NOT NULL,
	"cache_create_tokens" integer DEFAULT 0 NOT NULL,
	"audio_seconds" integer,
	"status" text NOT NULL,
	"duration_ms" integer,
	CONSTRAINT "ai_usage_key_source_check" CHECK ("ai_usage"."key_source" IN ('own_stored','shared_from','env_var')),
	CONSTRAINT "ai_usage_provider_check" CHECK ("ai_usage"."provider" IN ('anthropic','groq')),
	CONSTRAINT "ai_usage_status_check" CHECK ("ai_usage"."status" IN ('success','error'))
);
--> statement-breakpoint
CREATE TABLE "user_api_keys" (
	"user_id" text PRIMARY KEY NOT NULL,
	"anthropic_key_encrypted" text,
	"anthropic_last4" text,
	"groq_key_encrypted" text,
	"groq_last4" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_key_shares" (
	"grantor_id" text NOT NULL,
	"grantee_id" text NOT NULL,
	"provider" text NOT NULL,
	"grantee_email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_key_shares_grantor_id_grantee_id_provider_pk" PRIMARY KEY("grantor_id","grantee_id","provider"),
	CONSTRAINT "user_key_shares_provider_check" CHECK ("user_key_shares"."provider" IN ('anthropic','groq'))
);
--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_user_id_users_sync_id_fk" FOREIGN KEY ("user_id") REFERENCES "neon_auth"."users_sync"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_key_owner_id_users_sync_id_fk" FOREIGN KEY ("key_owner_id") REFERENCES "neon_auth"."users_sync"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_api_keys" ADD CONSTRAINT "user_api_keys_user_id_users_sync_id_fk" FOREIGN KEY ("user_id") REFERENCES "neon_auth"."users_sync"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_key_shares" ADD CONSTRAINT "user_key_shares_grantor_id_users_sync_id_fk" FOREIGN KEY ("grantor_id") REFERENCES "neon_auth"."users_sync"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_key_shares" ADD CONSTRAINT "user_key_shares_grantee_id_users_sync_id_fk" FOREIGN KEY ("grantee_id") REFERENCES "neon_auth"."users_sync"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_ai_usage_user_ts" ON "ai_usage" USING btree ("user_id","timestamp");--> statement-breakpoint
CREATE INDEX "idx_ai_usage_owner_ts" ON "ai_usage" USING btree ("key_owner_id","timestamp");--> statement-breakpoint
CREATE INDEX "idx_user_key_shares_grantee" ON "user_key_shares" USING btree ("grantee_id","provider");