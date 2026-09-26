import type { HistoryEntry } from "./types";

// 히스토리 기록으로 연도별 수익률을 계산한다. 금액은 만원.
// 기간 중 넣은 돈(누적원금 증가분)은 그 기록 날짜에 들어온 것으로 보고, 남은 기간만큼 가중한다 (Modified Dietz).
// → 매달 돈을 넣은 직후에 기록하면 가장 정확하다.

const DAY = 86400000;
export const FULL_YEAR_DAYS = 335; // 이만큼 이상 덮으면 1년 수익률로 본다 (월 1회 기록이면 기록일이 며칠 어긋나도 괜찮게)

export interface PeriodReturn {
  year: number; // 대부분을 덮는 해
  start: HistoryEntry;
  end: HistoryEntry;
  days: number;
  flows: number; // 기간 중 넣은 돈 (누적원금 증가분, 뺀 돈이면 음수)
  profit: number; // 끝 평가 − 시작 평가 − 넣은 돈
  rate: number; // 기간 수익률 (0~1)
  annualRate: number | null; // 1년 이상 덮을 때만 연 기준 수익률. 부분 기간이면 null (몇 달치를 연환산하면 과장된다)
}

const time = (h: HistoryEntry) => new Date(`${h.date}T00:00:00`).getTime();

export function periodReturn(records: HistoryEntry[], year: number): PeriodReturn | null {
  if (records.length < 2) return null;
  const start = records[0];
  const end = records[records.length - 1];
  const t0 = time(start);
  const t1 = time(end);
  if (!(t1 > t0)) return null;
  let flows = 0;
  let weighted = 0;
  for (let i = 1; i < records.length; i++) {
    const f = records[i].cumulativePrincipal - records[i - 1].cumulativePrincipal;
    flows += f;
    weighted += (f * (t1 - time(records[i]))) / (t1 - t0);
  }
  const base = start.totalValue + weighted;
  if (!(base > 0)) return null;
  const profit = end.totalValue - start.totalValue - flows;
  const rate = profit / base;
  const days = Math.round((t1 - t0) / DAY);
  const annualRate = days >= FULL_YEAR_DAYS ? Math.pow(1 + rate, 365 / Math.max(days, 365)) - 1 : null;
  return { year, start, end, days, flows, profit, rate, annualRate };
}

// 해마다 한 구간 (1월~12월): 시작 = 그해 1월 10일까지의 마지막 기록 (없으면 그해 첫 기록), 끝 = 다음 해 1월 10일까지의 마지막 기록.
// 월말(28~31일)에 기록하면 전년 12월 말 기록 → 그해 12월 말 기록이 한 해가 된다. 연말연시 휴일로 1월 초에 기록해도 같은 해 끝으로 본다.
// 앞 구간의 끝이 다음 구간의 시작이라 구간이 빈틈없이 이어진다.
const YEAR_CUTOFF = "01-10";
export function yearlyReturns(history: HistoryEntry[]): PeriodReturn[] {
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length < 2) return [];
  const firstYear = Number(sorted[0].date.slice(0, 4));
  const lastYear = Number(sorted[sorted.length - 1].date.slice(0, 4));
  const lastIndexOnOrBefore = (iso: string) => sorted.reduce((idx, h, i) => (h.date <= iso ? i : idx), -1);
  const out: PeriodReturn[] = [];
  for (let y = firstYear; y <= lastYear; y++) {
    let s = lastIndexOnOrBefore(`${y}-${YEAR_CUTOFF}`);
    if (s === -1) s = sorted.findIndex((h) => h.date.startsWith(`${y}-`));
    const e = lastIndexOnOrBefore(`${y + 1}-${YEAR_CUTOFF}`);
    if (s === -1 || e <= s) continue;
    const p = periodReturn(sorted.slice(s, e + 1), y);
    if (p) out.push(p);
  }
  return out;
}

// 첫 기록부터 마지막 기록까지 구간 수익률을 이어 붙인 전체 수익률과, 1년 이상이면 연평균
export function overallReturn(periods: PeriodReturn[]): { rate: number; days: number; annualRate: number | null } | null {
  if (periods.length === 0) return null;
  const rate = periods.reduce((acc, p) => acc * (1 + p.rate), 1) - 1;
  const days = Math.round((time(periods[periods.length - 1].end) - time(periods[0].start)) / DAY);
  return { rate, days, annualRate: days >= FULL_YEAR_DAYS ? Math.pow(1 + rate, 365 / Math.max(days, 365)) - 1 : null };
}

// 매달 기록일(1~28)을 정했을 때, 오늘까지 지난 가장 최근 기록일 (YYYY-MM-DD)
export function lastRecordDue(recordDay: number, now: Date): string {
  const day = Math.min(28, Math.max(1, Math.round(recordDay)));
  const d = now.getDate() >= day ? new Date(now.getFullYear(), now.getMonth(), day) : new Date(now.getFullYear(), now.getMonth() - 1, day);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// 연말·연초로 볼 기록 날짜 범위 (12월 15일 ~ 다음 해 1월 10일)
const nearYearEnd = (iso: string, year: number) => iso >= `${year}-12-15` && iso <= `${year + 1}-${YEAR_CUTOFF}`;

export interface PeriodView {
  kind: "full" | "ytd" | "partial"; // full: 그해 1~12월, ytd: 올해 1월~최근 기록, partial: 기록이 중간부터 시작했거나 연말 기록이 없는 해
  range: string; // 예: "1월~12월", "1월~9/29", "9/25~12월"
  target: number; // 비교할 목표 (0~1): 1년이면 목표 연 수익률, 아니면 기간만큼 줄인 목표
}

const md = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8))}`;

export function describePeriod(p: PeriodReturn, now: Date, targetPct: number): PeriodView {
  const fromJan = nearYearEnd(p.start.date, p.year - 1) || p.start.date === `${p.year}-01-01`;
  const toDec = nearYearEnd(p.end.date, p.year);
  const range = `${fromJan ? "1월" : md(p.start.date)}~${toDec ? "12월" : md(p.end.date)}`;
  const kind = fromJan && toDec ? "full" : fromJan && p.year === now.getFullYear() ? "ytd" : "partial";
  const t = targetPct / 100;
  const target = kind === "full" ? t : Math.pow(1 + t, p.days / 365) - 1;
  return { kind, range, target };
}
