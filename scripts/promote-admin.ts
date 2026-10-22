// Uso: pnpm admin:promote persona@email.com
// Marca como administrador de plataforma a una cuenta ya registrada.
import "dotenv/config";
import { createDb } from "../src/server/db/client";
import { staffUsers } from "../src/server/db/schema";
import { findAuthUserIdByEmail } from "../src/server/auth/identity";

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) throw new Error("Indica el email: pnpm admin:promote persona@email.com");
  const { db, sqlClient } = createDb(process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL!);
  try {
    const authUserId = await findAuthUserIdByEmail(db, email);
    if (!authUserId) throw new Error(`No existe una cuenta registrada con ${email}`);
    await db
      .insert(staffUsers)
      .values({ authUserId, email, fullName: email.split("@")[0], isPlatformAdmin: true })
      .onConflictDoUpdate({ target: staffUsers.authUserId, set: { isPlatformAdmin: true } });
    console.log(`${email} ahora es administrador de plataforma.`);
  } finally {
    await sqlClient.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
