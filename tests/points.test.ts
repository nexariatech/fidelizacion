import { describe, expect, it } from "vitest";
import { calculatePoints } from "@/server/domain/points";

const rule = { accrualBase: "total" as const, pointsPerUnit: 1, unitAmountCents: 10_000 };

describe("calculatePoints", () => {
  it("redondea hacia abajo", () => {
    expect(calculatePoints(rule, 25_999, null).points).toBe(2);
    expect(calculatePoints(rule, 9_999, null).points).toBe(0);
  });

  it("usa el importe elegible cuando el programa lo indica", () => {
    const eligible = { ...rule, accrualBase: "eligible" as const };
    expect(calculatePoints(eligible, 50_000, 20_000).points).toBe(2);
    expect(() => calculatePoints(eligible, 50_000, null)).toThrow("importe elegible");
  });

  it("multiplica por los puntos por unidad", () => {
    expect(calculatePoints({ ...rule, pointsPerUnit: 5 }, 30_000, null).points).toBe(15);
  });
});
