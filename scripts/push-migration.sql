-- Push notification tables for Neon Postgres
-- Run against your Neon database: psql $DATABASE_URL -f scripts/push-migration.sql

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth_key TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS push_dose_schedules (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  time_slot TEXT NOT NULL,
  day_of_week INTEGER NOT NULL,
  medications_json TEXT NOT NULL,
  UNIQUE(user_id, time_slot, day_of_week)
);

CREATE TABLE IF NOT EXISTS push_sent_log (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  time_slot TEXT NOT NULL,
  sent_date DATE NOT NULL,
  follow_up_index INTEGER NOT NULL DEFAULT 0,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, time_slot, sent_date, follow_up_index)
);

CREATE TABLE IF NOT EXISTS push_settings (
  user_id TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT true,
  follow_up_count INTEGER NOT NULL DEFAULT 2,
  follow_up_interval_minutes INTEGER NOT NULL DEFAULT 10,
  day_start_hour INTEGER NOT NULL DEFAULT 2
);
