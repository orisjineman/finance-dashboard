import type { AssetCategory, AssetRow, RebalanceSettings } from "./types";

export interface RebalanceTrade {
  rowId: string;
  account: string;
  item: string;
  action: "sell" | "buy";
  amount: number; // 만원
  taxAdvantaged: boolean;
}

export interface RebalanceResult {
  scopeTotal: number; // 만원, 위험+안전 합계 (현금성 제외)
  risk: number;
  safe: number;
  riskPct: number;
  driftPct: number; // 현재 위험 비중 - 목표 (%p)
  needsRebalance: boolean;
  sellCategory: AssetCategory | null;
  idealShift: number; // 목표 비중을 맞추기 위해 옮겨야 하는 금액
  achievedShift: number; // 실제 추천 거래로 옮기는 금액
  afterRiskPct: number;
  trades: RebalanceTrade[];
  notes: string[];
}

// ISA·IRP·연금저축은 계좌 안에서 사고팔아도 세금이 붙지 않아 리밸런싱을 우선 배정한다.
export function isTaxAdvantaged(account: string): boolean {
  return /ISA|IRP|연금/i.test(account);
}

export function computeRebalance(rows: AssetRow[], settings: RebalanceSettings): RebalanceResult {
  const excluded = new Set(settings.excludedAccounts);
  const scope = rows.filter((r) => !excluded.has(r.account) && (r.category === "risk" || r.category === "safe"));

  const risk = scope.filter((r) => r.category === "risk").reduce((s, r) => s + r.amount, 0);
  const safe = scope.filter((r) => r.category === "safe").reduce((s, r) => s + r.amount, 0);
  const scopeTotal = risk + safe;
  const riskPct = scopeTotal > 0 ? (risk / scopeTotal) * 100 : 0;
  const driftPct = riskPct - settings.targetRiskPct;
  const needsRebalance = scopeTotal > 0 && Math.abs(driftPct) > settings.tolerancePct;

  const result: RebalanceResult = {
    scopeTotal, risk, safe, riskPct, driftPct, needsRebalance,
    sellCategory: null, idealShift: 0, achievedShift: 0, afterRiskPct: riskPct, trades: [], notes: [],
  };
  if (!needsRebalance) return result;

  const sellCategory: AssetCategory = driftPct > 0 ? "risk" : "safe";
  const buyCategory: AssetCategory = sellCategory === "risk" ? "safe" : "risk";
  const idealShift = Math.abs(risk - (settings.targetRiskPct / 100) * scopeTotal);
  result.sellCategory = sellCategory;
  result.idealShift = idealShift;

  const accounts = Array.from(new Set(scope.map((r) => r.account)));
  const plans = accounts
    .map((account) => {
      const inAccount = scope.filter((r) => r.account === account);
      const sellRows = inAccount.filter((r) => r.category === sellCategory && r.amount > 0);
      const buyRows = inAccount.filter((r) => r.category === buyCategory);
      return { account, sellRows, buyRows, capacity: sellRows.reduce((s, r) => s + r.amount, 0) };
    })
    .filter((p) => p.capacity > 0 && p.buyRows.length > 0)
    .sort((a, b) => Number(isTaxAdvantaged(b.account)) - Number(isTaxAdvantaged(a.account)) || b.capacity - a.capacity);

  const sellLabel = sellCategory === "risk" ? "위험" : "안전";
  const skipped = accounts.filter((a) => !plans.some((p) => p.account === a) && scope.some((r) => r.account === a && r.category === sellCategory && r.amount > 0));
  if (skipped.length > 0) {
    result.notes.push(`${skipped.join(", ")}: 같은 계좌 안에 사 둘 상품이 없어 제외했어 (계좌 밖으로 옮기려면 출금이 필요해).`);
  }

  let remaining = idealShift;
  for (const plan of plans) {
    if (remaining <= 0) break;
    const x = Math.min(remaining, plan.capacity);
    const taxAdvantaged = isTaxAdvantaged(plan.account);
    for (const r of plan.sellRows) {
      result.trades.push({ rowId: r.id, account: plan.account, item: r.item, action: "sell", amount: (x * r.amount) / plan.capacity, taxAdvantaged });
    }
    const buyBase = plan.buyRows.reduce((s, r) => s + r.amount, 0);
    for (const r of plan.buyRows) {
      const share = buyBase > 0 ? r.amount / buyBase : 1 / plan.buyRows.length;
      result.trades.push({ rowId: r.id, account: plan.account, item: r.item, action: "buy", amount: x * share, taxAdvantaged });
    }
    if (!taxAdvantaged) {
      result.notes.push(`${plan.account}는 일반 과세 계좌라 ${sellLabel}자산을 팔면 양도소득세·배당세가 생길 수 있어.`);
    }
    remaining -= x;
  }

  result.achievedShift = idealShift - Math.max(remaining, 0);
  const shiftedRisk = sellCategory === "risk" ? -result.achievedShift : result.achievedShift;
  result.afterRiskPct = ((risk + shiftedRisk) / scopeTotal) * 100;
  if (remaining > 0.0001) {
    const shortWon = Math.round(remaining * 10000).toLocaleString("ko-KR");
    const buyLabel = buyCategory === "risk" ? "위험자산" : "안전자산";
    result.notes.push(
      `계좌 안에서 옮길 수 있는 금액이 부족해서 ${shortWon}원은 맞추지 못해. 남는 부족분은 신규 납입금으로 ${buyLabel}을 추가 매수하거나, 해당 계좌 밖의 ${sellLabel}자산을 출금해 채워야 해.`
    );
  }
  return result;
}
