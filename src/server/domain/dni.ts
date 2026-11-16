import { z } from "zod";

// DNI argentino: 7 u 8 dígitos. Acepta puntos y espacios ("30.123.456").
export const dniSchema = z
  .string()
  .transform((v) => v.replace(/[.\s-]/g, ""))
  .pipe(z.string().regex(/^\d{7,8}$/, "DNI inválido: deben ser 7 u 8 dígitos"));

export function normalizeDni(value: string): string | null {
  const r = dniSchema.safeParse(value);
  return r.success ? r.data : null;
}

// "30123456" → "30.123.456"
export function formatDni(dni: string): string {
  return dni.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

// "Juan Pérez" → "Juan P." Lo que ve la caja al sumar puntos por DNI, para
// confirmar con el cliente sin exponer su nombre completo.
export function maskName(fullName: string): string {
  const [first, ...rest] = fullName.trim().split(/\s+/);
  const last = rest.at(-1);
  return last ? `${first} ${last[0].toUpperCase()}.` : first;
}
