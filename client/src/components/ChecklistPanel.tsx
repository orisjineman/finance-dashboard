import { useState } from "react";
import type { BudgetData, ChecklistItem } from "../types";
import { fmtWon, newId } from "../utils";
import { autoAmount, daysUntilDue, DUE_ALERT_DAYS, dueLabel, moveUndone, normalizeOrder, splitUpcoming, toggleItem, UPCOMING_DAYS } from "../checklist";
import SectionTitle from "./SectionTitle";

interface Props {
  items: ChecklistItem[];
  onChange: (items: ChecklistItem[]) => void;
  budget: BudgetData; // 자동 금액(남은 한도·환급 몫) 계산용
  income: number; // 만원, 연 총보수
}

// 안 한 항목은 끌어서(또는 ↑↓ 버튼으로) 순서를 바꾸고, 완료한 항목은 맨 아래에 모인다.
// 할 날짜가 한 달보다 먼 항목은 '예정'으로 빼두고, 날짜가 다가오면 위로 올라오고 알림이 뜬다.
export default function ChecklistPanel({ items, onChange, budget, income }: Props) {
  const now = new Date();
  const ordered = normalizeOrder(items);
  const undone = ordered.filter((i) => !i.done);
  const done = ordered.filter((i) => i.done);
  const { current, upcoming } = splitUpcoming(undone, now);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [dueEditId, setDueEditId] = useState<string | null>(null);

  const update = (id: string, patch: Partial<ChecklistItem>) => onChange(ordered.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  const remove = (id: string) => onChange(ordered.filter((it) => it.id !== id));
  // '지금 할 것' 목록의 pos번째 자리 → 안 한 항목 전체에서의 위치 (예정 항목이 사이에 있어도 보이는 순서대로 옮긴다)
  const moveTo = (id: string, pos: number) => onChange(moveUndone(ordered, id, undone.indexOf(current[pos])));

  function dueControl(item: ChecklistItem) {
    if (dueEditId === item.id) {
      return (
        <span className="check-due-edit">
          <input type="date" value={item.due ?? ""} autoFocus onChange={(e) => update(item.id, { due: e.target.value || undefined })} onBlur={() => setDueEditId(null)} />
          {item.due && (
            <button className="btn ghost sm" onMouseDown={(e) => e.preventDefault()} onClick={() => { update(item.id, { due: undefined }); setDueEditId(null); }}>
              지우기
            </button>
          )}
        </span>
      );
    }
    const days = item.done ? null : daysUntilDue(item.due, now);
    if (item.due) {
      const tone = days === null ? "" : days < 0 ? "risk" : days <= DUE_ALERT_DAYS ? "cash" : "";
      return (
        <button className={`tag check-due ${tone}`} title="날짜 바꾸기" onClick={() => setDueEditId(item.id)}>
          {item.due.slice(0, 4) === String(now.getFullYear()) ? "" : `${item.due.slice(0, 4)}.`}
          {Number(item.due.slice(5, 7))}/{Number(item.due.slice(8))}
          {days !== null && days <= UPCOMING_DAYS ? ` · ${dueLabel(days)}` : ""}
        </button>
      );
    }
    return item.done ? null : (
      <button className="btn ghost sm" onClick={() => setDueEditId(item.id)}>
        날짜
      </button>
    );
  }

  // pos: '지금 할 것' 안에서의 자리. 예정·완료 항목은 -1 (순서를 바꾸지 않음)
  function row(item: ChecklistItem, pos: number) {
    const movable = pos >= 0;
    const auto = item.done ? null : autoAmount(item.auto, budget, income, now);
    return (
      <div
        key={item.id}
        className={`check-item${item.done ? " done" : ""}${!item.done && !movable ? " upcoming" : ""}${dragId === item.id ? " dragging" : ""}${movable && overIndex === pos && dragId !== item.id ? " drop-target" : ""}`}
        draggable={movable}
        onDragStart={(e) => {
          setDragId(item.id);
          e.dataTransfer.effectAllowed = "move";
        }}
        onDragOver={(e) => {
          if (!movable || !dragId) return;
          e.preventDefault();
          setOverIndex(pos);
        }}
        onDrop={(e) => {
          e.preventDefault();
          if (dragId && movable) moveTo(dragId, pos);
          setDragId(null);
          setOverIndex(null);
        }}
        onDragEnd={() => {
          setDragId(null);
          setOverIndex(null);
        }}
      >
        {movable ? (
          <span className="drag-handle" title="끌어서 순서 바꾸기" aria-hidden="true">
            ⋮⋮
          </span>
        ) : (
          <span className="drag-handle placeholder" aria-hidden="true" />
        )}
        <input type="checkbox" checked={item.done} onChange={() => onChange(toggleItem(ordered, item.id))} id={`chk-${item.id}`} aria-label="완료" />
        <input type="text" className="check-text" value={item.text} onChange={(e) => update(item.id, { text: e.target.value })} />
        {auto && (
          <span className={`tag ${auto.filled ? "safe" : "cash"}`} style={{ whiteSpace: "nowrap" }}>
            {auto.filled ? "한도 채움" : auto.kind === "remaining" ? `남은 ${fmtWon(auto.amount)}원` : `약 ${fmtWon(auto.amount)}원`}
          </span>
        )}
        {dueControl(item)}
        {movable && (
          <span className="check-move">
            <button className="btn ghost sm" disabled={pos === 0} onClick={() => moveTo(item.id, pos - 1)} aria-label="위로">
              ↑
            </button>
            <button className="btn ghost sm" disabled={pos === current.length - 1} onClick={() => moveTo(item.id, pos + 1)} aria-label="아래로">
              ↓
            </button>
          </span>
        )}
        <button className="btn ghost sm" onClick={() => remove(item.id)}>
          삭제
        </button>
      </div>
    );
  }

  return (
    <section className="panel active" id="panel-checklist">
      <SectionTitle>정기 체크리스트</SectionTitle>
      <div className="card">
        {current.map((item, i) => row(item, i))}
        {current.length === 0 && <p className="note" style={{ margin: 0 }}>지금 할 항목이 없어.</p>}
        <button className="btn ghost" style={{ marginTop: 12 }} onClick={() => onChange([...undone, { id: newId("chk"), text: "새 체크리스트 항목", done: false }, ...done])}>
          + 항목 추가
        </button>
        {upcoming.length > 0 && (
          <>
            <div className="check-done-title">예정 {upcoming.length}개 · 날짜 {UPCOMING_DAYS}일 전부터 위로 올라와</div>
            {upcoming.map((item) => row(item, -1))}
          </>
        )}
        {done.length > 0 && (
          <>
            <div className="check-done-title">완료 {done.length}개</div>
            {done.map((item) => row(item, -1))}
          </>
        )}
      </div>
      <p className="note">⋮⋮를 끌거나 ↑↓로 순서 변경 · 완료하면 맨 아래로 · 날짜를 넣으면 {DUE_ALERT_DAYS}일 전부터 개요에 알림.</p>
    </section>
  );
}
