import { describe, expect, it } from "vitest";
import type { AssetRow, HomePolicy, HomeSimInput, RebalanceGroup } from "./types";
import {
  afterTaxRatio,
  checkBogeumjari,
  checkDidimdolSingle,
  computeHome,
  computeHomeAssets,
  incomeAt,
  judgeRatio,
  judgeRule,
  netPayFactor,
  assetsNeededAffordable,
  evaluateTarget,
  monthsUntil,
  maxPrincipal,
  totalInterest,
  monthlyAfterTax,
  monthlyPayment,
  policyStale,
  yearExceeding,
} from "./home";

const policy: HomePolicy = {
  bogeumjari: { maxHousePrice: 60000, maxIncome: 7000, maxLoanFirstTime: 42000, ltv: 0.7 },
  didimdolSingle: { maxHousePrice: 30000, maxAreaM2: 60, maxLoanFirstTime: 20000 },
  afterTaxRatioTable: [
    [5000, 0.87],
    [6000, 0.86],
    [7000, 0.84],
    [8000, 0.825],
    [9000, 0.807],
    [10000, 0.79],
  ],
  judge: { tightMax: 0.4 },
  updatedAt: "2026-09-25",
};

const input = (p: Partial<HomeSimInput> = {}): HomeSimInput => ({
  assetSource: "group",
  includeDeposit: true,
  extraAssets: 0,
  closingCost: 1500,
  currentIncome: 5500,
  targetRatioPct: 34,
  areaM2: 0,
  prices: [50000, 55000, 60000],
  incomeThreshold: 7000,
  policy,
  ...p,
});

describe("검증 케이스 (널리 알려진 값과 비교)", () => {
  it("대출 3억, 4%, 30년 → 월 약 143만", () => {
    expect(monthlyPayment(30000, 4, 30)).toBeCloseTo(143.22, 1);
  });
  it("대출 3억, 4%, 40년 → 월 약 125만", () => {
    expect(monthlyPayment(30000, 4, 40)).toBeCloseTo(125.38, 1);
  });
  it("대출 2억, 4%, 40년 → 월 약 84만", () => {
    expect(monthlyPayment(20000, 4, 40)).toBeCloseTo(83.59, 1);
  });
  it("총보수 5,000, 인상률 3%, 4년 뒤 → 약 5,628", () => {
    expect(incomeAt(5000, 3, 2026, 2030)).toBeCloseTo(5627.5, 0);
  });
  it("총보수 5,000, 인상률 2% → 7천을 처음 넘는 해 2043년 (16년차 6,864 → 17년차 7,001)", () => {
    expect(yearExceeding(5000, 2, 2026, 7000)).toBe(2043);
  });
  it("집값 6억, 매수 시점 총보수 7,100 → 보금자리론 불가(소득 초과)", () => {
    const e = checkBogeumjari(60000, 30000, 7100, policy);
    expect(e.ok).toBe(false);
    expect(e.reasons).toEqual(["소득 초과"]);
  });
  it("집값 4억, 실투입 1.5억, 세후 400만, 4% 40년 → 상환비중 약 26%, 적정", () => {
    const ratio = monthlyPayment(40000 - 15000, 4, 40) / 400;
    expect(ratio).toBeCloseTo(0.261, 2);
    expect(judgeRatio(ratio, judgeRule(input()))).toBe("ok");
  });
});

describe("대출 계산", () => {
  it("maxPrincipal은 monthlyPayment의 역산이다", () => {
    for (const [p, r, y] of [[30000, 5, 30], [20000, 3.2, 40], [10000, 0, 10]] as const) {
      expect(maxPrincipal(monthlyPayment(p, r, y), r, y)).toBeCloseTo(p, 6);
    }
  });
  it("총이자: 40년이 30년보다 크고, 금리 0이면 0", () => {
    expect(totalInterest(10000, 5, 40)).toBeGreaterThan(totalInterest(10000, 5, 30));
    expect(totalInterest(10000, 5, 30)).toBeCloseTo(monthlyPayment(10000, 5, 30) * 360 - 10000, 9);
    expect(totalInterest(10000, 0, 30)).toBeCloseTo(0, 9);
  });
  it("대출이 0이면 상환액 0, 금리 0이면 원금 ÷ 개월 수", () => {
    expect(monthlyPayment(0, 5, 30)).toBe(0);
    expect(monthlyPayment(1200, 0, 10)).toBeCloseTo(10, 9);
  });
});

