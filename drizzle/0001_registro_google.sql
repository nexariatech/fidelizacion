ALTER TYPE "public"."point_movement_type" ADD VALUE 'profile_bonus';--> statement-breakpoint
ALTER TABLE "point_movements" ALTER COLUMN "branch_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "birth_date" date;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "profile_completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "loyalty_programs" ADD COLUMN "profile_bonus_points" integer DEFAULT 50 NOT NULL;--> statement-breakpoint
ALTER TABLE "program_memberships" ADD COLUMN "profile_bonus_granted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "loyalty_programs" ADD CONSTRAINT "loyalty_programs_profile_bonus" CHECK ("loyalty_programs"."profile_bonus_points" >= 0);--> statement-breakpoint
ALTER TABLE "point_movements" ADD CONSTRAINT "point_movements_branch" CHECK ("point_movements"."branch_id" is not null or "point_movements"."type"::text = 'profile_bonus');