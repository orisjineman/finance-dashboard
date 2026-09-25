import { describe, expect, it } from "vitest";
import type { DashboardData } from "./types";
import { deriveData, pensionRateFor } from "./derive";

describe("pensionRateFor", () => {
  it("총급여 5,500 이하 16.5%, 초과 13.2%, 모르면 null", () => {
    expect(pensionRateFor(5500)).toBe(16.5);
    expect(pensionRateFor(5501)).toBe(13.2);
    expect(pensionRateFor(0)).toBeNull();
  });
  it("기준 숫자를 바꾸면 그 값을 쓴다", () => {
    expect(pensionRateFor(6000, { lowIncomeMax: 7000, rateLowPct: 20, ratePct: 10 })).toBe(20);
  });
});

describe("deriveData", () => {
  const data = (income: number, rate: number) =>
    ({ home: { currentIncome: income }, budget: { pensionTaxCreditRate: rate } }) as unknown as DashboardData;
  it("총급여로 세액공제율을 맞춘다", () => {
    expect(deriveData(data(6000, 16.5)).budget.pensionTaxCreditRate).toBe(13.2);
    expect(deriveData(data(5000, 13.2)).budget.pensionTaxCreditRate).toBe(16.5);
  });
  it("이미 맞거나 총급여를 모르면 그대로 (같은 객체)", () => {
    const a = data(6000, 13.2);
    expect(deriveData(a)).toBe(a);
    const b = data(0, 16.5);
    expect(deriveData(b)).toBe(b);
  });
});
