import { describe, expect, it } from "vitest";
import type { BudgetData, TaxPrepInput } from "./types";
import { computeCardDeduction, computeRentCredit, computeSubscription, computeTaxPrep, thisYearValues } from "./tax";

const policy: TaxPrepInput["policy"] = {
  rent: { incomeMax: 8000, lowIncomeMax: 5500, rateLowPct: 17, ratePct: 15, limit: 1000 },
  subscription: { incomeMax: 7000, limit: 300, ratePct: 40 },
  card: { thresholdPct: 25, creditRatePct: 15, debitRatePct: 30, limitLow: 300, limitHigh: 250, limitIncome: 7000 },
  marginalRatePct: 16.5,
  updatedAt: "2026-09-25",
};
const input = (p: Partial<TaxPrepInput> = {}): TaxPrepInput => ({
  year: 2026,
  rentMonthly: 0,
  rentPaid: 0,
  subscriptionPaid: 0,
  creditCardUsed: 0,
  debitCardUsed: 0,
  policy,
  ...p,
});
const now = new Date("2026-09-25T00:00:00"); // 9월 → 남은 달 10·11·12월 = 3

describe("thisYearValues", () => {
  it("다른 해 값이면 올해 누적값은 0으로 본다 (월세 금액은 유지)", () => {
    const t = thisYearValues(input({ year: 2025, rentMonthly: 50, rentPaid: 400, creditCardUsed: 999 }), now);
    expect(t.rentPaid).toBe(0);
    expect(t.creditCardUsed).toBe(0);
    expect(t.rentMonthly).toBe(50);
    expect(thisYearValues(input({ rentPaid: 400 }), now).rentPaid).toBe(400);
  });
});

describe("월세 세액공제", () => {
  it("총급여 5,500 이하는 17%, 초과는 15%, 8,000 초과는 대상 아님", () => {
    const t = input({ rentPaid: 450, rentMonthly: 50 });
    expect(computeRentCredit(t, 5000, 3).credit).toBeCloseTo(450 * 0.17, 9);
    expect(computeRentCredit(t, 6000, 3).credit).toBeCloseTo(450 * 0.15, 9);
    const over = computeRentCredit(t, 9000, 3);
    expect(over.eligible).toBe(false);
    expect(over.credit).toBe(0);
  });
  it("연말까지 낼 월세를 더해 예상하고, 한도에서 자른다", () => {
    const r = computeRentCredit(input({ rentPaid: 450, rentMonthly: 50 }), 6000, 3);
    expect(r.projected).toBe(600);
    expect(r.projectedCredit).toBeCloseTo(90, 9);
    const big = computeRentCredit(input({ rentPaid: 900, rentMonthly: 100 }), 6000, 3);
    expect(big.projectedCredit).toBeCloseTo(1000 * 0.15, 9);
  });
  it("총급여를 모르면(0) 대상 아님", () => {
    expect(computeRentCredit(input({ rentPaid: 100 }), 0, 3).eligible).toBe(false);
  });
});

describe("주택청약 소득공제", () => {
  it("한도 300 안에서 40%를 소득공제하고 한계세율로 세금을 환산한다", () => {
    const s = computeSubscription(input({ subscriptionPaid: 240 }), 6000);
    expect(s.deduction).toBeCloseTo(96, 9);
    expect(s.taxSaved).toBeCloseTo(96 * 0.165, 9);
    expect(s.remaining).toBe(60);
    expect(s.extraTaxIfFilled).toBeCloseTo(60 * 0.4 * 0.165, 9);
  });
  it("한도를 넘게 넣어도 300까지만, 총급여 7,000 초과면 대상 아님", () => {
    expect(computeSubscription(input({ subscriptionPaid: 500 }), 6000).deduction).toBeCloseTo(120, 9);
    const over = computeSubscription(input({ subscriptionPaid: 240 }), 7500);
    expect(over.eligible).toBe(false);
    expect(over.deduction).toBe(0);
    expect(over.extraTaxIfFilled).toBe(0);
  });
});

describe("카드 소득공제", () => {
  it("문턱(총급여 25%)을 못 넘으면 공제 0, 남은 사용액을 알려준다", () => {
    const c = computeCardDeduction(input({ creditCardUsed: 1000, debitCardUsed: 200 }), 6000);
    expect(c.threshold).toBe(1500);
    expect(c.toThreshold).toBe(300);
    expect(c.deduction).toBe(0);
  });
  it("문턱은 신용카드 사용분부터 채우고, 넘은 체크카드는 30%", () => {
    // 문턱 1500: 신용 1000으로 먼저 채우고 체크 800 중 500이 문턱, 300이 초과 → 300 × 30% = 90
    const c = computeCardDeduction(input({ creditCardUsed: 1000, debitCardUsed: 800 }), 6000);
    expect(c.creditOver).toBe(0);
    expect(c.debitOver).toBe(300);
    expect(c.deduction).toBeCloseTo(90, 9);
    expect(c.taxSaved).toBeCloseTo(90 * 0.165, 9);
  });
  it("신용카드만으로 문턱을 넘으면 넘은 신용카드 15% + 체크카드 전액 30%", () => {
    const c = computeCardDeduction(input({ creditCardUsed: 2000, debitCardUsed: 100 }), 6000);
    expect(c.creditOver).toBe(500);
    expect(c.debitOver).toBe(100);
    expect(c.deduction).toBeCloseTo(75 + 30, 9);
  });
  it("공제 한도는 총급여 7,000 이하 300, 초과 250", () => {
    const low = computeCardDeduction(input({ debitCardUsed: 5000 }), 6000);
    expect(low.capped).toBe(true);
    expect(low.deduction).toBe(300);
    expect(computeCardDeduction(input({ debitCardUsed: 5000 }), 8000).deduction).toBe(250);
  });
});

describe("computeTaxPrep", () => {
  const budget: BudgetData = {
    monthlyNetIncome: 0,
    annualRaisePct: 0,
    expenseCategories: [],
    pensionAnnualContribution: 0,
    pensionTaxCreditRate: 16.5,
    pensionPaidThisYear: 600,
    pensionPaidYear: 2026,
  };
  it("남은 달 수와 항목별 합계를 계산한다", () => {
    const r = computeTaxPrep(budget, input({ rentPaid: 450, subscriptionPaid: 240 }), 6000, now);
    expect(r.monthsLeft).toBe(3);
    expect(r.pension.refund).toBeCloseTo(99, 9);
    expect(r.totalTaxSaved).toBeCloseTo(99 + 450 * 0.15 + 96 * 0.165, 9);
  });
  it("12월이면 남은 달 0", () => {
    expect(computeTaxPrep(budget, input(), 6000, new Date("2026-12-10T00:00:00")).monthsLeft).toBe(0);
  });
});
