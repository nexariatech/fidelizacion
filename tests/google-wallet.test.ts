import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { decodeJwt, exportPKCS8, generateKeyPair, jwtVerify, type CryptoKey } from "jose";
import {
  ensureWalletCard,
  loyaltyObject,
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
  pendingProfileBonus: 0,
};

describe("Google Wallet", () => {
  it("crea clase y tarjeta con QR y saldo, y el enlace solo referencia la tarjeta", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "t", expires_in: 3600 })))
      .mockResolvedValueOnce(new Response("", { status: 404 }))
      .mockResolvedValueOnce(new Response("{}"))
      .mockResolvedValueOnce(new Response("", { status: 404 }))
      .mockResolvedValueOnce(new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);

    await ensureWalletCard(cfg, card);
    const posts = fetchMock.mock.calls.filter(([, init]) => init?.method === "POST" && !String(init.body).includes("grant_type"));
    const [cls, obj] = posts.map(([, init]) => JSON.parse(init.body));
    expect(cls.id).toBe("3388000000012345678.merchant_6f1c2a8e11114c4c9a9a000000000001");
    expect(obj).toMatchObject({
      id: objectId(cfg, card.membershipId),
      barcode: { type: "QR_CODE", value: "token-opaco" },
      loyaltyPoints: { balance: { int: 42 } },
    });

    const url = await saveToWalletUrl(cfg, card.membershipId);
    const jwt = url.split("/").pop()!;
    await jwtVerify(jwt, publicKey, { audience: "google", issuer: cfg.serviceAccountEmail });
    expect((decodeJwt(jwt) as { payload: unknown }).payload).toEqual({
      loyaltyObjects: [{ id: objectId(cfg, card.membershipId) }],
    });
  });

  it("pide completar los datos con un aviso y un enlace mientras falten", () => {
    const pending = loyaltyObject(cfg, { ...card, pendingProfileBonus: 50 });
    expect(pending.messages).toEqual([expect.objectContaining({ id: "completar-datos", header: "Ganá 50 puntos" })]);
    expect(pending.linksModuleData?.uris.map((u) => u.uri)).toContain("https://fidelizacion.example/cliente/perfil");

    const done = loyaltyObject(cfg, card);
    expect(done.messages).toEqual([]);
    expect(done.linksModuleData?.uris.map((u) => u.id)).toEqual(["detalle"]);
  });

  it("muestra el motivo cuando Google rechaza la tarjeta", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response("", { status: 404 }))
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ error: { message: "Invalid programLogo" } }), { status: 400 }),
        ),
    );
    await expect(ensureWalletCard(cfg, card)).rejects.toThrow("Invalid programLogo");
  });

  it("actualizar una tarjeta que el cliente nunca guardó no es un error", async () => {
    // El token de acceso puede venir del caché de una prueba anterior.
    const fetchMock = vi.fn(async (url: string) =>
      url.includes("oauth2")
        ? new Response(JSON.stringify({ access_token: "t", expires_in: 3600 }))
        : new Response("not found", { status: 404 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    expect(await patchWalletObject(cfg, card.membershipId, { balance: 10 })).toBe(false);
    const [url, init] = fetchMock.mock.calls.find(([u]) => u.includes("loyaltyObject"))! as unknown as [string, RequestInit];
    expect(url).toContain(encodeURIComponent(objectId(cfg, card.membershipId)));
    expect(JSON.parse(String(init.body))).toEqual({ loyaltyPoints: { label: "Puntos", balance: { int: 10 } } });
  });
});
