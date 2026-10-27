"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signIn } from "@/app/actions/auth";
import { Button, Card, Field, FormMessage, Input } from "@/components/ui";

export default function LoginPage() {
  const [state, action, pending] = useActionState(signIn, null);
  return (
    <Card title="Iniciar sesión">
      <form action={action} className="space-y-4">
        <Field label="Email">
          <Input name="email" type="email" autoComplete="email" required />
        </Field>
        <Field label="Contraseña">
          <Input name="password" type="password" autoComplete="current-password" required minLength={8} />
        </Field>
        <FormMessage state={state} />
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Ingresando…" : "Ingresar"}
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-neutral-600">
        ¿No tienes cuenta?{" "}
        <Link href="/registro" className="font-medium text-indigo-700">
          Regístrate
        </Link>
      </p>
    </Card>
  );
}
