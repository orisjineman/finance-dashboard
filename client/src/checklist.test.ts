import { describe, expect, it } from "vitest";
import type { BudgetData, ChecklistItem } from "./types";
import { autoAmount, moveUndone, normalizeOrder, toggleItem } from "./checklist";

const item = (id: string, done = false): ChecklistItem => ({ id, text: id, done });
const ids = (xs: ChecklistItem[]) => xs.map((x) => `${x.id}${x.done ? "✓" : ""}`).join(",");

describe("체크리스트 순서", () => {
  it("완료 항목은 맨 아래, 나머지 순서는 유지", () => {
    expect(ids(normalizeOrder([item("a", true), item("b"), item("c", true), item("d")]))).toBe("b,d,a✓,c✓");
  });
  it("완료로 바꾸면 맨 아래로 간다", () => {
    expect(ids(toggleItem([item("a"), item("b"), item("c"), item("x", true)], "a"))).toBe("b,c,x✓,a✓");
  });
  it("완료를 풀면 안 한 항목들의 맨 아래로 간다", () => {
    expect(ids(toggleItem([item("a"), item("b"), item("x", true), item("y", true)], "y"))).toBe("a,b,y,x✓");
  });
  it("안 한 항목끼리 순서를 바꾸고 완료 항목은 건드리지 않는다", () => {
    const list = [item("a"), item("b"), item("c"), item("x", true)];
    expect(ids(moveUndone(list, "c", 0))).toBe("c,a,b,x✓");
    expect(ids(moveUndone(list, "a", 2))).toBe("b,c,a,x✓");
    expect(ids(moveUndone(list, "a", 99))).toBe("b,c,a,x✓");
    expect(ids(moveUndone(list, "x", 0))).toBe("a,b,c,x✓"); // 완료 항목은 못 옮김
    expect(ids(moveUndone(list, "zz", 0))).toBe("a,b,c,x✓");
  });
});

describe("체크리스트 자동 금액", () => {
  const now = new Date("2026-09-25T00:00:00");
  const budget: BudgetData = {
    monthlyNetIncome: 0, annualRaisePct: 0, expenseCategories: [], pensionAnnualContribution: 600, pensionTaxCreditRate: 16.5,
    pensionPaidThisYear: 200, pensionPaidYear: 2026, pensionCreditLimit: 600,
    taxPrep: {
      year: 2026, rentMonthly: 50, rentPaid: 450, subscriptionPaid: 100, creditCardUsed: 0, debitCardUsed: 0,
      rentSplit: [{ from: "2026-01", to: "2026-12", mine: 30, other: 20 }],
      policy: {
        rent: { incomeMax: 8000, lowIncomeMax: 5500, rateLowPct: 17, ratePct: 15, limit: 1000 },
        subscription: { incomeMax: 7000, limit: 300, ratePct: 40 },
        card: { thresholdPct: 25, creditRatePct: 15, debitRatePct: 30, limitLow: 300, limitHigh: 250, limitIncome: 7000 },
        marginalRatePct: 16.5, updatedAt: "2026-09-25",
      },
    },
  };
  it("연금·청약은 한도까지 남은 납입액", () => {
    expect(autoAmount("pensionFill", budget, 5000, now)).toEqual({ amount: 400, kind: "remaining", filled: false });
    expect(autoAmount("subscriptionFill", budget, 5000, now)).toEqual({ amount: 200, kind: "remaining", filled: false });
    expect(autoAmount("pensionFill", { ...budget, pensionPaidThisYear: 700 }, 5000, now)?.filled).toBe(true);
  });
  it("환급 몫은 분담자 몫과 내 몫", () => {
    const other = autoAmount("refundOther", budget, 5000, now)!;
    const mine = autoAmount("refundMine", budget, 5000, now)!;
    expect(other.amount).toBeCloseTo(600 * 0.17 * 0.4, 9);
    expect(mine.amount + other.amount).toBeCloseTo(600 * 0.165 + 600 * 0.17 + 100 * 0.4 * 0.165, 9); // 연금 + 월세 + 청약
  });
  it("자동 금액이 없는 항목은 null", () => {
    expect(autoAmount(undefined, budget, 5000, now)).toBeNull();
  });
});
