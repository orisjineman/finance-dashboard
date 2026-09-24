import { describe, expect, it } from "vitest";
import type { AssetRow, BudgetData, DashboardData, SimulationAssumptions } from "./types";
import type { RebalanceTrade } from "./rebalance";
import { computePensionCredit, paidThisYear } from "./pension";
import { estimateCosts } from "./costs";
import { evaluateScenario, runSimulation, yearReaching } from "./simulation";
import { computeAlerts } from "./alerts";

const now = new Date("2026-10-15T00:00:00");

const budget = (p: Partial<BudgetData> = {}): BudgetData => ({ monthlyNetIncome: 0, annualRaisePct: 0, expenseCategories: [], pensionAnnualContribution: 0, pensionTaxCreditRate: 16.5, ...p });

describe("연금 세액공제", () => {
  it("올해 값이 아니면 0으로 본다", () => {
    expect(paidThisYear(budget({ pensionPaidThisYear: 300, pensionPaidYear: 2025 }), now)).toBe(0);
    expect(paidThisYear(budget({ pensionPaidThisYear: 300, pensionPaidYear: 2026 }), now)).toBe(300);
    expect(paidThisYear(budget(), now)).toBe(0);
  });
  it("한도 900 기준으로 남은 한도와 예상 환급액을 계산한다", () => {
    const c = computePensionCredit(budget({ pensionPaidThisYear: 600, pensionPaidYear: 2026, pensionTaxCreditRate: 16.5 }), now);
    expect(c.limit).toBe(900);
    expect(c.counted).toBe(600);
    expect(c.remaining).toBe(300);
    expect(c.refund).toBeCloseTo(99, 6);
    expect(c.extraRefundIfFilled).toBeCloseTo(49.5, 6);
    expect(c.daysToYearEnd).toBe(77);
  });
  it("한도를 넘게 넣어도 공제 대상은 한도까지", () => {
    const c = computePensionCredit(budget({ pensionPaidThisYear: 1200, pensionPaidYear: 2026, pensionCreditLimit: 900 }), now);
    expect(c.counted).toBe(900);
    expect(c.remaining).toBe(0);
  });
  it("사용자가 정한 한도를 쓴다", () => {
    expect(computePensionCredit(budget({ pensionCreditLimit: 600 }), now).limit).toBe(600);
  });
});

describe("estimateCosts", () => {
  const rows: AssetRow[] = [
    { id: "a", account: "위탁", item: "ETF", category: "risk", amount: 1000, costBasis: 800, housingEligible: true },
    { id: "b", account: "위탁", item: "모름", category: "risk", amount: 500, housingEligible: true },
    { id: "c", account: "ISA", item: "ETF2", category: "risk", amount: 500, costBasis: 100, housingEligible: true },
  ];
  const trade = (rowId: string, account: string, item: string, action: "sell" | "buy", amount: number, taxAdvantaged: boolean): RebalanceTrade => ({ rowId, account, item, action, amount, taxAdvantaged });

  it("수수료는 사고파는 금액 모두에 붙는다", () => {
    const r = estimateCosts([trade("a", "위탁", "ETF", "sell", 1000, false), trade("x", "위탁", "채권", "buy", 1000, false)], rows, { feePct: 0.1 });
    expect(r.fee).toBeCloseTo(2, 9);
  });
  it("일반 과세 계좌 매도만 차익 비율로 세금을 계산한다", () => {
    // 평가 1000, 원금 800 → 차익 비율 20%, 500 매도 → 차익 100 → 15.4% = 15.4
    const r = estimateCosts([trade("a", "위탁", "ETF", "sell", 500, false)], rows, { taxRatePct: 15.4 });
    expect(r.tax).toBeCloseTo(15.4, 9);
    expect(r.unknown).toEqual([]);
  });
  it("세금 우대 계좌와 매수는 세금에서 뺀다", () => {
    const r = estimateCosts([trade("c", "ISA", "ETF2", "sell", 500, true), trade("a", "위탁", "ETF", "buy", 500, false)], rows, {});
    expect(r.tax).toBe(0);
  });
  it("손실 중이면 세금 0, 원금이 없으면 알 수 없음으로 표시한다", () => {
    const loss = estimateCosts([trade("a", "위탁", "ETF", "sell", 500, false)], [{ ...rows[0], costBasis: 1200 }], {});
    expect(loss.tax).toBe(0);
    const unknown = estimateCosts([trade("b", "위탁", "모름", "sell", 100, false)], rows, {});
    expect(unknown.unknown).toEqual(["위탁 · 모름"]);
  });
  it("설정이 없으면 기본 수수료율·세율을 쓴다", () => {
    const r = estimateCosts([trade("a", "위탁", "ETF", "sell", 1000, false)], rows, {});
    expect(r.fee).toBeCloseTo(0.15, 9);
    expect(r.tax).toBeCloseTo((1000 * 0.2 * 15.4) / 100, 9);
  });
});

