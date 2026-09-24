import { describe, expect, it } from "vitest";
import type { AssetRow } from "./types";
import { computeContribution, contributionNeeded, pickAccount, recommendTopUp } from "./contribution";
import { applyTrades, computeRebalance } from "./rebalance";

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

describe("pickAccount", () => {
  const rows = [row("ISA", "S&P", "risk", 100), row("위탁", "SPY", "risk", 0), row("CMA", "RP", "safe", 500)];
  it("입금 가능 금액이 있는 계좌를 먼저 고른다", () => {
    expect(pickAccount(rows, ["ISA", "위탁", "CMA"], "risk", {}, { 위탁: 500 })).toBe("위탁");
    expect(pickAccount(rows, ["ISA", "위탁", "CMA"], "risk")).toBe("ISA");
  });
  it("편입 불가 계좌와 해당 상품이 없는 계좌는 건너뛴다", () => {
    expect(pickAccount(rows, ["ISA", "위탁", "CMA"], "risk", { ISA: "blocked" })).toBe("위탁");
    expect(pickAccount(rows, ["ISA", "CMA"], "safe")).toBe("CMA");
    expect(pickAccount(rows, ["CMA"], "risk")).toBeNull();
  });
});

describe("applyTrades", () => {
  it("매도는 빼고 매수는 더한다", () => {
    const rows = [row("A", "x", "risk", 100), row("A", "y", "safe", 100)];
    const out = applyTrades(rows, [
      { rowId: rows[0].id, account: "A", item: "x", action: "sell", amount: 30, taxAdvantaged: true },
      { rowId: rows[1].id, account: "A", item: "y", action: "buy", amount: 30, taxAdvantaged: true },
    ]);
    expect(out.map((r) => r.amount)).toEqual([70, 130]);
  });
});

describe("recommendTopUp", () => {
  const build = () => [
    row("ISA", "S&P", "risk", 100),
    row("ISA", "채권", "safe", 100),
    row("CMA", "RP", "safe", 300),
    row("위탁", "SPY", "risk", 0, { unitPrice: 10 }),
  ];
  const accounts = ["ISA", "CMA", "위탁"];

  it("계좌 안 거래와 이동으로 못 맞춘 몫을 새 돈으로 채울 금액과 계좌를 알려준다", () => {
    const rows = build();
    // 이동 한도가 없으면 ISA 안에서만 조정 → 목표 50%에 못 닿는다
    const r = computeRebalance(rows, accounts, 50, 5);
    expect(r.afterRiskPct).toBeLessThan(45);
    const rec = recommendTopUp(rows, accounts, 50, r.trades)!;
    expect(rec).not.toBeNull();
    expect(rec.category).toBe("risk");
    expect(rec.account).toBe("ISA"); // 입금 한도 설정이 없으면 위험 상품이 있는 첫 계좌
    expect(rec.plan.afterRiskPct).toBeCloseTo(50, 0);
  });

  it("입금 가능 금액이 설정된 위탁계좌를 우선 추천한다", () => {
    const rows = build();
    const r = computeRebalance(rows, accounts, 50, 5);
    const rec = recommendTopUp(rows, accounts, 50, r.trades, {}, { 위탁: 5000 })!;
    expect(rec.account).toBe("위탁");
    expect(rec.plan.buys[0].item).toBe("SPY");
    expect(Number.isInteger(rec.plan.buys[0].shares)).toBe(true);
  });

  it("이미 목표에 닿았으면 추천하지 않는다", () => {
    const rows = [row("ISA", "S&P", "risk", 500), row("ISA", "채권", "safe", 500)];
    expect(recommendTopUp(rows, ["ISA"], 50, [])).toBeNull();
  });

  it("위험이 넘치는데 안전 상품이 있는 계좌가 있으면 안전자산에 넣으라고 한다", () => {
    const rows = [row("ISA", "S&P", "risk", 800, { rebalanceRule: "hold" }), row("ISA", "채권", "safe", 200)];
    const rec = recommendTopUp(rows, ["ISA"], 50, [])!;
    expect(rec.category).toBe("safe");
    expect(rec.needed).toBeCloseTo(600, 6);
  });

  it("넣을 계좌를 찾을 수 없으면 null", () => {
    const rows = [row("ISA", "S&P", "risk", 100, { rebalanceRule: "hold" }), row("ISA", "채권", "safe", 900)];
    expect(recommendTopUp(rows, ["ISA"], 50, [], { ISA: "blocked" })).toBeNull();
  });
});

describe("recommendTopUp — 1주보다 적은 금액", () => {
  it("추천 금액으로 1주도 못 사면 1주를 사는 데 필요한 금액을 따로 알려준다", () => {
    const rows = [row("ISA", "채권", "safe", 1000), row("위탁", "SPY", "risk", 0, { unitPrice: 100 })];
    const rec = recommendTopUp(rows, ["ISA", "위탁"], 10, [], {}, { 위탁: 500 })!;
    // 목표 10%: 필요 금액 = 0.1*1000/0.9 ≈ 111 → 1주(100)는 살 수 있다
    expect(rec.plan.buys.length).toBeGreaterThan(0);
    expect(rec.oneShare).toBeUndefined();

    const small = recommendTopUp([row("ISA", "채권", "safe", 1000), row("위탁", "SPY", "risk", 0, { unitPrice: 500 })], ["ISA", "위탁"], 10, [], {}, { 위탁: 500 })!;
    expect(small.plan.buys).toEqual([]);
    expect(small.oneShare?.item).toBe("SPY");
    expect(small.oneShare?.amount).toBe(500);
    expect(small.oneShare?.plan.buys[0].shares).toBe(1);
  });
});
