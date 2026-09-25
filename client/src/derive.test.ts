import { describe, expect, it } from "vitest";
import type { BudgetData, DashboardData } from "./types";
import { deriveData, pensionRateFor, refundFor } from "./derive";

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
  it("총급여를 모르면 공제율은 저장값 그대로", () => {
    expect(deriveData(data(0, 16.5)).budget.pensionTaxCreditRate).toBe(16.5);
  });
  it("이미 계산이 맞으면 같은 객체를 돌려준다", () => {
    const once = deriveData(data(6000, 16.5));
    expect(deriveData(once)).toBe(once);
  });
});

describe("refundFor (환급 예상액)", () => {
  const now = new Date("2026-09-25T00:00:00");
  const budget = (p: Partial<BudgetData> = {}): BudgetData => ({
    monthlyNetIncome: 0, annualRaisePct: 0, expenseCategories: [], pensionAnnualContribution: 900, pensionTaxCreditRate: 13.2, ...p,
  });
  it("기본은 연금 세액공제분 (납입액 × 공제율)", () => {
    expect(refundFor(budget(), 6000, now)).toBeCloseTo(118.8, 9);
  });
  it("직접 입력이면 그 값", () => {
    expect(refundFor(budget({ refundBasis: "manual", refundManual: 150 }), 6000, now)).toBe(150);
  });
  it("추정 합계는 연금 계획분 + 연말까지 월세 + 청약·카드", () => {
    const taxPrep = {
      year: 2026, rentMonthly: 80, rentPaid: 720, subscriptionPaid: 0, creditCardUsed: 0, debitCardUsed: 0,
      policy: {
        rent: { incomeMax: 8000, lowIncomeMax: 5500, rateLowPct: 17, ratePct: 15, limit: 1000 },
        subscription: { incomeMax: 7000, limit: 300, ratePct: 40 },
        card: { thresholdPct: 25, creditRatePct: 15, debitRatePct: 30, limitLow: 300, limitHigh: 250, limitIncome: 7000 },
        marginalRatePct: 16.5, updatedAt: "2026-09-25",
      },
    };
    // 연금 900 × 13.2% = 118.8, 월세 (720 + 80 × 3) × 15% = 144
    expect(refundFor(budget({ refundBasis: "estimate", taxPrep }), 6000, now)).toBeCloseTo(118.8 + 144, 9);
  });
});