describe("시뮬레이션", () => {
  const sim: SimulationAssumptions = { annualContribution: 100, years: 3, riskRate: 10, safeRate: 0, contributionRiskRatio: 100, applySalaryRaise: false };
  it("연도별로 복리 계산한다 (위험 100%, 수익 10%)", () => {
    const r = runSimulation(1000, 1, sim, 0);
    expect(r).toHaveLength(3);
    expect(r[0].total).toBeCloseTo(1210, 6); // (1000+100)*1.1
    expect(r[1].total).toBeCloseTo(1441, 6);
    expect(r[2].profit).toBeCloseTo(r[2].total - 1300, 6);
  });
  it("연봉 상승률을 적립액에 복리로 반영한다", () => {
    const r = runSimulation(0, 1, { ...sim, applySalaryRaise: true }, 10);
    expect(r[0].contribution).toBe(100);
    expect(r[1].contribution).toBeCloseTo(110, 9);
    expect(r[2].contribution).toBeCloseTo(121, 9);
  });
  it("기간은 1~40년으로 제한한다", () => {
    expect(runSimulation(0, 0, { ...sim, years: 99 }, 0)).toHaveLength(40);
    expect(runSimulation(0, 0, { ...sim, years: 0 }, 0)).toHaveLength(10); // 0이면 기본 10년
  });
  it("목표에 처음 닿는 연차를 찾는다", () => {
    const r = runSimulation(1000, 1, sim, 0);
    expect(yearReaching(r, 1400)).toBe(2);
    expect(yearReaching(r, 999999)).toBeNull();
    expect(yearReaching(r, 0)).toBeNull();
  });
  it("시나리오는 수익률·적립액만 덮어쓰고 결과를 비교할 수 있다", () => {
    const o = { base: 1000, riskPct0: 1, housingBase: 500, housingRiskPct0: 1, equityNeeded: 1000, raisePct: 0 };
    const base = evaluateScenario(o, sim, null);
    const better = evaluateScenario(o, sim, { id: "s", name: "낙관", riskRate: 20, safeRate: 0, annualContribution: 100, contributionRiskRatio: 100 });
    expect(better.final).toBeGreaterThan(base.final);
    expect(better.housingYear).not.toBeNull();
    expect(base.housingYear === null || better.housingYear! <= base.housingYear).toBe(true);
  });
});

describe("computeAlerts", () => {
  const data = (over: Partial<DashboardData> = {}): DashboardData => ({
    rows: [],
    simulation: { annualContribution: 0, years: 10, riskRate: 7, safeRate: 3, contributionRiskRatio: 50, applySalaryRaise: false },
    loan: { price: 0, ltvPct: 0, ratePct: 0, termYears: 30 },
    checklist: [],
    strategy: { housePurchaseDate: "", isaDutyEndDate: "", overviewSummary: [], glidePath: [] },
    history: [],
    budget: budget({ pensionPaidThisYear: 900, pensionPaidYear: 2026 }),
    rebalance: { tolerancePct: 5, groups: [] },
    ...over,
  });
  const entry = (date: string) => ({ id: date, date, newContribution: 0, cumulativePrincipal: 1, totalValue: 1, riskValue: 0, safeValue: 0, cashValue: 0, profit: 0, returnRate: 0 });
  const ids = (d: DashboardData) => computeAlerts(d, now).map((a) => a.id);

  it("기록이 없으면 안내, 오래되면 경고, 최근이면 알림 없음", () => {
    expect(ids(data())).toContain("snapshot-none");
    expect(ids(data({ history: [entry("2026-08-01")] }))).toContain("snapshot-stale");
    expect(ids(data({ history: [entry("2026-10-01")] }))).not.toContain("snapshot-stale");
  });
  it("허용 오차를 벗어난 묶음을 경고한다", () => {
    const rows: AssetRow[] = [
      { id: "1", account: "ISA", item: "S&P", category: "risk", amount: 800, housingEligible: true },
      { id: "2", account: "ISA", item: "채권", category: "safe", amount: 200, housingEligible: true },
    ];
    const rebalance = { tolerancePct: 5, groups: [{ id: "g1", name: "집 자금", accounts: ["ISA"], targetType: "fixed" as const, fixedRiskPct: 50, note: "" }] };
    const alert = computeAlerts(data({ rows, rebalance, history: [entry("2026-10-10")] }), now).find((a) => a.id === "rebalance-g1");
    expect(alert?.level).toBe("warn");
    expect(alert?.text).toContain("집 자금");
  });
  it("ISA 의무가입 종료가 90일 이내면 알리고, 멀거나 지났으면 안 알린다", () => {
    const withIsa = (d: string) => ids(data({ strategy: { housePurchaseDate: "", isaDutyEndDate: d, overviewSummary: [], glidePath: [] } }));
    expect(withIsa("2027-01-01")).toContain("isa-duty");
    expect(withIsa("2028-01-01")).not.toContain("isa-duty");
    expect(withIsa("2026-01-01")).not.toContain("isa-duty");
  });
  it("자동으로 불러온 가격이 오래되면 알린다", () => {
    const rows: AssetRow[] = [{ id: "1", account: "A", item: "ETF", category: "risk", amount: 1, unitPrice: 3, priceDate: "2026-09-01", housingEligible: true }];
    expect(ids(data({ rows }))).toContain("price-stale");
  });
  it("연말이 가깝고 한도가 남았을 때만 세액공제를 알린다", () => {
    expect(ids(data())).not.toContain("pension-limit"); // 한도를 다 채움
    expect(ids(data({ budget: budget() }))).toContain("pension-limit");
    expect(computeAlerts(data({ budget: budget() }), new Date("2026-03-01T00:00:00")).map((a) => a.id)).not.toContain("pension-limit");
  });
});
