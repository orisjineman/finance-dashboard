import { describe, expect, it } from "vitest";
import type { AssetRow, HistoryEntry, LoanInput } from "./types";
import {
  computeCurrentReturn,
  computeHousingLiquid,
  computeLoanEquity,
  computeReturnTotals,
  computeTotals,
  monthlyHouseSavings,
  fmt,
  fmtEok,
  fmtWon,
  newId,
  parseWonToManwon,
  uniqueAccounts,
} from "./utils";

function row(p: Partial<AssetRow> & Pick<AssetRow, "category" | "amount">): AssetRow {
  return { id: "r", account: "A", item: "x", housingEligible: true, ...p };
}

describe("금액 표기", () => {
  it("만원 단위를 원 단위 쉼표 문자열로 바꾼다", () => {
    expect(fmtWon(3.7)).toBe("37,000");
    expect(fmtWon(12345.6789)).toBe("123,456,789");
    expect(fmtWon(0)).toBe("0");
    expect(fmtWon(undefined)).toBe("0");
    expect(fmtWon(null)).toBe("0");
  });

  it("원 단위 문자열을 만원 단위 숫자로 되돌린다", () => {
    expect(parseWonToManwon("37,000")).toBe(3.7);
    expect(parseWonToManwon("123,456,789원")).toBeCloseTo(12345.6789, 6);
    expect(parseWonToManwon("")).toBe(0);
    expect(parseWonToManwon("-")).toBe(0);
    expect(parseWonToManwon("-10,000")).toBe(-1);
  });

  it("fmtWon과 parseWonToManwon은 서로 왕복이 된다", () => {
    for (const manwon of [0, 1, 3.7, 1234.5678, 99999.9999]) {
      expect(parseWonToManwon(fmtWon(manwon))).toBeCloseTo(manwon, 4);
    }
  });

  it("억 단위 라벨과 일반 쉼표 표기", () => {
    expect(fmtEok(23808.6)).toBe("2.4억");
    expect(fmtEok(undefined)).toBe("0억");
    expect(fmt(1234567.6)).toBe("1,234,568");
    expect(fmt(null)).toBe("0");
  });
});

describe("합계 계산", () => {
  const rows = [
    row({ id: "1", category: "risk", amount: 300 }),
    row({ id: "2", category: "safe", amount: 500 }),
    row({ id: "3", category: "cash", amount: 200, excludeFromReturn: true, housingEligible: false }),
  ];

  it("위험·안전·현금성을 나누고 비중은 투자 항목(위험+안전) 기준이다", () => {
    const t = computeTotals(rows);
    expect(t).toMatchObject({ risk: 300, safe: 500, cash: 200, total: 1000, investBase: 800 });
    expect(t.riskPct).toBe(38); // 37.5 반올림
    expect(t.safePct).toBe(62);
  });

  it("투자 항목이 없으면 비중은 0이다", () => {
    expect(computeTotals([row({ category: "cash", amount: 10 })])).toMatchObject({ riskPct: 0, safePct: 0 });
    expect(computeTotals([])).toMatchObject({ total: 0, investBase: 0 });
  });

  it("수익률 대상은 excludeFromReturn 항목을 뺀다", () => {
    expect(computeReturnTotals(rows).total).toBe(800);
  });

  it("집 마련 가용자산은 housingEligible 항목만 더한다", () => {
    expect(computeHousingLiquid(rows)).toBe(800);
  });

  it("필요 자기자금은 집값에서 LTV 대출한도를 뺀 값이다", () => {
    const loan = { price: 100000, ltvPct: 70, ratePct: 4, termYears: 30 } as LoanInput;
    expect(computeLoanEquity(loan)).toBeCloseTo(30000, 6);
    expect(computeLoanEquity({ ...loan, ltvPct: 0 })).toBe(100000);
    expect(computeLoanEquity(loan, 1500)).toBeCloseTo(31500, 6); // 부대비용 포함
  });

  it("집 마련 월 저축액은 연금 납입을 빼고 세액공제 환급을 더한다", () => {
    const budget = { monthlyNetIncome: 400, annualRaisePct: 0, expenseCategories: [{ id: "a", name: "생활", amount: 150 }], pensionAnnualContribution: 0, pensionTaxCreditRate: 16.5 };
    expect(monthlyHouseSavings(budget)).toBe(250);
    expect(monthlyHouseSavings({ ...budget, pensionAnnualContribution: 600 })).toBeCloseTo(250 - 50 + 8.25, 9);
  });
});

describe("투자원금 대비 수익률", () => {
  const rows = [row({ category: "risk", amount: 1100 }), row({ id: "2", category: "cash", amount: 50, excludeFromReturn: true })];
  const entry = (date: string, cumulativePrincipal: number): HistoryEntry =>
    ({ id: date, date, newContribution: 0, cumulativePrincipal, totalValue: 0, note: "" }) as unknown as HistoryEntry;

  it("기록이 없으면 null", () => {
    expect(computeCurrentReturn(rows, [])).toBeNull();
  });

  it("원금이 0 이하면 null", () => {
    expect(computeCurrentReturn(rows, [entry("2026-01-01", 0)])).toBeNull();
  });

  it("가장 최근 날짜의 원금을 기준으로 계산한다 (입력 순서와 무관)", () => {
    const r = computeCurrentReturn(rows, [entry("2026-09-01", 1000), entry("2026-01-01", 500)]);
    expect(r).not.toBeNull();
    expect(r!.principal).toBe(1000);
    expect(r!.currentTotal).toBe(1100);
    expect(r!.profit).toBe(100);
    expect(r!.returnRate).toBeCloseTo(0.1, 10);
  });
});

describe("기타", () => {
  it("newId는 접두어를 붙이고 매번 다르다", () => {
    const a = newId("row");
    expect(a.startsWith("row-")).toBe(true);
    expect(newId("row")).not.toBe(a);
  });

  it("uniqueAccounts는 빈 값을 빼고 중복 없이 가나다순으로 준다", () => {
    const rows = [row({ category: "cash", amount: 1, account: "나" }), row({ category: "cash", amount: 1, account: "가" }), row({ category: "cash", amount: 1, account: "나" }), row({ category: "cash", amount: 1, account: "" })];
    expect(uniqueAccounts(rows)).toEqual(["가", "나"]);
  });
});
