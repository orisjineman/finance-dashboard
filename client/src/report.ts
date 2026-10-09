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

export interface AccountJump {
  account: string;
  before: number;
  after: number;
  delta: number;
  pct: number; // 변화율 (0~, 부호 있음). 이전 잔액이 0이면 Infinity
}

export const JUMP_PCT = 0.1;
export const JUMP_MIN_AMOUNT = 100; // 만원, 이보다 작은 변동은 비율이 커도 무시

// 두 기록 사이에 잔액이 크게 달라진 계좌: 입력 실수(0 하나 빠뜨림 등)를 잡아내는 용도. 변화율이 큰 순.
export function accountJumps(from: HistoryEntry, to: HistoryEntry, threshold = JUMP_PCT, minAmount = JUMP_MIN_AMOUNT): AccountJump[] {
  if (!from.accounts || !to.accounts) return [];
  const before = new Map(from.accounts.map((a) => [a.account, a.amount]));
  const after = new Map(to.accounts.map((a) => [a.account, a.amount]));
  return [...new Set([...before.keys(), ...after.keys()])]
    .map((account) => {
      const b = before.get(account) ?? 0;
      const a = after.get(account) ?? 0;
      return { account, before: b, after: a, delta: a - b, pct: b !== 0 ? (a - b) / Math.abs(b) : a === 0 ? 0 : Infinity };
    })
    .filter((j) => Math.abs(j.delta) >= minAmount && Math.abs(j.pct) >= threshold)
    .sort((x, y) => Math.abs(y.pct) - Math.abs(x.pct));
}

const won = (manwon: number) => `${manwon < 0 ? "−" : "+"}${Math.round(Math.abs(manwon) * 10000).toLocaleString("ko-KR")}원`;

// 월간 리포트를 메신저·메모에 붙여 넣을 수 있는 글로 만든다
export function reportText(r: MonthlyReport): string {
  const lines = [`[월간 리포트] ${r.from.date} → ${r.to.date} (${r.days}일)`, `${r.coversAllAssets ? "전체 자산" : "투자 항목"} 변화 ${won(r.assetsDelta)}`, `· 넣은 돈 ${won(r.flows)}`, `· 운용 수익 ${won(r.profit)}`];
  if (r.coversAllAssets) lines.push(`· 그 외(통장·보증금 등) ${won(r.other)}`);
  if (r.rate !== null) lines.push(`수익률(넣은 돈 제외) ${r.rate >= 0 ? "+" : "−"}${(Math.abs(r.rate) * 100).toFixed(1)}%`);
  for (const c of r.categories) lines.push(`${c.label} ${won(c.delta)}`);
  if (r.accounts) {
    const top = r.accounts.slice(0, 5);
    if (top.length > 0) lines.push("계좌별 변화: " + top.map((a) => `${a.account || "(이름 없음)"} ${won(a.delta)}`).join(", "));
  }
  return lines.join("\n");
}
