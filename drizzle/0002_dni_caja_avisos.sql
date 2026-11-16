ALTER TABLE "customers" ALTER COLUMN "auth_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "dni" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "privacy_accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "registered_by_staff_id" uuid;--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "disputed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_registered_by_staff_id_staff_users_id_fk" FOREIGN KEY ("registered_by_staff_id") REFERENCES "public"."staff_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_dni_unique" UNIQUE("dni");--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_dni_format" CHECK ("customers"."dni" is null or "customers"."dni" ~ '^[0-9]{7,8}$');--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_identity" CHECK ("customers"."auth_user_id" is not null or "customers"."dni" is not null);