describe("연봉·세후", () => {
  it("매수 연도가 지났거나 올해면 인상하지 않는다", () => {
    expect(incomeAt(5500, 3, 2026, 2026)).toBe(5500);
    expect(incomeAt(5500, 3, 2026, 2024)).toBe(5500);
  });
  it("이미 넘었으면 올해, 인상률 0이면 null", () => {
    expect(yearExceeding(7500, 2, 2026, 7000)).toBe(2026);
    expect(yearExceeding(5500, 0, 2026, 7000)).toBeNull();
  });
  it("세후 비율은 표를 직선으로 이어 읽고 표 밖은 양 끝 값", () => {
    expect(afterTaxRatio(policy.afterTaxRatioTable, 6000)).toBe(0.86);
    expect(afterTaxRatio(policy.afterTaxRatioTable, 6500)).toBeCloseTo(0.85, 9);
    expect(afterTaxRatio(policy.afterTaxRatioTable, 3000)).toBe(0.87);
    expect(afterTaxRatio(policy.afterTaxRatioTable, 20000)).toBe(0.79);
    expect(afterTaxRatio([], 5000)).toBe(1);
  });
  it("handoff 예시: 6,000만 → 약 430만, 7,000만 → 약 490만, 9,000만 → 약 605만", () => {
    expect(monthlyAfterTax(policy.afterTaxRatioTable, 6000)).toBeCloseTo(430, 0);
    expect(monthlyAfterTax(policy.afterTaxRatioTable, 7000)).toBeCloseTo(490, 0);
    expect(monthlyAfterTax(policy.afterTaxRatioTable, 9000)).toBeCloseTo(605, 0);
  });
});

describe("판정·자격", () => {
  it("목표 상환 비중(34%) 이하 적정, 40% 이하 빠듯, 초과 부담", () => {
    const rule = judgeRule(input());
    expect(rule.okMax).toBeCloseTo(0.34, 9);
    expect(judgeRatio(0.34, rule)).toBe("ok");
    expect(judgeRatio(0.35, rule)).toBe("tight");
    expect(judgeRatio(0.4, rule)).toBe("tight");
    expect(judgeRatio(0.41, rule)).toBe("heavy");
  });
  it("목표 상환 비중을 바꾸면 '적정' 기준도 같이 바뀐다", () => {
    expect(judgeRatio(0.32, judgeRule(input({ targetRatioPct: 30 })))).toBe("tight");
    expect(judgeRatio(0.32, judgeRule(input({ targetRatioPct: 35 })))).toBe("ok");
  });
  it("보금자리론은 사유를 모두 모아 보여준다", () => {
    expect(checkBogeumjari(55000, 30000, 6500, policy).ok).toBe(true);
    expect(checkBogeumjari(65000, 45000, 7500, policy).reasons).toEqual(["집값 초과", "소득 초과", "대출 한도 초과"]);
  });
  it("디딤돌(미혼 단독세대주)은 집값·면적·대출을 본다", () => {
    expect(checkDidimdolSingle(28000, 15000, 59, policy).ok).toBe(true);
    expect(checkDidimdolSingle(28000, 15000, 0, policy).reasons).toEqual(["전용면적 미입력"]);
    expect(checkDidimdolSingle(55000, 30000, 84, policy).reasons).toEqual(["집값 초과", "면적 초과", "대출 한도 초과"]);
  });
  it("정책 숫자 확인일이 1년 넘으면 stale", () => {
    expect(policyStale("2026-09-25", new Date("2027-09-24T00:00:00"))).toBe(false);
    expect(policyStale("2026-09-25", new Date("2027-09-26T00:00:00"))).toBe(true);
    expect(policyStale("bad", new Date())).toBe(true);
  });
});

