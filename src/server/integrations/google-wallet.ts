import { importPKCS8, SignJWT } from "jose";

// Tarjetas de fidelidad de Google Wallet: una clase por comercio y un objeto
// por membresía (cliente en ese comercio). La tarjeta muestra el mismo QR
// personal del cliente y su saldo; no reemplaza la autorización de canje.

export type GoogleWalletConfig = {
  issuerId: string;
  serviceAccountEmail: string;
  privateKey: string;
  origin: string;
};

export function googleWalletConfig(origin: string): GoogleWalletConfig | null {
  const issuerId = process.env.GOOGLE_WALLET_ISSUER_ID;
  const serviceAccountEmail = process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_WALLET_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!issuerId || !serviceAccountEmail || !privateKey) return null;
  return { issuerId, serviceAccountEmail, privateKey, origin };
}

// Los ids de Wallet solo aceptan letras, números, '.', '_' y '-'.
export function classId(cfg: Pick<GoogleWalletConfig, "issuerId">, merchantId: string) {
  return `${cfg.issuerId}.merchant_${merchantId.replace(/-/g, "")}`;
}

export function objectId(cfg: Pick<GoogleWalletConfig, "issuerId">, membershipId: string) {
  return `${cfg.issuerId}.membership_${membershipId.replace(/-/g, "")}`;
}

export type WalletCard = {
  merchantId: string;
  merchantName: string;
  programName: string;
  membershipId: string;
  customerName: string;
  balance: number;
};

// Google descarga el logo, así que debe ser una URL pública (no localhost).
export function loyaltyClass(cfg: GoogleWalletConfig, card: Pick<WalletCard, "merchantId" | "merchantName" | "programName">) {
  return {
    id: classId(cfg, card.merchantId),
    issuerName: card.merchantName,
    programName: card.programName,
    programLogo: {
      sourceUri: { uri: process.env.GOOGLE_WALLET_LOGO_URL ?? `${cfg.origin}/wallet-logo.png` },
      contentDescription: { defaultValue: { language: "es", value: card.merchantName } },
    },
    hexBackgroundColor: "#4f46e5",
    reviewStatus: "UNDER_REVIEW",
  };
}

// Sin código de barras: los puntos se suman con el DNI y el canje usa un código
// temporal que se genera en la app. Un PUT con messages vacío borra avisos viejos.
export function loyaltyObject(cfg: GoogleWalletConfig, card: WalletCard) {
  const links = [{ uri: `${cfg.origin}/cliente/${card.merchantId}`, description: "Ver recompensas y canjear", id: "detalle" }];
  return {
    id: objectId(cfg, card.membershipId),
    classId: classId(cfg, card.merchantId),
    state: "ACTIVE",
    accountName: card.customerName,
    accountId: card.membershipId.slice(0, 8).toUpperCase(),
    loyaltyPoints: { label: "Puntos", balance: { int: card.balance } },
    messages: [],
    // Google rechaza enlaces que no sean https (por ejemplo localhost).
    ...(cfg.origin.startsWith("https://") && { linksModuleData: { uris: links } }),
  };
}

// Enlace "Agregar a Google Wallet". La clase y la tarjeta ya existen (ver
// ensureWalletCard), así el JWT solo referencia la tarjeta por id.
export async function saveToWalletUrl(cfg: GoogleWalletConfig, membershipId: string): Promise<string> {
  const key = await importPKCS8(cfg.privateKey, "RS256");
  const jwt = await new SignJWT({
    typ: "savetowallet",
    payload: { loyaltyObjects: [{ id: objectId(cfg, membershipId) }] },
  })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(cfg.serviceAccountEmail)
    .setAudience("google")
    .setIssuedAt()
    .sign(key);
  return `https://pay.google.com/gp/v/save/${jwt}`;
}

const API = "https://walletobjects.googleapis.com/walletobjects/v1";
let cachedToken: { value: string; expiresAt: number } | undefined;

