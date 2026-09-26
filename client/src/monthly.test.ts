import { describe, expect, it } from "vitest";
import type { AssetRow, BudgetData, HistoryEntry } from "./types";
import { cycleDue, cycleStart, monthlyClose, stampRowUpdates } from "./monthly";

const d = (iso: string) => new Date(`${iso}T00:00:00`);
const row = (id: string, amount: number, updatedAt?: string): AssetRow => ({ id, account: "A", item: id, category: "cash", amount, housingEligible: true, updatedAt });

describe("정리 주기", () => {
  it("기록일 3일 전부터 새 주기 (28이면 25일~다음 달 24일)", () => {
    expect(cycleStart(28, d("2026-09-26"))).toBe("2026-09-25");
    expect(cycleStart(28, d("2026-10-03"))).toBe("2026-09-25");
    expect(cycleStart(28, d("2026-10-24"))).toBe("2026-09-25");
    expect(cycleStart(28, d("2026-10-25"))).toBe("2026-10-25");
    expect(cycleStart(28, d("2027-01-05"))).toBe("2026-12-25");
    expect(cycleDue(28, d("2026-10-03"))).toBe("2026-09-28");
  });
  it("기록일이 없으면 이번 달 1일부터", () => {
    expect(cycleStart(undefined, d("2026-09-26"))).toBe("2026-09-01");
    expect(cycleDue(undefined, d("2026-09-26"))).toBeNull();
  });
});

describe("stampRowUpdates", () => {
  it("잔액이 바뀐 행과 새 행에만 날짜를 찍는다", () => {
    const prev = [row("a", 10), row("b", 20, "2026-01-01")];
    const next = stampRowUpdates(prev, [row("a", 11), { ...prev[1], item: "이름만 바꿈" }, row("c", 5)], "2026-09-26");
    expect(next.map((r) => r.updatedAt)).toEqual(["2026-09-26", "2026-01-01", "2026-09-26"]);
  });
});

describe("monthlyClose", () => {
  const now = d("2026-09-29");
  const budget = (editedAt = {}): BudgetData => ({
    monthlyNetIncome: 0, annualRaisePct: 0, expenseCategories: [], pensionAnnualContribution: 0, pensionTaxCreditRate: 16.5,
    taxPrep: { rentMonthly: 0, rentPaid: 0, subscriptionPaid: 0, creditCardUsed: 0, debitCardUsed: 0, editedAt, policy: {} as never },
  });
  const entry = (date: string) => ({ id: date, date } as HistoryEntry);
  const strategy = { housePurchaseDate: "", isaDutyEndDate: "", overviewSummary: [], glidePath: [], recordDay: 28 };
  it("이번 주기에 한 일만 완료로 친다", () => {
    const c = monthlyClose(
      { rows: [row("a", 1, "2026-09-26"), row("b", 1, "2026-08-30")], history: [entry("2026-08-30")], strategy, budget: budget({ pension: "2026-09-27", card: "2026-09-01" }) },
      [{ id: "rebalance-g1", level: "warn", text: "" }],
      now,
    );
    const done = Object.fromEntries(c.steps.map((s) => [s.key, s.done]));
    expect(done).toEqual({ balances: false, pension: true, subscription: false, card: false, history: false, rebalance: false });
    expect(c.steps[0].detail).toBe("1/2");
  });
  it("모두 하면 전부 완료", () => {
    const c = monthlyClose(
      { rows: [row("a", 1, "2026-09-28")], history: [entry("2026-09-28")], strategy, budget: budget({ pension: "2026-09-28", subscription: "2026-09-28", card: "2026-09-28" }) },
      [],
      now,
    );
    expect(c.steps.every((s) => s.done)).toBe(true);
  });
});
