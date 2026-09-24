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

describe("백업·복원·내보내기·가져오기", () => {
  const post = (url: string, body?: unknown) => fetch(`${base}${url}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });

  it("지금 백업하면 목록에 나타난다", async () => {
    const { name } = (await (await post("/api/backups")).json()) as { name: string };
    expect(name).toMatch(/^finance-dashboard-.*-manual\.json$/);
    const { backups } = (await (await fetch(`${base}/api/backups`)).json()) as { backups: { name: string; size: number }[] };
    expect(backups.some((b) => b.name === name && b.size > 0)).toBe(true);
  });

  it("백업으로 되돌리면 그때 값으로 돌아가고 되돌리기 직전 상태도 백업된다", async () => {
    const before = await getData();
    const { name } = (await (await post("/api/backups")).json()) as { name: string };
    await fetch(`${base}/api/loan`, json({ ...before.loan, price: 999999 }));
    expect((await getData()).loan.price).toBe(999999);
    const res = await post("/api/backups/restore", { name });
    expect(res.status).toBe(200);
    expect((await getData()).loan.price).toBe(before.loan.price);
    const { backups } = (await (await fetch(`${base}/api/backups`)).json()) as { backups: { name: string }[] };
    expect(backups.some((b) => b.name.endsWith("-before-restore.json"))).toBe(true);
  });

  it("되돌리면 섹션 버전이 바뀌어 열려 있던 오래된 화면의 저장은 막힌다", async () => {
    const v = (await getData())._versions.loan;
    const { name } = (await (await post("/api/backups")).json()) as { name: string };
    await post("/api/backups/restore", { name });
    const stale = await fetch(`${base}/api/loan`, json((await getData()).loan, { "If-Match": v }));
    expect(stale.status).toBe(409);
  });

  it("없는 백업이나 이상한 이름(경로 조작)은 404", async () => {
    expect((await post("/api/backups/restore", { name: "finance-dashboard-1.json" })).status).toBe(404);
    expect((await post("/api/backups/restore", { name: "../../etc/passwd" })).status).toBe(404);
    expect((await post("/api/backups/restore", {})).status).toBe(404);
  });

  it("내보낸 JSON은 다시 가져올 수 있다", async () => {
    const exp = await fetch(`${base}/api/export`);
    expect(exp.headers.get("content-disposition")).toContain("attachment");
    const exported = await exp.json();
    exported.loan.price = 424242;
    const res = await post("/api/import", exported);
    expect(res.status).toBe(200);
    expect((await getData()).loan.price).toBe(424242);
  });

  it("가져오기는 형식이 이상하면 거절하고 기존 데이터를 지키며 가져오기 직전 상태를 백업한다", async () => {
    const before = (await getData()).loan.price;
    expect((await post("/api/import", { hello: 1 })).status).toBe(400);
    expect((await post("/api/import", { rows: { not: "array" } })).status).toBe(400);
    expect((await getData()).loan.price).toBe(before);
    const { backups } = (await (await fetch(`${base}/api/backups`)).json()) as { backups: { name: string }[] };
    expect(backups.some((b) => b.name.endsWith("-before-import.json"))).toBe(true);
  });

  it("엑셀 내보내기는 자산·히스토리 시트를 가진 xlsx를 준다", async () => {
    const res = await fetch(`${base}/api/export.xlsx`);
    expect(res.headers.get("content-type")).toContain("spreadsheetml");
    const XLSX = await import("xlsx");
    const wb = XLSX.read(Buffer.from(await res.arrayBuffer()), { type: "buffer" });
    expect(wb.SheetNames).toEqual(["자산", "히스토리"]);
    const first = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets["자산"])[0];
    if (first) expect(typeof first["잔액(원)"]).toBe("number");
  });
});
