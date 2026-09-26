import { describe, expect, it } from "vitest";
import type { AssetRow, BudgetData, DashboardData, SimulationAssumptions } from "./types";
import type { RebalanceTrade } from "./rebalance";
import { computePensionCredit, paidThisYear } from "./pension";
import { estimateCosts } from "./costs";
import { evaluateScenario, runSimulation } from "./simulation";
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
  it("수익 없는 자산(idle)은 그대로 더해지고 수익에는 안 잡힌다", () => {
    const withIdle = runSimulation(1000, 1, sim, 0, 500);
    const without = runSimulation(1000, 1, sim, 0);
    withIdle.forEach((r, i) => {
      expect(r.total).toBeCloseTo(without[i].total + 500, 9);
      expect(r.profit).toBeCloseTo(without[i].profit, 9);
    });
    const o = evaluateScenario({ base: 1000, riskPct0: 1, raisePct: 0, idle: 500 }, sim, null);
    expect(o.final).toBeCloseTo(without[2].total + 500, 9);
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
  it("시나리오는 수익률·적립액만 덮어쓰고 결과를 비교할 수 있다", () => {
    const o = { base: 1000, riskPct0: 1, raisePct: 0 };
    const base = evaluateScenario(o, sim, null);
    const better = evaluateScenario(o, sim, { id: "s", name: "낙관", riskRate: 20, safeRate: 0, annualContribution: 100, contributionRiskRatio: 100 });
    expect(better.final).toBeGreaterThan(base.final);
    expect(better.results).toHaveLength(base.results.length);
  });
});