describe("가용자산", () => {
  const rows: AssetRow[] = [
    { id: "1", account: "ISA", item: "S&P", category: "risk", amount: 10000, housingEligible: true },
    { id: "2", account: "CMA", item: "RP", category: "safe", amount: 5000, housingEligible: true },
    { id: "3", account: "기타", item: "월세보증금", category: "cash", amount: 3000, housingEligible: true },
    { id: "4", account: "예금", item: "통장", category: "cash", amount: 1000, housingEligible: true },
    { id: "5", account: "IRP", item: "펀드", category: "risk", amount: 9999, housingEligible: false },
  ];
  const groups: RebalanceGroup[] = [
    { id: "g", name: "집 자금", accounts: ["ISA", "CMA"], targetType: "glide", fixedRiskPct: 0, note: "" },
    { id: "r", name: "노후 자금", accounts: ["IRP"], targetType: "fixed", fixedRiskPct: 100, note: "" },
  ];

  it("집 자금 묶음 + 보증금 + 추가 − 부대비용", () => {
    const a = computeHomeAssets(rows, groups, input({ extraAssets: 500 }));
    expect(a.base).toBe(15000);
    expect(a.deposit).toBe(3000);
    expect(a.depositItems).toEqual(["월세보증금"]);
    expect(a.equity).toBe(15000 + 3000 + 500 - 1500);
    expect(a.groupName).toBe("집 자금");
  });
  it("보증금을 빼면 그만큼 줄어든다", () => {
    expect(computeHomeAssets(rows, groups, input({ includeDeposit: false })).equity).toBe(15000 - 1500);
  });
  it("'집자금' 체크 전체 기준이면 보증금을 두 번 세지 않는다", () => {
    const a = computeHomeAssets(rows, groups, input({ assetSource: "housing" }));
    expect(a.base).toBe(16000);
    expect(a.equity).toBe(16000 + 3000 - 1500);
  });
});

describe("computeHome", () => {
  const now = new Date("2026-09-25T00:00:00");
  it("매수 연도 연봉, 세후 월급, 집값별 표, 최대 적정 집값", () => {
    const r = computeHome(input({ currentIncome: 5000 }), 20000, 4, "2030-06-30", now, 3);
    expect(r.purchaseYear).toBe(2030);
    expect(r.incomeAtPurchase).toBeCloseTo(5627.5, 0);
    expect(r.rows.map((x) => x.price)).toEqual([50000, 55000, 60000]);
    const mid = r.rows[1];
    expect(mid.loan).toBe(35000);
    expect(mid.monthly40).toBeCloseTo(monthlyPayment(35000, 4, 40), 9);
    expect(mid.bogeumjari.ok).toBe(true);
    expect(r.maxPrice40).toBeGreaterThan(r.maxPrice30);
    // 최대 적정 집값에서 상환비중은 정확히 목표 비중
    const atMax = monthlyPayment(r.maxPrice30 - 20000, 4, 30) / r.afterTaxMonthly;
    expect(atMax).toBeCloseTo(0.34, 9);
  });
  it("실투입금이 집값보다 크면 대출 0", () => {
    const r = computeHome(input({ prices: [20000] }), 25000, 4, "2030-06-30", now, 2.5);
    expect(r.rows[0].loan).toBe(0);
    expect(r.rows[0].judge30).toBe("ok");
  });
  it("LTV를 넘는 대출이면 표시한다", () => {
    const r = computeHome(input({ prices: [50000] }), 10000, 4, "2030-06-30", now, 2.5);
    expect(r.rows[0].overLtv).toBe(true); // 대출 4억 > 5억 × 70%
  });
  it("연봉이 0이면 비중은 무한대(부담)로 본다", () => {
    const r = computeHome(input({ currentIncome: 0 }), 20000, 4, "2030-06-30", now, 2.5);
    expect(r.rows[0].judge30).toBe("heavy");
  });
});

