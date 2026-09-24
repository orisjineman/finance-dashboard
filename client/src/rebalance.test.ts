import { describe, expect, it } from "vitest";
import type { AssetRow, RebalanceGroup, StrategyData } from "./types";
import { computeRebalance, deriveGroupPlan, glideRiskPct, groupTarget, isTaxAdvantaged, yearsUntil } from "./rebalance";

let seq = 0;
function row(account: string, item: string, category: AssetRow["category"], amount: number, extra: Partial<AssetRow> = {}): AssetRow {
  return { id: `r${++seq}`, account, item, category, amount, housingEligible: true, ...extra };
}
const sum = (xs: { amount: number }[]) => xs.reduce((s, x) => s + x.amount, 0);

describe("isTaxAdvantaged", () => {
  it("ISA·IRP·연금 계좌만 세금 우대 계좌로 본다", () => {
    expect(isTaxAdvantaged("ISA")).toBe(true);
    expect(isTaxAdvantaged("A증권 IRP")).toBe(true);
    expect(isTaxAdvantaged("연금저축펀드")).toBe(true);
    expect(isTaxAdvantaged("일반 위탁계좌")).toBe(false);
    expect(isTaxAdvantaged("증권사 CMA")).toBe(false);
  });
});

describe("yearsUntil", () => {
  const now = new Date("2026-01-01T00:00:00");
  it("날짜가 없거나 잘못되면 null", () => {
    expect(yearsUntil("", now)).toBeNull();
    expect(yearsUntil("not-a-date", now)).toBeNull();
  });
  it("남은 기간을 년 단위로 계산한다", () => {
    expect(yearsUntil("2031-01-01", now)!).toBeCloseTo(5, 1);
  });
  it("이미 지난 날짜는 0", () => {
    expect(yearsUntil("2020-01-01", now)).toBe(0);
  });
});

describe("glideRiskPct", () => {
  const pts = [
    { id: "a", yearsLeft: 5, riskPct: 50 },
    { id: "b", yearsLeft: 3, riskPct: 40 },
    { id: "c", yearsLeft: 0, riskPct: 10 },
  ];
  it("지점 사이는 직선으로 잇는다 (입력 순서와 무관)", () => {
    expect(glideRiskPct(pts, 4)).toBeCloseTo(45, 10);
    expect(glideRiskPct(pts, 1.5)).toBeCloseTo(25, 10);
  });
  it("지점 위에서는 그 값을 그대로 쓴다", () => {
    expect(glideRiskPct(pts, 3)).toBe(40);
    expect(glideRiskPct(pts, 0)).toBe(10);
  });
  it("범위 밖은 가장 가까운 끝 값을 쓴다", () => {
    expect(glideRiskPct(pts, 10)).toBe(50);
    expect(glideRiskPct(pts, -1)).toBe(10);
  });
  it("지점이 없거나 값이 유효하지 않으면 null", () => {
    expect(glideRiskPct([], 3)).toBeNull();
    expect(glideRiskPct([{ id: "x", yearsLeft: NaN, riskPct: 10 }], 3)).toBeNull();
  });
});

describe("groupTarget", () => {
  const glide: RebalanceGroup = { id: "g", name: "집", accounts: [], targetType: "glide", fixedRiskPct: 0, note: "" };
  const fixed: RebalanceGroup = { ...glide, targetType: "fixed", fixedRiskPct: 70 };
  const strategy = (housePurchaseDate: string): StrategyData =>
    ({ housePurchaseDate, glidePath: [{ id: "a", yearsLeft: 0, riskPct: 10 }] }) as unknown as StrategyData;

  it("고정 묶음은 고정 비중을 그대로 준다", () => {
    expect(groupTarget(fixed, strategy(""))).toBe(70);
  });
  it("글리드 묶음은 집 매수 예정일이 없으면 null, 있으면 표에서 계산한다", () => {
    expect(groupTarget(glide, strategy(""))).toBeNull();
    expect(groupTarget(glide, strategy("2020-01-01"))).toBe(10);
  });
});

