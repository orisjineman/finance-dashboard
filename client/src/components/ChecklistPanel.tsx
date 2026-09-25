import { useState } from "react";
import type { BudgetData, ChecklistItem } from "../types";
import { fmtWon, newId } from "../utils";
import { autoAmount, moveUndone, normalizeOrder, toggleItem } from "../checklist";
import SectionTitle from "./SectionTitle";

interface Props {
  items: ChecklistItem[];
  onChange: (items: ChecklistItem[]) => void;
  budget: BudgetData; // 자동 금액(남은 한도·환급 몫) 계산용
  income: number; // 만원, 연 총보수
}

// 안 한 항목은 끌어서(또는 ↑↓ 버튼으로) 순서를 바꾸고, 완료한 항목은 맨 아래에 모인다.
export default function ChecklistPanel({ items, onChange, budget, income }: Props) {
  const now = new Date();
  const ordered = normalizeOrder(items);
  const undone = ordered.filter((i) => !i.done);
  const done = ordered.filter((i) => i.done);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const update = (id: string, patch: Partial<ChecklistItem>) => onChange(ordered.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  const remove = (id: string) => onChange(ordered.filter((it) => it.id !== id));

  function row(item: ChecklistItem, index: number) {
    const movable = !item.done;
    const auto = item.done ? null : autoAmount(item.auto, budget, income, now);
    return (
      <div
        key={item.id}
        className={`check-item${item.done ? " done" : ""}${dragId === item.id ? " dragging" : ""}${movable && overIndex === index && dragId !== item.id ? " drop-target" : ""}`}
        draggable={movable}
        onDragStart={(e) => {
          setDragId(item.id);
          e.dataTransfer.effectAllowed = "move";
        }}
        onDragOver={(e) => {
          if (!movable || !dragId) return;
          e.preventDefault();
          setOverIndex(index);
        }}
        onDrop={(e) => {
          e.preventDefault();
          if (dragId && movable) onChange(moveUndone(ordered, dragId, index));
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
        {movable && (
          <span className="check-move">
            <button className="btn ghost sm" disabled={index === 0} onClick={() => onChange(moveUndone(ordered, item.id, index - 1))} aria-label="위로">
              ↑
            </button>
            <button className="btn ghost sm" disabled={index === undone.length - 1} onClick={() => onChange(moveUndone(ordered, item.id, index + 1))} aria-label="아래로">
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
        {undone.map((item, i) => row(item, i))}
        {undone.length === 0 && <p className="note" style={{ margin: 0 }}>남은 항목이 없어.</p>}
        <button className="btn ghost" style={{ marginTop: 12 }} onClick={() => onChange([...undone, { id: newId("chk"), text: "새 체크리스트 항목", done: false }, ...done])}>
          + 항목 추가
        </button>
        {done.length > 0 && (
          <>
            <div className="check-done-title">완료 {done.length}개</div>
            {done.map((item) => row(item, -1))}
          </>
        )}
      </div>
      <p className="note">안 한 항목은 ⋮⋮를 끌거나 ↑↓로 순서를 바꿔. 완료하면 맨 아래로 가.</p>
    </section>
  );
}
