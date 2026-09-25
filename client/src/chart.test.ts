import { describe, expect, it } from "vitest";
import { niceTicks, valueAt } from "./chart";
import { projectHousing } from "./housing";

describe("niceTicks", () => {
  it("범위를 덮고 오름차순이며 간격이 일정하다", () => {
    for (const [min, max] of [[0, 100], [3, 97], [1234, 98765], [-50, 20], [0.1, 0.9]]) {
      const t = niceTicks(min, max, 4);
      expect(t[0]).toBeLessThanOrEqual(min);
      expect(t[t.length - 1]).toBeGreaterThanOrEqual(max);
      const step = t[1] - t[0];
      t.slice(1).forEach((v, i) => expect(v - t[i]).toBeCloseTo(step, 9));
    }
  });
  it("눈금 간격은 1·2·5 × 10^n 이다", () => {
    const t = niceTicks(0, 87000, 4);
    expect([1, 2, 5]).toContain(Number((t[1] - t[0]).toExponential(0).split("e")[0]));
  });
  it("최소와 최대가 같거나 값이 이상하면 죽지 않는다", () => {
    expect(niceTicks(5, 5)).toEqual([5]);
    expect(niceTicks(NaN, 1)).toEqual([0]);
  });
});

describe("projectHousing", () => {
  const now = new Date("2026-09-24T00:00:00");
  it("이미 목표를 넘었으면 지금 도달로 본다", () => {
    const p = projectHousing({ current: 100, target: 80, monthlyAdd: 10, now, purchaseDate: "2030-06-30" });
    expect(p.monthsToReach).toBe(0);
    expect(p.onTrack).toBe(true);
  });
  it("저축이 0 이하이면 도달할 수 없다", () => {
    const p = projectHousing({ current: 10, target: 80, monthlyAdd: 0, now, purchaseDate: "2030-06-30" });
    expect(p.reachDate).toBeNull();
    expect(p.onTrack).toBe(false);
  });
  it("매달 저축으로 도달 시점을 직선으로 계산한다", () => {
    const p = projectHousing({ current: 20, target: 80, monthlyAdd: 10, now, purchaseDate: "2030-06-30" });
    expect(p.monthsToReach).toBeCloseTo(6, 6);
    expect(p.points).toHaveLength(2);
    expect(p.points[1].y).toBe(80);
    expect(p.onTrack).toBe(true);
  });
  it("예정일보다 늦게 닿으면 onTrack=false, 예정일이 없으면 null", () => {
    expect(projectHousing({ current: 0, target: 100000, monthlyAdd: 10, now, purchaseDate: "2027-01-01" }).onTrack).toBe(false);
    expect(projectHousing({ current: 0, target: 100, monthlyAdd: 10, now, purchaseDate: "" }).onTrack).toBeNull();
  });
});

describe("valueAt", () => {
  const pts = [
    { t: 100, y: 10 },
    { t: 0, y: 0 },
    { t: 300, y: 10 },
  ];
  it("점 위에서는 그 값, 사이에서는 직선으로 이어 읽는다 (입력 순서와 무관)", () => {
    expect(valueAt(pts, 0)).toBe(0);
    expect(valueAt(pts, 50)).toBeCloseTo(5, 9);
    expect(valueAt(pts, 200)).toBeCloseTo(10, 9);
    expect(valueAt(pts, 300)).toBe(10);
  });
  it("선 밖이나 빈 선은 null, 점 하나면 그 시각에서만 값", () => {
    expect(valueAt(pts, -1)).toBeNull();
    expect(valueAt(pts, 301)).toBeNull();
    expect(valueAt([], 5)).toBeNull();
    expect(valueAt([{ t: 5, y: 7 }], 5)).toBe(7);
    expect(valueAt([{ t: 5, y: 7 }], 6)).toBeNull();
  });
});
