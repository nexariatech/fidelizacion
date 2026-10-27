const money = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" });
const dateTime = new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" });

export function formatMoney(cents: number) {
  return money.format(cents / 100);
}

export function formatDate(date: Date | string) {
  return dateTime.format(new Date(date));
}

// Acepta "1234", "1234,50", "1.234,50" o "1234.50". Devuelve centavos o null.
export function parseMoneyToCents(raw: string): number | null {
  let value = raw.trim().replace(/\s|\$/g, "");
  if (!value) return null;
  if (value.includes(",")) value = value.replace(/\./g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return null;
  return Math.round(Number(value) * 100);
}

export const movementLabels: Record<string, string> = {
  purchase: "Compra",
  purchase_void: "Compra anulada",
  redemption: "Canje",
  redemption_cancel: "Canje cancelado",
  profile_bonus: "Regalo por completar tus datos",
};
