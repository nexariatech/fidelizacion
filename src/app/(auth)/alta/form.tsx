"use client";

import Link from "next/link";
import { useActionState } from "react";
import { registerCustomerAction } from "@/app/actions/customer";
import { Button, Field, FormMessage, Input } from "@/components/ui";

export function RegisterCustomerForm({ next, defaultName }: { next: string; defaultName: string }) {
  const [state, action, pending] = useActionState(registerCustomerAction, null);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <Field label="Nombre y apellido">
        <Input name="fullName" autoComplete="name" defaultValue={defaultName} required minLength={2} />
      </Field>
      <Field label="DNI" hint="Solo números, sin puntos">
        <Input name="dni" inputMode="numeric" pattern="[0-9.\s]{7,10}" placeholder="30123456" required />
      </Field>
      <label className="flex items-start gap-2 text-sm text-neutral-700">
        <input type="checkbox" name="acceptPrivacy" required className="mt-1" />
        <span>
          Acepto que los comercios adheridos usen mi DNI para identificarme y registrar mis puntos, según la{" "}
          <Link href="/privacidad" target="_blank" className="font-medium text-indigo-700 underline">
            política de privacidad
          </Link>
          .
        </span>
      </label>
      <FormMessage state={state} />
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Guardando…" : "Continuar"}
      </Button>
    </form>
  );
}
