"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { redeemAction, registerCustomerAtCounterAction, registerPurchaseAction } from "@/app/actions/staff";
import { ActionForm } from "@/components/action-form";
import { QrScannerButton } from "@/components/qr-scanner";
import { Button, Field, FormMessage, Input } from "@/components/ui";
import type { ActionState } from "@/lib/action-result";
import { formatDni, normalizeDni } from "@/server/domain/dni";

export function PurchaseForm({ branchId, askEligible }: { branchId: string; askEligible: boolean }) {
  const [state, action, pending] = useActionState(registerPurchaseAction, null);
  // Una clave por compra: si la red falla y se reenvía, no se duplica.
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  // Campos controlados: tras un error (p. ej. DNI no registrado) no se pierde lo cargado.
  const [dni, setDni] = useState("");
  const [amount, setAmount] = useState("");
  const [eligibleAmount, setEligibleAmount] = useState("");
  const [reference, setReference] = useState("");
  const [submittedDni, setSubmittedDni] = useState("");
  // Alta hecha desde este formulario, ligada al resultado que la pidió.
  const [registered, setRegistered] = useState<{ forState: ActionState; message: string } | null>(null);
  const submitRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (state?.message) {
      setDni("");
      setAmount("");
      setEligibleAmount("");
      setReference("");
      setIdempotencyKey(crypto.randomUUID());
    }
  }, [state]);

  // Si el DNI no está registrado, se ofrece el alta ahí mismo con ese DNI ya
  // cargado. Si la caja corrige el DNI, el alta se oculta hasta volver a intentar.
  const pendingDni = normalizeDni(submittedDni);
  const askSignUp =
    state?.code === "dni_not_registered" &&
    registered?.forState !== state &&
    pendingDni !== null &&
    normalizeDni(dni) === pendingDni;
  const shown: ActionState = registered?.forState === state ? { message: registered.message } : state;

  const onRegistered = (message: string) => setRegistered({ forState: state, message });

  // Con el cliente ya dado de alta, la compra queda lista para confirmar.
  useEffect(() => {
    if (registered) submitRef.current?.focus();
  }, [registered]);

  return (
    <div className="space-y-4">
      <form action={action} onSubmit={() => setSubmittedDni(dni)} className="space-y-4">
        <input type="hidden" name="branchId" value={branchId} />
        <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
        <Field label="DNI del cliente" hint="Confirma con el cliente el nombre que aparece al registrar">
          <Input
            name="dni"
            value={dni}
            onChange={(e) => setDni(e.target.value)}
            inputMode="numeric"
            autoComplete="off"
            placeholder="30123456"
            required
            pattern="[0-9.\s]{7,10}"
          />
        </Field>
        <Field label="Importe total">
          <Input name="amount" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0,00" required />
        </Field>
        {askEligible && (
          <Field label="Importe que suma puntos" hint="El programa calcula puntos sobre este importe">
            <Input
              name="eligibleAmount"
              value={eligibleAmount}
              onChange={(e) => setEligibleAmount(e.target.value)}
              inputMode="decimal"
              placeholder="0,00"
              required
            />
          </Field>
        )}
        <Field label="Referencia (opcional)" hint="Número de ticket o factura">
          <Input name="reference" value={reference} onChange={(e) => setReference(e.target.value)} />
        </Field>
        <FormMessage state={shown} />
        <Button ref={submitRef} type="submit" disabled={pending || askSignUp} className="w-full">
          {pending ? "Registrando…" : "Registrar compra"}
        </Button>
      </form>
      {askSignUp && <QuickSignUpForm branchId={branchId} dni={pendingDni} onRegistered={onRegistered} />}
    </div>
  );
}

// Alta en el momento, cuando la compra se rechazó por DNI no registrado: el DNI
// ya viene cargado y la caja solo pide el nombre (y el email, si lo quiere dar).
function QuickSignUpForm({
  branchId,
  dni,
  onRegistered,
}: {
  branchId: string;
  dni: string;
  onRegistered: (message: string) => void;
}) {
  const [state, action, pending] = useActionState(async (prev: ActionState, formData: FormData) => {
    const result = await registerCustomerAtCounterAction(prev, formData);
    if (result?.message) onRegistered(result.message);
    return result;
  }, null);

  return (
    <form action={action} className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
      <input type="hidden" name="branchId" value={branchId} />
      <input type="hidden" name="dni" value={dni} />
      <p className="text-sm font-semibold text-neutral-800">Cliente nuevo · DNI {formatDni(dni)}</p>
      <NewCustomerFields autoFocusName />
      {state?.error && <FormMessage state={state} />}
      <Button type="submit" variant="secondary" disabled={pending} className="w-full">
        {pending ? "Registrando…" : "Registrar cliente"}
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

// Alta del cliente en la caja, antes de sumarle la primera compra.
export function CounterSignUpForm({ branchId }: { branchId: string }) {
  return (
    <ActionForm action={registerCustomerAtCounterAction} submitLabel="Registrar cliente" variant="secondary" className="space-y-4">
      <input type="hidden" name="branchId" value={branchId} />
      <Field label="DNI">
        <Input name="dni" inputMode="numeric" autoComplete="off" placeholder="30123456" required pattern="[0-9.\s]{7,10}" />
      </Field>
      <NewCustomerFields />
    </ActionForm>
  );
}

function NewCustomerFields({ autoFocusName = false }: { autoFocusName?: boolean }) {
  return (
    <>
      <Field label="Nombre y apellido">
        <Input name="fullName" autoComplete="off" required minLength={2} autoFocus={autoFocusName} />
      </Field>
      <Field label="Email (opcional)" hint="Le mandamos la bienvenida y un aviso cada vez que suma puntos">
        <Input name="email" type="email" autoComplete="off" />
      </Field>
      <label className="flex items-start gap-2 text-sm text-neutral-700">
        <input type="checkbox" name="acceptPrivacy" required className="mt-1" />
        <span>
          El cliente aceptó la{" "}
          <a href="/privacidad" target="_blank" className="font-medium text-indigo-700 underline">
            política de privacidad
          </a>{" "}
          y que usemos su DNI para registrar sus puntos.
        </span>
      </label>
    </>
  );
}
