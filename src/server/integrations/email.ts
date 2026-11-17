import nodemailer from "nodemailer";

// Envío de emails transaccionales, por una de dos salidas:
// - SMTP (p. ej. Gmail con contraseña de aplicación): SMTP_HOST, SMTP_USER,
//   SMTP_PASSWORD y SMTP_PORT (465 por defecto). Tiene prioridad.
// - Resend (https://resend.com) por HTTP, sin SDK: RESEND_API_KEY y EMAIL_FROM.
// EMAIL_FROM es el remitente; con SMTP, si falta, se usa SMTP_USER. Gmail
// reescribe cualquier remitente que no sea la propia cuenta. Sin configuración
// no envía nada.
type Message = { to: string; subject: string; text: string };

function smtpConfig() {
  const { SMTP_HOST: host, SMTP_USER: user, SMTP_PASSWORD: pass } = process.env;
  if (!host || !user || !pass) return null;
  const port = Number(process.env.SMTP_PORT || 465);
  return { host, port, secure: port === 465, auth: { user, pass } };
}

export function isEmailEnabled() {
  return Boolean(smtpConfig() || (process.env.RESEND_API_KEY && process.env.EMAIL_FROM));
}

export async function sendEmail(message: Message) {
  const smtp = smtpConfig();
  if (smtp) {
    const from = process.env.EMAIL_FROM || smtp.auth.user;
    await nodemailer.createTransport(smtp).sendMail({ from, ...message });
    return true;
  }
  if (!isEmailEnabled()) return false;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, ...message }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
  return true;
}
