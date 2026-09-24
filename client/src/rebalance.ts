import type { AssetCategory, AssetRow, GlidePathRow, RebalanceGroup, StrategyData } from "./types";

export interface RebalanceTrade {
  rowId: string;
  account: string;
  item: string;
  action: "sell" | "buy";
  amount: number; // 만원, 1주 단위로 맞춘 실제 거래금액
  shares?: number; // 1주 가격이 입력된 상품만
  unitPrice?: number; // 만원
  taxAdvantaged: boolean;
  crossAccount?: boolean; // 다른 계좌에서 옮겨 온 돈으로 하는 거래인지
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
  transfers: { from: string; to: string; amount: number }[]; // 계좌 간 이동 (만원)
  notes: string[];
}

// ISA·IRP·연금저축은 계좌 안에서 사고팔아도 세금이 붙지 않아 리밸런싱을 우선 배정한다.
export function isTaxAdvantaged(account: string): boolean {
  return /ISA|IRP|연금/i.test(account);
}

// 집 매수 예정일까지 남은 기간(년). 날짜가 없거나 잘못되면 null, 이미 지났으면 0.
export function yearsUntil(dateStr: string, now: Date = new Date()): number | null {
  if (!dateStr) return null;
  const target = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  return Math.max(0, (target.getTime() - now.getTime()) / (365.25 * 86400000));
}

// 글리드 패스 지점(남은 기간, 위험 비중) 사이를 직선으로 이어서 목표 비중을 계산.
// 가장 먼 지점보다 멀면 그 지점 값, 가장 가까운 지점보다 가까우면 그 지점 값을 쓴다.
export function glideRiskPct(points: GlidePathRow[], yearsLeft: number): number | null {
  const pts = points.filter((p) => Number.isFinite(p.yearsLeft) && Number.isFinite(p.riskPct)).sort((a, b) => a.yearsLeft - b.yearsLeft);
  if (pts.length === 0) return null;
  if (yearsLeft <= pts[0].yearsLeft) return pts[0].riskPct;
  if (yearsLeft >= pts[pts.length - 1].yearsLeft) return pts[pts.length - 1].riskPct;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (yearsLeft >= a.yearsLeft && yearsLeft <= b.yearsLeft) {
      const t = b.yearsLeft === a.yearsLeft ? 0 : (yearsLeft - a.yearsLeft) / (b.yearsLeft - a.yearsLeft);
      return a.riskPct + (b.riskPct - a.riskPct) * t;
    }
  }
  return null;
}

