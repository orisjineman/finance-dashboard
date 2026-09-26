import { describe, expect, it } from "vitest";
import type { HistoryEntry } from "./types";
import { describePeriod, lastRecordDue, overallReturn, periodReturn, yearlyReturns } from "./returns";

// 날짜, 누적원금, 평가금액만 의미 있는 기록
const rec = (date: string, principal: number, value: number): HistoryEntry => ({
  id: date, date, newContribution: 0, cumulativePrincipal: principal, totalValue: value,
  riskValue: 0, safeValue: 0, cashValue: 0, profit: value - principal, returnRate: 0,
});

describe("periodReturn", () => {
  it("중간에 넣은 돈이 없으면 단순 수익률", () => {
    const p = periodReturn([rec("2027-01-01", 1000, 1000), rec("2028-01-01", 1000, 1100)], 2027)!;
    expect(p.rate).toBeCloseTo(0.1, 9);
    expect(p.annualRate).toBeCloseTo(0.1, 9);
    expect(p.flows).toBe(0);
  });
  it("넣은 돈은 수익에서 빼고, 남은 기간만큼 가중한다", () => {
    // 연초 1,000, 연 중간에 500 넣음(기록 날짜 기준), 연말 1,650 → 수익 150, 분모 1,000 + 500 × 약 0.5
    const p = periodReturn([rec("2027-01-01", 1000, 1000), rec("2027-07-02", 1500, 1560), rec("2028-01-01", 1500, 1650)], 2027)!;
    expect(p.flows).toBe(500);
    expect(p.profit).toBe(150);
    expect(p.rate).toBeCloseTo(150 / (1000 + (500 * 183) / 365), 9);
  });
  it("1년이 안 되면 연환산하지 않는다", () => {
    const p = periodReturn([rec("2027-09-25", 1000, 1000), rec("2027-12-25", 1000, 1030)], 2027)!;
    expect(p.rate).toBeCloseTo(0.03, 9);
    expect(p.annualRate).toBeNull();
  });
  it("1년보다 길면 연 기준으로 줄인다", () => {
    const p = periodReturn([rec("2027-01-01", 1000, 1000), rec("2029-01-01", 1000, 1210)], 2028)!;
    expect(p.annualRate).toBeCloseTo(0.1, 2);
  });
  it("기록이 하나뿐이거나 날짜가 같으면 null", () => {
    expect(periodReturn([rec("2027-01-01", 1, 1)], 2027)).toBeNull();
    expect(periodReturn([rec("2027-01-01", 1, 1), rec("2027-01-01", 1, 2)], 2027)).toBeNull();
  });
});

describe("yearlyReturns", () => {
  it("매달 같은 날 기록하면 해마다 앞 구간의 끝이 다음 구간의 시작", () => {
    const h = [rec("2026-09-25", 1000, 1000), rec("2026-12-25", 1000, 1020), rec("2027-06-25", 1200, 1250), rec("2027-12-25", 1200, 1300)];
    const ys = yearlyReturns(h);
    expect(ys.map((p) => p.year)).toEqual([2026, 2027]);
    expect(ys[0].start.date).toBe("2026-09-25");
    expect(ys[0].annualRate).toBeNull(); // 첫해는 부분
    expect(ys[1].start.date).toBe("2026-12-25");
    expect(ys[1].end.date).toBe("2027-12-25");
    expect(ys[1].annualRate).not.toBeNull();
  });
  it("1월 1일 기록은 전년도의 끝이자 올해의 시작", () => {
    const ys = yearlyReturns([rec("2027-01-01", 1000, 1000), rec("2028-01-01", 1000, 1100), rec("2028-03-01", 1000, 1120)]);
    expect(ys.map((p) => [p.year, p.start.date, p.end.date])).toEqual([
      [2027, "2027-01-01", "2028-01-01"],
      [2028, "2028-01-01", "2028-03-01"],
    ]);
  });
  it("기록이 없는 해는 건너뛰어도 구간은 이어진다", () => {
    const ys = yearlyReturns([rec("2026-09-01", 1000, 1000), rec("2028-03-01", 1000, 1200)]);
    expect(ys).toHaveLength(1);
    expect(ys[0].start.date).toBe("2026-09-01");
    expect(ys[0].end.date).toBe("2028-03-01");
  });
  it("기록이 하나면 빈 목록", () => {
    expect(yearlyReturns([rec("2026-09-25", 1000, 1050)])).toEqual([]);
  });
});

describe("overallReturn", () => {
  it("구간 수익률을 이어 붙이고, 1년 이상이면 연평균", () => {
    const ys = yearlyReturns([rec("2027-01-01", 1000, 1000), rec("2028-01-01", 1000, 1100), rec("2029-01-01", 1000, 1210)]);
    const o = overallReturn(ys)!;
    expect(o.rate).toBeCloseTo(0.21, 9);
    expect(o.annualRate).toBeCloseTo(0.1, 2);
    expect(overallReturn([])).toBeNull();
  });
});

describe("lastRecordDue", () => {
  it("이번 달 기록일이 지났으면 이번 달, 아직이면 지난달", () => {
    expect(lastRecordDue(25, new Date("2026-09-26T00:00:00"))).toBe("2026-09-25");
    expect(lastRecordDue(25, new Date("2026-09-10T00:00:00"))).toBe("2026-08-25");
    expect(lastRecordDue(25, new Date("2026-01-10T00:00:00"))).toBe("2025-12-25");
  });
});

describe("1월~12월 단위 구간", () => {
  // 매달 말일쯤 기록하는 습관
  const h = [
    rec("2026-09-25", 1000, 1000),
    rec("2026-12-29", 1000, 1030),
    rec("2027-06-30", 1100, 1150),
    rec("2027-12-30", 1200, 1300),
    rec("2028-01-05", 1200, 1310), // 연초 휴일로 늦게 한 기록도 전년 끝으로
    rec("2028-03-30", 1200, 1350),
  ];
  const ys = yearlyReturns(h);
  it("전년 12월 말 기록 → 그해 12월 말 기록이 한 해", () => {
    expect(ys.map((p) => [p.year, p.start.date, p.end.date])).toEqual([
      [2026, "2026-09-25", "2026-12-29"],
      [2027, "2026-12-29", "2028-01-05"],
      [2028, "2028-01-05", "2028-03-30"],
    ]);
  });
  it("첫해는 일부 기간, 지난해는 1월~12월, 올해는 1월~최근 기록(진행 중)", () => {
    const now = new Date("2028-04-02T00:00:00");
    expect(describePeriod(ys[0], now, 7)).toMatchObject({ kind: "partial", range: "9/25~12월" });
    expect(describePeriod(ys[1], now, 7)).toMatchObject({ kind: "full", range: "1월~12월" });
    expect(describePeriod(ys[1], now, 7).target).toBeCloseTo(0.07, 9);
    const ytd = describePeriod(ys[2], now, 7);
    expect(ytd).toMatchObject({ kind: "ytd", range: "1월~3/30" });
    expect(ytd.target).toBeCloseTo(Math.pow(1.07, ys[2].days / 365) - 1, 9); // 지난 기간만큼 줄인 목표
  });
  it("연말 기록이 없던 지난해는 일부 기간으로 본다", () => {
    const y = yearlyReturns([rec("2026-12-29", 1000, 1000), rec("2027-11-29", 1000, 1050)]);
    expect(describePeriod(y[0], new Date("2028-02-01T00:00:00"), 7)).toMatchObject({ kind: "partial", range: "1월~11/29" });
  });
});
