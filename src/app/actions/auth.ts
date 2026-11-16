"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/action-result";
import { requestOrigin, safeNextPath } from "@/lib/origin";

const credentials = z.object({
  email: z.email(),
  password: z.string().min(8),
});

export async function signIn(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = credentials.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Email o contraseña inválidos." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: "Email o contraseña incorrectos." };
  redirect(safeNextPath(formData.get("next")));
}

const staffSignUpInput = credentials.extend({
  fullName: z.string().trim().min(2).max(120),
  merchantName: z.string().trim().max(120),
  branchName: z.string().trim().max(120),
});

// Alta de personal (dueño o empleado), separada de la de clientes. La cuenta de
// personal y el comercio se crean en el primer acceso, ya confirmado el email
// (ver getViewer), con los datos que quedan en los metadatos de la cuenta.
export async function signUpStaff(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = staffSignUpInput.safeParse({
    ...Object.fromEntries(formData),
    merchantName: formData.get("merchantName") ?? "",
    branchName: formData.get("branchName") ?? "",
  });
  if (!parsed.success) return { error: "Completa nombre, email y una contraseña de al menos 8 caracteres." };
  const isOwner = formData.get("role") !== "employee";
  if (isOwner && parsed.data.merchantName.length < 2) return { error: "Escribe el nombre de tu comercio." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: {
        full_name: parsed.data.fullName,
        account_type: "staff",
        merchant_name: isOwner ? parsed.data.merchantName : null,
        branch_name: isOwner ? parsed.data.branchName || "Principal" : null,
      },
      emailRedirectTo: callbackUrl(await requestOrigin(), "/inicio"),
    },
  });
  if (error) return { error: "No se pudo crear la cuenta. ¿Ya estás registrado?" };
  if (data.session) redirect("/inicio");
  return { message: "Te enviamos un correo para confirmar tu cuenta. Al confirmarla entras directo a tu panel." };
}

function callbackUrl(origin: string, next: string) {
  return `${origin}/auth/callback?next=${encodeURIComponent(next)}`;
}

// Login y alta en un paso: si la cuenta no existe, Supabase la crea.
export async function signInWithGoogle(formData: FormData) {
  const next = safeNextPath(formData.get("next"));
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: callbackUrl(await requestOrigin(), next) },
  });
  if (error || !data.url) redirect(`/login?error=google&next=${encodeURIComponent(next)}`);
  redirect(data.url);
}

// Alternativa sin Google: un link de acceso por email, sin contraseña.
export async function sendMagicLink(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.email().safeParse(formData.get("email"));
  if (!parsed.success) return { error: "Escribe un email válido." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data,
    options: { emailRedirectTo: callbackUrl(await requestOrigin(), safeNextPath(formData.get("next"))) },
  });
  if (error) return { error: "No se pudo enviar el email. Intenta de nuevo en un minuto." };
  return { message: "Te enviamos un link a tu email. Ábrelo desde este mismo dispositivo." };
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
