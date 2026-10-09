// 공공데이터포털 금융위원회 시세 API로 종목코드별 최근 종가를 가져온다 (ETF → 못 찾으면 주식 순서로 조회).
const BASE = process.env.QUOTE_API_BASE ?? "https://apis.data.go.kr/1160100";

const SERVICES = [
  { service: "GetSecuritiesProductInfoService_V2", op: "getETFPriceInfo_V2", label: "ETF" },
  { service: "GetStockSecuritiesInfoService_V2", op: "getStockPriceInfo_V2", label: "주식" },
] as const;

export interface QuoteResult {
  ok: boolean;
  price?: number; // 원, 종가
  basDt?: string; // YYYYMMDD
  name?: string;
  source?: string;
  error?: string;
}

interface Item {
  basDt?: string;
  srtnCd?: string;
  isinCd?: string;
  itmsNm?: string;
  clpr?: string | number;
}

const KEY_HINTS: Record<string, string> = {
  SERVICE_KEY_IS_NOT_REGISTERED_ERROR: "등록되지 않은 서비스 키야. 키를 다시 확인하고, 활용신청이 승인된 지 얼마 안 됐다면 잠시 뒤에 다시 시도해줘.",
  LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR: "오늘 호출 한도를 넘었어. 내일 다시 시도해줘.",
  SERVICE_ACCESS_DENIED_ERROR: "이 API는 아직 활용신청이 승인되지 않았어. 공공데이터포털에서 해당 API를 신청해줘.",
  UNREGISTERED_IP_ERROR: "허용되지 않은 IP에서 호출했어.",
};

export function normalizeCode(code: string): string {
  return code.trim().toUpperCase().replace(/^A(?=\d)/, "");
}

// 서비스 키는 포털에서 '인코딩 키'와 '디코딩 키'를 함께 주는데, 어느 쪽을 붙여넣어도 이중 인코딩되지 않게 정규화한다.
export function normalizeServiceKey(raw: string): string {
  const key = raw.trim();
  try {
    return encodeURIComponent(key.includes("%") ? decodeURIComponent(key) : key);
  } catch {
    return encodeURIComponent(key);
  }
}

export function parseResponse(text: string): { items: Item[] } | { error: string } {
  const trimmed = text.trim();
  if (trimmed.startsWith("<")) {
    const msg = /<returnAuthMsg>([^<]*)</.exec(trimmed)?.[1] ?? /<errMsg>([^<]*)</.exec(trimmed)?.[1] ?? /<resultMsg>([^<]*)</.exec(trimmed)?.[1] ?? trimmed.slice(0, 120);
    return { error: KEY_HINTS[msg] ?? `API 오류: ${msg}` };
  }
  let json: any;
  try {
    json = JSON.parse(trimmed);
  } catch {
    return { error: `API 응답을 읽을 수 없어: ${trimmed.slice(0, 80)}` };
  }
  const header = json?.response?.header;
  if (header && header.resultCode !== "00") {
    const msg = String(header.resultMsg ?? header.resultCode);
    return { error: KEY_HINTS[msg] ?? `API 오류: ${msg}` };
  }
  const raw = json?.response?.body?.items?.item;
  const items: Item[] = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return { items };
}

export function pickLatest(items: Item[], code: string): Item | null {
  const want = normalizeCode(code);
  const matches = items.filter((it) => normalizeCode(String(it.srtnCd ?? "")) === want || String(it.isinCd ?? "").toUpperCase() === want);
  matches.sort((a, b) => String(b.basDt ?? "").localeCompare(String(a.basDt ?? "")));
  return matches[0] ?? null;
}

function ymd(d: Date): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

