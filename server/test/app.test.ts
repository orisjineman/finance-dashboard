import { mkdtempSync, rmSync } from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// 임시 폴더를 데이터 위치로 지정한 뒤 실제 앱을 띄워 HTTP로 시험한다. (실제 data/는 건드리지 않는다)
const dir = mkdtempSync(path.join(tmpdir(), "fd-app-"));
let server: Server;
let base = "";

const json = (body: unknown, headers: Record<string, string> = {}) => ({
  method: "PUT",
  headers: { "Content-Type": "application/json", ...headers },
  body: JSON.stringify(body),
});
const getData = async () => (await (await fetch(`${base}/api/data`)).json()) as Record<string, any>;

beforeAll(async () => {
  process.env.FD_DATA_DIR = dir;
  const { createApp } = await import("../src/app");
  server = createApp().listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server.close();
  delete process.env.FD_DATA_DIR;
  rmSync(dir, { recursive: true, force: true });
});

describe("GET /api/data", () => {
  it("모든 섹션과 섹션별 버전을 준다", async () => {
    const d = await getData();
    for (const k of ["rows", "simulation", "loan", "checklist", "strategy", "history", "budget", "rebalance"]) expect(d).toHaveProperty(k);
    expect(Object.keys(d._versions).sort()).toEqual(["budget", "checklist", "history", "loan", "rebalance", "rows", "simulation", "strategy"]);
  });
});

describe("PUT /api/:section", () => {
  it("저장하고 새 버전을 헤더로 돌려준다", async () => {
    const before = (await getData())._versions.rows;
    const rows = [{ id: "a", account: "ISA", item: "x", category: "risk", amount: 5, housingEligible: true }];
    const res = await fetch(`${base}/api/rows`, json(rows));
    expect(res.status).toBe(200);
    expect(res.headers.get("x-version")).not.toBe(before);
    expect((await getData()).rows).toEqual(rows);
  });

  it("형식이 잘못되면 400 (배열이어야 하는 곳에 객체 등)", async () => {
    expect((await fetch(`${base}/api/rows`, json({ a: 1 }))).status).toBe(400);
    expect((await fetch(`${base}/api/loan`, json([1]))).status).toBe(400);
    expect((await fetch(`${base}/api/loan`, json(null))).status).toBe(400);
  });

  it("최신 버전을 If-Match로 보내면 저장되고, 오래된 버전이면 409로 막는다", async () => {
    const v0 = (await getData())._versions.history;
    const ok = await fetch(`${base}/api/history`, json([], { "If-Match": v0 }));
    expect(ok.status).toBe(200);
    const stale = await fetch(`${base}/api/history`, json([{ id: "new" }], { "If-Match": v0 }));
    expect(stale.status).toBe(409);
    expect((await getData()).history).toEqual([]);
  });

  it("다른 섹션의 버전은 서로 영향을 주지 않는다", async () => {
    const before = (await getData())._versions;
    await fetch(`${base}/api/checklist`, json([]));
    const res = await fetch(`${base}/api/budget`, json((await getData()).budget, { "If-Match": before.budget }));
    expect(res.status).toBe(200);
  });

  it("서로 다른 섹션을 동시에 저장해도 둘 다 남는다 (덮어쓰기 없음)", async () => {
    const d = await getData();
    const rows = [{ id: "z", account: "A", item: "동시", category: "safe", amount: 7, housingEligible: true }];
    const loan = { ...d.loan, price: 123456 };
    await Promise.all([fetch(`${base}/api/rows`, json(rows)), fetch(`${base}/api/loan`, json(loan)), fetch(`${base}/api/simulation`, json({ ...d.simulation, years: 33 }))]);
    const after = await getData();
    expect(after.rows).toEqual(rows);
    expect(after.loan.price).toBe(123456);
    expect(after.simulation.years).toBe(33);
  });
});

describe("시세 키 API", () => {
  it("형식이 이상한 키는 거절한다", async () => {
    expect((await fetch(`${base}/api/quotes/key`, json({ key: "short" }))).status).toBe(400);
    expect((await fetch(`${base}/api/quotes/key`, json({ key: "has space inside key" }))).status).toBe(400);
  });
});

describe("POST /api/import-xlsx", () => {
  it("파일이 없으면 400", async () => {
    expect((await fetch(`${base}/api/import-xlsx`, { method: "POST" })).status).toBe(400);
  });
});
