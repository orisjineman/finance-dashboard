import { describe, expect, it } from "vitest";
import type { AssetRow, BudgetData, HistoryEntry, IncomeEntry, RetirementInput, SimulationAssumptions } from "./types";
import { expectedAnnualIncome, yearIncome } from "./income";
import { comprehensiveStatus, isaStatus, placementTips } from "./taxplan";
import { emergencyStatus } from "./emergency";
import { housingSensitivity, simulationSensitivity } from "./sensitivity";
import { DEFAULT_RETIREMENT, planRetirement } from "./retirement";
import { accountJumps, buildReport, reportText } from "./report";
import { planHousing } from "./housing";
import { computeAlerts } from "./alerts";
import { defaultData } from "../../server/src/defaults";

const row = (id: string, account: string, category: AssetRow["category"], amount: number, extra: Partial<AssetRow> = {}): AssetRow => ({ id, account, item: id, category, amount, housingEligible: true, ...extra });
const inc = (date: string, account: string, kind: IncomeEntry["kind"], amount: number): IncomeEntry => ({ id: `${date}${account}${amount}`, date, account, kind, amount });
const budget = (p: Partial<BudgetData> = {}): BudgetData => ({ ...defaultData().budget, ...p });

describe("배당·이자 수입", () => {
  const log = [inc("2026-01-15", "ISA", "dividend", 10), inc("2026-03-10", "CMA", "interest", 5), inc("2026-03-20", "ISA", "dividend", 7), inc("2025-12-01", "ISA", "dividend", 99)];
  it("올해 기록만 월별·종류별·계좌별로 합친다", () => {
    const s = yearIncome(log, 2026);
    expect(s.total).toBe(22);
    expect(s.dividend).toBe(17);
    expect(s.interest).toBe(5);
    expect(s.byMonth[0]).toBe(10);
    expect(s.byMonth[2]).toBe(12);
    expect(s.byAccount[0]).toEqual({ account: "ISA", amount: 17 });
  });
  it("예상 연 수입은 잔액×수익률이고 수익률 없는 상품은 세어 알려준다", () => {
    const e = expectedAnnualIncome([row("a", "ISA", "risk", 1000, { yieldPct: 3 }), row("b", "CMA", "cash", 500, { yieldPct: 2 }), row("c", "기타", "cash", 100), row("d", "기타", "cash", 0)]);
    expect(e.total).toBeCloseTo(40, 6);
    expect(e.missingYield).toBe(1);
  });
});

describe("세금 우대 계좌 점검", () => {
  it("ISA 남은 납입 한도와 올해 ISA 수입 대비 비과세 한도를 계산한다", () => {
    const b = budget({ isaKind: "low", isaPaid: { year: 2026, amount: 1500 }, incomeLog: [inc("2026-02-01", "ISA 중개형", "dividend", 150), inc("2026-02-01", "CMA", "interest", 50)] });
    const s = isaStatus(b, [row("a", "ISA 중개형", "risk", 3000)], 2026);
    expect(s.remaining).toBe(500);
    expect(s.taxFreeLimit).toBe(400);
    expect(s.isaIncome).toBe(150);
    expect(s.taxFreeLeft).toBe(250);
    expect(s.balance).toBe(3000);
    expect(isaStatus(b, [], 2027).paid).toBe(0);
  });
  it("금융소득종합과세는 ISA·연금을 빼고, 받은 금액과 예상 중 큰 쪽으로 본다", () => {
    const rows = [row("a", "증권", "risk", 60000, { yieldPct: 3 }), row("b", "ISA", "risk", 99999, { yieldPct: 5 })];
    const s = comprehensiveStatus([inc("2026-01-01", "ISA", "dividend", 500)], rows, 2026);
    expect(s.received).toBe(0);
    expect(s.expected).toBe(1800);
    expect(s.level).toBe("near");
    expect(comprehensiveStatus([], [row("a", "증권", "risk", 80000, { yieldPct: 3 })], 2026).level).toBe("over");
    expect(comprehensiveStatus([], [], 2026).level).toBe("ok");
  });
  it("고배당·이자 상품이 일반 과세 계좌에 있으면 세금 큰 순으로 추천한다", () => {
    const tips = placementTips([row("a", "증권", "risk", 1000, { yieldPct: 4 }), row("b", "증권", "risk", 5000, { yieldPct: 3 }), row("c", "ISA", "risk", 5000, { yieldPct: 6 }), row("d", "증권", "risk", 5000, { yieldPct: 1 })]);
    expect(tips.map((t) => t.rowId)).toEqual(["b", "a"]);
    expect(tips[0].yearlyTax).toBeCloseTo(23.1, 6);
  });
});

