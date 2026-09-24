import type { AssetRow, RebalanceSettings } from "./types";
import type { RebalanceTrade } from "./rebalance";

export const DEFAULT_FEE_PCT = 0.015;
export const DEFAULT_TAX_RATE_PCT = 15.4;

export interface CostEstimate {
  fee: number; // 만원, 사고파는 금액 전체에 대한 수수료 추정
  tax: number; // 만원, 일반 과세 계좌 매도 차익에 대한 세금 추정 (매입 원금을 입력한 상품만)
  unknown: string[]; // 매입 원금이 없어 세금을 계산하지 못한 "계좌 · 상품"
}

// 추천 거래의 수수료와 세금을 대략 추정한다. 세금은 (평가금액 - 매입 원금)의 비율만큼을 매도액에 곱해 차익을 잡고,
// 세금 우대 계좌(ISA·IRP·연금저축)는 계산에서 뺀다. 상품·계좌별 실제 세법과는 다를 수 있는 참고용 숫자다.
export function estimateCosts(trades: RebalanceTrade[], rows: AssetRow[], settings: Pick<RebalanceSettings, "feePct" | "taxRatePct">): CostEstimate {
  const feePct = settings.feePct ?? DEFAULT_FEE_PCT;
  const taxRate = settings.taxRatePct ?? DEFAULT_TAX_RATE_PCT;
  const byId = new Map(rows.map((r) => [r.id, r]));
  let fee = 0;
  let tax = 0;
  const unknown = new Set<string>();
  for (const t of trades) {
    fee += (t.amount * feePct) / 100;
    if (t.action !== "sell" || t.taxAdvantaged) continue;
    const row = byId.get(t.rowId);
    if (!row || row.costBasis === undefined || row.amount <= 0) {
      unknown.add(`${t.account} · ${t.item}`);
      continue;
    }
    const gainRatio = Math.max(0, (row.amount - row.costBasis) / row.amount);
    tax += (t.amount * gainRatio * taxRate) / 100;
  }
  return { fee, tax, unknown: Array.from(unknown) };
}
