import type { BenchmarkSetting } from "./types";

// 수익률 비교 기준. ETF는 종가가 오른 비율(분배금은 빠짐), 금리는 고정 연 금리를 기간만큼 복리로 쌓은 값.
// 내 수익률(넣은 돈을 뺀 운용 수익률)과 같은 기간으로 견주기 위해 기간의 시작일·끝일을 받는다.

export interface PricePoint {
  d: string; // YYYY-MM-DD
  p: number; // 종가(원)
}

export const DEFAULT_BENCHMARKS: BenchmarkSetting[] = [
  { id: "bm-sp500", name: "S&P500", kind: "etf", ticker: "360750" }, // TIGER 미국S&P500
  { id: "bm-kospi200", name: "코스피200", kind: "etf", ticker: "069500" }, // KODEX 200
  { id: "bm-deposit", name: "예금 금리", kind: "rate", ratePct: 3 },
];

export function benchmarksOf(configured: BenchmarkSetting[] | undefined): BenchmarkSetting[] {
  return configured ?? DEFAULT_BENCHMARKS;
}

// 날짜 이하의 마지막 거래일 종가. series는 날짜 오름차순.
export function priceOnOrBefore(series: PricePoint[], iso: string): PricePoint | null {
  let found: PricePoint | null = null;
  for (const pt of series) {
    if (pt.d <= iso) found = pt;
    else break;
  }
  return found;
}

const DAY = 86400000;
const MAX_GAP_DAYS = 10; // 받아 둔 시세가 이보다 더 멀리 떨어져 있으면 그 날짜의 값으로 보지 않는다 (명절 연휴는 넉넉히 덮는다)

const days = (a: string, b: string) => Math.round((new Date(`${b}T00:00:00`).getTime() - new Date(`${a}T00:00:00`).getTime()) / DAY);

// startIso~endIso 동안의 비교 기준 수익률(0~1). 시세가 부족해 계산할 수 없으면 null.
export function benchmarkReturn(setting: BenchmarkSetting, series: PricePoint[] | undefined, startIso: string, endIso: string): number | null {
  if (setting.kind === "rate") {
    if (setting.ratePct === undefined || !Number.isFinite(setting.ratePct)) return null;
    const n = days(startIso, endIso);
    return n > 0 ? Math.pow(1 + setting.ratePct / 100, n / 365) - 1 : null;
  }
  if (!series || series.length === 0) return null;
  const a = priceOnOrBefore(series, startIso);
  const b = priceOnOrBefore(series, endIso);
  if (!a || !b || days(a.d, startIso) > MAX_GAP_DAYS || days(b.d, endIso) > MAX_GAP_DAYS) return null;
  return b.p / a.p - 1;
}

// 가장 이른 날짜 (비교 구간들의 시작) — 서버에 이 날짜부터의 시세를 달라고 할 때 쓴다
export function earliestDate(dates: string[]): string | null {
  return dates.length === 0 ? null : dates.reduce((m, d) => (d < m ? d : m));
}
