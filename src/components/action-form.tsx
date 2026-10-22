"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import type { ActionState } from "@/lib/action-result";
import { Button, FormMessage } from "./ui";

type Props = {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  submitLabel: string;
  variant?: "primary" | "secondary" | "danger";
  className?: string;
  children: ReactNode;
};

// Formulario genérico para server actions: muestra el resultado y se limpia al tener éxito.
export function ActionForm({ action, submitLabel, variant = "primary", className = "space-y-3", children }: Props) {
  const [state, formAction, pending] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.message) ref.current?.reset();
  }, [state]);

  return (
    <form ref={ref} action={formAction} className={className}>
      {children}
      <FormMessage state={state} />
      <Button type="submit" variant={variant} disabled={pending}>
        {pending ? "Guardando…" : submitLabel}
      </Button>
    </form>
  );
}
