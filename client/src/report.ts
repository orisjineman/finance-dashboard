import type { AssetRow, HistoryEntry } from "./types";
import { computeHousingLiquid, computeReturnTotals, computeTotals, newId } from "./utils";
import { periodReturn } from "./returns";

// 월간 리포트: 이웃한 두 히스토리 기록 사이에 자산이 얼마나, 왜 바뀌었는지. 금액은 만원.
// 전체 자산 변화 = 넣은 돈 + 운용 수익 + 그 외(통장·보증금 등 수익률 계산에서 빠지는 자산의 변동)

// 지금 잔액으로 히스토리 기록 한 줄을 만든다 (기록 추가 버튼과 '기록 전 미리보기'가 같이 쓴다)
export function makeHistoryEntry(rows: AssetRow[], date: string, cumulativePrincipal: number, previousPrincipal: number): HistoryEntry {
  const t = computeReturnTotals(rows);
  const profit = t.total - cumulativePrincipal;
  const byAccount = new Map<string, number>();
  for (const r of rows) byAccount.set(r.account, (byAccount.get(r.account) ?? 0) + r.amount);
  return {
    id: newId("hist"),
    date,
    newContribution: cumulativePrincipal - previousPrincipal,
    cumulativePrincipal,
    totalValue: t.total,
    riskValue: t.risk,
    safeValue: t.safe,
    cashValue: t.cash,
    accounts: [...byAccount].map(([account, amount]) => ({ account, amount })),
    housingLiquid: computeHousingLiquid(rows),
    totalAssets: computeTotals(rows).total,
    profit,
    returnRate: cumulativePrincipal !== 0 ? profit / cumulativePrincipal : 0,
  };
}

export interface MonthlyReport {
  from: HistoryEntry;
  to: HistoryEntry;
  days: number;
  assetsDelta: number; // 전체 자산 변화 (전체 자산을 기록하지 않은 옛 기록이면 투자 항목 합계 변화)
  coversAllAssets: boolean; // assetsDelta 가 통장·보증금까지 포함한 값인지
  flows: number; // 넣은 돈 (누적 투자원금 증가분, 뺀 돈이면 음수)
  profit: number; // 운용 수익 = 투자 항목 평가금액 변화 − 넣은 돈
  other: number; // 그 외 = 전체 자산 변화 − 투자 항목 변화 (통장·보증금 등). 옛 기록이면 0
  rate: number | null; // 이 기간 수익률 (넣은 돈 제외, 0~1)
  categories: { key: "risk" | "safe" | "cash"; label: string; delta: number }[]; // 투자 항목의 분류별 변화
  accounts: { account: string; delta: number }[] | null; // 계좌별 변화 (절댓값 큰 순). 두 기록 모두 계좌별 값이 있을 때만
  housingDelta: number | null; // 집 마련 가용자산 변화
}

const DAY = 86400000;
const time = (h: HistoryEntry) => new Date(`${h.date}T00:00:00`).getTime();

export function buildReport(from: HistoryEntry, to: HistoryEntry): MonthlyReport {
  const coversAllAssets = from.totalAssets !== undefined && to.totalAssets !== undefined;
  const investDelta = to.totalValue - from.totalValue;
  const flows = to.cumulativePrincipal - from.cumulativePrincipal;
  const assetsDelta = coversAllAssets ? (to.totalAssets as number) - (from.totalAssets as number) : investDelta;
  let accounts: MonthlyReport["accounts"] = null;
  if (from.accounts && to.accounts) {
    const before = new Map(from.accounts.map((a) => [a.account, a.amount]));
    const after = new Map(to.accounts.map((a) => [a.account, a.amount]));
    accounts = [...new Set([...before.keys(), ...after.keys()])]
      .map((account) => ({ account, delta: (after.get(account) ?? 0) - (before.get(account) ?? 0) }))
      .filter((a) => Math.abs(a.delta) >= 1e-9)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  }
  return {
    from,
    to,
    days: Math.round((time(to) - time(from)) / DAY),
    assetsDelta,
    coversAllAssets,
    flows,
    profit: investDelta - flows,
    other: coversAllAssets ? assetsDelta - investDelta : 0,
    rate: periodReturn([from, to], Number(to.date.slice(0, 4)))?.rate ?? null,
    categories: [
      { key: "risk", label: "위험자산", delta: to.riskValue - from.riskValue },
      { key: "safe", label: "안전자산", delta: to.safeValue - from.safeValue },
      { key: "cash", label: "현금성", delta: to.cashValue - from.cashValue },
    ],
    accounts,
    housingDelta: from.housingLiquid !== undefined && to.housingLiquid !== undefined ? to.housingLiquid - from.housingLiquid : null,
  };
}

// 기록된 이웃한 쌍마다 리포트를 만든다 (최근 것이 먼저)
export function monthlyReports(history: HistoryEntry[]): MonthlyReport[] {
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
  const out: MonthlyReport[] = [];
  for (let i = 1; i < sorted.length; i++) out.push(buildReport(sorted[i - 1], sorted[i]));
  return out.reverse();
}