export function computeRebalance(
  rows: AssetRow[],
  accounts: string[],
  targetRiskPct: number,
  tolerancePct: number,
  riskAccess: Record<string, "allowed" | "blocked"> = {},
  depositLimit: Record<string, number> = {}
): RebalanceResult {
  const included = new Set(accounts);
  const scope = rows.filter((r) => included.has(r.account) && (r.category === "risk" || r.category === "safe"));

  const risk = scope.filter((r) => r.category === "risk").reduce((s, r) => s + r.amount, 0);
  const safe = scope.filter((r) => r.category === "safe").reduce((s, r) => s + r.amount, 0);
  const scopeTotal = risk + safe;
  const riskPct = scopeTotal > 0 ? (risk / scopeTotal) * 100 : 0;
  const driftPct = riskPct - targetRiskPct;
  const needsRebalance = scopeTotal > 0 && Math.abs(driftPct) > tolerancePct;

  const result: RebalanceResult = {
    scopeTotal, risk, safe, riskPct, driftPct, needsRebalance,
    sellCategory: null, idealShift: 0, achievedShift: 0, afterRiskPct: riskPct, trades: [], transfers: [], notes: [],
  };
  if (!needsRebalance) return result;

  const sellCategory: AssetCategory = driftPct > 0 ? "risk" : "safe";
  const buyCategory: AssetCategory = sellCategory === "risk" ? "safe" : "risk";
  const idealShift = Math.abs(risk - (targetRiskPct / 100) * scopeTotal);
  result.sellCategory = sellCategory;
  result.idealShift = idealShift;

  const accountList = Array.from(new Set(scope.map((r) => r.account)));
  const plans = accountList
    .map((account) => {
      const inAccount = scope.filter((r) => r.account === account);
      const sellRows = inAccount.filter((r) => r.category === sellCategory && r.amount > 0 && r.rebalanceRule !== "hold");
      const buyCandidates = inAccount.filter((r) => r.category === buyCategory && r.rebalanceRule !== "hold");
      const preferred = buyCandidates.filter((r) => r.rebalanceRule === "preferred");
      const buyRows = preferred.length > 0 ? preferred : buyCandidates;
      return { account, sellRows, buyRows, capacity: sellRows.reduce((s, r) => s + r.amount, 0) };
    })
    .filter((p) => p.capacity > 0 && p.buyRows.length > 0)
    .filter((p) => !(buyCategory === "risk" && riskAccess[p.account] === "blocked"))
    .sort((a, b) => Number(isTaxAdvantaged(b.account)) - Number(isTaxAdvantaged(a.account)) || b.capacity - a.capacity);

  const sellLabel = sellCategory === "risk" ? "위험" : "안전";
  const blockedSkipped = buyCategory === "risk" ? accountList.filter((a) => riskAccess[a] === "blocked" && scope.some((r) => r.account === a && r.category === "safe" && r.amount > 0)) : [];
  if (blockedSkipped.length > 0) {
    result.notes.push(`${blockedSkipped.join(", ")}: 위험자산 편입 불가로 설정돼 있어서 위험자산을 사는 거래에서 제외했어.`);
  }
  const skipped = accountList.filter((a) => !blockedSkipped.includes(a) && !plans.some((p) => p.account === a) && scope.some((r) => r.account === a && r.category === sellCategory && r.amount > 0 && r.rebalanceRule !== "hold"));
  if (skipped.length > 0) {
    result.notes.push(`${skipped.join(", ")}: 같은 계좌 안에 사 둘 상품이 없거나 '매매 안 함'으로 묶여 있어 제외했어 (계좌 밖으로 옮기려면 출금이 필요해).`);
  }

  const EPS = 1e-9;
  const won = (m: number) => Math.round(m * 10000).toLocaleString("ko-KR");
  const wholeShares = (amount: number, price: number) => Math.floor(amount / price + EPS);
  // 같은 상품(이름)이 여러 계좌에 있으면 가격을 한 번만 입력해도 되도록, 어느 한 곳에 입력된 가격을 같은 이름의 상품에 공유한다.
  const priceByItem = new Map<string, number>();
  for (const r of rows) {
    if ((r.unitPrice ?? 0) > 0 && !priceByItem.has(r.item)) priceByItem.set(r.item, r.unitPrice as number);
  }
  const priceOf = (r: AssetRow): number | undefined => ((r.unitPrice ?? 0) > 0 ? r.unitPrice : priceByItem.get(r.item));
  const hasPrice = (r: AssetRow) => priceOf(r) !== undefined;

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
        const price = priceOf(r) as number;
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
        const price = priceOf(r) as number;
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
      result.trades.push({ rowId: t.r.id, account: plan.account, item: t.r.item, action: "sell", amount: t.amount, shares: t.shares, unitPrice: priceOf(t.r), taxAdvantaged });
    }
    for (const t of buys) {
      if (t.amount <= EPS) continue;
      result.trades.push({ rowId: t.r.id, account: plan.account, item: t.r.item, action: "buy", amount: t.amount, shares: t.shares, unitPrice: priceOf(t.r), taxAdvantaged });
    }
    if (!taxAdvantaged) {
      result.notes.push(`${plan.account}는 일반 과세 계좌라 ${sellLabel}자산을 팔면 양도소득세·배당세가 생길 수 있어.`);
    }
    sumSells += sells.reduce((sum, t) => sum + t.amount, 0);
    sumBuys += buys.reduce((sum, t) => sum + t.amount, 0);
    remaining -= proceeds;
  }

  // 2단계: 계좌 안에서 다 못 맞춘 몫은 계좌 간 이동으로 채운다.
  // 돈을 뺄 수 있는 계좌는 ISA·IRP·연금저축처럼 묶인 계좌를 뺀 계좌, 받을 수 있는 계좌는 '입금 가능 금액'이 남은 계좌뿐이다.
  if (remaining * 10000 > 1000) {
    const limitLeft = new Map<string, number>();
    for (const a of accountList) limitLeft.set(a, depositLimit[a] ?? 0);
    const soldBy = new Map<string, number>();
    for (const t of result.trades) if (t.action === "sell") soldBy.set(t.rowId, (soldBy.get(t.rowId) ?? 0) + t.amount);

    const sources = scope
      .filter((r) => r.category === sellCategory && r.rebalanceRule !== "hold" && !isTaxAdvantaged(r.account))
      .map((r) => ({ r, avail: r.amount - (soldBy.get(r.id) ?? 0) }))
      .filter((x) => x.avail > EPS)
      .sort((x, y) => y.avail - x.avail);

    const moved = new Map<string, number>();
    const taxNoted = new Set<string>();
    for (const src of sources) {
      let avail = src.avail;
      while (remaining * 10000 > 1000 && avail > EPS) {
        const dest = accountList
          .filter((a) => a !== src.r.account && (limitLeft.get(a) ?? 0) > EPS && !(buyCategory === "risk" && riskAccess[a] === "blocked"))
          .map((a) => {
            const cands = scope.filter((r) => r.account === a && r.category === buyCategory && r.rebalanceRule !== "hold");
            const pref = cands.filter((r) => r.rebalanceRule === "preferred");
            return { a, rows: pref.length > 0 ? pref : cands };
          })
          .filter((d) => d.rows.length > 0)
          .sort((x, y) => (limitLeft.get(y.a) ?? 0) - (limitLeft.get(x.a) ?? 0))[0];
        if (!dest) break;

        let x = Math.min(remaining, avail, limitLeft.get(dest.a) ?? 0);
        let sellShares: number | undefined;
        if (hasPrice(src.r)) {
          const price = priceOf(src.r) as number;
          sellShares = Math.min(wholeShares(avail, price), Math.round(x / price));
          x = sellShares * price;
        }
        if (x <= EPS) break;

        const base = dest.rows.reduce((sum, r) => sum + r.amount, 0);
        const buysHere = dest.rows.map((r) => {
          const share = base > 0 ? r.amount / base : 1 / dest.rows.length;
          const target = x * share;
          if (hasPrice(r)) {
            const price = priceOf(r) as number;
            const sh = wholeShares(target, price);
            return { r, shares: sh as number | undefined, amount: sh * price };
          }
          return { r, shares: undefined as number | undefined, amount: target };
        });
        let spent = buysHere.reduce((sum, t) => sum + t.amount, 0);
        let left = x - spent;
        const free = buysHere.filter((b) => b.shares === undefined);
        if (left > EPS && free.length > 0) {
          free.forEach((b) => (b.amount += left / free.length));
          spent = x;
          left = 0;
        }
        if (spent <= EPS) {
          result.notes.push(`${dest.a}로 옮길 금액(${won(x)}원)이 1주 가격보다 작아서 계좌 간 이동은 하지 않았어.`);
          break;
        }
        if (left * 10000 >= 1) {
          result.notes.push(`${dest.a}: 1주 단위로 맞추다 보니 옮겨 온 돈 중 ${won(left)}원은 쓰지 못하고 예수금으로 남아.`);
        }

        result.trades.push({ rowId: src.r.id, account: src.r.account, item: src.r.item, action: "sell", amount: x, shares: sellShares, unitPrice: priceOf(src.r), taxAdvantaged: false, crossAccount: true });
        for (const t of buysHere) {
          if (t.amount <= EPS) continue;
          result.trades.push({ rowId: t.r.id, account: dest.a, item: t.r.item, action: "buy", amount: t.amount, shares: t.shares, unitPrice: priceOf(t.r), taxAdvantaged: isTaxAdvantaged(dest.a), crossAccount: true });
        }
        const key = `${src.r.account}\u0000${dest.a}`;
        moved.set(key, (moved.get(key) ?? 0) + x);
        if (!taxNoted.has(src.r.account) && !result.notes.some((n) => n.startsWith(`${src.r.account}는 일반 과세`))) {
          result.notes.push(`${src.r.account}는 일반 과세 계좌라 ${sellLabel}자산을 팔면 양도소득세·배당세가 생길 수 있어.`);
        }
        taxNoted.add(src.r.account);
        limitLeft.set(dest.a, (limitLeft.get(dest.a) ?? 0) - x);
        avail -= x;
        remaining -= x;
        sumSells += x;
        sumBuys += spent;
      }
    }
    result.transfers = Array.from(moved.entries()).map(([key, amount]) => {
      const [from, to] = key.split("\u0000");
      return { from, to, amount };
    });
  }

  result.achievedShift = sumSells;
  const riskDelta = sellCategory === "risk" ? -sumSells : sumBuys;
  result.afterRiskPct = ((risk + riskDelta) / scopeTotal) * 100;
  if (remaining * 10000 > 1000) {
    const buyLabel = buyCategory === "risk" ? "위험자산" : "안전자산";
    result.notes.push(
      `계좌 안 대체 상품이 부족하거나, 1주 단위로 맞추느라, 또는 계좌 간 이동 한도(입금 가능 금액)가 없어서 ${won(remaining)}원은 못 맞췄어. 남는 부족분은 신규 납입금으로 ${buyLabel}을 추가 매수하거나, 입금 가능 금액을 늘려야 해.`
    );
  }
  return result;
}

