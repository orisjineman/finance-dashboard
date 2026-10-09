import { promises as fs } from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./store.js";
import { fetchPriceSeries, normalizeCode, type SeriesResult } from "./quotes.js";

// 비교 기준(지수 추종 ETF)의 일별 종가를 data/benchmark-cache.json 에 담아 둔다.
// 같은 기간을 화면을 열 때마다 다시 부르면 공공데이터포털 일일 호출 한도를 쓰니, 최근에 받은 값은 그대로 쓴다.
const CACHE_FILE = path.join(DATA_DIR, "benchmark-cache.json");
export const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const LEAD_DAYS = 14; // 시작일이 휴장일이어도 직전 거래일 종가를 찾을 수 있게 앞쪽을 여유 있게 받는다

interface CacheEntry {
  from: string; // YYYY-MM-DD, 이 날짜부터 받아 둠
  fetchedAt: number;
  name?: string;
  series: { d: string; p: number }[];
}

async function readCache(): Promise<Record<string, CacheEntry>> {
  try {
    return JSON.parse(await fs.readFile(CACHE_FILE, "utf-8")) as Record<string, CacheEntry>;
  } catch {
    return {};
  }
}

async function writeCache(cache: Record<string, CacheEntry>): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(CACHE_FILE, JSON.stringify(cache), "utf-8");
}


function leadDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() - LEAD_DAYS);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

export async function getBenchmarkSeries(serviceKey: string, codes: string[], fromIso: string, now = Date.now()): Promise<Record<string, SeriesResult>> {
  const cache = await readCache();
  const out: Record<string, SeriesResult> = {};
  let changed = false;
  for (const code of codes) {
    const id = normalizeCode(code);
    const hit = cache[id];
    if (hit && hit.from <= fromIso && now - hit.fetchedAt < CACHE_TTL_MS) {
      out[code] = { ok: true, series: hit.series, name: hit.name };
      continue;
    }
    const fetched = await fetchPriceSeries(serviceKey, code, leadDate(fromIso));
    out[code] = fetched;
    if (fetched.ok && fetched.series) {
      const begin = leadDate(fromIso);
      cache[id] = { from: `${begin.slice(0, 4)}-${begin.slice(4, 6)}-${begin.slice(6, 8)}`, fetchedAt: now, name: fetched.name, series: fetched.series };
      changed = true;
    }
  }
  if (changed) await writeCache(cache);
  return out;
}