describe("비상금", () => {
  it("보증금·청약을 뺀 현금성 자산을 월 지출로 나눈다", () => {
    const b = budget({ expenseCategories: [{ id: "x", name: "생활", amount: 100 }, { id: "y", name: "주거", amount: 100 }] });
    const s = emergencyStatus([row("a", "CMA", "cash", 600), row("b", "전세 보증금", "cash", 9000), row("c", "청약", "cash", 300), row("d", "ISA", "risk", 900)], b);
    expect(s.liquid).toBe(600);
    expect(s.months).toBe(3);
    expect(s.targetMonths).toBe(6);
    expect(s.shortfall).toBe(600);
  });
  it("지출이 없으면 개월 수를 계산하지 않고, 목표가 부족하면 알림을 낸다", () => {
    expect(emergencyStatus([row("a", "CMA", "cash", 600)], budget({ expenseCategories: [] })).months).toBeNull();
    const d = defaultData();
    d.rows = [row("a", "CMA", "cash", 100)];
    d.budget = { ...d.budget, expenseCategories: [{ id: "x", name: "생활", amount: 100 }] };
    const alert = computeAlerts(d, new Date(2026, 9, 9)).find((a) => a.id === "emergency-low");
    expect(alert?.level).toBe("warn");
  });
});

describe("민감도 분석", () => {
  const sim: SimulationAssumptions = { annualContribution: 1200, years: 10, riskRate: 8, safeRate: 3, contributionRiskRatio: 50, applySalaryRaise: false };
  it("수익률이 높고 저축이 많을수록 최종 자산이 커지고, 가운데 칸은 기본 결과와 같다", () => {
    const g = simulationSensitivity(5000, 0.5, sim, 0, 0);
    expect(g[2][2]).toBeGreaterThan(g[1][1]);
    expect(g[0][0]).toBeLessThan(g[1][1]);
    expect(g[1][1]).toBeGreaterThan(5000);
  });
  it("집 마련: 저축을 늘리면 도달이 빨라지고, 못 닿는 경우는 null", () => {
    const d = defaultData();
    const b = budget({ monthlyNetIncome: 500, expenseCategories: [{ id: "x", name: "생활", amount: 300 }], pensionAnnualContribution: 0 });
    const plan = planHousing([row("a", "ISA", "safe", 1000)], b, { riskRate: 8, safeRate: 3, contributionRiskRatio: 50 }, "2030-01-01", new Date(2026, 9, 9), true);
    const g = housingSensitivity(plan, 5000, new Date(2026, 9, 9));
    expect(g[1][2].months!).toBeLessThan(g[1][0].months!);
    expect(g[2][1].months!).toBeLessThan(g[0][1].months!);
    expect(housingSensitivity(plan, 1e9, new Date(2026, 9, 9))[1][1].months).toBeNull();
    expect(housingSensitivity(plan, 500, new Date(2026, 9, 9))[1][1].months).toBe(0);
    expect(d).toBeTruthy();
  });
});

