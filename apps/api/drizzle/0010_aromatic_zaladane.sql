ALTER TABLE "notices" ADD COLUMN "category" text DEFAULT 'general' NOT NULL;--> statement-breakpoint
ALTER TABLE "notices" ADD COLUMN "starts_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notices" ADD COLUMN "ends_at" timestamp with time zone;