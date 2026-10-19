ALTER TABLE "user_settings" ADD COLUMN "late_window_minutes" integer DEFAULT 40 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "reminder_period_minutes" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "ask_skip_reason" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_late_window_minutes_check" CHECK ("user_settings"."late_window_minutes" BETWEEN -1 AND 1440);--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_reminder_period_minutes_check" CHECK ("user_settings"."reminder_period_minutes" BETWEEN 1 AND 1440);