// 묶음의 목표 위험 비중 (고정이면 그 값, 글리드 패스면 집 매수 예정일까지 남은 기간으로 계산). 계산할 수 없으면 null.
export function groupTarget(group: RebalanceGroup, strategy: StrategyData): number | null {
  if (group.targetType === "fixed") return group.fixedRiskPct;
  const y = yearsUntil(strategy.housePurchaseDate);
  return y === null ? null : glideRiskPct(strategy.glidePath, y);
}

export interface GroupPlanAccount {
  account: string;
  amount: number; // 만원
  holdsRisk: boolean; // 스냅샷에 위험 상품 행이 하나라도 있는지
  riskAmount: number; // 만원, 지금 들고 있는 위험자산 금액
  policy: "allowed" | "blocked" | "auto"; // 사용자가 정한 위험자산 편입 설정 (auto = 위험 상품 유무로 자동 판단)
  canHoldRisk: boolean; // 최종 판단: 이 계좌가 위험자산을 담을 수 있는지
}

// 리밸런싱 탭의 목표(묶음 전체 기준)를 이루려면 계좌별로 어떻게 나눠야 하는지 계산한다.
// 위험자산 편입이 불가한 계좌는 (이미 있는 위험자산은 그대로 두고) 나머지는 안전으로 고정,
// 편입 가능한 계좌들이 남은 목표 위험 금액을 맡아야 한다.
export interface GroupPlan {
  total: number;
  targetRiskPct: number;
  requiredRisk: number; // 묶음 전체의 목표 위험 금액
  accounts: GroupPlanAccount[];
  safeOnly: GroupPlanAccount[]; // 위험 편입 불가(또는 위험 상품 없음)로 보는 계좌
  capable: GroupPlanAccount[]; // 위험 편입 가능한 계좌
  capableTotal: number;
  fixedRisk: number; // 편입 불가 계좌가 이미 들고 있는 위험자산
  capableRiskPct: number | null; // 편입 가능 계좌들 안에서 필요한 위험 비중 (0~100 밖이면 불가능)
  maxRiskPct: number; // 이 묶음이 낼 수 있는 최대 위험 비중
  minRiskPct: number; // 이 묶음이 낼 수 있는 최소 위험 비중 (편입 불가 계좌에 이미 있는 위험자산 때문에 0보다 클 수 있음)
  feasible: boolean;
  tooLow: boolean; // 목표가 최소 위험 비중보다 낮아 못 맞추는 경우
}

