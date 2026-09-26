import type { BudgetData, ChecklistAuto, ChecklistItem } from "./types";
import { computePensionCredit } from "./pension";
import { computeRefundSplit, thisYearValues } from "./tax";

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

// 항목 옆에 붙는 자동 금액 (만원). 채울 한도가 이미 찼으면 filled. 계산할 수 없으면 null.
export interface AutoAmount {
  amount: number;
  kind: "remaining" | "refund"; // 한도까지 남은 납입액 / 환급 예상액
  filled: boolean;
}

export function autoAmount(auto: ChecklistAuto | undefined, budget: BudgetData, income: number, now: Date): AutoAmount | null {
  if (!auto) return null;
  const tp = budget.taxPrep;
  if (auto === "pensionFill") {
    const remaining = computePensionCredit(budget, now).remaining;
    return { amount: remaining, kind: "remaining", filled: remaining <= 0 };
  }
  if (!tp) return null;
  if (auto === "subscriptionFill") {
    const remaining = Math.max(0, tp.policy.subscription.limit - thisYearValues(tp, now).subscriptionPaid);
    return { amount: remaining, kind: "remaining", filled: remaining <= 0 };
  }
  const split = computeRefundSplit(budget, tp, income, now);
  return { amount: auto === "refundOther" ? split.other : split.mine, kind: "refund", filled: false };
}

// 할 날짜까지 남은 날 (지났으면 음수). 날짜가 없거나 형식이 틀리면 null
export function daysUntilDue(due: string | undefined, now: Date): number | null {
  if (!due) return null;
  const d = new Date(`${due}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

export const UPCOMING_DAYS = 30; // 할 날짜가 이보다 멀면 '예정'으로 빼둔다
export const DUE_ALERT_DAYS = 7; // 이 안으로 들어오면 알림

// 안 한 항목을 '지금 할 것'과 '예정'(날짜 가까운 순)으로 나눈다
export function splitUpcoming(undone: ChecklistItem[], now: Date): { current: ChecklistItem[]; upcoming: ChecklistItem[] } {
  const far = (i: ChecklistItem) => (daysUntilDue(i.due, now) ?? 0) > UPCOMING_DAYS;
  return {
    current: undone.filter((i) => !far(i)),
    upcoming: undone.filter(far).sort((a, b) => (a.due ?? "").localeCompare(b.due ?? "")),
  };
}

export function dueLabel(days: number): string {
  return days < 0 ? `${-days}일 지남` : days === 0 ? "오늘" : `D-${days}`;
}
