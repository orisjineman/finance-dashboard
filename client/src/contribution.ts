import type { AssetRow } from "./types";
import { applyTrades, type RebalanceTrade } from "./rebalance";

export interface ContributionBuy {
  rowId: string;
  item: string;
  category: "risk" | "safe";
  amount: number; // 만원, 1주 단위로 맞춘 실제 매수 금액
  shares?: number;
  unitPrice?: number; // 만원
}

export interface ContributionPlan {
  scopeTotal: number; // 만원, 납입 전 위험+안전 합계
  riskPct: number; // 납입 전
  afterRiskPct: number; // 납입 후 (실제로 산 금액 기준)
  riskWanted: number; // 만원, 목표에 맞추려고 위험으로 넣고 싶은 금액
  safeWanted: number; // 만원
  buys: ContributionBuy[];
  unspent: number; // 만원, 사지 못하고 예수금으로 남는 금액
  reachesTarget: boolean; // 팔지 않고 이 금액만으로 목표 비중에 닿는지
  notes: string[];
}

// 목표 비중(%)에 맞추려면 (팔지 않고) 새 돈만으로 얼마를 넣어야 하는지 (만원). 목표가 0%이거나 100%라 불가능하면 null.
export function contributionNeeded(risk: number, total: number, targetPct: number): number | null {
  const t = targetPct / 100;
  if (total <= 0 || t <= 0 || t >= 1) return null;
  const riskGap = t * total - risk;
  if (riskGap > 0) return riskGap / (1 - t); // 위험이 모자람 → 전부 위험자산으로
  if (riskGap < 0) return risk / t - total; // 위험이 넘침 → 전부 안전자산으로
  return 0;
}

const EPS = 1e-9;

// 같은 이름의 상품은 한 곳에 입력한 1주 가격을 다른 행에서도 쓴다.
function makePriceOf(rows: AssetRow[]): (r: AssetRow) => number | undefined {
  const priceByItem = new Map<string, number>();
  for (const r of rows) if ((r.unitPrice ?? 0) > 0 && !priceByItem.has(r.item)) priceByItem.set(r.item, r.unitPrice as number);
  return (r) => ((r.unitPrice ?? 0) > 0 ? (r.unitPrice as number) : priceByItem.get(r.item));
}

// 기존 자산은 팔지 않고, account 에 새로 넣는 돈(amount, 만원)만으로 목표 위험 비중에 최대한 가깝게 사는 계획을 만든다.
// 위험/안전 어느 쪽에 얼마를 넣을지는 '납입 후 목표 비중'에서 정하고, 그 계좌의 '매매 안 함' 상품은 사지 않는다.
export function computeContribution(
  rows: AssetRow[],
  groupAccounts: string[],
  targetRiskPct: number,
  account: string,
  amount: number,
  riskAccess: Record<string, "allowed" | "blocked"> = {}
): ContributionPlan {
  const included = new Set(groupAccounts);
  const scope = rows.filter((r) => included.has(r.account) && (r.category === "risk" || r.category === "safe"));
  const risk = scope.filter((r) => r.category === "risk").reduce((s, r) => s + r.amount, 0);
  const scopeTotal = scope.reduce((s, r) => s + r.amount, 0);
  const plan: ContributionPlan = {
    scopeTotal,
    riskPct: scopeTotal > 0 ? (risk / scopeTotal) * 100 : 0,
    afterRiskPct: scopeTotal > 0 ? (risk / scopeTotal) * 100 : 0,
    riskWanted: 0,
    safeWanted: 0,
    buys: [],
    unspent: Math.max(0, amount),
    reachesTarget: false,
    notes: [],
  };
  if (!(amount > 0)) return plan;
  if (!included.has(account)) {
    plan.notes.push("납입할 계좌가 이 묶음에 들어 있지 않아.");
    return plan;
  }

  const target = targetRiskPct / 100;
  const riskGap = target * (scopeTotal + amount) - risk;
  plan.riskWanted = Math.min(amount, Math.max(0, riskGap));
  plan.safeWanted = amount - plan.riskWanted;

  const priceOf = makePriceOf(rows);

  const inAccount = scope.filter((r) => r.account === account);
  const spendOn = (category: "risk" | "safe", want: number) => {
    if (want <= EPS) return;
    if (category === "risk" && riskAccess[account] === "blocked") {
      plan.notes.push(`${account}는 위험자산 편입 불가라 ${won(want)}원을 못 샀어. 다른 계좌를 골라줘.`);
      return;
    }
    const cands = inAccount.filter((r) => r.category === category && r.rebalanceRule !== "hold");
    const preferred = cands.filter((r) => r.rebalanceRule === "preferred");
    const targets = preferred.length > 0 ? preferred : cands;
    if (targets.length === 0) {
      plan.notes.push(`${account}에 살 ${category === "risk" ? "위험" : "안전"}자산 상품이 없어서 ${won(want)}원은 예수금으로 남음.`);
      return;
    }
    const base = targets.reduce((s, r) => s + r.amount, 0);
    const parts = targets.map((r) => {
      const share = base > 0 ? r.amount / base : 1 / targets.length;
      const money = want * share;
      const price = priceOf(r);
      if (price) {
        const shares = Math.floor(money / price + EPS);
        return { r, shares: shares as number | undefined, price, amount: shares * price };
      }
      return { r, shares: undefined as number | undefined, price: undefined as number | undefined, amount: money };
    });
    const leftover = want - parts.reduce((s, p) => s + p.amount, 0);
    const free = parts.filter((p) => p.shares === undefined);
    if (leftover > EPS && free.length > 0) free.forEach((p) => (p.amount += leftover / free.length));
    else if (leftover * 10000 >= 1) plan.notes.push(`1주 단위라 ${won(leftover)}원은 예수금으로 남음.`);
    for (const p of parts) {
      if (p.amount <= EPS) continue;
      plan.buys.push({ rowId: p.r.id, item: p.r.item, category, amount: p.amount, shares: p.shares, unitPrice: p.price });
    }
  };
  spendOn("risk", plan.riskWanted);
  spendOn("safe", plan.safeWanted);

  const bought = plan.buys.reduce((s, b) => s + b.amount, 0);
  plan.unspent = Math.max(0, amount - bought);
  const riskBought = plan.buys.filter((b) => b.category === "risk").reduce((s, b) => s + b.amount, 0);
  plan.afterRiskPct = ((risk + riskBought) / (scopeTotal + bought)) * 100;
  plan.reachesTarget = Math.abs(plan.afterRiskPct - targetRiskPct) < 0.05;
  return plan;
}

