import type { BudgetCategory, BudgetData } from "../types";
import { fmtWon, newId } from "../utils";
import MoneyInput from "./MoneyInput";
import BudgetBreakdown from "./BudgetBreakdown";
import SectionTitle from "./SectionTitle";

interface Props {
  budget: BudgetData;
  onChange: (budget: BudgetData) => void;
}

export default function BudgetPanel({ budget, onChange }: Props) {
  const { monthlyNetIncome, annualRaisePct, expenseCategories } = budget;
  const totalBudget = expenseCategories.reduce((sum, c) => sum + c.amount, 0);
  const savings = monthlyNetIncome - totalBudget;
  const savingsRate = monthlyNetIncome > 0 ? (savings / monthlyNetIncome) * 100 : 0;
  const nextYearIncome = monthlyNetIncome * (1 + (annualRaisePct || 0) / 100);

  function setIncome(v: number) {
    onChange({ ...budget, monthlyNetIncome: v });
  }
  function setRaise(v: number) {
    onChange({ ...budget, annualRaisePct: v });
  }
  function updateCategory(i: number, patch: Partial<BudgetCategory>) {
    onChange({ ...budget, expenseCategories: expenseCategories.map((c, idx) => (idx === i ? { ...c, ...patch } : c)) });
  }
  function addCategory() {
    onChange({ ...budget, expenseCategories: [...expenseCategories, { id: newId("bud"), name: "새 항목", amount: 0 }] });
  }
  function removeCategory(i: number) {
    onChange({ ...budget, expenseCategories: expenseCategories.filter((_, idx) => idx !== i) });
  }

  return (
    <section className="panel active" id="panel-budget">
      <SectionTitle>월 소득</SectionTitle>
      <div className="card">
        <div className="field-row">
          <div className="field">
            <label>월 실수령액 (원)</label>
            <MoneyInput value={monthlyNetIncome} onChange={setIncome} />
          </div>
          <div className="field">
            <label>예상 연간 상승률 (%)</label>
            <input type="number" step={0.1} value={annualRaisePct} onChange={(e) => setRaise(parseFloat(e.target.value) || 0)} />
          </div>
        </div>
        <p className="note">
          상승률을 적용하면 1년 뒤 예상 월 실수령액은 약 {fmtWon(nextYearIncome)}원이야. 이 상승률은 시뮬레이션의 적립액 증가와 '내 집 마련' 탭의 매수 시점 연봉 계산에도 같이 쓰여.
          대출 심사에 쓰는 연 총보수(상여·과세 복지 포함)는 '내 집 마련' 탭에서 따로 입력해.
        </p>
      </div>

      <SectionTitle>생활비 · 주거비 예산</SectionTitle>
      <div className="card">
        <div className="table-scroll">
<table className="grid">
          <thead>
            <tr>
              <th>항목</th>
              <th style={{ textAlign: "right" }}>월 예산 (원)</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {expenseCategories.map((c, i) => (
              <tr key={c.id}>
                <td>
                  <input
                    type="text"
                    value={c.name}
                    onChange={(e) => updateCategory(i, { name: e.target.value })}
                    className="cell-input"
                  />
                </td>
                <td className="num">
                  <MoneyInput value={c.amount} onChange={(v) => updateCategory(i, { amount: v })} />
                </td>
                <td>
                  <button className="btn ghost sm" onClick={() => removeCategory(i)}>
                    삭제
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td style={{ fontWeight: 700 }}>합계</td>
              <td className="num" style={{ fontWeight: 700 }}>
                {fmtWon(totalBudget)}
              </td>
              <td></td>
            </tr>
          </tfoot>
        </table>
</div>
        <button className="btn ghost" style={{ marginTop: 10 }} onClick={addCategory}>
          + 항목 추가
        </button>
      </div>

      <SectionTitle>요약</SectionTitle>
      <div className="card">
        <BudgetBreakdown categories={expenseCategories} savings={savings} />
        <div className="result-line" style={{ marginTop: 12 }}>
          <span className="k">월 실수령액</span>
          <span className="v">{fmtWon(monthlyNetIncome)}원</span>
        </div>
        <div className="result-line">
          <span className="k">총 예산(지출)</span>
          <span className="v">{fmtWon(totalBudget)}원</span>
        </div>
        <div className="result-line total">
          <span className="k">저축 가능액</span>
          <span className="v">{fmtWon(savings)}원</span>
        </div>
        <p className="note">저축률 {savingsRate.toFixed(1)}%</p>
      </div>

    </section>
  );
}