export function deriveGroupPlan(
  rows: AssetRow[],
  accountNames: string[],
  targetRiskPct: number,
  riskAccess: Record<string, "allowed" | "blocked"> = {}
): GroupPlan {
  const included = new Set(accountNames);
  const map = new Map<string, GroupPlanAccount>();
  for (const r of rows) {
    if (!included.has(r.account) || (r.category !== "risk" && r.category !== "safe")) continue;
    const cur =
      map.get(r.account) ?? { account: r.account, amount: 0, holdsRisk: false, riskAmount: 0, policy: riskAccess[r.account] ?? "auto", canHoldRisk: false };
    cur.amount += r.amount;
    if (r.category === "risk") {
      cur.holdsRisk = true;
      cur.riskAmount += r.amount;
    }
    map.set(r.account, cur);
  }
  const accounts = Array.from(map.values()).sort((a, b) => b.amount - a.amount);
  for (const a of accounts) a.canHoldRisk = a.policy === "allowed" || (a.policy === "auto" && a.holdsRisk);
  const total = accounts.reduce((sum, a) => sum + a.amount, 0);
  const capable = accounts.filter((a) => a.canHoldRisk);
  const safeOnly = accounts.filter((a) => !a.canHoldRisk);
  const capableTotal = capable.reduce((sum, a) => sum + a.amount, 0);
  const fixedRisk = safeOnly.reduce((sum, a) => sum + a.riskAmount, 0);
  const requiredRisk = (total * targetRiskPct) / 100;
  const needFromCapable = requiredRisk - fixedRisk;
  const EPS = 1e-9;
  return {
    total,
    targetRiskPct,
    requiredRisk,
    accounts,
    safeOnly,
    capable,
    capableTotal,
    fixedRisk,
    capableRiskPct: capableTotal > 0 ? (needFromCapable / capableTotal) * 100 : null,
    maxRiskPct: total > 0 ? ((capableTotal + fixedRisk) / total) * 100 : 0,
    minRiskPct: total > 0 ? (fixedRisk / total) * 100 : 0,
    feasible: needFromCapable <= capableTotal + EPS && needFromCapable >= -EPS,
    tooLow: needFromCapable < -EPS,
  };
}

// 추천 거래를 적용한 뒤의 자산 목록 (매도는 그 행에서 빼고 매수는 그 행에 더한다). 돈은 같은 묶음 안에 머무른다고 본다.
export function applyTrades(rows: AssetRow[], trades: RebalanceTrade[]): AssetRow[] {
  const delta = new Map<string, number>();
  for (const t of trades) delta.set(t.rowId, (delta.get(t.rowId) ?? 0) + (t.action === "buy" ? t.amount : -t.amount));
  return rows.map((r) => (delta.has(r.id) ? { ...r, amount: Math.max(0, r.amount + (delta.get(r.id) as number)) } : r));
}