describe("computeRebalance — 기본 동작", () => {
  it("허용 오차 안이면 거래를 만들지 않는다", () => {
    const rows = [row("ISA", "S&P", "risk", 500), row("ISA", "채권", "safe", 500)];
    const r = computeRebalance(rows, ["ISA"], 52, 5);
    expect(r.needsRebalance).toBe(false);
    expect(r.trades).toEqual([]);
    expect(r.riskPct).toBe(50);
  });

  it("범위 밖 계좌·현금성은 계산에서 제외한다", () => {
    const rows = [row("ISA", "S&P", "risk", 500), row("ISA", "채권", "safe", 500), row("기타", "통장", "cash", 9999), row("다른", "S&P", "risk", 9999)];
    const r = computeRebalance(rows, ["ISA"], 50, 5);
    expect(r.scopeTotal).toBe(1000);
  });

  it("위험이 목표보다 크면 위험을 팔고 안전을 사서 목표 비중에 맞춘다", () => {
    const rows = [row("ISA", "S&P", "risk", 1000), row("ISA", "채권", "safe", 1000)];
    const r = computeRebalance(rows, ["ISA"], 30, 5);
    expect(r.needsRebalance).toBe(true);
    expect(r.sellCategory).toBe("risk");
    expect(r.idealShift).toBeCloseTo(400, 6);
    const sells = r.trades.filter((t) => t.action === "sell");
    const buys = r.trades.filter((t) => t.action === "buy");
    expect(sum(sells)).toBeCloseTo(400, 6);
    expect(sum(buys)).toBeCloseTo(400, 6);
    expect(sells[0].item).toBe("S&P");
    expect(buys[0].item).toBe("채권");
    expect(r.afterRiskPct).toBeCloseTo(30, 6);
  });

  it("위험이 목표보다 작으면 안전을 팔고 위험을 산다", () => {
    const rows = [row("ISA", "S&P", "risk", 500), row("ISA", "채권", "safe", 1500)];
    const r = computeRebalance(rows, ["ISA"], 50, 5);
    expect(r.sellCategory).toBe("safe");
    expect(r.afterRiskPct).toBeCloseTo(50, 6);
    expect(r.trades.find((t) => t.action === "buy")!.item).toBe("S&P");
  });

  it("매도는 보유금액 비율대로 나눈다", () => {
    const rows = [row("ISA", "A", "risk", 750), row("ISA", "B", "risk", 250), row("ISA", "채권", "safe", 1000)];
    const r = computeRebalance(rows, ["ISA"], 30, 5);
    const a = r.trades.find((t) => t.action === "sell" && t.item === "A")!.amount;
    const b = r.trades.find((t) => t.action === "sell" && t.item === "B")!.amount;
    expect(a / b).toBeCloseTo(3, 6);
  });
});

describe("computeRebalance — 규칙", () => {
  it("'매매 안 함' 상품은 팔지도 사지도 않는다", () => {
    const rows = [
      row("ISA", "S&P", "risk", 500),
      row("ISA", "묶인채권", "safe", 1000, { rebalanceRule: "hold" }),
      row("ISA", "단기채", "safe", 500),
    ];
    const r = computeRebalance(rows, ["ISA"], 50, 5);
    expect(r.trades.some((t) => t.item === "묶인채권")).toBe(false);
    expect(r.trades.some((t) => t.item === "단기채" && t.action === "sell")).toBe(true);
  });

  it("'매수 우선' 상품이 있으면 매수는 그 상품에만 몰린다", () => {
    const rows = [
      row("ISA", "R1", "risk", 300),
      row("ISA", "R2", "risk", 200, { rebalanceRule: "preferred" }),
      row("ISA", "채권", "safe", 1500),
    ];
    const r = computeRebalance(rows, ["ISA"], 50, 5);
    const buys = r.trades.filter((t) => t.action === "buy");
    expect(buys.length).toBe(1);
    expect(buys[0].item).toBe("R2");
  });

  it("위험자산 편입 불가 계좌는 위험을 사는 거래에서 빠지고 안내가 붙는다", () => {
    const rows = [row("ISA", "S&P", "risk", 200), row("ISA", "채권", "safe", 800)];
    const r = computeRebalance(rows, ["ISA"], 50, 5, { ISA: "blocked" });
    expect(r.trades).toEqual([]);
    expect(r.notes.some((n) => n.includes("편입 불가"))).toBe(true);
  });
});

