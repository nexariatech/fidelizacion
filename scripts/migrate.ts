// Uso: pnpm db:migrate
// Aplica las migraciones de ./drizzle y muestra el error completo si falla.
import "dotenv/config";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDb } from "../src/server/db/client";

async function main() {
  const url = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("Falta DIRECT_DATABASE_URL (o DATABASE_URL) en .env");
  const host = new URL(url).host;
  console.log(`Migrando en ${host}…`);
  const { db, sqlClient } = createDb(url);
  try {
    await migrate(db, { migrationsFolder: "./drizzle" });
    console.log("Migraciones aplicadas.");
  } finally {
    await sqlClient.end();
  }
}

main().catch((error) => {
  console.error("Error al migrar:", error?.cause ?? error);
  process.exit(1);
});
