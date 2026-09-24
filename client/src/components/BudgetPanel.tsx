import type { BudgetCategory, BudgetData } from "../types";
import { fmtWon, newId } from "../utils";
import MoneyInput from "./MoneyInput";
import BudgetBreakdown from "./BudgetBreakdown";
import SectionTitle from "./SectionTitle";
import { computePensionCredit, DEFAULT_PENSION_LIMIT } from "../pension";

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

  const now = new Date();
  const credit = computePensionCredit(budget, now);
  const creditPct = credit.limit > 0 ? Math.min(100, Math.round((credit.paid / credit.limit) * 100)) : 0;

  function setPaid(v: number) {
    onChange({ ...budget, pensionPaidThisYear: v, pensionPaidYear: now.getFullYear() });
  }

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
        <p className="note">상승률을 적용하면 1년 뒤 예상 월 실수령액은 약 {fmtWon(nextYearIncome)}원이야.</p>
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

      <SectionTitle>연금저축·IRP 세액공제 (올해)</SectionTitle>
      <div className="card">
        <div className="field-row">
          <div className="field">
            <label>올해 납입한 금액 (원)</label>
            <MoneyInput value={credit.paid} onChange={setPaid} />
          </div>
          <div className="field">
            <label>세액공제 대상 한도 (원)</label>
            <MoneyInput value={credit.limit} onChange={(v) => onChange({ ...budget, pensionCreditLimit: v > 0 ? v : DEFAULT_PENSION_LIMIT })} />
          </div>
          <div className="field">
            <label>세액공제율 (%)</label>
            <select value={budget.pensionTaxCreditRate} onChange={(e) => onChange({ ...budget, pensionTaxCreditRate: parseFloat(e.target.value) })}>
              <option value={16.5}>16.5% (총급여 5,500만원 이하)</option>
              <option value={13.2}>13.2% (총급여 5,500만원 초과)</option>
            </select>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, marginBottom: 6 }}>
          <span>납입 {fmtWon(credit.paid)}원</span>
          <span style={{ color: "var(--ink-soft)" }}>한도 {fmtWon(credit.limit)}원</span>
        </div>
        <div style={{ height: 14, borderRadius: 999, background: "var(--line)", overflow: "hidden" }}>
          <div style={{ width: `${creditPct}%`, height: "100%", background: credit.remaining <= 0 ? "var(--safe)" : "var(--gold)" }} />
        </div>
        <div className="result-line" style={{ marginTop: 12 }}>
          <span className="k">남은 한도</span>
          <span className="v">{fmtWon(credit.remaining)}원</span>
        </div>
        <div className="result-line">
          <span className="k">지금까지 예상 세액공제액</span>
          <span className="v">{fmtWon(credit.refund)}원</span>
        </div>
        <div className="result-line total">
          <span className="k">남은 한도를 채우면 더 받을 수 있는 금액</span>
          <span className="v">{fmtWon(credit.extraRefundIfFilled)}원</span>
        </div>
        <p className="note">
          올해 연말까지 {credit.daysToYearEnd}일 남았어. 해가 바뀌면 납입액은 자동으로 0부터 다시 시작해. 한도(연금저축+IRP 합산)와 공제율은 세법에 따라 바뀔 수 있으니 국세청 안내를 확인해서 고쳐줘.
          연금계좌에 넣은 돈은 집 마련에 쓸 수 없다는 점도 함께 고려해줘.
        </p>
      </div>
    </section>
  );
}