describe("computeRebalance — 1주 단위", () => {
  it("1주 가격이 있으면 정수 주수로 팔고, 안 쓴 돈은 가격 없는 상품이 흡수한다", () => {
    const rows = [row("ISA", "ETF", "risk", 600, { unitPrice: 30 }), row("ISA", "RP", "safe", 400)];
    const r = computeRebalance(rows, ["ISA"], 30, 5);
    const sell = r.trades.find((t) => t.action === "sell")!;
    expect(sell.shares).toBe(10);
    expect(sell.amount).toBeCloseTo(300, 6);
    expect(Number.isInteger(sell.shares)).toBe(true);
    expect(r.afterRiskPct).toBeCloseTo(30, 6);
  });

  it("살 상품에 가격이 있으면 살 수 있는 만큼만 정수 주수로 사고 남는 돈을 알린다", () => {
    const rows = [row("ISA", "S&P", "risk", 100, { unitPrice: 30 }), row("ISA", "RP", "safe", 900)];
    const r = computeRebalance(rows, ["ISA"], 50, 5);
    const buy = r.trades.find((t) => t.action === "buy")!;
    expect(Number.isInteger(buy.shares)).toBe(true);
    expect(buy.amount).toBe(buy.shares! * 30);
    expect(r.notes.some((n) => n.includes("1주 단위"))).toBe(true);
  });

  it("같은 이름의 상품은 한 곳에 입력한 가격을 다른 계좌에서도 쓴다", () => {
    const rows = [
      row("ISA", "ETF", "risk", 600),
      row("ISA", "RP", "safe", 400),
      row("연금저축", "ETF", "risk", 100, { unitPrice: 30 }),
    ];
    const r = computeRebalance(rows, ["ISA"], 30, 5);
    const sell = r.trades.find((t) => t.action === "sell" && t.item === "ETF")!;
    expect(sell.unitPrice).toBe(30);
    expect(sell.shares).toBe(10);
  });

  it("팔아야 할 금액이 1주 가격보다 작으면 계좌를 건너뛴다", () => {
    const rows = [row("ISA", "ETF", "risk", 520, { unitPrice: 1000 }), row("ISA", "RP", "safe", 480)];
    const r = computeRebalance(rows, ["ISA"], 50, 1);
    expect(r.trades).toEqual([]);
    expect(r.notes.some((n) => n.includes("1주 가격보다 작아서"))).toBe(true);
  });
});

