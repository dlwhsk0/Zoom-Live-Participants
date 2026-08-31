CREATE TABLE IF NOT EXISTS "name_aliases" (
	"alias" text PRIMARY KEY NOT NULL,
	"canonical" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"client_ip" text
);
