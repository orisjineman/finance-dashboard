import type { AssetRow, BudgetData } from "../types";
import { emergencyStatus, isLiquidCash } from "../emergency";
import { fmtWon } from "../utils";
import ProgressBar from "./ProgressBar";
import SectionTitle from "./SectionTitle";

interface Props {
  rows: AssetRow[];
  budget: BudgetData;
  onBudgetChange: (budget: BudgetData) => void;
}

// 비상금: 바로 꺼낼 수 있는 현금성 자산이 몇 달 치 지출을 버티는지
export default function EmergencyCard({ rows, budget, onBudgetChange }: Props) {
  const s = emergencyStatus(rows, budget);
  const items = rows.filter((r) => isLiquidCash(r) && r.amount > 0);
  const enough = s.months !== null && s.months >= s.targetMonths;
  return (
    <>
      <SectionTitle>비상금</SectionTitle>
      <div className="card">
        {s.months === null ? (
          <p className="note" style={{ margin: 0 }}>내 정보 탭에 월 지출 예산을 넣으면 몇 개월 치인지 계산해줘.</p>
        ) : (
          <>
            <div className="result-line total">
              <span className="k">바로 쓸 수 있는 현금</span>
              <span className="v" style={{ color: enough ? "var(--safe)" : "var(--risk)" }}>
                {fmtWon(s.liquid)}원 · 지출 {s.months.toFixed(1)}개월 치
              </span>
            </div>
            <ProgressBar value={s.liquid} max={s.monthlyExpense * s.targetMonths} valueLabel="현금" maxLabel={`목표 ${s.targetMonths}개월 치`} remainingLabel="더 필요한 금액" />
            <p className="note">
              월 지출 {fmtWon(s.monthlyExpense)}원 × 목표 {s.targetMonths}개월 = {fmtWon(s.monthlyExpense * s.targetMonths)}원
              {enough ? " · 충분해." : ` · ${fmtWon(s.shortfall)}원 부족해.`}
            </p>
          </>
        )}
        <div className="field" style={{ maxWidth: 200 }}>
          <label>목표 (개월 치 지출)</label>
          <input type="number" min={1} max={36} value={s.targetMonths} onChange={(e) => onBudgetChange({ ...budget, emergencyTargetMonths: Math.max(1, parseInt(e.target.value) || 6) })} />
        </div>
        <p className="note">
          현금성 자산 중 보증금·청약은 뺐어{items.length > 0 ? `: ${items.map((r) => `${r.account} ${r.item}`).join(", ")}` : ""}. 집 계약금처럼 따로 묶어 둔 현금이 있으면 비상금으로는 넉넉하게 보일 수 있어.
        </p>
      </div>
    </>
  );
}
