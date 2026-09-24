import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// BASE는 모듈을 읽을 때 정해지므로, 가짜 서버를 띄운 뒤 환경변수를 넣고 나서 불러온다.
let server: http.Server;
let quotes: typeof import("../src/quotes");
const seen: string[] = [];

beforeAll(async () => {
  server = http.createServer((req, res) => {
    seen.push(req.url ?? "");
    const url = new URL(req.url ?? "", "http://x");
    const code = url.searchParams.get("likeSrtnCd") ?? url.searchParams.get("isinCd") ?? "";
    const isEtf = url.pathname.includes("getETFPriceInfo_V2");
    const body = (items: unknown[]) => JSON.stringify({ response: { header: { resultCode: "00", resultMsg: "NORMAL SERVICE." }, body: { items: { item: items } } } });
    res.setHeader("content-type", "application/json");
    if (url.searchParams.get("serviceKey") === "BADKEY") {
      res.setHeader("content-type", "text/xml");
      res.end("<OpenAPI_ServiceResponse><cmmMsgHeader><returnAuthMsg>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</returnAuthMsg></cmmMsgHeader></OpenAPI_ServiceResponse>");
    } else if (isEtf && code === "360750") {
      res.end(body([{ basDt: "20260918", srtnCd: "360750", itmsNm: "TIGER 미국S&P500", clpr: "20000" }, { basDt: "20260921", srtnCd: "360750", itmsNm: "TIGER 미국S&P500", clpr: "20100" }]));
    } else if (!isEtf && code === "005930") {
      res.end(body({ basDt: "20260921", srtnCd: "005930", itmsNm: "삼성전자", clpr: "70000" }));
    } else {
      res.end(body([]));
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  process.env.QUOTE_API_BASE = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  quotes = await import("../src/quotes");
});

afterAll(() => {
  server.close();
  delete process.env.QUOTE_API_BASE;
});

describe("normalizeCode", () => {
  it("공백·소문자·앞의 A를 정리한다", () => {
    expect(quotes.normalizeCode(" a360750 ")).toBe("360750");
    expect(quotes.normalizeCode("spy")).toBe("SPY");
    expect(quotes.normalizeCode("A")).toBe("A");
  });
});

describe("normalizeServiceKey", () => {
  it("인코딩 키와 디코딩 키가 같은 결과가 된다", () => {
    const decoded = "abc+/def==";
    const encoded = encodeURIComponent(decoded);
    expect(quotes.normalizeServiceKey(decoded)).toBe(quotes.normalizeServiceKey(encoded));
    expect(quotes.normalizeServiceKey(` ${decoded} `)).toBe(encoded);
  });
  it("잘못된 % 표기가 있어도 죽지 않는다", () => {
    expect(() => quotes.normalizeServiceKey("100%")).not.toThrow();
  });
});

describe("parseResponse", () => {
  it("XML 오류 응답은 안내 문구로 바꾼다", () => {
    const r = quotes.parseResponse("<x><returnAuthMsg>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</returnAuthMsg></x>");
    expect(r).toHaveProperty("error");
    expect((r as { error: string }).error).toContain("등록되지 않은 서비스 키");
  });
  it("알 수 없는 XML 오류는 원문을 붙인다", () => {
    expect((quotes.parseResponse("<x><errMsg>SOMETHING</errMsg></x>") as { error: string }).error).toContain("SOMETHING");
  });
  it("JSON 헤더의 오류 코드를 오류로 돌려준다", () => {
    const r = quotes.parseResponse(JSON.stringify({ response: { header: { resultCode: "30", resultMsg: "SERVICE_ACCESS_DENIED_ERROR" } } }));
    expect((r as { error: string }).error).toContain("활용신청");
  });
  it("항목이 하나여도, 여러 개여도, 없어도 배열로 돌려준다", () => {
    const wrap = (item: unknown) => JSON.stringify({ response: { header: { resultCode: "00" }, body: { items: { item } } } });
    expect(quotes.parseResponse(wrap({ srtnCd: "1" }))).toEqual({ items: [{ srtnCd: "1" }] });
    expect(quotes.parseResponse(wrap([{ srtnCd: "1" }, { srtnCd: "2" }]))).toEqual({ items: [{ srtnCd: "1" }, { srtnCd: "2" }] });
    expect(quotes.parseResponse(wrap(undefined))).toEqual({ items: [] });
  });
  it("JSON이 아니면 읽을 수 없다는 오류", () => {
    expect((quotes.parseResponse("hello") as { error: string }).error).toContain("읽을 수 없어");
  });
});

describe("pickLatest", () => {
  const items = [
    { basDt: "20260918", srtnCd: "360750", clpr: "1" },
    { basDt: "20260921", srtnCd: "360750", clpr: "2" },
    { basDt: "20260922", srtnCd: "000000", clpr: "3" },
  ];
  it("같은 코드 중 기준일이 가장 최근인 항목을 고른다", () => {
    expect(quotes.pickLatest(items, "a360750")?.clpr).toBe("2");
  });
  it("일치하는 코드가 없으면 null", () => {
    expect(quotes.pickLatest(items, "999999")).toBeNull();
  });
  it("ISIN으로도 찾는다", () => {
    expect(quotes.pickLatest([{ basDt: "20260921", isinCd: "KR7360750004", clpr: "5" }], "kr7360750004")?.clpr).toBe("5");
  });
});

describe("fetchQuote / fetchQuotes (가짜 서버)", () => {
  it("ETF에서 최근 종가를 찾는다", async () => {
    const r = await quotes.fetchQuote("KEY", "360750");
    expect(r).toMatchObject({ ok: true, price: 20100, basDt: "20260921", source: "ETF" });
  });
  it("ETF에 없으면 주식 서비스에서 찾는다", async () => {
    const r = await quotes.fetchQuote("KEY", "005930");
    expect(r).toMatchObject({ ok: true, price: 70000, source: "주식", name: "삼성전자" });
  });
  it("어디에도 없으면 실패와 안내를 준다", async () => {
    const r = await quotes.fetchQuote("KEY", "111111");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("찾지 못했어");
  });
  it("키가 잘못되면 키 안내 오류를 준다", async () => {
    const r = await quotes.fetchQuote("BADKEY", "360750");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("서비스 키");
  });
  it("서비스 키를 정규화해 요청에 싣는다", async () => {
    seen.length = 0;
    await quotes.fetchQuote("a+b/c=", "360750");
    expect(seen[0]).toContain(`serviceKey=${encodeURIComponent("a+b/c=")}`);
    expect(seen[0]).toContain("resultType=json");
  });
  it("여러 종목을 한 번에 조회한다", async () => {
    const r = await quotes.fetchQuotes("KEY", ["360750", "005930", "111111"]);
    expect(Object.keys(r).sort()).toEqual(["005930", "111111", "360750"]);
    expect(r["360750"].ok).toBe(true);
    expect(r["111111"].ok).toBe(false);
  });
});
