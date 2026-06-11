ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_action_check";--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_action_check" CHECK ("audit_logs"."action" IN (
        'ai_parse_request','ai_parse_success','ai_parse_error','data_export',
        'data_import','data_clear','settings_change','api_key_set','api_key_clear',
        'pin_set','pin_verify_success','pin_verify_failure','dose_taken',
        'dose_skipped','dose_rescheduled','dose_time_edited','prescription_added',
        'prescription_updated','inventory_adjusted','phase_activated','validation_error',
        'dose_untaken','prescription_deleted','phase_completed','phase_started',
        'stock_recalculated','inventory_added','inventory_deleted','titration_plan_updated',
        'timezone_adjusted'
      ));