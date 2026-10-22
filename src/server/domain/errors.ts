export type DomainErrorCode =
  | "invalid_input"
  | "not_found"
  | "forbidden"
  | "merchant_suspended"
  | "program_inactive"
  | "idempotency_conflict"
  | "already_voided"
  | "points_already_spent"
  | "insufficient_points"
  | "reward_inactive"
  | "authorization_invalid"
  | "already_cancelled";

export class DomainError extends Error {
  constructor(
    public readonly code: DomainErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "DomainError";
  }
}
