import { mkdtempSync, rmSync } from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// 가짜 시세 서버로 호출 횟수를 세어, 캐시가 같은 기간의 재호출을 막는지 확인한다. (실제 data/는 건드리지 않는다)
const dir = mkdtempSync(path.join(tmpdir(), "fd-bench-"));
let server: http.Server;
let bench: typeof import("../src/benchmarks");
let calls = 0;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    calls += 1;
    const url = new URL(req.url ?? "", "http://x");
    const code = url.searchParams.get("likeSrtnCd") ?? "";
    const items = code === "360750" && url.pathname.includes("getETFPriceInfo_V2") ? [{ basDt: "20260105", srtnCd: "360750", clpr: "100" }, { basDt: "20261201", srtnCd: "360750", clpr: "130" }] : [];
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ response: { header: { resultCode: "00" }, body: { totalCount: items.length, items: { item: items } } } }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  process.env.QUOTE_API_BASE = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.FD_DATA_DIR = dir;
  bench = await import("../src/benchmarks");
});

afterAll(() => {
  server.close();
  delete process.env.QUOTE_API_BASE;
  delete process.env.FD_DATA_DIR;
  rmSync(dir, { recursive: true, force: true });
});

describe("getBenchmarkSeries", () => {
  it("처음엔 불러오고, 12시간 안의 같은 기간 요청은 캐시에서 준다", async () => {
    const t0 = Date.now();
    const first = await bench.getBenchmarkSeries("KEY", ["360750"], "2026-01-01", t0);
    expect(first["360750"].series).toHaveLength(2);
    const afterFirst = calls;
    expect(afterFirst).toBeGreaterThan(0);

    const second = await bench.getBenchmarkSeries("KEY", ["360750"], "2026-02-01", t0 + 60_000);
    expect(second["360750"].series).toEqual(first["360750"].series);
    expect(calls).toBe(afterFirst);
  });
  it("캐시가 오래됐거나 더 이른 날짜를 요청하면 다시 불러온다", async () => {
    const before = calls;
    await bench.getBenchmarkSeries("KEY", ["360750"], "2026-01-01", Date.now() + bench.CACHE_TTL_MS + 1000);
    expect(calls).toBeGreaterThan(before);
    const mid = calls;
    await bench.getBenchmarkSeries("KEY", ["360750"], "2025-01-01", Date.now() + bench.CACHE_TTL_MS + 2000);
    expect(calls).toBeGreaterThan(mid);
  });
  it("못 찾은 종목은 실패로 돌려주고 캐시하지 않는다", async () => {
    const r = await bench.getBenchmarkSeries("KEY", ["111111"], "2026-01-01");
    expect(r["111111"].ok).toBe(false);
  });
});