async function accessToken(cfg: GoogleWalletConfig): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const key = await importPKCS8(cfg.privateKey, "RS256");
  const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/wallet_object.issuer" })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(cfg.serviceAccountEmail)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  if (!res.ok) throw new Error(`Google OAuth ${res.status}: ${await res.text()}`);
  const body = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
  return body.access_token;
}

// Actualiza la tarjeta si el cliente la guardó. Un 404 significa que nunca la
// agregó a Wallet y se ignora.
export async function patchWalletObject(
  cfg: GoogleWalletConfig,
  membershipId: string,
  patch: { balance?: number },
) {
  const body: Record<string, unknown> = {};
  if (patch.balance !== undefined) body.loyaltyPoints = { label: "Puntos", balance: { int: patch.balance } };
  const res = await fetch(`${API}/loyaltyObject/${encodeURIComponent(objectId(cfg, membershipId))}`, {
    method: "PATCH",
    headers: { authorization: `Bearer ${await accessToken(cfg)}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status === 404) return false;
  if (!res.ok) throw new Error(`Google Wallet ${res.status}: ${await res.text()}`);
  return true;
}

export class GoogleWalletError extends Error {}

async function walletRequest(cfg: GoogleWalletConfig, method: string, path: string, body?: unknown) {
  const res = await fetch(`${API}/${path}`, {
    method,
    headers: { authorization: `Bearer ${await accessToken(cfg)}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 404 && method === "GET") return null;
  if (!res.ok) {
    const detail = await res.text();
    let message = detail;
    try {
      message = (JSON.parse(detail) as { error?: { message?: string } }).error?.message ?? detail;
    } catch {}
    throw new GoogleWalletError(`Google Wallet rechazó ${method} ${path.split("/")[0]} (${res.status}): ${message}`);
  }
  return res.json();
}

// Reescribe la tarjeta solo si el cliente ya la tiene; no crea tarjetas nuevas.
export async function updateWalletCardIfExists(cfg: GoogleWalletConfig, card: WalletCard) {
  const obj = loyaltyObject(cfg, card);
  const path = `loyaltyObject/${encodeURIComponent(obj.id)}`;
  if (!(await walletRequest(cfg, "GET", path))) return false;
  await walletRequest(cfg, "PUT", path, obj);
  return true;
}

// Crea la clase del comercio y la tarjeta del cliente si no existen, o
// actualiza la tarjeta. Los errores de Google llegan con su mensaje real.
export async function ensureWalletCard(cfg: GoogleWalletConfig, card: WalletCard) {
  const cls = loyaltyClass(cfg, card);
  if (!(await walletRequest(cfg, "GET", `loyaltyClass/${encodeURIComponent(cls.id)}`))) {
    await walletRequest(cfg, "POST", "loyaltyClass", cls);
  }
  const obj = loyaltyObject(cfg, card);
  if (await walletRequest(cfg, "GET", `loyaltyObject/${encodeURIComponent(obj.id)}`)) {
    await walletRequest(cfg, "PUT", `loyaltyObject/${encodeURIComponent(obj.id)}`, obj);
  } else {
    await walletRequest(cfg, "POST", "loyaltyObject", obj);
  }
}

// Mensaje en la tarjeta con notificación en el teléfono (TEXT_AND_NOTIFY).
// Google limita las notificaciones por tarjeta y por día; pasado el límite el
// mensaje queda en la tarjeta sin sonar. Devuelve false si el cliente no la guardó.
export async function notifyWalletCard(cfg: GoogleWalletConfig, membershipId: string, message: { id: string; header: string; body: string }) {
  const path = `loyaltyObject/${encodeURIComponent(objectId(cfg, membershipId))}`;
  if (!(await walletRequest(cfg, "GET", path))) return false;
  await walletRequest(cfg, "POST", `${path}/addMessage`, { message: { ...message, messageType: "TEXT_AND_NOTIFY" } });
  return true;
}
