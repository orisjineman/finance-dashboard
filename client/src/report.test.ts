import { describe, expect, it } from "vitest";
import type { AssetRow, HistoryEntry } from "./types";
import { buildReport, makeHistoryEntry, monthlyReports } from "./report";

const row = (id: string, account: string, category: AssetRow["category"], amount: number, extra: Partial<AssetRow> = {}): AssetRow => ({ id, account, item: id, category, amount, housingEligible: true, ...extra });

const entry = (date: string, p: Partial<HistoryEntry>): HistoryEntry => ({
  id: date, date, newContribution: 0, cumulativePrincipal: 0, totalValue: 0, riskValue: 0, safeValue: 0, cashValue: 0, profit: 0, returnRate: 0, ...p,
});

describe("makeHistoryEntry", () => {
  const rows = [
    row("a", "ISA", "risk", 600),
    row("b", "ISA", "safe", 400),
    row("c", "연금", "risk", 300, { housingEligible: false }),
    row("d", "통장", "cash", 200, { excludeFromReturn: true }),
  ];
  it("수익률 포함 항목만 평가금액에 넣고, 전체 자산과 계좌별 합계를 함께 기록한다", () => {
    const e = makeHistoryEntry(rows, "2026-10-28", 1000, 800);
    expect(e.totalValue).toBe(1300);
    expect(e.totalAssets).toBe(1500);
    expect(e.newContribution).toBe(200);
    expect(e.profit).toBe(300);
    expect(e.returnRate).toBeCloseTo(0.3, 6);
    expect(e.housingLiquid).toBe(1200);
    expect(e.accounts).toEqual([
      { account: "ISA", amount: 1000 },
      { account: "연금", amount: 300 },
      { account: "통장", amount: 200 },
    ]);
  });
});

describe("buildReport", () => {
  const from = entry("2026-09-28", {
    cumulativePrincipal: 1000, totalValue: 1100, riskValue: 700, safeValue: 300, cashValue: 100, totalAssets: 1500, housingLiquid: 900,
    accounts: [{ account: "ISA", amount: 800 }, { account: "통장", amount: 400 }, { account: "연금", amount: 300 }],
  });
  const to = entry("2026-10-28", {
    cumulativePrincipal: 1200, totalValue: 1400, riskValue: 900, safeValue: 380, cashValue: 120, totalAssets: 1850, housingLiquid: 1080,
    accounts: [{ account: "ISA", amount: 1000 }, { account: "통장", amount: 450 }, { account: "연금", amount: 400 }],
  });
  it("전체 자산 변화를 넣은 돈 + 운용 수익 + 그 외로 나눈다", () => {
    const r = buildReport(from, to);
    expect(r.assetsDelta).toBe(350);
    expect(r.flows).toBe(200);
    expect(r.profit).toBe(100); // 투자 평가금액 +300 − 넣은 돈 200
    expect(r.other).toBe(50); // 통장 등 +350 − 300
    expect(r.flows + r.profit + r.other).toBe(r.assetsDelta);
    expect(r.days).toBe(30);
    expect(r.housingDelta).toBe(180);
  });
  it("수익률은 넣은 돈을 뺀 값 (기간 끝에 넣은 돈은 가중 0)", () => {
    expect(buildReport(from, to).rate).toBeCloseTo(100 / 1100, 6);
  });
  it("분류별·계좌별 변화를 큰 순서로 돌려준다", () => {
    const r = buildReport(from, to);
    expect(r.categories.map((c) => [c.key, c.delta])).toEqual([["risk", 200], ["safe", 80], ["cash", 20]]);
    expect(r.accounts).toEqual([
      { account: "ISA", delta: 200 },
      { account: "연금", delta: 100 },
      { account: "통장", delta: 50 },
    ]);
  });
  it("계좌별 값이 없는 옛 기록이면 계좌별 변화는 null, 전체 자산이 없으면 투자 항목 기준", () => {
    const old = entry("2026-09-28", { cumulativePrincipal: 1000, totalValue: 1100 });
    const next = entry("2026-10-28", { cumulativePrincipal: 1200, totalValue: 1400 });
    const r = buildReport(old, next);
    expect(r.accounts).toBeNull();
    expect(r.coversAllAssets).toBe(false);
    expect(r.assetsDelta).toBe(300);
    expect(r.other).toBe(0);
    expect(r.housingDelta).toBeNull();
  });
  it("계좌가 새로 생기거나 없어져도 변화에 잡힌다", () => {
    const a = entry("2026-09-28", { totalValue: 1, accounts: [{ account: "옛계좌", amount: 100 }] });
    const b = entry("2026-10-28", { totalValue: 1, accounts: [{ account: "새계좌", amount: 70 }] });
    expect(buildReport(a, b).accounts).toEqual([{ account: "옛계좌", delta: -100 }, { account: "새계좌", delta: 70 }]);
  });
});

describe("monthlyReports", () => {
  it("날짜순으로 이웃한 쌍을 만들고 최근 것이 먼저 온다", () => {
    const h = [entry("2026-10-28", { totalValue: 3 }), entry("2026-08-28", { totalValue: 1 }), entry("2026-09-28", { totalValue: 2 })];
    expect(monthlyReports(h).map((r) => `${r.from.date}→${r.to.date}`)).toEqual(["2026-09-28→2026-10-28", "2026-08-28→2026-09-28"]);
    expect(monthlyReports([h[0]])).toEqual([]);
  });
});
