import type { DashboardData, TaxPrepInput } from "./types.js";

// 연말정산 준비 카드의 기본값. 공제 기준 숫자는 세법 개정으로 자주 바뀌니 화면에서 확인·수정하게 한다.
export function defaultTaxPrep(): TaxPrepInput {
  return {
    rentMonthly: 0,
    rentPaid: 0,
    subscriptionPaid: 0,
    creditCardUsed: 0,
    debitCardUsed: 0,
    policy: {
      pension: { lowIncomeMax: 5500, rateLowPct: 16.5, ratePct: 13.2 },
      rent: { incomeMax: 8000, lowIncomeMax: 5500, rateLowPct: 17, ratePct: 15, limit: 1000 },
      subscription: { incomeMax: 7000, limit: 300, ratePct: 40 },
      card: { thresholdPct: 25, creditRatePct: 15, debitRatePct: 30, limitLow: 300, limitHigh: 250, limitIncome: 7000 },
      marginalRatePct: 16.5,
      updatedAt: "2026-09-25"
    }
  };
}

export function defaultData(): DashboardData {
  return {
    rows: [
      { id: "r1", account: "ISA", item: "위험자산(S&P500)", category: "risk", amount: 0, housingEligible: true },
      { id: "r2", account: "ISA", item: "안전자산(채권·금·달러)", category: "safe", amount: 0, housingEligible: true },
      { id: "r3", account: "CMA", item: "내 집 계약금", category: "cash", amount: 0, housingEligible: true },
      { id: "r4", account: "연금저축펀드", item: "펀드", category: "risk", amount: 0, housingEligible: false },
      { id: "r5", account: "IRP", item: "펀드", category: "safe", amount: 0, housingEligible: false },
      { id: "r6", account: "주택청약종합저축", item: "예금", category: "cash", amount: 0, housingEligible: true },
      { id: "r7", account: "기타", item: "현금성 자산", category: "cash", amount: 0, housingEligible: true }
    ],
    simulation: {
      contributionMode: "auto",
      annualContribution: 0,
      years: 10,
      riskRate: 8,
      safeRate: 3.2,
      contributionRiskRatio: 50,
      applySalaryRaise: false
    },
    loan: {
      price: 0,
      ratePct: 4.2
    },
    checklist: [
      { id: "c1", text: "매달: 정기 적립 항목 납입하기", done: false },
      { id: "c2", text: "안전자산 만기 도래 시 재투자 (만기는 항상 의무기간 이전으로)", done: false },
      { id: "c3", text: "연말: 연금저축·IRP 등 세액공제 납입 한도 확인", done: false },
      { id: "c4", text: "목표 시점이 가까워지면 → 위험자산 비중 축소 시작", done: false },
      { id: "c5", text: "만기 분산 재구성 실행", done: false },
      { id: "c6", text: "청약저축 등 제도 변경 여부 검토", done: false },
      { id: "c7", text: "연말정산 시 세액공제 한도 실제 채웠는지 확인", done: false }
    ],
    strategy: {
      housePurchaseDate: "",
      isaDutyEndDate: "",
      overviewSummary: ["여기에 나만의 요약 메모를 적어보세요 (개요 편집에서 수정 가능)"],
      glidePath: [
        { id: "g1", yearsLeft: 5, riskPct: 50 },
        { id: "g2", yearsLeft: 3, riskPct: 40 },
        { id: "g3", yearsLeft: 2, riskPct: 35 },
        { id: "g4", yearsLeft: 1, riskPct: 20 },
        { id: "g5", yearsLeft: 0, riskPct: 10 }
      ]
    },
    history: [],
    budget: {
      monthlyNetIncome: 0,
      annualRaisePct: 0,
      expenseCategories: [
        { id: "b1", name: "주거비", amount: 0 },
        { id: "b2", name: "생활비", amount: 0 },
        { id: "b3", name: "기타", amount: 0 }
      ],
      pensionAnnualContribution: 900,
      pensionTaxCreditRate: 16.5,
      refundTo: "pension",
      refundBasis: "pension",
      taxPrep: defaultTaxPrep()
    },
    rebalance: {
      tolerancePct: 5,
      groups: [
        { id: "rg-house", name: "집 자금", accounts: ["ISA"], targetType: "glide", fixedRiskPct: 50, note: "" },
        { id: "rg-retire", name: "노후 자금", accounts: ["연금저축펀드", "IRP"], targetType: "fixed", fixedRiskPct: 70, note: "" }
      ]
    },
    home: {
      assetSource: "housing",
      includeDeposit: true,
      projectWithReturns: false,
      extraMode: "auto",
      extraAssets: 0,
      closingCost: 1500,
      currentIncome: 0,
      targetRatioPct: 34,
      areaM2: 0,
      prices: [40000, 50000, 60000],
      incomeThreshold: 7000,
      policy: {
        bogeumjari: { maxHousePrice: 60000, maxIncome: 7000, maxLoanFirstTime: 42000, ltv: 0.7 },
        didimdolSingle: { maxHousePrice: 30000, maxAreaM2: 60, maxLoanFirstTime: 20000 },
        afterTaxRatioTable: [
          [5000, 0.87],
          [6000, 0.86],
          [7000, 0.84],
          [8000, 0.825],
          [9000, 0.807],
          [10000, 0.79]
        ],
        judge: { okMax: 0.34, tightMax: 0.4 },
        updatedAt: "2026-09-25"
      }
    }
  };
}
