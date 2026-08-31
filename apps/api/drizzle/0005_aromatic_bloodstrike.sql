CREATE TABLE IF NOT EXISTS "admin_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"action" text NOT NULL,
	"meeting_uuid" text,
	"detail" jsonb NOT NULL,
	"client_ip" text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_admin_actions_created_at" ON "admin_actions" USING btree ("created_at");