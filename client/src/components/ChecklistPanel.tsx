import type { ChecklistItem } from "../types";
import { newId } from "../utils";
import SectionTitle from "./SectionTitle";

interface Props {
  items: ChecklistItem[];
  onChange: (items: ChecklistItem[]) => void;
}

export default function ChecklistPanel({ items, onChange }: Props) {
  function toggle(i: number) {
    onChange(items.map((it, idx) => (idx === i ? { ...it, done: !it.done } : it)));
  }

  function updateText(i: number, text: string) {
    onChange(items.map((it, idx) => (idx === i ? { ...it, text } : it)));
  }

  function addItem() {
    onChange([...items, { id: newId("chk"), text: "새 체크리스트 항목", done: false }]);
  }

  function removeItem(i: number) {
    onChange(items.filter((_, idx) => idx !== i));
  }

  return (
    <section className="panel active" id="panel-checklist">
      <SectionTitle>정기 체크리스트</SectionTitle>
      <div className="card">
        {items.map((item, i) => (
          <div className={`check-item${item.done ? " done" : ""}`} key={item.id}>
            <input type="checkbox" checked={item.done} onChange={() => toggle(i)} id={`chk-${item.id}`} />
            <input
              type="text"
              value={item.text}
              onChange={(e) => updateText(i, e.target.value)}
              style={{
                flex: 1,
                border: "none",
                background: "none",
                padding: 0,
                font: "inherit",
                color: "inherit",
                textDecoration: item.done ? "line-through" : "none",
              }}
            />
            <button className="btn ghost" style={{ padding: "4px 8px", fontSize: 11 }} onClick={() => removeItem(i)}>
              삭제
            </button>
          </div>
        ))}
        <button className="btn ghost" style={{ marginTop: 12 }} onClick={addItem}>
          + 항목 추가
        </button>
      </div>
      <p className="note">체크 상태는 로컬 파일에 저장돼서 브라우저를 지워도 유지돼.</p>
    </section>
  );
}