const won = (m: number) => Math.round(m * 10000).toLocaleString("ko-KR");

// 새 돈을 넣을 계좌를 고른다. 해당 자산(위험/안전) 상품이 있고 편입 불가가 아닌 계좌 중, '입금 가능 금액'이 설정된 계좌를 먼저 쓴다.
export function pickAccount(
  rows: AssetRow[],
  accounts: string[],
  category: "risk" | "safe",
  riskAccess: Record<string, "allowed" | "blocked"> = {},
  depositLimit: Record<string, number> = {}
): string | null {
  const usable = accounts.filter(
    (a) => !(category === "risk" && riskAccess[a] === "blocked") && rows.some((r) => r.account === a && r.category === category && r.rebalanceRule !== "hold")
  );
  return usable.find((a) => (depositLimit[a] ?? 0) > 0) ?? usable[0] ?? null;
}

export interface TopUpRecommendation {
  account: string;
  category: "risk" | "safe"; // 새 돈을 넣어야 하는 쪽
  needed: number; // 만원, 추천 거래를 다 한 뒤에도 목표까지 모자란 몫을 새 돈으로 채우는 데 필요한 금액
  plan: ContributionPlan;
  // needed 만으로는 1주도 못 살 때: 가장 싼 상품 1주를 사려면 필요한 금액과 그때의 계획
  oneShare?: { item: string; amount: number; plan: ContributionPlan };
}

// 묶음 안의 매매·계좌 간 이동(trades)을 다 해도 목표 비중에 못 닿을 때, 남는 몫을 채우려면 어느 계좌에 새 돈을 얼마 넣어야 하는지 추천한다.
// 이미 목표에 닿았거나(0.05%p 이내) 채울 방법이 없으면 null.
export function recommendTopUp(
  rows: AssetRow[],
  accounts: string[],
  targetRiskPct: number,
  trades: RebalanceTrade[],
  riskAccess: Record<string, "allowed" | "blocked"> = {},
  depositLimit: Record<string, number> = {}
): TopUpRecommendation | null {
  const after = applyTrades(rows, trades);
  const scope = after.filter((r) => accounts.includes(r.account) && (r.category === "risk" || r.category === "safe"));
  const total = scope.reduce((s, r) => s + r.amount, 0);
  const risk = scope.filter((r) => r.category === "risk").reduce((s, r) => s + r.amount, 0);
  if (total <= 0 || Math.abs((risk / total) * 100 - targetRiskPct) < 0.05) return null;
  const needed = contributionNeeded(risk, total, targetRiskPct);
  if (needed === null || needed <= EPS) return null;
  const category = (risk / total) * 100 < targetRiskPct ? "risk" : "safe";
  const account = pickAccount(after, accounts, category, riskAccess, depositLimit);
  if (!account) return null;
  const plan = computeContribution(after, accounts, targetRiskPct, account, needed, riskAccess);
  const rec: TopUpRecommendation = { account, category, needed, plan };
  if (plan.buys.length === 0 && !plan.notes.some((n) => n.includes("편입 불가"))) {
    const priceOf = makePriceOf(after);
    const cands = after.filter((r) => r.account === account && r.category === category && r.rebalanceRule !== "hold");
    const preferred = cands.filter((r) => r.rebalanceRule === "preferred");
    const priced = (preferred.length > 0 ? preferred : cands).map((r) => ({ r, price: priceOf(r) })).filter((x): x is { r: AssetRow; price: number } => x.price !== undefined);
    if (priced.length > 0) {
      const cheapest = priced.reduce((a, b) => (b.price < a.price ? b : a));
      // 1주만 그대로 산다고 보고 그때의 비중을 계산한다 (목표 비중 배분과 상관없이 그 상품에 전액)
      const oneShareAfter = ((category === "risk" ? risk + cheapest.price : risk) / (total + cheapest.price)) * 100;
      rec.oneShare = {
        item: cheapest.r.item,
        amount: cheapest.price,
        plan: {
          ...plan,
          buys: [{ rowId: cheapest.r.id, item: cheapest.r.item, category, amount: cheapest.price, shares: 1, unitPrice: cheapest.price }],
          afterRiskPct: oneShareAfter,
          unspent: 0,
          riskWanted: category === "risk" ? cheapest.price : 0,
          safeWanted: category === "safe" ? cheapest.price : 0,
          reachesTarget: Math.abs(oneShareAfter - targetRiskPct) < 0.05,
        },
      };
    }
  }
  return rec;
}