describe("computeRebalance — 계좌 간 이동", () => {
  const ISA = "ISA";
  const CMA = "증권사 CMA";
  const TOSS = "일반 위탁계좌";
  const build = () => [
    row(ISA, "S&P", "risk", 100),
    row(ISA, "채권", "safe", 100),
    row(CMA, "RP", "safe", 1000),
    row(TOSS, "SPY", "risk", 0),
  ];

  it("입금 가능 금액이 없으면 계좌 안 거래만 하고 못 맞춘 몫을 알린다", () => {
    const r = computeRebalance(build(), [ISA, CMA, TOSS], 40, 5);
    expect(r.transfers).toEqual([]);
    expect(r.trades.every((t) => !t.crossAccount)).toBe(true);
    expect(r.notes.some((n) => n.includes("못 맞췄어"))).toBe(true);
  });

  it("입금 가능 금액이 있으면 CMA에서 빼서 위탁계좌로 옮기고 목표를 맞춘다", () => {
    const r = computeRebalance(build(), [ISA, CMA, TOSS], 40, 5, {}, { [TOSS]: 500 });
    expect(r.transfers).toHaveLength(1);
    expect(r.transfers[0]).toMatchObject({ from: CMA, to: TOSS });
    expect(r.transfers[0].amount).toBeCloseTo(280, 6);
    const cross = r.trades.filter((t) => t.crossAccount);
    expect(cross.map((t) => t.action).sort()).toEqual(["buy", "sell"]);
    expect(r.afterRiskPct).toBeCloseTo(40, 6);
  });

  it("입금 한도는 넘지 않는다", () => {
    const r = computeRebalance(build(), [ISA, CMA, TOSS], 40, 5, {}, { [TOSS]: 100 });
    expect(r.transfers[0].amount).toBeCloseTo(100, 6);
    expect(r.notes.some((n) => n.includes("못 맞췄어"))).toBe(true);
  });

  it("위험자산 편입 불가 계좌로는 위험을 사기 위해 옮기지 않는다", () => {
    const r = computeRebalance(build(), [ISA, CMA, TOSS], 40, 5, { [TOSS]: "blocked" }, { [TOSS]: 500 });
    expect(r.transfers).toEqual([]);
  });

  it("세금 우대 계좌(ISA)에서는 다른 계좌로 돈을 빼지 않는다", () => {
    const rows = [row(ISA, "채권", "safe", 1000), row(ISA, "S&P", "risk", 0), row(TOSS, "SPY", "risk", 0)];
    const r = computeRebalance(rows, [ISA, TOSS], 50, 5, {}, { [TOSS]: 5000 });
    expect(r.transfers).toEqual([]);
  });
});

describe("deriveGroupPlan", () => {
  const rows = [
    row("A", "S&P", "risk", 500),
    row("A", "채권", "safe", 500),
    row("B", "RP", "safe", 1000),
  ];

  it("위험 상품이 있는 계좌는 자동으로 편입 가능, 없는 계좌는 안전 전용으로 본다", () => {
    const p = deriveGroupPlan(rows, ["A", "B"], 25);
    expect(p.capable.map((a) => a.account)).toEqual(["A"]);
    expect(p.safeOnly.map((a) => a.account)).toEqual(["B"]);
    expect(p.total).toBe(2000);
    expect(p.requiredRisk).toBe(500);
    expect(p.feasible).toBe(true);
    expect(p.capableRiskPct).toBeCloseTo(50, 6);
    expect(p.maxRiskPct).toBeCloseTo(50, 6);
    expect(p.minRiskPct).toBe(0);
  });

  it("목표가 최대 비중보다 높으면 불가능", () => {
    const p = deriveGroupPlan(rows, ["A", "B"], 60);
    expect(p.feasible).toBe(false);
    expect(p.tooLow).toBe(false);
  });

  it("편입 가능으로 지정하면 위험 상품이 없는 계좌도 위험을 담을 수 있다", () => {
    const p = deriveGroupPlan(rows, ["A", "B"], 60, { B: "allowed" });
    expect(p.capable.map((a) => a.account).sort()).toEqual(["A", "B"]);
    expect(p.feasible).toBe(true);
  });

  it("편입 불가 계좌에 이미 있는 위험자산 때문에 목표가 너무 낮으면 tooLow", () => {
    const p = deriveGroupPlan(rows, ["A", "B"], 10, { A: "blocked" });
    expect(p.fixedRisk).toBe(500);
    expect(p.minRiskPct).toBeCloseTo(25, 6);
    expect(p.tooLow).toBe(true);
    expect(p.feasible).toBe(false);
  });

  it("계좌가 비어 있어도 죽지 않는다", () => {
    const p = deriveGroupPlan([], ["A"], 30);
    expect(p.total).toBe(0);
    expect(p.capableRiskPct).toBeNull();
  });
});