export async function fetchQuote(serviceKey: string, code: string): Promise<QuoteResult> {
  const isIsin = /^[A-Z]{2}[A-Z0-9]{9}\d$/i.test(code.trim());
  const since = ymd(new Date(Date.now() - 12 * 86400000));
  const key = normalizeServiceKey(serviceKey);
  let lastError = "";

  for (const svc of SERVICES) {
    const filter = isIsin ? `isinCd=${encodeURIComponent(code.trim().toUpperCase())}` : `likeSrtnCd=${encodeURIComponent(normalizeCode(code))}`;
    const url = `${BASE}/${svc.service}/${svc.op}?serviceKey=${key}&resultType=json&numOfRows=30&pageNo=1&beginBasDt=${since}&${filter}`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      const parsed = parseResponse(await res.text());
      if ("error" in parsed) {
        lastError = parsed.error;
        continue;
      }
      const item = pickLatest(parsed.items, code);
      if (item) {
        const price = Number(item.clpr);
        if (Number.isFinite(price) && price > 0) {
          return { ok: true, price, basDt: String(item.basDt ?? ""), name: item.itmsNm, source: svc.label };
        }
      }
    } catch (e) {
      lastError = e instanceof Error && e.name === "TimeoutError" ? "응답이 너무 오래 걸려서 중단했어." : "네트워크 오류로 호출하지 못했어.";
    }
  }
  return { ok: false, error: lastError || "이 종목코드의 최근 시세를 찾지 못했어. 코드가 맞는지 확인해줘 (해외 상장 종목은 지원하지 않아)." };
}

export async function fetchQuotes(serviceKey: string, codes: string[]): Promise<Record<string, QuoteResult>> {
  const out: Record<string, QuoteResult> = {};
  const queue = [...codes];
  const workers = Array.from({ length: Math.min(4, queue.length) }, async () => {
    for (let code = queue.shift(); code !== undefined; code = queue.shift()) {
      out[code] = await fetchQuote(serviceKey, code);
    }
  });
  await Promise.all(workers);
  return out;
}

export interface PricePoint {
  d: string; // YYYY-MM-DD
  p: number; // 원, 종가
}

export interface SeriesResult {
  ok: boolean;
  series?: PricePoint[]; // 날짜 오름차순
  name?: string;
  error?: string;
}

const ymdToIso = (s: string) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
const SERIES_PAGE = 1000;
const SERIES_MAX_PAGES = 6;

// 기간(beginYmd~오늘) 동안의 일별 종가. 시세 조회와 같은 순서(ETF → 주식)로 찾고, 값이 있는 첫 서비스의 결과를 쓴다.
export async function fetchPriceSeries(serviceKey: string, code: string, beginYmd: string): Promise<SeriesResult> {
  const isIsin = /^[A-Z]{2}[A-Z0-9]{9}\d$/i.test(code.trim());
  const key = normalizeServiceKey(serviceKey);
  const filter = isIsin ? `isinCd=${encodeURIComponent(code.trim().toUpperCase())}` : `likeSrtnCd=${encodeURIComponent(normalizeCode(code))}`;
  let lastError = "";

  for (const svc of SERVICES) {
    const byDate = new Map<string, number>();
    let name: string | undefined;
    try {
      for (let page = 1; page <= SERIES_MAX_PAGES; page++) {
        const url = `${BASE}/${svc.service}/${svc.op}?serviceKey=${key}&resultType=json&numOfRows=${SERIES_PAGE}&pageNo=${page}&beginBasDt=${beginYmd}&${filter}`;
        const text = await (await fetch(url, { signal: AbortSignal.timeout(15000) })).text();
        const parsed = parseResponse(text);
        if ("error" in parsed) {
          lastError = parsed.error;
          break;
        }
        const want = normalizeCode(code);
        for (const it of parsed.items) {
          const matches = normalizeCode(String(it.srtnCd ?? "")) === want || String(it.isinCd ?? "").toUpperCase() === want;
          const price = Number(it.clpr);
          if (matches && it.basDt && Number.isFinite(price) && price > 0) {
            byDate.set(ymdToIso(String(it.basDt)), price);
            name = name ?? it.itmsNm;
          }
        }
        const total = Number(/"totalCount"\s*:\s*"?(\d+)/.exec(text)?.[1] ?? 0);
        if (page * SERIES_PAGE >= total) break;
      }
    } catch (e) {
      lastError = e instanceof Error && e.name === "TimeoutError" ? "응답이 너무 오래 걸려서 중단했어." : "네트워크 오류로 호출하지 못했어.";
      continue;
    }
    if (byDate.size > 0) {
      return { ok: true, name, series: [...byDate].map(([d, p]) => ({ d, p })).sort((a, b) => a.d.localeCompare(b.d)) };
    }
  }
  return { ok: false, error: lastError || "이 종목코드의 시세를 찾지 못했어. 코드가 맞는지 확인해줘 (해외 상장 종목은 지원하지 않아)." };
}
