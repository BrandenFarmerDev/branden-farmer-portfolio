CREATE TABLE contact_submissions (
  submission_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  company TEXT NOT NULL,
  position TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'replied', 'archived')),
  owner_notification_state TEXT NOT NULL DEFAULT 'pending' CHECK (owner_notification_state IN ('pending', 'sent')),
  confirmation_state TEXT NOT NULL DEFAULT 'pending' CHECK (confirmation_state IN ('pending', 'sent')),
  notification_attempts INTEGER NOT NULL DEFAULT 0 CHECK (notification_attempts >= 0),
  next_retry_at TEXT,
  owner_notified_at TEXT,
  confirmation_sent_at TEXT,
  submitted_at TEXT NOT NULL,
  last_interaction_at TEXT NOT NULL
);

CREATE INDEX contact_submissions_email ON contact_submissions (email);
CREATE INDEX contact_submissions_submitted_at ON contact_submissions (submitted_at DESC);
CREATE INDEX contact_submissions_retry ON contact_submissions (next_retry_at)
  WHERE owner_notification_state = 'pending' OR confirmation_state = 'pending';

CREATE TABLE booking_history (
  booking_uid TEXT PRIMARY KEY,
  previous_booking_uid TEXT,
  event_type_id INTEGER,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('booked', 'rescheduled', 'cancelled')),
  source TEXT NOT NULL CHECK (source IN ('cal', 'manual')),
  provider_sequence INTEGER NOT NULL DEFAULT 0,
  provider_updated_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX booking_history_email ON booking_history (email);
CREATE INDEX booking_history_start_at ON booking_history (start_at DESC);
CREATE INDEX booking_history_previous_uid ON booking_history (previous_booking_uid);

CREATE TABLE booking_events (
  provider_event_key TEXT PRIMARY KEY,
  booking_uid TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('created', 'rescheduled', 'cancelled')),
  occurred_at TEXT NOT NULL,
  received_at TEXT NOT NULL
);

CREATE INDEX booking_events_booking_uid ON booking_events (booking_uid, occurred_at);

CREATE TABLE ai_daily_usage (
  usage_day TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('browser', 'ip', 'global')),
  key_hash TEXT NOT NULL,
  count INTEGER NOT NULL CHECK (count >= 1 AND count <= daily_limit),
  daily_limit INTEGER NOT NULL CHECK (daily_limit > 0),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (usage_day, scope, key_hash)
);

CREATE TABLE ai_usage_summary (
  usage_day TEXT NOT NULL,
  model TEXT NOT NULL,
  calls INTEGER NOT NULL DEFAULT 0 CHECK (calls >= 0),
  input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  estimated_cost REAL NOT NULL DEFAULT 0 CHECK (estimated_cost >= 0),
  PRIMARY KEY (usage_day, model)
);

CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);