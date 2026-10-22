import { DomainError } from "./errors";

export type AccrualRule = {
  accrualBase: "total" | "eligible";
  pointsPerUnit: number;
  unitAmountCents: number;
};

// Puntos = floor(importe / unidad) * puntos por unidad. Sin fracciones de punto.
export function calculatePoints(
  rule: AccrualRule,
  amountCents: number,
  eligibleAmountCents: number | null | undefined,
): { baseAmountCents: number; points: number } {
  let baseAmountCents = amountCents;
  if (rule.accrualBase === "eligible") {
    if (eligibleAmountCents == null) {
      throw new DomainError("invalid_input", "El programa calcula sobre importe elegible y no se informó");
    }
    baseAmountCents = eligibleAmountCents;
  }
  return {
    baseAmountCents,
    points: Math.floor(baseAmountCents / rule.unitAmountCents) * rule.pointsPerUnit,
  };
}
