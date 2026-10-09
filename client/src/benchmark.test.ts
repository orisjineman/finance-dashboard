import { describe, expect, it } from "vitest";
import type { BenchmarkSetting } from "./types";
import { benchmarkReturn, benchmarksOf, DEFAULT_BENCHMARKS, earliestDate, priceOnOrBefore } from "./benchmark";

const series = [
  { d: "2026-01-02", p: 100 },
  { d: "2026-01-05", p: 102 },
  { d: "2026-06-30", p: 120 },
  { d: "2026-12-30", p: 130 },
];
const etf: BenchmarkSetting = { id: "e", name: "ETF", kind: "etf", ticker: "360750" };
const rate = (ratePct?: number): BenchmarkSetting => ({ id: "r", name: "예금", kind: "rate", ratePct });

describe("priceOnOrBefore", () => {
  it("그 날짜 이하의 마지막 종가를 고른다 (휴장일이면 직전 거래일)", () => {
    expect(priceOnOrBefore(series, "2026-01-04")).toEqual({ d: "2026-01-02", p: 100 });
    expect(priceOnOrBefore(series, "2026-06-30")).toEqual({ d: "2026-06-30", p: 120 });
    expect(priceOnOrBefore(series, "2026-01-01")).toBeNull();
  });
});

describe("benchmarkReturn", () => {
  it("ETF는 종가가 오른 비율", () => {
    expect(benchmarkReturn(etf, series, "2026-01-02", "2026-12-31")).toBeCloseTo(0.3, 6);
    expect(benchmarkReturn(etf, series, "2026-01-03", "2026-06-30")).toBeCloseTo(0.2, 6);
  });
  it("시세가 비었거나 시작·끝이 너무 멀면 null", () => {
    expect(benchmarkReturn(etf, undefined, "2026-01-02", "2026-12-31")).toBeNull();
    expect(benchmarkReturn(etf, [], "2026-01-02", "2026-12-31")).toBeNull();
    expect(benchmarkReturn(etf, series, "2025-12-01", "2026-12-31")).toBeNull(); // 시작일 이전 시세 없음
    expect(benchmarkReturn(etf, series, "2026-01-02", "2027-02-01")).toBeNull(); // 끝일 직전 시세가 한 달 넘게 전
  });
  it("금리는 기간만큼 복리로 쌓는다", () => {
    expect(benchmarkReturn(rate(3), undefined, "2026-01-01", "2027-01-01")).toBeCloseTo(0.03, 6);
    expect(benchmarkReturn(rate(4), undefined, "2026-01-01", "2026-07-02")).toBeCloseTo(Math.pow(1.04, 182 / 365) - 1, 6);
  });
  it("금리가 비었거나 기간이 0이면 null", () => {
    expect(benchmarkReturn(rate(undefined), undefined, "2026-01-01", "2027-01-01")).toBeNull();
    expect(benchmarkReturn(rate(3), undefined, "2026-01-01", "2026-01-01")).toBeNull();
  });
});

describe("benchmarksOf / earliestDate", () => {
  it("설정이 없으면 기본 목록, 빈 목록이면 비교 안 함", () => {
    expect(benchmarksOf(undefined)).toBe(DEFAULT_BENCHMARKS);
    expect(benchmarksOf([])).toEqual([]);
  });
  it("가장 이른 날짜", () => {
    expect(earliestDate(["2026-03-01", "2025-12-28", "2026-01-01"])).toBe("2025-12-28");
    expect(earliestDate([])).toBeNull();
  });
});
