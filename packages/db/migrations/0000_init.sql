CREATE TABLE "audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"timestamp" bigint NOT NULL,
	"action" text NOT NULL,
	"details" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"deleted_at" bigint,
	"device_id" text NOT NULL,
	"timezone" text NOT NULL,
	CONSTRAINT "audit_logs_action_check" CHECK ("audit_logs"."action" IN (
        'ai_parse_request','ai_parse_success','ai_parse_error','data_export',
        'data_import','data_clear','settings_change','api_key_set','api_key_clear',
        'pin_set','pin_verify_success','pin_verify_failure','dose_taken',
        'dose_skipped','dose_rescheduled','prescription_added','prescription_updated',
        'inventory_adjusted','phase_activated','validation_error','dose_untaken',
        'prescription_deleted','phase_completed','phase_started','stock_recalculated',
        'inventory_added','inventory_deleted','titration_plan_updated','timezone_adjusted'
      ))
);
--> statement-breakpoint
CREATE TABLE "blood_pressure_records" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"systolic" integer NOT NULL,
	"diastolic" integer NOT NULL,
	"heart_rate" integer,
	"irregular_heartbeat" boolean,
	"position" text NOT NULL,
	"arm" text NOT NULL,
	"timestamp" bigint NOT NULL,
	"note" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"deleted_at" bigint,
	"device_id" text NOT NULL,
	"timezone" text NOT NULL,
	CONSTRAINT "blood_pressure_records_position_check" CHECK ("blood_pressure_records"."position" IN ('standing','sitting')),
	CONSTRAINT "blood_pressure_records_arm_check" CHECK ("blood_pressure_records"."arm" IN ('left','right'))
);
--> statement-breakpoint
CREATE TABLE "daily_notes" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"date" text NOT NULL,
	"prescription_id" text,
	"dose_log_id" text,
	"note" text NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"deleted_at" bigint,
	"device_id" text NOT NULL,
	"timezone" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "defecation_records" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"timestamp" bigint NOT NULL,
	"amount_estimate" text,
	"note" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"deleted_at" bigint,
	"device_id" text NOT NULL,
	"timezone" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dose_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"prescription_id" text NOT NULL,
	"phase_id" text NOT NULL,
	"schedule_id" text NOT NULL,
	"inventory_item_id" text,
	"scheduled_date" text NOT NULL,
	"scheduled_time" text NOT NULL,
	"status" text NOT NULL,
	"action_timestamp" bigint,
	"rescheduled_to" text,
	"skip_reason" text,
	"note" text,
	"timezone" text NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"deleted_at" bigint,
	"device_id" text NOT NULL,
	CONSTRAINT "dose_logs_status_check" CHECK ("dose_logs"."status" IN ('taken','skipped','rescheduled','pending'))
);
--> statement-breakpoint
CREATE TABLE "eating_records" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"timestamp" bigint NOT NULL,
	"grams" integer,
	"note" text,
	"group_id" text,
	"original_input_text" text,
	"group_source" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"deleted_at" bigint,
	"device_id" text NOT NULL,
	"timezone" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "intake_records" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"amount" integer NOT NULL,
	"timestamp" bigint NOT NULL,
	"source" text,
	"note" text,
	"group_id" text,
	"original_input_text" text,
	"group_source" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"deleted_at" bigint,
	"device_id" text NOT NULL,
	"timezone" text NOT NULL,
	CONSTRAINT "intake_records_type_check" CHECK ("intake_records"."type" IN ('water','salt'))
);
--> statement-breakpoint
CREATE TABLE "inventory_items" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"prescription_id" text NOT NULL,
	"brand_name" text NOT NULL,
	"current_stock" integer,
	"strength" real NOT NULL,
	"unit" text NOT NULL,
	"pill_shape" text NOT NULL,
	"pill_color" text NOT NULL,
	"visual_identification" text,
	"refill_alert_days" integer,
	"refill_alert_pills" integer,
	"is_active" boolean NOT NULL,
	"is_archived" boolean,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"deleted_at" bigint,
	"device_id" text NOT NULL,
	"timezone" text NOT NULL,
	CONSTRAINT "inventory_items_pill_shape_check" CHECK ("inventory_items"."pill_shape" IN ('round','oval','capsule','diamond','tablet'))
);
--> statement-breakpoint
CREATE TABLE "inventory_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"inventory_item_id" text NOT NULL,
	"timestamp" bigint NOT NULL,
	"amount" integer NOT NULL,
	"note" text,
	"type" text NOT NULL,
	"dose_log_id" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"deleted_at" bigint,
	"device_id" text NOT NULL,
	"timezone" text NOT NULL,
	CONSTRAINT "inventory_transactions_type_check" CHECK ("inventory_transactions"."type" IN ('refill','consumed','adjusted','initial'))
);
--> statement-breakpoint
CREATE TABLE "medication_phases" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"prescription_id" text NOT NULL,
	"type" text NOT NULL,
	"unit" text NOT NULL,
	"start_date" bigint NOT NULL,
	"end_date" bigint,
	"food_instruction" text NOT NULL,
	"food_note" text,
	"notes" text,
	"status" text NOT NULL,
	"titration_plan_id" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"deleted_at" bigint,
	"device_id" text NOT NULL,
	CONSTRAINT "medication_phases_type_check" CHECK ("medication_phases"."type" IN ('maintenance','titration')),
	CONSTRAINT "medication_phases_food_instruction_check" CHECK ("medication_phases"."food_instruction" IN ('before','after','none')),
	CONSTRAINT "medication_phases_status_check" CHECK ("medication_phases"."status" IN ('active','completed','cancelled','pending'))
);
--> statement-breakpoint
CREATE TABLE "phase_schedules" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"phase_id" text NOT NULL,
	"time" text NOT NULL,
	"schedule_time_utc" integer NOT NULL,
	"anchor_timezone" text NOT NULL,
	"dosage" real NOT NULL,
	"days_of_week" integer[] NOT NULL,
	"enabled" boolean NOT NULL,
	"unit" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"deleted_at" bigint,
	"device_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prescriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"generic_name" text NOT NULL,
	"indication" text NOT NULL,
	"notes" text,
	"contraindications" text[],
	"warnings" text[],
	"is_active" boolean NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"deleted_at" bigint,
	"device_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_schedules" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"time_slot" text NOT NULL,
	"day_of_week" integer NOT NULL,
	"medications_json" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_sent_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"time_slot" text NOT NULL,
	"sent_date" date NOT NULL,
	"follow_up_index" integer DEFAULT 0 NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "push_settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"follow_up_count" integer DEFAULT 2 NOT NULL,
	"follow_up_interval_minutes" integer DEFAULT 10 NOT NULL,
	"day_start_hour" integer DEFAULT 2 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "push_subscriptions_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "substance_records" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"amount_mg" integer,
	"amount_standard_drinks" real,
	"volume_ml" integer,
	"description" text NOT NULL,
	"source" text NOT NULL,
	"source_record_id" text,
	"ai_enriched" boolean,
	"timestamp" bigint NOT NULL,
	"group_id" text,
	"original_input_text" text,
	"group_source" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"deleted_at" bigint,
	"device_id" text NOT NULL,
	"timezone" text NOT NULL,
	CONSTRAINT "substance_records_type_check" CHECK ("substance_records"."type" IN ('caffeine','alcohol')),
	CONSTRAINT "substance_records_source_check" CHECK ("substance_records"."source" IN ('water_intake','eating','standalone'))
);
--> statement-breakpoint
CREATE TABLE "titration_plans" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"condition_label" text NOT NULL,
	"recommended_start_date" bigint,
	"status" text NOT NULL,
	"notes" text,
	"warnings" text[],
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"deleted_at" bigint,
	"device_id" text NOT NULL,
	CONSTRAINT "titration_plans_status_check" CHECK ("titration_plans"."status" IN ('draft','active','completed','cancelled'))
);
--> statement-breakpoint
CREATE TABLE "urination_records" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"timestamp" bigint NOT NULL,
	"amount_estimate" text,
	"note" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"deleted_at" bigint,
	"device_id" text NOT NULL,
	"timezone" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "neon_auth"."users_sync" (
	"id" text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weight_records" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"weight" real NOT NULL,
	"timestamp" bigint NOT NULL,
	"note" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"deleted_at" bigint,
	"device_id" text NOT NULL,
	"timezone" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_sync_id_fk" FOREIGN KEY ("user_id") REFERENCES "neon_auth"."users_sync"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blood_pressure_records" ADD CONSTRAINT "blood_pressure_records_user_id_users_sync_id_fk" FOREIGN KEY ("user_id") REFERENCES "neon_auth"."users_sync"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_notes" ADD CONSTRAINT "daily_notes_user_id_users_sync_id_fk" FOREIGN KEY ("user_id") REFERENCES "neon_auth"."users_sync"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_notes" ADD CONSTRAINT "daily_notes_prescription_id_prescriptions_id_fk" FOREIGN KEY ("prescription_id") REFERENCES "public"."prescriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_notes" ADD CONSTRAINT "daily_notes_dose_log_id_dose_logs_id_fk" FOREIGN KEY ("dose_log_id") REFERENCES "public"."dose_logs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "defecation_records" ADD CONSTRAINT "defecation_records_user_id_users_sync_id_fk" FOREIGN KEY ("user_id") REFERENCES "neon_auth"."users_sync"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dose_logs" ADD CONSTRAINT "dose_logs_user_id_users_sync_id_fk" FOREIGN KEY ("user_id") REFERENCES "neon_auth"."users_sync"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dose_logs" ADD CONSTRAINT "dose_logs_prescription_id_prescriptions_id_fk" FOREIGN KEY ("prescription_id") REFERENCES "public"."prescriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dose_logs" ADD CONSTRAINT "dose_logs_phase_id_medication_phases_id_fk" FOREIGN KEY ("phase_id") REFERENCES "public"."medication_phases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dose_logs" ADD CONSTRAINT "dose_logs_schedule_id_phase_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."phase_schedules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dose_logs" ADD CONSTRAINT "dose_logs_inventory_item_id_inventory_items_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eating_records" ADD CONSTRAINT "eating_records_user_id_users_sync_id_fk" FOREIGN KEY ("user_id") REFERENCES "neon_auth"."users_sync"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intake_records" ADD CONSTRAINT "intake_records_user_id_users_sync_id_fk" FOREIGN KEY ("user_id") REFERENCES "neon_auth"."users_sync"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_user_id_users_sync_id_fk" FOREIGN KEY ("user_id") REFERENCES "neon_auth"."users_sync"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_prescription_id_prescriptions_id_fk" FOREIGN KEY ("prescription_id") REFERENCES "public"."prescriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_user_id_users_sync_id_fk" FOREIGN KEY ("user_id") REFERENCES "neon_auth"."users_sync"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_inventory_item_id_inventory_items_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_dose_log_id_dose_logs_id_fk" FOREIGN KEY ("dose_log_id") REFERENCES "public"."dose_logs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medication_phases" ADD CONSTRAINT "medication_phases_user_id_users_sync_id_fk" FOREIGN KEY ("user_id") REFERENCES "neon_auth"."users_sync"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medication_phases" ADD CONSTRAINT "medication_phases_prescription_id_prescriptions_id_fk" FOREIGN KEY ("prescription_id") REFERENCES "public"."prescriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medication_phases" ADD CONSTRAINT "medication_phases_titration_plan_id_titration_plans_id_fk" FOREIGN KEY ("titration_plan_id") REFERENCES "public"."titration_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phase_schedules" ADD CONSTRAINT "phase_schedules_user_id_users_sync_id_fk" FOREIGN KEY ("user_id") REFERENCES "neon_auth"."users_sync"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phase_schedules" ADD CONSTRAINT "phase_schedules_phase_id_medication_phases_id_fk" FOREIGN KEY ("phase_id") REFERENCES "public"."medication_phases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_user_id_users_sync_id_fk" FOREIGN KEY ("user_id") REFERENCES "neon_auth"."users_sync"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_schedules" ADD CONSTRAINT "push_schedules_user_id_users_sync_id_fk" FOREIGN KEY ("user_id") REFERENCES "neon_auth"."users_sync"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_sent_log" ADD CONSTRAINT "push_sent_log_user_id_users_sync_id_fk" FOREIGN KEY ("user_id") REFERENCES "neon_auth"."users_sync"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_settings" ADD CONSTRAINT "push_settings_user_id_users_sync_id_fk" FOREIGN KEY ("user_id") REFERENCES "neon_auth"."users_sync"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_sync_id_fk" FOREIGN KEY ("user_id") REFERENCES "neon_auth"."users_sync"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "substance_records" ADD CONSTRAINT "substance_records_user_id_users_sync_id_fk" FOREIGN KEY ("user_id") REFERENCES "neon_auth"."users_sync"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "substance_records" ADD CONSTRAINT "substance_records_source_record_id_intake_records_id_fk" FOREIGN KEY ("source_record_id") REFERENCES "public"."intake_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "titration_plans" ADD CONSTRAINT "titration_plans_user_id_users_sync_id_fk" FOREIGN KEY ("user_id") REFERENCES "neon_auth"."users_sync"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "urination_records" ADD CONSTRAINT "urination_records_user_id_users_sync_id_fk" FOREIGN KEY ("user_id") REFERENCES "neon_auth"."users_sync"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weight_records" ADD CONSTRAINT "weight_records_user_id_users_sync_id_fk" FOREIGN KEY ("user_id") REFERENCES "neon_auth"."users_sync"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_audit_user_updated" ON "audit_logs" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_audit_action_ts" ON "audit_logs" USING btree ("action","timestamp");--> statement-breakpoint
CREATE INDEX "idx_bp_user_updated" ON "blood_pressure_records" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_bp_ts" ON "blood_pressure_records" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "idx_daily_notes_user_updated" ON "daily_notes" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_daily_notes_date" ON "daily_notes" USING btree ("date");--> statement-breakpoint
CREATE INDEX "idx_daily_notes_prescription" ON "daily_notes" USING btree ("prescription_id");--> statement-breakpoint
CREATE INDEX "idx_defecation_user_updated" ON "defecation_records" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_dose_logs_user_updated" ON "dose_logs" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_dose_logs_prescription_date" ON "dose_logs" USING btree ("prescription_id","scheduled_date");--> statement-breakpoint
CREATE INDEX "idx_dose_logs_status" ON "dose_logs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_eating_user_updated" ON "eating_records" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_eating_group" ON "eating_records" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "idx_intake_user_updated" ON "intake_records" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_intake_type_ts" ON "intake_records" USING btree ("type","timestamp");--> statement-breakpoint
CREATE INDEX "idx_intake_group" ON "intake_records" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "idx_inventory_user_updated" ON "inventory_items" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_inventory_prescription" ON "inventory_items" USING btree ("prescription_id");--> statement-breakpoint
CREATE INDEX "idx_inventory_active" ON "inventory_items" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_inventory_tx_user_updated" ON "inventory_transactions" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_inventory_tx_item_ts" ON "inventory_transactions" USING btree ("inventory_item_id","timestamp");--> statement-breakpoint
CREATE INDEX "idx_inventory_tx_type" ON "inventory_transactions" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_phases_user_updated" ON "medication_phases" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_phases_prescription" ON "medication_phases" USING btree ("prescription_id");--> statement-breakpoint
CREATE INDEX "idx_phases_status_type" ON "medication_phases" USING btree ("status","type");--> statement-breakpoint
CREATE INDEX "idx_phase_schedules_user_updated" ON "phase_schedules" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_phase_schedules_phase" ON "phase_schedules" USING btree ("phase_id");--> statement-breakpoint
CREATE INDEX "idx_phase_schedules_enabled" ON "phase_schedules" USING btree ("enabled");--> statement-breakpoint
CREATE INDEX "idx_prescriptions_user_updated" ON "prescriptions" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_prescriptions_active" ON "prescriptions" USING btree ("is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "push_schedules_user_slot_dow_uq" ON "push_schedules" USING btree ("user_id","time_slot","day_of_week");--> statement-breakpoint
CREATE UNIQUE INDEX "push_sent_log_uq" ON "push_sent_log" USING btree ("user_id","time_slot","sent_date","follow_up_index");--> statement-breakpoint
CREATE INDEX "idx_substance_user_updated" ON "substance_records" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_substance_type_ts" ON "substance_records" USING btree ("type","timestamp");--> statement-breakpoint
CREATE INDEX "idx_substance_group" ON "substance_records" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "idx_titration_user_updated" ON "titration_plans" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_titration_condition" ON "titration_plans" USING btree ("condition_label");--> statement-breakpoint
CREATE INDEX "idx_titration_status" ON "titration_plans" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_urination_user_updated" ON "urination_records" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_weight_user_updated" ON "weight_records" USING btree ("user_id","updated_at");