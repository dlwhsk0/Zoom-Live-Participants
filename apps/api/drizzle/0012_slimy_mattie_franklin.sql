CREATE TABLE IF NOT EXISTS "alias_rejections" (
	"name_a" text NOT NULL,
	"name_b" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"client_ip" text,
	CONSTRAINT "alias_rejections_name_a_name_b_pk" PRIMARY KEY("name_a","name_b")
);
