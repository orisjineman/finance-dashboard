import { describe, expect, it } from "vitest";
import type { AssetRow, BudgetData, HistoryEntry } from "./types";
import {
  computeCurrentReturn,
  computeHousingLiquid,
  computeLoanEquity,
  computeReturnTotals,
  computeTotals,
  autoAnnualContribution,
  monthlyHouseSavings,
  pensionFromSalary,
  pensionAccountTotal,
  expectedRefund,
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
    expect(computeLoanEquity(100000, 0.7)).toBeCloseTo(30000, 6);
    expect(computeLoanEquity(100000, 0)).toBe(100000);
    expect(computeLoanEquity(100000, 0.7, 1500)).toBeCloseTo(31500, 6); // 부대비용 포함
    expect(computeLoanEquity(100000, 1.5)).toBe(0); // 0~1 밖은 잘라낸다
  });

  it("시뮬레이션 자동 적립액은 월 저축 가능액 × 12 + 연금 세액공제 환급", () => {
    const budget = { monthlyNetIncome: 400, annualRaisePct: 0, expenseCategories: [{ id: "a", name: "생활", amount: 150 }], pensionAnnualContribution: 600, pensionTaxCreditRate: 16.5 };
    expect(autoAnnualContribution(budget)).toBeCloseTo(250 * 12 + 99, 9);
    expect(autoAnnualContribution({ ...budget, refundExpected: 200 })).toBeCloseTo(250 * 12 + 200, 9);
    expect(autoAnnualContribution({ ...budget, monthlyNetIncome: 100, pensionAnnualContribution: 0 })).toBe(0); // 적자면 0
  });

  it("집 마련 월 저축액은 연금 납입을 빼고, 환급은 사용처가 집 마련일 때만 더한다", () => {
    const budget = { monthlyNetIncome: 400, annualRaisePct: 0, expenseCategories: [{ id: "a", name: "생활", amount: 150 }], pensionAnnualContribution: 0, pensionTaxCreditRate: 16.5 };
    expect(monthlyHouseSavings(budget)).toBe(250);
    // 연금 600, 공제율 16.5% → 환급 99
    const b = { ...budget, pensionAnnualContribution: 600 };
    expect(monthlyHouseSavings(b)).toBeCloseTo(250 - (600 - 99) / 12, 9); // 기본: 환급을 연금에 보탬 → 월급 몫 501
    expect(monthlyHouseSavings({ ...b, refundTo: "retirement" })).toBeCloseTo(250 - 50, 9); // 환급은 따로 → 월급에서 600 전부
    expect(monthlyHouseSavings({ ...b, refundTo: "house" })).toBeCloseTo(250 - 50 + 99 / 12, 9);
    expect(monthlyHouseSavings({ ...b, refundExpected: 800 })).toBeCloseTo(250, 9); // 환급이 납입액보다 크면 월급 몫 0
    expect(pensionFromSalary({ ...b, refundExpected: 150 })).toBe(450);
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

describe("환급 내 몫과 연금 납입 방식", () => {
  const b = (p: Partial<BudgetData> = {}): BudgetData => ({
    monthlyNetIncome: 300, annualRaisePct: 0, expenseCategories: [], pensionAnnualContribution: 600, pensionTaxCreditRate: 16.5,
    refundExpected: 150, refundOtherShare: 30, ...p,
  });
  it("환급 내 몫 = 환급 예상액 − 분담자 몫", () => {
    expect(expectedRefund(b())).toBe(120);
    expect(expectedRefund(b({ refundOtherShare: undefined }))).toBe(150);
  });
  it("한도 안에 포함하면 월급 몫이 내 몫만큼 줄고, 위에 추가하면 월급 몫은 그대로", () => {
    expect(pensionFromSalary(b())).toBe(480);
    expect(pensionAccountTotal(b())).toBe(600);
    expect(pensionFromSalary(b({ refundPensionMode: "onTop" }))).toBe(600);
    expect(pensionAccountTotal(b({ refundPensionMode: "onTop" }))).toBe(720);
  });
  it("환급을 연금에 안 보태면 방식과 상관없이 월급에서 전액", () => {
    expect(pensionFromSalary(b({ refundTo: "retirement", refundPensionMode: "onTop" }))).toBe(600);
    expect(pensionAccountTotal(b({ refundTo: "retirement", refundPensionMode: "onTop" }))).toBe(600);
  });
});
