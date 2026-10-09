import type { AssetRow, BudgetData, IncomeEntry } from "./types";
import { isTaxAdvantaged } from "./rebalance";
import { yearIncome } from "./income";

// 세금 우대 계좌(ISA·연금) 활용 점검: ISA 납입·비과세 한도, 금융소득종합과세 접근, 상품 위치 추천. 금액은 만원.
// 한도 숫자는 세법 개정으로 바뀔 수 있어 참고용이다. 바뀌면 여기 상수를 고친다.

export const ISA_ANNUAL_LIMIT = 2000;
export const ISA_TOTAL_LIMIT = 10000;
export const ISA_TAXFREE: Record<"general" | "low", number> = { general: 200, low: 400 };
export const COMPREHENSIVE_THRESHOLD = 2000; // 이자+배당 연 2천만원 초과 시 금융소득종합과세
export const COMPREHENSIVE_WARN_RATIO = 0.8;
export const HIGH_YIELD_PCT = 3; // 이 이상이면 '현금흐름이 큰 상품'으로 본다
export const DIVIDEND_TAX_PCT = 15.4;

const isIsa = (account: string) => /ISA/i.test(account);

export interface IsaStatus {
  kind: "general" | "low";
  paid: number; // 올해 납입
  remaining: number; // 올해 더 넣을 수 있는 금액
  taxFreeLimit: number;
  isaIncome: number; // 올해 ISA 계좌에서 받은 배당·이자
  taxFreeLeft: number;
  balance: number; // ISA 계좌 잔액 합계
}

export function isaStatus(budget: BudgetData, rows: AssetRow[], year: number): IsaStatus {
  const kind = budget.isaKind ?? "general";
  const paid = budget.isaPaid?.year === year ? budget.isaPaid.amount : 0;
  const taxFreeLimit = ISA_TAXFREE[kind];
  const isaIncome = (budget.incomeLog ?? []).filter((e) => isIsa(e.account) && e.date.startsWith(`${year}-`)).reduce((s, e) => s + e.amount, 0);
  return {
    kind,
    paid,
    remaining: Math.max(0, ISA_ANNUAL_LIMIT - paid),
    taxFreeLimit,
    isaIncome,
    taxFreeLeft: Math.max(0, taxFreeLimit - isaIncome),
    balance: rows.filter((r) => isIsa(r.account)).reduce((s, r) => s + r.amount, 0),
  };
}

export interface ComprehensiveStatus {
  received: number; // 올해 일반 과세 계좌에서 받은 이자+배당
  expected: number; // 올해 예상 합계 (받은 것 + 남은 기간은 보유 상품의 예상 수익률로)
  threshold: number;
  level: "ok" | "near" | "over";
}

// 일반 과세 계좌(ISA·연금 제외)의 이자+배당만 센다. 올해 예상은 '받은 금액'과 '연 예상 수입'을 단순 비교해 큰 쪽으로 본다.
export function comprehensiveStatus(log: IncomeEntry[], rows: AssetRow[], year: number): ComprehensiveStatus {
  const received = yearIncome(
    log.filter((e) => !isTaxAdvantaged(e.account)),
    year
  ).total;
  const planned = rows.filter((r) => !isTaxAdvantaged(r.account) && r.amount > 0 && r.yieldPct).reduce((s, r) => s + (r.amount * (r.yieldPct as number)) / 100, 0);
  const expected = Math.max(received, planned);
  const level = expected > COMPREHENSIVE_THRESHOLD ? "over" : expected >= COMPREHENSIVE_THRESHOLD * COMPREHENSIVE_WARN_RATIO ? "near" : "ok";
  return { received, expected, threshold: COMPREHENSIVE_THRESHOLD, level };
}

export interface PlacementTip {
  rowId: string;
  account: string;
  item: string;
  amount: number;
  yieldPct: number;
  yearlyTax: number; // 일반 과세로 두면 해마다 내는 세금 추정 (만원)
}

// 배당·이자가 큰 상품이 일반 과세 계좌에 있으면 ISA·연금계좌로 옮기라고 알린다 (세금 많은 순).
export function placementTips(rows: AssetRow[]): PlacementTip[] {
  return rows
    .filter((r) => !isTaxAdvantaged(r.account) && r.amount > 0 && (r.yieldPct ?? 0) >= HIGH_YIELD_PCT && !r.excludeFromReturn)
    .map((r) => ({
      rowId: r.id,
      account: r.account,
      item: r.item,
      amount: r.amount,
      yieldPct: r.yieldPct as number,
      yearlyTax: (r.amount * (r.yieldPct as number) * DIVIDEND_TAX_PCT) / 10000,
    }))
    .sort((a, b) => b.yearlyTax - a.yearlyTax);
}
