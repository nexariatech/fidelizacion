import { sql } from "drizzle-orm";
import type { DbOrTx } from "../db/client";

// Busca una cuenta del proveedor de autenticación por email. Es el único punto
// que lee el esquema auth de Supabase; al migrar de proveedor se cambia aquí.
export async function findAuthUserIdByEmail(db: DbOrTx, email: string): Promise<string | null> {
  const rows = await db.execute<{ id: string }>(
    sql`select id from auth.users where lower(email) = ${email.trim().toLowerCase()} limit 1`,
  );
  return rows[0]?.id ?? null;
}
