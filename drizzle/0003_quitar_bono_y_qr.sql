ALTER TABLE "customers" DROP CONSTRAINT "customers_qr_token_unique";--> statement-breakpoint
ALTER TABLE "loyalty_programs" DROP CONSTRAINT "loyalty_programs_profile_bonus";--> statement-breakpoint
ALTER TABLE "customers" DROP COLUMN "profile_completed_at";--> statement-breakpoint
ALTER TABLE "customers" DROP COLUMN "qr_token";--> statement-breakpoint
ALTER TABLE "loyalty_programs" DROP COLUMN "profile_bonus_points";--> statement-breakpoint
ALTER TABLE "program_memberships" DROP COLUMN "profile_bonus_granted_at";