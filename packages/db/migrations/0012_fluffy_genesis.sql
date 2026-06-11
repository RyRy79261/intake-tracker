CREATE TABLE "mcp_access_tokens" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"refresh_token_hash" text,
	"client_id" text NOT NULL,
	"user_id" text NOT NULL,
	"scope" text NOT NULL,
	"expires_at" bigint NOT NULL,
	"refresh_expires_at" bigint,
	"revoked_at" bigint,
	"created_at" bigint NOT NULL,
	"last_used_at" bigint,
	CONSTRAINT "mcp_access_tokens_refresh_token_hash_unique" UNIQUE("refresh_token_hash")
);
--> statement-breakpoint
CREATE TABLE "mcp_audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" text NOT NULL,
	"client_id" text NOT NULL,
	"tool" text NOT NULL,
	"args_json" text,
	"status" text NOT NULL,
	"error_message" text,
	"duration_ms" integer,
	CONSTRAINT "mcp_audit_log_status_check" CHECK ("mcp_audit_log"."status" IN ('success','error'))
);
--> statement-breakpoint
CREATE TABLE "mcp_auth_codes" (
	"code" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"user_id" text NOT NULL,
	"redirect_uri" text NOT NULL,
	"code_challenge" text NOT NULL,
	"code_challenge_method" text NOT NULL,
	"scope" text NOT NULL,
	"expires_at" bigint NOT NULL,
	"consumed_at" bigint,
	"created_at" bigint NOT NULL,
	CONSTRAINT "mcp_auth_codes_challenge_method_check" CHECK ("mcp_auth_codes"."code_challenge_method" IN ('S256','plain'))
);
--> statement-breakpoint
CREATE TABLE "mcp_oauth_clients" (
	"client_id" text PRIMARY KEY NOT NULL,
	"client_secret_hash" text,
	"client_name" text NOT NULL,
	"redirect_uris" text[] NOT NULL,
	"token_endpoint_auth_method" text NOT NULL,
	"scope" text,
	"created_at" bigint NOT NULL,
	"last_used_at" bigint,
	CONSTRAINT "mcp_oauth_clients_auth_method_check" CHECK ("mcp_oauth_clients"."token_endpoint_auth_method" IN ('none','client_secret_basic','client_secret_post'))
);
--> statement-breakpoint
ALTER TABLE "mcp_access_tokens" ADD CONSTRAINT "mcp_access_tokens_client_id_mcp_oauth_clients_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."mcp_oauth_clients"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_access_tokens" ADD CONSTRAINT "mcp_access_tokens_user_id_users_sync_id_fk" FOREIGN KEY ("user_id") REFERENCES "neon_auth"."users_sync"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_audit_log" ADD CONSTRAINT "mcp_audit_log_user_id_users_sync_id_fk" FOREIGN KEY ("user_id") REFERENCES "neon_auth"."users_sync"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_auth_codes" ADD CONSTRAINT "mcp_auth_codes_client_id_mcp_oauth_clients_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."mcp_oauth_clients"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_auth_codes" ADD CONSTRAINT "mcp_auth_codes_user_id_users_sync_id_fk" FOREIGN KEY ("user_id") REFERENCES "neon_auth"."users_sync"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_mcp_access_tokens_user" ON "mcp_access_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_mcp_access_tokens_expires" ON "mcp_access_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_mcp_audit_user_ts" ON "mcp_audit_log" USING btree ("user_id","timestamp");--> statement-breakpoint
CREATE INDEX "idx_mcp_auth_codes_client" ON "mcp_auth_codes" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "idx_mcp_auth_codes_expires" ON "mcp_auth_codes" USING btree ("expires_at");