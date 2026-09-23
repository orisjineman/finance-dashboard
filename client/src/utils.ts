import type { AssetRow, LoanInput } from "./types";

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

// 집 마련 자금으로 쓸 수 있는 가용자산 합계 (연금저축·IRP 등 housingEligible=false 항목 제외)
export function computeHousingLiquid(rows: AssetRow[]): number {
  return rows.filter((r) => r.housingEligible).reduce((sum, r) => sum + r.amount, 0);
}

// 대출 계산기와 동일한 공식으로 필요 자기자금(집값 - LTV 대출한도)을 계산
export function computeLoanEquity(loan: LoanInput): number {
  const ltv = (loan.ltvPct || 0) / 100;
  return loan.price * (1 - ltv);
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

export function debounce<Args extends unknown[]>(fn: (...args: Args) => void, wait: number) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (...args: Args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}