describe("evaluateTarget", () => {
  const now = new Date("2026-09-25T00:00:00");
  const base = {
    rows: [
      { id: "1", account: "ISA", item: "S&P", category: "risk" as const, amount: 15000, housingEligible: true },
      { id: "2", account: "기타", item: "월세보증금", category: "cash" as const, amount: 3000, housingEligible: true },
    ],
    rebalance: { tolerancePct: 5, groups: [] },
    home: input({ assetSource: "housing", currentIncome: 5000 }),
    loan: { price: 40000, ratePct: 4 },
    strategy: { housePurchaseDate: "2030-06-30", isaDutyEndDate: "", overviewSummary: [], glidePath: [] },
    budget: { monthlyNetIncome: 0, annualRaisePct: 3, expenseCategories: [], pensionAnnualContribution: 0, pensionTaxCreditRate: 16.5 },
    simulation: { annualContribution: 0, years: 10, riskRate: 8, safeRate: 3, contributionRiskRatio: 50, applySalaryRaise: false },
  };
  it("목표 집값 한 채를 내 정보 탭 인상률로 판정한다", () => {
    const t = evaluateTarget(base, now)!;
    expect(t.equity).toBe(15000 + 3000 - 1500);
    expect(t.row.price).toBe(40000);
    expect(t.row.loan).toBe(40000 - 16500);
    expect(t.result.incomeAtPurchase).toBeCloseTo(5627.5, 0); // 5000 × 1.03^4
  });
  it("목표 집값이나 연봉이 없으면 null", () => {
    expect(evaluateTarget({ ...base, loan: { ...base.loan, price: 0 } }, now)).toBeNull();
    expect(evaluateTarget({ ...base, home: { ...base.home, currentIncome: 0 } }, now)).toBeNull();
  });
});

describe("매수 때까지 더 모을 돈 (자동)", () => {
  const rows: AssetRow[] = [{ id: "1", account: "ISA", item: "S&P", category: "risk", amount: 10000, housingEligible: true }];
  it("남은 달 수는 이번 달 기준, 지났으면 0", () => {
    const now = new Date("2026-09-25T00:00:00");
    expect(monthsUntil("2030-06-30", now)).toBe(45);
    expect(monthsUntil("2026-09-30", now)).toBe(0);
    expect(monthsUntil("2025-01-01", now)).toBe(0);
    expect(monthsUntil("", now)).toBe(0);
  });
  it("auto면 넘겨준 값(월 저축액 × 남은 달), manual이면 입력값을 쓴다", () => {
    expect(computeHomeAssets(rows, [], input({ assetSource: "housing", extraMode: "auto", extraAssets: 999 }), 4500).extra).toBe(4500);
    expect(computeHomeAssets(rows, [], input({ assetSource: "housing", extraMode: "manual", extraAssets: 999 }), 4500).extra).toBe(999);
    expect(computeHomeAssets(rows, [], input({ assetSource: "housing", extraAssets: 999 }), 4500).extra).toBe(999); // 예전 데이터는 manual로 본다
  });
});

describe("assetsNeededAffordable", () => {
  it("그 가용자산이면 목표 집값의 상환 비중이 정확히 목표 비중이 된다", () => {
    const now = new Date("2026-09-25T00:00:00");
    const base = {
      rows: [{ id: "1", account: "ISA", item: "S&P", category: "risk" as const, amount: 15000, housingEligible: true }],
      rebalance: { tolerancePct: 5, groups: [] },
      home: input({ assetSource: "housing", currentIncome: 5000, extraMode: "manual", closingCost: 1000 }),
      loan: { price: 50000, ratePct: 4 },
      strategy: { housePurchaseDate: "2030-06-30", isaDutyEndDate: "", overviewSummary: [], glidePath: [] },
      budget: { monthlyNetIncome: 0, annualRaisePct: 3, expenseCategories: [], pensionAnnualContribution: 0, pensionTaxCreditRate: 16.5 },
      simulation: { annualContribution: 0, years: 10, riskRate: 8, safeRate: 3, contributionRiskRatio: 50, applySalaryRaise: false },
    };
    const t = evaluateTarget(base, now)!;
    const need = assetsNeededAffordable(t, 40, 1000);
    // 가용자산이 need면 실투입금 = need − 부대비용, 대출 = 집값 − 실투입금
    const loan = 50000 - (need - 1000);
    expect(monthlyPayment(loan, 4, 40) / t.result.afterTaxMonthly).toBeCloseTo(0.34, 9);
  });
});

