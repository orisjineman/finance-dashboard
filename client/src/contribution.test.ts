import { describe, expect, it } from "vitest";
import type { AssetRow } from "./types";
import { computeContribution, contributionNeeded } from "./contribution";

let n = 0;
const row = (account: string, item: string, category: AssetRow["category"], amount: number, extra: Partial<AssetRow> = {}): AssetRow => ({
  id: `c${++n}`, account, item, category, amount, housingEligible: true, ...extra,
});
const sum = (xs: { amount: number }[]) => xs.reduce((s, x) => s + x.amount, 0);

describe("contributionNeeded", () => {
  it("위험이 모자라면 전부 위험자산으로 넣는다고 보고 필요한 금액을 계산한다", () => {
    // 위험 200 / 총 1000, 목표 50% → (200+C)/(1000+C)=0.5 → C=600
    expect(contributionNeeded(200, 1000, 50)).toBeCloseTo(600, 9);
  });
  it("위험이 넘치면 전부 안전자산으로 넣는다고 본다", () => {
    // 위험 800 / 총 1000, 목표 50% → 800/(1000+C)=0.5 → C=600
    expect(contributionNeeded(800, 1000, 50)).toBeCloseTo(600, 9);
  });
  it("이미 목표면 0, 0%·100% 목표나 빈 자산은 null", () => {
    expect(contributionNeeded(500, 1000, 50)).toBe(0);
    expect(contributionNeeded(500, 1000, 100)).toBeNull();
    expect(contributionNeeded(500, 1000, 0)).toBeNull();
    expect(contributionNeeded(0, 0, 50)).toBeNull();
  });
});

describe("computeContribution", () => {
  const rows = () => [row("ISA", "S&P", "risk", 200), row("ISA", "채권", "safe", 800)];

  it("위험이 모자라면 새 돈을 위험자산에 넣고 팔지는 않는다", () => {
    const p = computeContribution(rows(), ["ISA"], 40, "ISA", 300);
    // 목표 40%: (200 + x)/1300 = 0.4 → x=320 > 300 → 300 전부 위험
    expect(p.riskWanted).toBeCloseTo(300, 9);
    expect(sum(p.buys)).toBeCloseTo(300, 9);
    expect(p.buys.every((b) => b.category === "risk")).toBe(true);
    expect(p.afterRiskPct).toBeCloseTo((500 / 1300) * 100, 6);
    expect(p.reachesTarget).toBe(false);
  });

  it("금액이 충분하면 목표 비중에 정확히 맞추고 위험·안전에 나눠 넣는다", () => {
    const p = computeContribution(rows(), ["ISA"], 40, "ISA", 1000);
    // (200+x)/2000=0.4 → x=600 위험, 400 안전
    expect(p.riskWanted).toBeCloseTo(600, 9);
    expect(p.safeWanted).toBeCloseTo(400, 9);
    expect(p.afterRiskPct).toBeCloseTo(40, 6);
    expect(p.reachesTarget).toBe(true);
    expect(p.unspent).toBeCloseTo(0, 9);
  });

  it("위험이 넘치면 새 돈은 전부 안전자산으로", () => {
    const r = [row("ISA", "S&P", "risk", 800), row("ISA", "채권", "safe", 200)];
    const p = computeContribution(r, ["ISA"], 50, "ISA", 100);
    expect(p.riskWanted).toBe(0);
    expect(p.buys.every((b) => b.category === "safe")).toBe(true);
    expect(p.afterRiskPct).toBeCloseTo((800 / 1100) * 100, 6);
  });

  it("매매 안 함 상품은 사지 않고 매수 우선 상품에 몰아서 산다", () => {
    const r = [
      row("ISA", "R1", "risk", 100),
      row("ISA", "R2", "risk", 100, { rebalanceRule: "preferred" }),
      row("ISA", "묶임", "safe", 800, { rebalanceRule: "hold" }),
      row("ISA", "단기채", "safe", 100),
    ];
    const p = computeContribution(r, ["ISA"], 60, "ISA", 500);
    expect(p.buys.some((b) => b.item === "묶임")).toBe(false);
    expect(p.buys.filter((b) => b.category === "risk").map((b) => b.item)).toEqual(["R2"]);
  });

  it("1주 가격이 있으면 정수 주수로 사고 남는 돈은 가격 없는 상품이 흡수하거나 예수금으로 남긴다", () => {
    const r = [row("ISA", "ETF", "risk", 100, { unitPrice: 30 }), row("ISA", "RP", "safe", 100)];
    const p = computeContribution(r, ["ISA"], 100, "ISA", 100);
    const buy = p.buys.find((b) => b.item === "ETF")!;
    expect(Number.isInteger(buy.shares)).toBe(true);
    expect(buy.shares).toBe(3);
    expect(p.unspent).toBeCloseTo(10, 9);
    expect(p.notes.some((t) => t.includes("1주 단위"))).toBe(true);
  });

  it("위험자산 편입 불가 계좌에는 위험자산을 사지 않는다", () => {
    const p = computeContribution(rows(), ["ISA"], 40, "ISA", 300, { ISA: "blocked" });
    expect(p.buys).toEqual([]);
    expect(p.unspent).toBeCloseTo(300, 9);
    expect(p.notes.some((t) => t.includes("편입 불가"))).toBe(true);
  });

  it("살 상품이 없으면 예수금으로 남는다고 알린다", () => {
    const r = [row("ISA", "채권", "safe", 800), row("위탁", "S&P", "risk", 200)];
    const p = computeContribution(r, ["ISA", "위탁"], 50, "ISA", 300);
    expect(p.buys.every((b) => b.category === "safe")).toBe(true);
    expect(p.notes.some((t) => t.includes("위험자산 상품이 없어"))).toBe(true);
  });

  it("묶음에 없는 계좌나 0원이면 아무것도 사지 않는다", () => {
    expect(computeContribution(rows(), ["ISA"], 40, "다른계좌", 100).buys).toEqual([]);
    expect(computeContribution(rows(), ["ISA"], 40, "ISA", 0).buys).toEqual([]);
  });
});
