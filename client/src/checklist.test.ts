import { describe, expect, it } from "vitest";
import type { ChecklistItem } from "./types";
import { moveUndone, normalizeOrder, toggleItem } from "./checklist";

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
