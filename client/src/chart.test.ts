import { describe, expect, it } from "vitest";
import { niceTicks, valueAt } from "./chart";
import { addMonths, growBalances, monthsToReach, monthsUntil, planHousing, reachDate } from "./housing";

describe("niceTicks", () => {
  it("범위를 덮고 오름차순이며 간격이 일정하다", () => {
    for (const [min, max] of [[0, 100], [3, 97], [1234, 98765], [-50, 20], [0.1, 0.9]]) {
      const t = niceTicks(min, max, 4);
      expect(t[0]).toBeLessThanOrEqual(min);
      expect(t[t.length - 1]).toBeGreaterThanOrEqual(max);
      const step = t[1] - t[0];
      t.slice(1).forEach((v, i) => expect(v - t[i]).toBeCloseTo(step, 9));
    }
  });
  it("눈금 간격은 1·2·5 × 10^n 이다", () => {
    const t = niceTicks(0, 87000, 4);
    expect([1, 2, 5]).toContain(Number((t[1] - t[0]).toExponential(0).split("e")[0]));
  });
  it("최소와 최대가 같거나 값이 이상하면 죽지 않는다", () => {
    expect(niceTicks(5, 5)).toEqual([5]);
    expect(niceTicks(NaN, 1)).toEqual([0]);
  });
});

describe("집 마련 예상 경로", () => {
  const g = { risk: 100, safe: 100, cash: 50, monthlyAdd: 10, contribRiskPct: 50, riskRatePct: 12, safeRatePct: 0, withReturns: false };
  it("수익률을 빼면 매달 저축액만큼 직선으로 는다", () => {
    const b = growBalances(g, 3);
    expect(b).toEqual([250, 260, 270, 280]);
  });
  it("수익률을 넣으면 위험자산에 월 복리가 붙고 현금은 그대로", () => {
    const b = growBalances({ ...g, monthlyAdd: 0, withReturns: true }, 12);
    expect(b[12]).toBeCloseTo(100 * 1.12 + 100 + 50, 6); // 월 환산 12번 = 연 12%
  });
  it("목표에 닿는 달: 이미 넘으면 0, 저축이 없으면 null", () => {
    expect(monthsToReach(g, 275)).toBe(3);
    expect(monthsToReach(g, 200)).toBe(0);
    expect(monthsToReach({ ...g, monthlyAdd: 0 }, 1000)).toBeNull();
  });
  it("남은 달·달 더하기", () => {
    const now = new Date("2026-09-25T00:00:00");
    expect(monthsUntil("2030-06-30", now)).toBe(45);
    expect(monthsUntil("", now)).toBe(0);
    expect(addMonths(now, 4).getMonth()).toBe(0); // 2027년 1월
  });
  it("planHousing: '집자금' 행만 모으고 매수일까지 달마다 경로를 만든다", () => {
    const now = new Date("2026-09-25T00:00:00");
    const rows = [
      { id: "1", account: "A", item: "x", category: "risk" as const, amount: 100, housingEligible: true },
      { id: "2", account: "B", item: "보증금", category: "cash" as const, amount: 50, housingEligible: true },
      { id: "3", account: "IRP", item: "y", category: "risk" as const, amount: 999, housingEligible: false },
    ];
    const budget = { monthlyNetIncome: 30, annualRaisePct: 0, expenseCategories: [{ id: "e", name: "생활", amount: 20 }], pensionAnnualContribution: 0, pensionTaxCreditRate: 16.5 };
    const sim = { riskRate: 12, safeRate: 3, contributionRiskRatio: 100 };
    const flat = planHousing(rows, budget, sim, "2027-01-01", now, false);
    expect(flat.current).toBe(150);
    expect(flat.monthsLeft).toBe(4);
    expect(flat.extra).toBe(40); // 월 10 × 4달
    expect(flat.series).toHaveLength(5);
    const grow = planHousing(rows, budget, sim, "2027-01-01", now, true);
    expect(grow.atPurchase).toBeGreaterThan(flat.atPurchase);
    expect(reachDate(flat, 170, now)?.getMonth()).toBe(10); // 2달 뒤 = 11월
    expect(reachDate(flat, 100, now)).toBe(now);
  });
});

describe("valueAt", () => {
  const pts = [
    { t: 100, y: 10 },
    { t: 0, y: 0 },
    { t: 300, y: 10 },
  ];
  it("점 위에서는 그 값, 사이에서는 직선으로 이어 읽는다 (입력 순서와 무관)", () => {
    expect(valueAt(pts, 0)).toBe(0);
    expect(valueAt(pts, 50)).toBeCloseTo(5, 9);
    expect(valueAt(pts, 200)).toBeCloseTo(10, 9);
    expect(valueAt(pts, 300)).toBe(10);
  });
  it("선 밖이나 빈 선은 null, 점 하나면 그 시각에서만 값", () => {
    expect(valueAt(pts, -1)).toBeNull();
    expect(valueAt(pts, 301)).toBeNull();
    expect(valueAt([], 5)).toBeNull();
    expect(valueAt([{ t: 5, y: 7 }], 5)).toBe(7);
    expect(valueAt([{ t: 5, y: 7 }], 6)).toBeNull();
  });
});
