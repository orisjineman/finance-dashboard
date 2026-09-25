import type { ChecklistItem } from "./types";

// 체크리스트 순서 규칙: 안 한 항목이 위(사용자가 정한 순서), 완료한 항목은 맨 아래.

export function normalizeOrder(items: ChecklistItem[]): ChecklistItem[] {
  return [...items.filter((i) => !i.done), ...items.filter((i) => i.done)];
}

// 완료 표시하면 맨 아래로, 완료를 풀면 안 한 항목들의 맨 아래로 보낸다.
export function toggleItem(items: ChecklistItem[], id: string): ChecklistItem[] {
  const target = items.find((i) => i.id === id);
  if (!target) return items;
  const flipped = { ...target, done: !target.done };
  const rest = normalizeOrder(items.filter((i) => i.id !== id));
  const undone = rest.filter((i) => !i.done);
  const done = rest.filter((i) => i.done);
  return flipped.done ? [...undone, ...done, flipped] : [...undone, flipped, ...done];
}

// 안 한 항목끼리만 순서를 바꾼다. to는 '안 한 항목들' 안에서의 새 위치 (범위 밖이면 끝으로 붙인다).
export function moveUndone(items: ChecklistItem[], id: string, to: number): ChecklistItem[] {
  const ordered = normalizeOrder(items);
  const undone = ordered.filter((i) => !i.done);
  const done = ordered.filter((i) => i.done);
  const from = undone.findIndex((i) => i.id === id);
  if (from === -1) return ordered;
  const [moved] = undone.splice(from, 1);
  undone.splice(Math.max(0, Math.min(undone.length, to)), 0, moved);
  return [...undone, ...done];
}
