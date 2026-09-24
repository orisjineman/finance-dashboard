import type { AssetCategory, AssetRow, RebalanceSettings } from "./types";

export interface RebalanceTrade {
  rowId: string;
  account: string;
  item: string;
  action: "sell" | "buy";
  amount: number; // 만원, 1주 단위로 맞춘 실제 거래금액
  shares?: number; // 1주 가격이 입력된 상품만
  unitPrice?: number; // 만원
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

  const EPS = 1e-9;
  const won = (m: number) => Math.round(m * 10000).toLocaleString("ko-KR");
  const wholeShares = (amount: number, price: number) => Math.floor(amount / price + EPS);
  const hasPrice = (r: AssetRow) => (r.unitPrice ?? 0) > 0;

  let remaining = idealShift;
  let sumSells = 0;
  let sumBuys = 0;
  for (const plan of plans) {
    if (remaining <= 0.0001) break;
    const x = Math.min(remaining, plan.capacity);
    const taxAdvantaged = isTaxAdvantaged(plan.account);

    const sells = plan.sellRows.map((r) => {
      const target = (x * r.amount) / plan.capacity;
      if (hasPrice(r)) {
        const price = r.unitPrice as number;
        const shares = Math.min(wholeShares(r.amount, price), Math.round(target / price));
        return { r, shares: shares as number | undefined, amount: shares * price };
      }
      return { r, shares: undefined as number | undefined, amount: target };
    });
    let proceeds = sells.reduce((sum, t) => sum + t.amount, 0);
    if (proceeds <= EPS) {
      result.notes.push(`${plan.account}: 팔아야 할 금액이 1주 가격보다 작아서 이 계좌는 거래를 건너뛰었어.`);
      continue;
    }

    const buyBase = plan.buyRows.reduce((sum, r) => sum + r.amount, 0);
    const buys = plan.buyRows.map((r) => {
      const share = buyBase > 0 ? r.amount / buyBase : 1 / plan.buyRows.length;
      const target = proceeds * share;
      if (hasPrice(r)) {
        const price = r.unitPrice as number;
        const shares = wholeShares(target, price);
        return { r, shares: shares as number | undefined, amount: shares * price };
      }
      return { r, shares: undefined as number | undefined, amount: target };
    });

    let leftover = proceeds - buys.reduce((sum, t) => sum + t.amount, 0);
    if (leftover > EPS) {
      const free = buys.filter((b) => b.shares === undefined);
      if (free.length > 0) {
        free.forEach((b) => (b.amount += leftover / free.length));
        leftover = 0;
      } else if (sells.every((t) => t.shares === undefined)) {
        const factor = (proceeds - leftover) / proceeds;
        sells.forEach((t) => (t.amount *= factor));
        proceeds -= leftover;
        leftover = 0;
      }
    }
    if (leftover * 10000 >= 1) {
      result.notes.push(`${plan.account}: 1주 단위로 맞추다 보니 ${won(leftover)}원은 쓰지 못하고 매도 대금으로 계좌에 남아.`);
    }

    for (const t of sells) {
      if (t.amount <= EPS) continue;
      result.trades.push({ rowId: t.r.id, account: plan.account, item: t.r.item, action: "sell", amount: t.amount, shares: t.shares, unitPrice: t.r.unitPrice, taxAdvantaged });
    }
    for (const t of buys) {
      if (t.amount <= EPS) continue;
      result.trades.push({ rowId: t.r.id, account: plan.account, item: t.r.item, action: "buy", amount: t.amount, shares: t.shares, unitPrice: t.r.unitPrice, taxAdvantaged });
    }
    if (!taxAdvantaged) {
      result.notes.push(`${plan.account}는 일반 과세 계좌라 ${sellLabel}자산을 팔면 양도소득세·배당세가 생길 수 있어.`);
    }
    sumSells += sells.reduce((sum, t) => sum + t.amount, 0);
    sumBuys += buys.reduce((sum, t) => sum + t.amount, 0);
    remaining -= proceeds;
  }

  result.achievedShift = sumSells;
  const riskDelta = sellCategory === "risk" ? -sumSells : sumBuys;
  result.afterRiskPct = ((risk + riskDelta) / scopeTotal) * 100;
  if (remaining * 10000 > 1000) {
    const buyLabel = buyCategory === "risk" ? "위험자산" : "안전자산";
    result.notes.push(
      `계좌 안 대체 상품이 부족하거나 1주 단위로 맞추느라 ${won(remaining)}원은 못 맞췄어. 남는 부족분은 신규 납입금으로 ${buyLabel}을 추가 매수하거나, 해당 계좌 밖의 ${sellLabel}자산을 출금해 채워야 해.`
    );
  }
  return result;
}
