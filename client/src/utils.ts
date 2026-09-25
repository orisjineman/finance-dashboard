import type { AssetRow, BudgetData, HistoryEntry } from "./types";

export interface Totals {
  risk: number;
  safe: number;
  cash: number;
  total: number;
  investBase: number;
  riskPct: number;
  safePct: number;
}

export function computeTotals(rows: AssetRow[]): Totals {
  let risk = 0;
  let safe = 0;
  let cash = 0;
  rows.forEach((r) => {
    if (r.category === "risk") risk += r.amount;
    else if (r.category === "safe") safe += r.amount;
    else cash += r.amount;
  });
  const investBase = risk + safe;
  const riskPct = investBase > 0 ? Math.round((risk / investBase) * 100) : 0;
  const safePct = investBase > 0 ? 100 - riskPct : 0;
  return { risk, safe, cash, total: risk + safe + cash, investBase, riskPct, safePct };
}

// 투자 수익률 계산에 포함되는 항목(excludeFromReturn이 아닌 것)만의 합계
export function computeReturnTotals(rows: AssetRow[]): Totals {
  return computeTotals(rows.filter((r) => !r.excludeFromReturn));
}

// 집 마련 자금으로 쓸 수 있는 가용자산 합계 (연금저축·IRP 등 housingEligible=false 항목 제외)
export function computeHousingLiquid(rows: AssetRow[]): number {
  return rows.filter((r) => r.housingEligible).reduce((sum, r) => sum + r.amount, 0);
}

// 필요 자기자금 = 집값 - LTV 대출한도 + 부대비용(취득세·중개·법무·이사). 개요·시뮬레이션·내 집 마련 탭이 모두 이 값을 쓴다.
// ltv는 0~1 (내 집 마련 탭 정책 설정의 LTV 하나만 쓴다)
export function computeLoanEquity(price: number, ltv: number, closingCost = 0): number {
  return price * (1 - Math.min(1, Math.max(0, ltv || 0))) + Math.max(0, closingCost);
}

// 연간 연말정산 환급 중 내 몫 (만원) = 환급 예상액 − 월세 분담자에게 돌려줄 몫.
// 저장된 계산값이 없으면 연금 세액공제분(납입액 × 공제율)으로 본다.
export function expectedRefund(budget: BudgetData): number {
  if (budget.refundExpected !== undefined) return Math.max(0, budget.refundExpected - (budget.refundOtherShare ?? 0));
  return ((budget.pensionAnnualContribution || 0) * (budget.pensionTaxCreditRate || 0)) / 100;
}

// 환급(내 몫)을 연금 납입 계획 '안에' 넣는지 (월급에서 그만큼 덜 냄). 한도 위에 추가하면 false
function refundWithinPension(budget: BudgetData): boolean {
  return (budget.refundTo ?? "pension") === "pension" && budget.refundPensionMode !== "onTop";
}

// 연금 연간 납입액 중 월급에서 내는 몫 (만원/년). 환급을 계획 안에 보태면 그만큼 월급에서 덜 낸다.
export function pensionFromSalary(budget: BudgetData): number {
  const pension = budget.pensionAnnualContribution || 0;
  const offset = refundWithinPension(budget) ? Math.min(pension, expectedRefund(budget)) : 0;
  return pension - offset;
}

// 연금계좌에 1년 동안 넣는 돈 합계 (만원) = 계획 납입액 (+ 환급을 한도 위에 추가하면 그 환급)
export function pensionAccountTotal(budget: BudgetData): number {
  const pension = budget.pensionAnnualContribution || 0;
  const onTop = (budget.refundTo ?? "pension") === "pension" && budget.refundPensionMode === "onTop";
  return pension + (onTop ? expectedRefund(budget) : 0);
}

// 집 마련에 매달 모을 수 있는 돈 = 월 저축 가능액 − 월급에서 내는 연금(월) (+ 환급을 집 자금에 쓰면 환급/12)
export function monthlyHouseSavings(budget: BudgetData): number {
  const savings = budget.monthlyNetIncome - budget.expenseCategories.reduce((sum, c) => sum + c.amount, 0);
  const toHouse = budget.refundTo === "house" ? expectedRefund(budget) / 12 : 0;
  return savings - pensionFromSalary(budget) / 12 + toHouse;
}

export interface CurrentReturn {
  principal: number; // 만원, 히스토리에 기록된 최신 누적 납입원금
  currentTotal: number; // 만원, 지금 자산 스냅샷 합계 (실시간)
  profit: number; // 만원
  returnRate: number; // 비율(0~1)
}

// 히스토리에 기록된 가장 최근 누적 납입원금과 "지금" 자산 스냅샷 합계를 비교한 수익률.
// 히스토리 기록이 없거나 원금이 0이면 계산할 수 없어 null을 반환.
export function computeCurrentReturn(rows: AssetRow[], history: HistoryEntry[]): CurrentReturn | null {
  if (history.length === 0) return null;
  const latest = [...history].sort((a, b) => a.date.localeCompare(b.date))[history.length - 1];
  if (!latest || latest.cumulativePrincipal <= 0) return null;
  const currentTotal = computeReturnTotals(rows).total;
  const profit = currentTotal - latest.cumulativePrincipal;
  return {
    principal: latest.cumulativePrincipal,
    currentTotal,
    profit,
    returnRate: profit / latest.cumulativePrincipal,
  };
}

export function fmt(n: number | undefined | null): string {
  return Math.round(n || 0).toLocaleString("ko-KR");
}

// 만원 단위 금액을 원 단위 콤마 문자열로 변환 (예: 3.7 -> "37,000")
export function fmtWon(manwon: number | undefined | null): string {
  return Math.round((manwon || 0) * 10000).toLocaleString("ko-KR");
}

// 원 단위 콤마 문자열/숫자 문자열을 만원 단위 숫자로 변환 (예: "37,000" -> 3.7)
export function parseWonToManwon(text: string): number {
  const digits = text.replace(/[^0-9-]/g, "");
  if (!digits || digits === "-") return 0;
  return parseInt(digits, 10) / 10000;
}

// 만원 단위 금액을 차트 라벨용 "억" 단위 축약 문자열로 변환 (예: 23808.6 -> "2.4억")
export function fmtEok(manwon: number | undefined | null): string {
  return `${Math.round(((manwon || 0) / 10000) * 10) / 10}억`;
}

export function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

// 자산 행들에 등장하는 계좌 이름 목록 (가나다순, 빈 값 제외)
export function uniqueAccounts(rows: AssetRow[]): string[] {
  return Array.from(new Set(rows.map((r) => r.account).filter(Boolean))).sort();
}

// 연도별 시뮬레이션의 연간 신규 적립액(자동) = 월 저축 가능액 × 12 + 연말정산 환급 내 몫. 월급을 쓰고 남는 돈을 모두 투자한다고 본다.
export function autoAnnualContribution(budget: BudgetData): number {
  const savings = budget.monthlyNetIncome - budget.expenseCategories.reduce((sum, c) => sum + c.amount, 0);
  return Math.max(0, savings * 12 + expectedRefund(budget));
}
