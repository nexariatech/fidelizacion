import { DomainError, type DomainErrorCode } from "@/server/domain/errors";

export type ActionState = { error?: string; message?: string } | null;

const messages: Record<DomainErrorCode, string> = {
  invalid_input: "Revisa los datos ingresados.",
  not_found: "No se encontró lo que buscabas o no tienes acceso.",
  forbidden: "No tienes permiso para esta acción.",
  merchant_suspended: "El comercio está suspendido.",
  program_inactive: "El programa de puntos del comercio está inactivo.",
  idempotency_conflict: "Esta operación ya se registró con otros datos. Recarga la página.",
  already_voided: "La compra ya estaba anulada.",
  points_already_spent: "No se puede anular: el cliente ya usó esos puntos.",
  insufficient_points: "Puntos insuficientes.",
  reward_inactive: "La recompensa no está disponible.",
  authorization_invalid: "Código inválido, vencido o ya usado.",
  already_cancelled: "El canje ya estaba cancelado.",
};

// Traduce errores de negocio a mensajes para el usuario; el resto se relanza.
export function toActionError(error: unknown): { error: string } {
  if (error instanceof DomainError) {
    const custom = error.message !== error.code && error.code !== "invalid_input" ? error.message : null;
    return { error: custom ?? messages[error.code] };
  }
  throw error;
}