describe("실수령 보정", () => {
  const now = new Date("2026-09-25T00:00:00");
  it("보정계수 = 실제 세후 비율 ÷ 비율표 값", () => {
    // 총보수 5,000 → 비율표 0.87, 실수령 300 × 12 / 5,000 = 0.72
    expect(netPayFactor(input({ currentIncome: 5000 }), 300)).toBeCloseTo(0.72 / 0.87, 9);
  });
  it("실수령액을 모르거나 보정을 끄면 1", () => {
    expect(netPayFactor(input({ currentIncome: 5000 }), 0)).toBe(1);
    expect(netPayFactor(input({ currentIncome: 0 }), 300)).toBe(1);
    expect(netPayFactor(input({ currentIncome: 5000, netPayCorrection: false }), 300)).toBe(1);
  });
  it("보정계수만큼 세후 월급이 줄고, 최대 적정 집값에서 상환 비중은 여전히 목표 비중", () => {
    const plain = computeHome(input(), 20000, 4, "2030-06-30", now, 2.5);
    const r = computeHome(input(), 20000, 4, "2030-06-30", now, 2.5, 0.9);
    expect(r.netFactor).toBe(0.9);
    expect(r.afterTaxMonthly).toBeCloseTo(plain.afterTaxMonthly * 0.9, 9);
    expect(r.maxPrice40).toBeLessThan(plain.maxPrice40);
    expect(monthlyPayment(r.maxPrice40 - 20000, 4, 40) / r.afterTaxMonthly).toBeCloseTo(0.34, 9);
  });
  it("최대 적정 집값을 그대로 넣으면 '적정'으로 판정한다", () => {
    const r = computeHome(input(), 20000, 4, "2030-06-30", now, 2.5, 0.9);
    const atMax = computeHome(input({ prices: [r.maxPrice40] }), 20000, 4, "2030-06-30", now, 2.5, 0.9);
    expect(atMax.rows[0].judge40).toBe("ok");
  });
  it("evaluateTarget도 내 정보의 실수령액으로 보정한다", () => {
    const data = {
      rows: [{ id: "1", account: "ISA", item: "S&P", category: "risk" as const, amount: 15000, housingEligible: true }],
      rebalance: { tolerancePct: 5, groups: [] },
      home: input({ assetSource: "housing", currentIncome: 5000, extraMode: "manual" }),
      loan: { price: 40000, ratePct: 4 },
      strategy: { housePurchaseDate: "2030-06-30", isaDutyEndDate: "", overviewSummary: [], glidePath: [] },
      budget: { monthlyNetIncome: 300, annualRaisePct: 0, expenseCategories: [], pensionAnnualContribution: 0, pensionTaxCreditRate: 16.5 },
      simulation: { annualContribution: 0, years: 10, riskRate: 8, safeRate: 3, contributionRiskRatio: 50, applySalaryRaise: false },
    };
    expect(evaluateTarget(data, now)!.result.afterTaxMonthly).toBeCloseTo(300, 9); // 인상률 0이면 매수 때도 실수령액 그대로
    expect(evaluateTarget({ ...data, home: { ...data.home, netPayCorrection: false } }, now)!.result.afterTaxMonthly).toBeCloseTo((5000 * 0.87) / 12, 9);
  });
});
