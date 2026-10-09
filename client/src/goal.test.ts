import { describe, expect, it } from "vitest";
import type { GrowthInput, HousingPlan } from "./housing";
import { growBalances } from "./housing";
import { extraMonthlyNeeded, goalStatus } from "./goal";

const d = (iso: string) => new Date(`${iso}T00:00:00`);
const now = d("2026-10-09");

function planOf(growth: Partial<GrowthInput>, monthsLeft: number): HousingPlan {
  const g: GrowthInput = { risk: 0, safe: 0, cash: 1000, monthlyAdd: 100, contribRiskPct: 50, riskRatePct: 8, safeRatePct: 3, withReturns: false, ...growth };
  const bal = growBalances(g, monthsLeft);
  return { withReturns: g.withReturns, current: bal[0], monthly: g.monthlyAdd, monthsLeft, atPurchase: bal[bal.length - 1], extra: bal[bal.length - 1] - bal[0], series: [], growth: g };
}

describe("extraMonthlyNeeded", () => {
  it("수익률이 없으면 부족분 ÷ 남은 달", () => {
    const plan = planOf({}, 10); // 1000 + 100×10 = 2000
    expect(extraMonthlyNeeded(plan, 2500)).toBeCloseTo(50, 6);
  });
  it("이미 맞으면 0, 예정일이 없거나 지났으면 null", () => {
    expect(extraMonthlyNeeded(planOf({}, 10), 1800)).toBe(0);
    expect(extraMonthlyNeeded(planOf({}, 0), 5000)).toBeNull();
  });
  it("수익률을 반영해도 그만큼 더 모으면 정확히 목표에 닿는다", () => {
    const plan = planOf({ withReturns: true }, 24);
    const need = plan.atPurchase + 3000;
    const extra = extraMonthlyNeeded(plan, need)!;
    expect(extra).toBeGreaterThan(0);
    const fixed = planOf({ withReturns: true, monthlyAdd: 100 + extra }, 24);
    expect(fixed.atPurchase).toBeCloseTo(need, 4);
  });
});

describe("goalStatus", () => {
  const purchase = d("2027-08-09"); // 10개월 뒤
  it("이미 넘었으면 reached", () => {
    const s = goalStatus(planOf({}, 10), 900, purchase, now);
    expect(s.state).toBe("reached");
    expect(s.extraMonthly).toBe(0);
  });
  it("예정일 전에 닿으면 ontrack, 며칠 빠른지 계산", () => {
    // 1000 + 100×m ≥ 1500 → 5개월째
    const s = goalStatus(planOf({}, 10), 1500, purchase, now);
    expect(s.state).toBe("ontrack");
    expect(s.monthsEarly).toBe(5);
    expect(s.gapAtPurchase).toBeCloseTo(500, 6);
  });
  it("예정일 뒤에 닿으면 behind, 더 모아야 할 월 금액 제시", () => {
    // 2000(예정일) < 2500 → 15개월째에 닿음 = 5개월 늦음
    const s = goalStatus(planOf({}, 10), 2500, purchase, now);
    expect(s.state).toBe("behind");
    expect(s.monthsEarly).toBe(-5);
    expect(s.gapAtPurchase).toBeCloseTo(-500, 6);
    expect(s.extraMonthly).toBeCloseTo(50, 6);
  });
  it("월 저축이 0이라 영영 못 닿으면 unreachable", () => {
    const s = goalStatus(planOf({ monthlyAdd: 0 }, 10), 5000, purchase, now);
    expect(s.state).toBe("unreachable");
    expect(s.reachAt).toBeNull();
  });
  it("예정일이 없으면 시점 비교 없이 도달만 알려준다", () => {
    const s = goalStatus(planOf({}, 0), 1500, null, now);
    expect(s.state).toBe("ontrack");
    expect(s.monthsEarly).toBeNull();
    expect(s.gapAtPurchase).toBeNull();
    expect(s.extraMonthly).toBeNull();
  });
});
