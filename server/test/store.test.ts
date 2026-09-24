import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// DATA_DIR은 모듈을 읽을 때 정해지므로 임시 폴더를 환경변수로 지정한 뒤 불러온다. (실제 data/는 건드리지 않는다)
const dir = mkdtempSync(path.join(tmpdir(), "fd-store-"));
let store: typeof import("../src/store");
const file = path.join(dir, "finance-dashboard.json");

beforeAll(async () => {
  process.env.FD_DATA_DIR = dir;
  store = await import("../src/store");
});

afterAll(() => {
  delete process.env.FD_DATA_DIR;
  rmSync(dir, { recursive: true, force: true });
});

describe("store", () => {
  it("데이터 파일이 없으면 기본값으로 만든다", async () => {
    expect(existsSync(file)).toBe(false);
    const data = await store.readData();
    expect(existsSync(file)).toBe(true);
    expect(Array.isArray(data.rows)).toBe(true);
    expect(data.rebalance.groups.length).toBeGreaterThan(0);
  });

  it("저장하면 다시 읽을 때 같은 값이 나온다", async () => {
    const data = await store.readData();
    data.rows = [{ id: "a", account: "ISA", item: "x", category: "risk", amount: 1, housingEligible: true }];
    await store.writeData(data);
    expect((await store.readData()).rows).toEqual(data.rows);
  });

  it("예전 파일에 없는 최상위 항목은 기본값으로 채운다", async () => {
    const old = JSON.parse(readFileSync(file, "utf-8"));
    delete old.rebalance;
    delete old.budget.pensionAnnualContribution;
    writeFileSync(file, JSON.stringify(old));
    const data = await store.readData();
    expect(data.rebalance).toBeDefined();
    expect(data.budget.pensionAnnualContribution).toBeDefined();
  });

  it("동시에 여러 번 저장해도 파일이 깨지지 않고 마지막 값이 남는다", async () => {
    const data = await store.readData();
    await Promise.all(
      Array.from({ length: 20 }, (_, i) => store.writeData({ ...data, simulation: { ...data.simulation, years: i + 1 } }))
    );
    expect(() => JSON.parse(readFileSync(file, "utf-8"))).not.toThrow();
    expect((await store.readData()).simulation.years).toBe(20);
    expect(existsSync(`${file}.tmp`)).toBe(false);
  });
});
