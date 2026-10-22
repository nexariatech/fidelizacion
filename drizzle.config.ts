import "dotenv/config";
import { defineConfig } from "drizzle-kit";

// Las migraciones usan la conexión directa (session pooler), no el transaction pooler.
export default defineConfig({
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL! },
});
