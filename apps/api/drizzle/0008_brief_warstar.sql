CREATE TABLE IF NOT EXISTS "daily_snapshots" (
	"date" text PRIMARY KEY NOT NULL,
	"people" integer NOT NULL,
	"seconds" integer NOT NULL,
	"peak" integer NOT NULL,
	"first_at" text,
	"last_at" text,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
