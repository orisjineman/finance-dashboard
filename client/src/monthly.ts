import type { AssetRow, DashboardData, MonthlyEditKey } from "./types";
import type { Alert } from "./alerts";

// 매달 말 정리(잔액 갱신 → 연금·청약·카드 입력 → 히스토리 기록 → 리밸런싱 확인)의 진행 상황.

export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// 이번 정리 주기의 시작일: 기록일 3일 전부터 새 주기로 본다 (기록일 28이면 25일~다음 달 24일).
// 기록일이 없으면 이번 달 1일.
export const CYCLE_LEAD_DAYS = 3;

export function cycleStart(recordDay: number | undefined, now: Date): string {
  if (!recordDay) return isoDate(new Date(now.getFullYear(), now.getMonth(), 1));
  const day = Math.min(28, Math.max(1, Math.round(recordDay)));
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), day - CYCLE_LEAD_DAYS);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return isoDate(thisMonth <= today ? thisMonth : new Date(now.getFullYear(), now.getMonth() - 1, day - CYCLE_LEAD_DAYS));
}

// 이번 주기의 기록일 (주기 시작 + 3일)
export function cycleDue(recordDay: number | undefined, now: Date): string | null {
  if (!recordDay) return null;
  const s = new Date(`${cycleStart(recordDay, now)}T00:00:00`);
  s.setDate(s.getDate() + CYCLE_LEAD_DAYS);
  return isoDate(s);
}

// 잔액이 바뀌었거나 새로 생긴 행에 오늘 날짜를 찍는다
export function stampRowUpdates(prev: AssetRow[], next: AssetRow[], today: string): AssetRow[] {
  const before = new Map(prev.map((r) => [r.id, r.amount]));
  return next.map((r) => (before.get(r.id) === r.amount ? r : { ...r, updatedAt: today }));
}

export function rowUpToDate(r: AssetRow, start: string): boolean {
  return !!r.updatedAt && r.updatedAt >= start;
}

export interface CloseStep {
  key: "balances" | MonthlyEditKey | "history" | "rebalance";
  label: string;
  done: boolean;
  detail?: string;
  tab: "snapshot" | "tax" | "rebalance";
  canSkip?: boolean; // '변동 없음'으로 완료 표시할 수 있는 단계
}

export const EDIT_LABEL: Record<MonthlyEditKey, string> = {
  pension: "연금 납입액",
  subscription: "청약 납입액",
  card: "카드 사용액",
};

export function monthlyClose(data: Pick<DashboardData, "rows" | "history" | "strategy" | "budget">, alerts: Alert[], now: Date): { start: string; due: string | null; steps: CloseStep[] } {
  const start = cycleStart(data.strategy.recordDay, now);
  const updated = data.rows.filter((r) => rowUpToDate(r, start)).length;
  const edited = data.budget.taxPrep?.editedAt ?? {};
  const latest = [...data.history].sort((a, b) => b.date.localeCompare(a.date))[0];
  const rebalanceAlerts = alerts.filter((a) => a.id.startsWith("rebalance-"));
  const steps: CloseStep[] = [
    { key: "balances", label: "잔액 갱신", done: data.rows.length > 0 && updated === data.rows.length, detail: `${updated}/${data.rows.length}`, tab: "snapshot" },
    ...(["pension", "subscription", "card"] as MonthlyEditKey[]).map((k) => ({
      key: k,
      label: `${EDIT_LABEL[k]} 입력`,
      done: !!edited[k] && edited[k]! >= start,
      tab: "tax" as const,
      canSkip: true,
    })),
    { key: "history", label: "히스토리 기록", done: !!latest && latest.date >= start, tab: "snapshot" },
    {
      key: "rebalance",
      label: "리밸런싱 확인",
      done: rebalanceAlerts.length === 0,
      detail: rebalanceAlerts.length > 0 ? `${rebalanceAlerts.length}개 묶음 조정 필요` : undefined,
      tab: "rebalance",
    },
  ];
  return { start, due: cycleDue(data.strategy.recordDay, now), steps };
}
