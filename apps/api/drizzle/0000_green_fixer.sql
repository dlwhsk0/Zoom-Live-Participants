CREATE TABLE IF NOT EXISTS "participant_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"webhook_event_id" uuid NOT NULL,
	"meeting_id" text NOT NULL,
	"meeting_uuid" text NOT NULL,
	"participant_uuid" text NOT NULL,
	"event_type" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"display_name" text,
	"user_id" text,
	"leave_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meeting_id" text NOT NULL,
	"meeting_uuid" text NOT NULL,
	"participant_uuid" text NOT NULL,
	"display_name" text,
	"is_present" boolean NOT NULL,
	"last_event_type" text NOT NULL,
	"last_occurred_at" timestamp with time zone NOT NULL,
	"first_joined_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"payload" jsonb NOT NULL,
	"dedupe_key" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_participant_events_presence" ON "participant_events" USING btree ("meeting_uuid","participant_uuid","occurred_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_participant_events_meeting_occurred" ON "participant_events" USING btree ("meeting_uuid","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_participants_meeting_participant" ON "participants" USING btree ("meeting_uuid","participant_uuid");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_participants_present" ON "participants" USING btree ("meeting_uuid","is_present");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_participants_latest_session" ON "participants" USING btree ("meeting_id","last_occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_webhook_events_dedupe_key" ON "webhook_events" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_webhook_events_received_at" ON "webhook_events" USING btree ("received_at");