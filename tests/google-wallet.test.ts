import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { decodeJwt, exportPKCS8, generateKeyPair, jwtVerify, type CryptoKey } from "jose";
import {
  objectId,
  patchWalletObject,
  saveToWalletUrl,
  type GoogleWalletConfig,
} from "@/server/integrations/google-wallet";

let cfg: GoogleWalletConfig;
let publicKey: CryptoKey;

beforeAll(async () => {
  const pair = await generateKeyPair("RS256", { extractable: true });
  publicKey = pair.publicKey;
  cfg = {
    issuerId: "3388000000012345678",
    serviceAccountEmail: "wallet@demo.iam.gserviceaccount.com",
    privateKey: await exportPKCS8(pair.privateKey),
    origin: "https://fidelizacion.example",
  };
});

afterEach(() => vi.unstubAllGlobals());

const card = {
  merchantId: "6f1c2a8e-1111-4c4c-9a9a-000000000001",
  merchantName: "Café Central",
  programName: "Club Café",
  membershipId: "aa11bb22-3333-4444-5555-666677778888",
  customerName: "Ana",
  qrToken: "token-opaco",
  balance: 42,
};

describe("Google Wallet", () => {
  it("el enlace lleva un JWT firmado con clase y tarjeta con QR y saldo", async () => {
    const url = await saveToWalletUrl(cfg, card);
    expect(url.startsWith("https://pay.google.com/gp/v/save/")).toBe(true);
    const jwt = url.split("/").pop()!;
    await jwtVerify(jwt, publicKey, { audience: "google", issuer: cfg.serviceAccountEmail });

    const { payload } = decodeJwt(jwt) as unknown as {
      payload: { loyaltyClasses: { id: string }[]; loyaltyObjects: Record<string, unknown>[] };
    };
    expect(payload.loyaltyClasses[0].id).toBe("3388000000012345678.merchant_6f1c2a8e11114c4c9a9a000000000001");
    expect(payload.loyaltyObjects[0]).toMatchObject({
      id: objectId(cfg, card.membershipId),
      barcode: { type: "QR_CODE", value: "token-opaco" },
      loyaltyPoints: { balance: { int: 42 } },
    });
  });

  it("actualizar una tarjeta que el cliente nunca guardó no es un error", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "t", expires_in: 3600 })))
      .mockResolvedValueOnce(new Response("not found", { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);

    expect(await patchWalletObject(cfg, card.membershipId, { balance: 10 })).toBe(false);
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toContain(encodeURIComponent(objectId(cfg, card.membershipId)));
    expect(JSON.parse(init.body)).toEqual({ loyaltyPoints: { label: "Puntos", balance: { int: 10 } } });
  });
});
