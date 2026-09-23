import type { BudgetCategory } from "../types";
import { fmtWon } from "../utils";

const PALETTE = ["var(--risk)", "var(--gold)", "#7c6a9a", "#5b7a9a", "#9b8b6a", "#6a9a8c"];

interface Props {
  categories: BudgetCategory[];
  savings: number; // 만원, 음수면 초과지출
}

export default function BudgetBreakdown({ categories, savings }: Props) {
  const spentTotal = categories.reduce((s, c) => s + c.amount, 0);
  const denom = spentTotal + Math.max(savings, 0);

  const segments = [
    ...categories.filter((c) => c.amount > 0).map((c, i) => ({ label: c.name, amount: c.amount, color: PALETTE[i % PALETTE.length] })),
    ...(savings > 0 ? [{ label: "저축 가능액", amount: savings, color: "var(--safe)" }] : []),
  ];

  if (denom <= 0) {
    return <p className="note">월 실수령액과 예산 항목을 입력하면 여기에 비중이 표시돼.</p>;
  }

  return (
    <div>
      <div style={{ display: "flex", height: 14, borderRadius: 999, overflow: "hidden", background: "var(--line)" }}>
        {segments.map((s, i) => (
          <div key={i} style={{ width: `${(s.amount / denom) * 100}%`, background: s.color }} />
        ))}
      </div>
      <div className="legend" style={{ marginTop: 12 }}>
        {segments.map((s, i) => (
          <div className="row" key={i}>
            <span className="swatch" style={{ background: s.color }} />
            {s.label} {fmtWon(s.amount)}원 ({Math.round((s.amount / denom) * 100)}%)
          </div>
        ))}
      </div>
      {savings < 0 && <p className="note" style={{ color: "var(--risk)" }}>예산이 실수령액을 {fmtWon(-savings)}원 초과했어.</p>}
    </div>
  );
}