describe("computeAlerts", () => {
  const data = (over: Partial<DashboardData> = {}): DashboardData => ({
    rows: [],
    simulation: { annualContribution: 0, years: 10, riskRate: 7, safeRate: 3, contributionRiskRatio: 50, applySalaryRaise: false },
    loan: { price: 0, ratePct: 0 },
    checklist: [],
    strategy: { housePurchaseDate: "", isaDutyEndDate: "", overviewSummary: [], glidePath: [] },
    history: [],
    budget: budget({ pensionPaidThisYear: 900, pensionPaidYear: 2026 }),
    rebalance: { tolerancePct: 5, groups: [] },
    home: {
      assetSource: "group",
      includeDeposit: true,
      extraAssets: 0,
      closingCost: 0,
      currentIncome: 0,
      targetRatioPct: 34,
      areaM2: 0,
      prices: [],
      incomeThreshold: 7000,
      policy: {
        bogeumjari: { maxHousePrice: 60000, maxIncome: 7000, maxLoanFirstTime: 42000, ltv: 0.7 },
        didimdolSingle: { maxHousePrice: 30000, maxAreaM2: 60, maxLoanFirstTime: 20000 },
        afterTaxRatioTable: [[6000, 0.86]],
        judge: { tightMax: 0.4 },
        updatedAt: "2026-09-25",
      },
    },
    ...over,
  });
  const entry = (date: string) => ({ id: date, date, newContribution: 0, cumulativePrincipal: 1, totalValue: 1, riskValue: 0, safeValue: 0, cashValue: 0, profit: 0, returnRate: 0 });
  const ids = (d: DashboardData) => computeAlerts(d, now).map((a) => a.id);

  it("기록이 없으면 안내, 오래되면 경고, 최근이면 알림 없음", () => {
    expect(ids(data())).toContain("snapshot-none");
    expect(ids(data({ history: [entry("2026-08-01")] }))).toContain("snapshot-stale");
    expect(ids(data({ history: [entry("2026-10-01")] }))).not.toContain("snapshot-stale");
    // 매달 기록일을 정하면 30일 경과 대신 기록일 기준으로 알린다 (3일 일찍 기록해도 괜찮음)
    const withDay = (date: string, day: number) => data({ history: [entry(date)], strategy: { housePurchaseDate: "", isaDutyEndDate: "", overviewSummary: [], glidePath: [], recordDay: day } });
    expect(ids(withDay("2026-08-26", 20))).toContain("snapshot-due");
    expect(ids(withDay("2026-09-18", 20))).not.toContain("snapshot-due");
    expect(ids(withDay("2026-08-26", 20))).not.toContain("snapshot-stale");
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
  it("대출 정책 숫자를 확인한 지 1년이 넘으면 알린다", () => {
    const base = data();
    expect(ids(base)).not.toContain("home-policy-stale");
    const old = data({ home: { ...base.home, policy: { ...base.home.policy, updatedAt: "2025-01-01" } } });
    expect(ids(old)).toContain("home-policy-stale");
  });
  it("매수 예정 연도 전에 연봉이 보금자리론 소득 기준을 넘으면 알린다", () => {
    const base = data();
    const strategy = { ...base.strategy, housePurchaseDate: "2030-06-30" };
    const raise = (annualRaisePct: number) => ({ ...base.budget, annualRaisePct });
    expect(ids(data({ strategy, budget: raise(2.5), home: { ...base.home, currentIncome: 5500 } }))).not.toContain("home-income");
    expect(ids(data({ strategy, budget: raise(3), home: { ...base.home, currentIncome: 6600 } }))).toContain("home-income");
    expect(ids(data({ strategy, home: { ...base.home, currentIncome: 0 } }))).not.toContain("home-income");
  });
  it("목표 집값이 부담·LTV 초과·보금자리론 불가면 알리고, 여유 있으면 안 알린다", () => {
    const base = data();
    const rows: AssetRow[] = [{ id: "1", account: "ISA", item: "S&P", category: "risk", amount: 10000, housingEligible: true }];
    const strategy = { ...base.strategy, housePurchaseDate: "2030-06-30" };
    const home = { ...base.home, assetSource: "housing" as const, currentIncome: 5000, policy: { ...base.home.policy, afterTaxRatioTable: [[5000, 0.87]] as [number, number][] } };
    const withPrice = (price: number) => ids(data({ rows, strategy, home, loan: { price, ratePct: 4 } }));
    const heavy = withPrice(70000);
    expect(heavy).toContain("home-target-heavy");
    expect(heavy).toContain("home-target-ltv");
    expect(heavy).toContain("home-target-bogeumjari");
    const light = withPrice(15000);
    expect(light.filter((x) => x.startsWith("home-target"))).toEqual([]);
    expect(ids(data({ rows, strategy, home, loan: { price: 0, ratePct: 4 } })).filter((x) => x.startsWith("home-target"))).toEqual([]);
  });
  it("연말정산 기준 숫자가 오래됐거나, 연말 전 청약 한도가 남으면 알린다", () => {
    const base = data();
    const taxPrep = {
      year: 2026,
      rentMonthly: 0,
      rentPaid: 0,
      subscriptionPaid: 100,
      creditCardUsed: 0,
      debitCardUsed: 0,
      policy: {
        rent: { incomeMax: 8000, lowIncomeMax: 5500, rateLowPct: 17, ratePct: 15, limit: 1000 },
        subscription: { incomeMax: 7000, limit: 300, ratePct: 40 },
        card: { thresholdPct: 25, creditRatePct: 15, debitRatePct: 30, limitLow: 300, limitHigh: 250, limitIncome: 7000 },
        marginalRatePct: 16.5,
        updatedAt: "2026-09-25",
      },
    };
    const home = { ...base.home, currentIncome: 5000 };
    expect(ids(data({ home, budget: { ...base.budget, taxPrep } }))).toContain("tax-subscription");
    expect(ids(data({ home, budget: { ...base.budget, taxPrep: { ...taxPrep, subscriptionPaid: 300 } } }))).not.toContain("tax-subscription");
    expect(ids(data({ home, budget: { ...base.budget, taxPrep: { ...taxPrep, subscriptionPaid: 0 } } }))).not.toContain("tax-subscription"); // 납입 안 하는 중이면 조용히
    expect(ids(data({ home: { ...home, currentIncome: 8000 }, budget: { ...base.budget, taxPrep } }))).not.toContain("tax-subscription"); // 소득 기준 초과
    const old = { ...taxPrep, policy: { ...taxPrep.policy, updatedAt: "2025-01-01" } };
    expect(ids(data({ home, budget: { ...base.budget, taxPrep: old } }))).toContain("tax-policy-stale");
  });
  it("연말이 가깝고 한도가 남았을 때만 세액공제를 알린다", () => {
    expect(ids(data())).not.toContain("pension-limit"); // 한도를 다 채움
    expect(ids(data({ budget: budget() }))).toContain("pension-limit");
    expect(computeAlerts(data({ budget: budget() }), new Date("2026-03-01T00:00:00")).map((a) => a.id)).not.toContain("pension-limit");
  });
});
