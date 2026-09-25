ALTER TABLE "prescriptions" ALTER COLUMN "indication" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN "server_updated_at" bigint DEFAULT (floor(extract(epoch from now()) * 1000))::bigint NOT NULL;--> statement-breakpoint
ALTER TABLE "blood_pressure_records" ADD COLUMN "server_updated_at" bigint DEFAULT (floor(extract(epoch from now()) * 1000))::bigint NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_notes" ADD COLUMN "server_updated_at" bigint DEFAULT (floor(extract(epoch from now()) * 1000))::bigint NOT NULL;--> statement-breakpoint
ALTER TABLE "defecation_records" ADD COLUMN "server_updated_at" bigint DEFAULT (floor(extract(epoch from now()) * 1000))::bigint NOT NULL;--> statement-breakpoint
ALTER TABLE "dose_logs" ADD COLUMN "dose_amount" real;--> statement-breakpoint
ALTER TABLE "dose_logs" ADD COLUMN "dose_unit" text;--> statement-breakpoint
ALTER TABLE "dose_logs" ADD COLUMN "pills_consumed" real;--> statement-breakpoint
ALTER TABLE "dose_logs" ADD COLUMN "pill_strength" real;--> statement-breakpoint
ALTER TABLE "dose_logs" ADD COLUMN "server_updated_at" bigint DEFAULT (floor(extract(epoch from now()) * 1000))::bigint NOT NULL;--> statement-breakpoint
ALTER TABLE "eating_records" ADD COLUMN "server_updated_at" bigint DEFAULT (floor(extract(epoch from now()) * 1000))::bigint NOT NULL;--> statement-breakpoint
ALTER TABLE "insight_reports" ADD COLUMN "server_updated_at" bigint DEFAULT (floor(extract(epoch from now()) * 1000))::bigint NOT NULL;--> statement-breakpoint
ALTER TABLE "intake_records" ADD COLUMN "server_updated_at" bigint DEFAULT (floor(extract(epoch from now()) * 1000))::bigint NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "server_updated_at" bigint DEFAULT (floor(extract(epoch from now()) * 1000))::bigint NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD COLUMN "server_updated_at" bigint DEFAULT (floor(extract(epoch from now()) * 1000))::bigint NOT NULL;--> statement-breakpoint
ALTER TABLE "medication_phases" ADD COLUMN "server_updated_at" bigint DEFAULT (floor(extract(epoch from now()) * 1000))::bigint NOT NULL;--> statement-breakpoint
ALTER TABLE "phase_schedules" ADD COLUMN "server_updated_at" bigint DEFAULT (floor(extract(epoch from now()) * 1000))::bigint NOT NULL;--> statement-breakpoint
ALTER TABLE "prescriptions" ADD COLUMN "server_updated_at" bigint DEFAULT (floor(extract(epoch from now()) * 1000))::bigint NOT NULL;--> statement-breakpoint
ALTER TABLE "substance_records" ADD COLUMN "server_updated_at" bigint DEFAULT (floor(extract(epoch from now()) * 1000))::bigint NOT NULL;--> statement-breakpoint
ALTER TABLE "titration_plans" ADD COLUMN "server_updated_at" bigint DEFAULT (floor(extract(epoch from now()) * 1000))::bigint NOT NULL;--> statement-breakpoint
ALTER TABLE "urination_records" ADD COLUMN "server_updated_at" bigint DEFAULT (floor(extract(epoch from now()) * 1000))::bigint NOT NULL;--> statement-breakpoint
ALTER TABLE "user_profile" ADD COLUMN "server_updated_at" bigint DEFAULT (floor(extract(epoch from now()) * 1000))::bigint NOT NULL;--> statement-breakpoint
ALTER TABLE "weight_records" ADD COLUMN "server_updated_at" bigint DEFAULT (floor(extract(epoch from now()) * 1000))::bigint NOT NULL;--> statement-breakpoint
-- Backfill (hand-added): existing rows take server_updated_at = updated_at so
-- pull cursors saved by clients before this migration (which are in
-- updated_at space) stay valid. Without it every row would carry the
-- migration's now() and every device would re-pull its whole dataset.
UPDATE "audit_logs" SET "server_updated_at" = "updated_at";--> statement-breakpoint
UPDATE "blood_pressure_records" SET "server_updated_at" = "updated_at";--> statement-breakpoint
UPDATE "daily_notes" SET "server_updated_at" = "updated_at";--> statement-breakpoint
UPDATE "defecation_records" SET "server_updated_at" = "updated_at";--> statement-breakpoint
UPDATE "dose_logs" SET "server_updated_at" = "updated_at";--> statement-breakpoint
UPDATE "eating_records" SET "server_updated_at" = "updated_at";--> statement-breakpoint
UPDATE "insight_reports" SET "server_updated_at" = "updated_at";--> statement-breakpoint
UPDATE "intake_records" SET "server_updated_at" = "updated_at";--> statement-breakpoint
UPDATE "inventory_items" SET "server_updated_at" = "updated_at";--> statement-breakpoint
UPDATE "inventory_transactions" SET "server_updated_at" = "updated_at";--> statement-breakpoint
UPDATE "medication_phases" SET "server_updated_at" = "updated_at";--> statement-breakpoint
UPDATE "phase_schedules" SET "server_updated_at" = "updated_at";--> statement-breakpoint
UPDATE "prescriptions" SET "server_updated_at" = "updated_at";--> statement-breakpoint
UPDATE "substance_records" SET "server_updated_at" = "updated_at";--> statement-breakpoint
UPDATE "titration_plans" SET "server_updated_at" = "updated_at";--> statement-breakpoint
UPDATE "urination_records" SET "server_updated_at" = "updated_at";--> statement-breakpoint
UPDATE "user_profile" SET "server_updated_at" = "updated_at";--> statement-breakpoint
UPDATE "weight_records" SET "server_updated_at" = "updated_at";--> statement-breakpoint
CREATE INDEX "idx_audit_user_server_updated" ON "audit_logs" USING btree ("user_id","server_updated_at","id");--> statement-breakpoint
CREATE INDEX "idx_bp_user_server_updated" ON "blood_pressure_records" USING btree ("user_id","server_updated_at","id");--> statement-breakpoint
CREATE INDEX "idx_daily_notes_user_server_updated" ON "daily_notes" USING btree ("user_id","server_updated_at","id");--> statement-breakpoint
CREATE INDEX "idx_defecation_user_server_updated" ON "defecation_records" USING btree ("user_id","server_updated_at","id");--> statement-breakpoint
CREATE INDEX "idx_dose_logs_user_server_updated" ON "dose_logs" USING btree ("user_id","server_updated_at","id");--> statement-breakpoint
CREATE INDEX "idx_eating_user_server_updated" ON "eating_records" USING btree ("user_id","server_updated_at","id");--> statement-breakpoint
CREATE INDEX "idx_insight_reports_user_server_updated" ON "insight_reports" USING btree ("user_id","server_updated_at","id");--> statement-breakpoint
CREATE INDEX "idx_intake_user_server_updated" ON "intake_records" USING btree ("user_id","server_updated_at","id");--> statement-breakpoint
CREATE INDEX "idx_inventory_user_server_updated" ON "inventory_items" USING btree ("user_id","server_updated_at","id");--> statement-breakpoint
CREATE INDEX "idx_inventory_tx_user_server_updated" ON "inventory_transactions" USING btree ("user_id","server_updated_at","id");--> statement-breakpoint
CREATE INDEX "idx_phases_user_server_updated" ON "medication_phases" USING btree ("user_id","server_updated_at","id");--> statement-breakpoint
CREATE INDEX "idx_phase_schedules_user_server_updated" ON "phase_schedules" USING btree ("user_id","server_updated_at","id");--> statement-breakpoint
CREATE INDEX "idx_prescriptions_user_server_updated" ON "prescriptions" USING btree ("user_id","server_updated_at","id");--> statement-breakpoint
CREATE INDEX "idx_substance_user_server_updated" ON "substance_records" USING btree ("user_id","server_updated_at","id");--> statement-breakpoint
CREATE INDEX "idx_titration_user_server_updated" ON "titration_plans" USING btree ("user_id","server_updated_at","id");--> statement-breakpoint
CREATE INDEX "idx_urination_user_server_updated" ON "urination_records" USING btree ("user_id","server_updated_at","id");--> statement-breakpoint
CREATE INDEX "idx_user_profile_user_server_updated" ON "user_profile" USING btree ("user_id","server_updated_at","id");--> statement-breakpoint
CREATE INDEX "idx_weight_user_server_updated" ON "weight_records" USING btree ("user_id","server_updated_at","id");