describe("은퇴 시뮬레이션", () => {
  const inp: RetirementInput = { ...DEFAULT_RETIREMENT, currentAge: 40, retireAge: 60, lifeExpectancy: 90, monthlySpend: 200, inflationPct: 0, withdrawRatePct: 4, postRetireRatePct: 0, pensionMonthly: 0, pensionStartAge: 65 };
  it("물가 0%면 필요 자산은 연 생활비 ÷ 4%(= 25배)", () => {
    const p = planRetirement(inp, 60000);
    expect(p.required).toBe(60000);
    expect(p.gap).toBe(0);
    expect(p.fundedPct).toBeCloseTo(100, 6);
  });
  it("수익 0%·물가 0%에서 30년을 버티려면 정확히 필요 자산의 절반이 아니라 30년 치 생활비가 필요하다", () => {
    expect(planRetirement(inp, 200 * 12 * 30).depletionAge).toBeNull();
    expect(planRetirement(inp, 200 * 12 * 30 - 1).depletionAge).toBe(89);
    expect(planRetirement(inp, 0).depletionAge).toBe(60);
  });
  it("연금을 받으면 필요 자산이 줄고 늦게 받으면 소진 시점이 달라진다", () => {
    const now = planRetirement({ ...inp, pensionMonthly: 100, pensionStartAge: 60 }, 0);
    expect(now.required).toBe(30000);
    const late = { ...inp, pensionMonthly: 100, pensionStartAge: 65 };
    expect(planRetirement(late, 0).required).toBe(60000);
    // 60~64세 5년은 연 2,400, 65~89세 25년은 연금을 뺀 연 1,200
    expect(planRetirement(late, 2400 * 5 + 1200 * 25).depletionAge).toBeNull();
    expect(planRetirement(late, 2400 * 5 + 1200 * 25 - 1).depletionAge).toBe(89);
    expect(planRetirement(late, 2400 * 5).depletionAge).toBe(65);
  });
  it("물가가 오르면 은퇴 시점 생활비가 복리로 커진다", () => {
    expect(planRetirement({ ...inp, inflationPct: 3 }, 0).annualSpendAtRetire).toBeCloseTo(2400 * Math.pow(1.03, 20), 6);
  });
});

describe("월간 리포트 확장", () => {
  const e = (date: string, accounts: { account: string; amount: number }[]): HistoryEntry => ({ id: date, date, newContribution: 0, cumulativePrincipal: 0, totalValue: 0, riskValue: 0, safeValue: 0, cashValue: 0, profit: 0, returnRate: 0, accounts });
  it("비율이 크고 금액도 작지 않은 변동만 잡는다", () => {
    const j = accountJumps(
      e("2026-09-28", [{ account: "A", amount: 1000 }, { account: "B", amount: 1000 }, { account: "C", amount: 10 }, { account: "D", amount: 0 }]),
      e("2026-10-28", [{ account: "A", amount: 1050 }, { account: "B", amount: 100 }, { account: "C", amount: 40 }, { account: "D", amount: 500 }])
    );
    expect(j.map((x) => x.account)).toEqual(["D", "B"]);
    expect(j[0].pct).toBe(Infinity);
    expect(j[1].pct).toBeCloseTo(-0.9, 6);
  });
  it("계좌별 값이 없는 기록은 비교하지 않는다", () => {
    expect(accountJumps({ ...e("a", []), accounts: undefined }, e("b", []))).toEqual([]);
  });
  it("복사용 글에 기간·변화·수익률이 들어간다", () => {
    const from = { ...e("2026-09-28", [{ account: "A", amount: 1000 }]), totalValue: 1000, cumulativePrincipal: 1000, totalAssets: 1000 };
    const to = { ...e("2026-10-28", [{ account: "A", amount: 1200 }]), totalValue: 1200, cumulativePrincipal: 1100, totalAssets: 1200 };
    const text = reportText(buildReport(from, to));
    expect(text).toContain("2026-09-28 → 2026-10-28");
    expect(text).toContain("넣은 돈 +1,000,000원");
    expect(text).toContain("운용 수익 +1,000,000원");
    expect(text).toContain("A +2,000,000원");
  });
});
