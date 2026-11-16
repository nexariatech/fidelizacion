ALTER TABLE "customers" ADD COLUMN "dni" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "privacy_accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_dni_unique" UNIQUE("dni");--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_dni_format" CHECK ("customers"."dni" is null or "customers"."dni" ~ '^[0-9]{7,8}$');