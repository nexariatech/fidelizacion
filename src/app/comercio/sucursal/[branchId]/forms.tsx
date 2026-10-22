"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { redeemAction, registerPurchaseAction } from "@/app/actions/staff";
import { QrScannerButton } from "@/components/qr-scanner";
import { Button, Field, FormMessage, Input } from "@/components/ui";

export function PurchaseForm({ branchId, askEligible }: { branchId: string; askEligible: boolean }) {
  const [state, action, pending] = useActionState(registerPurchaseAction, null);
  const [qrToken, setQrToken] = useState("");
  // Una clave por compra: si la red falla y se reenvía, no se duplica.
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.message) {
      formRef.current?.reset();
      setQrToken("");
      setIdempotencyKey(crypto.randomUUID());
    }
  }, [state]);

  return (
    <form ref={formRef} action={action} className="space-y-4">
      <input type="hidden" name="branchId" value={branchId} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <Field label="QR del cliente">
        <div className="space-y-2">
          <QrScannerButton onResult={setQrToken} label="Escanear QR del cliente" />
          <Input
            name="qrToken"
            value={qrToken}
            onChange={(e) => setQrToken(e.target.value)}
            placeholder="o pega el código del QR"
            required
          />
        </div>
      </Field>
      <Field label="Importe total">
        <Input name="amount" inputMode="decimal" placeholder="0,00" required />
      </Field>
      {askEligible && (
        <Field label="Importe que suma puntos" hint="El programa calcula puntos sobre este importe">
          <Input name="eligibleAmount" inputMode="decimal" placeholder="0,00" required />
        </Field>
      )}
      <Field label="Referencia (opcional)" hint="Número de ticket o factura">
        <Input name="reference" />
      </Field>
      <FormMessage state={state} />
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Registrando…" : "Registrar compra"}
      </Button>
    </form>
  );
}

export function RedeemForm({ branchId }: { branchId: string }) {
  const [state, action, pending] = useActionState(redeemAction, null);
  const [code, setCode] = useState("");

  useEffect(() => {
    if (state?.message) setCode("");
  }, [state]);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="branchId" value={branchId} />
      <p className="text-sm text-neutral-600">
        El cliente genera el código desde su cuenta. Vence a los 120 segundos y sirve una sola vez.
      </p>
      <QrScannerButton onResult={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))} label="Escanear código" />
      <Field label="Código de 6 dígitos">
        <Input
          name="code"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric"
          pattern="\d{6}"
          className="font-mono text-2xl tracking-widest"
          required
        />
      </Field>
      <FormMessage state={state} />
      <Button type="submit" disabled={pending || code.length !== 6} className="w-full">
        {pending ? "Validando…" : "Validar y canjear"}
      </Button>
    </form>
  );
}
