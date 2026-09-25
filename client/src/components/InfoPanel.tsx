import type { BudgetCategory, BudgetData, HomeSimInput, LoanInput, StrategyData } from "../types";
import { fmtWon, monthlyHouseSavings, newId } from "../utils";
import { pensionRateFor } from "../derive";
import MoneyInput from "./MoneyInput";
import BudgetBreakdown from "./BudgetBreakdown";
import SectionTitle from "./SectionTitle";
import { Uses } from "./InfoLink";

interface Props {
  budget: BudgetData;
  onBudgetChange: (budget: BudgetData) => void;
  home: HomeSimInput;
  onHomeChange: (home: HomeSimInput) => void;
  strategy: StrategyData;
  onStrategyChange: (strategy: StrategyData) => void;
  loan: LoanInput;
  onLoanChange: (loan: LoanInput) => void;
}

// '내 정보' 탭: 여러 화면이 같이 쓰는 사실값(소득·지출·연금·집 계획·날짜)은 모두 여기서만 입력한다.
// 각 탭에 남는 입력은 그 탭에서만 쓰는 가정(수익률, 리밸런싱 설정, 정책 숫자, 올해 누적액)뿐이다.
export default function InfoPanel({ budget, onBudgetChange, home, onHomeChange, strategy, onStrategyChange, loan, onLoanChange }: Props) {
  const { monthlyNetIncome, annualRaisePct, expenseCategories } = budget;
  const totalBudget = expenseCategories.reduce((sum, c) => sum + c.amount, 0);
  const savings = monthlyNetIncome - totalBudget;
  const savingsRate = monthlyNetIncome > 0 ? (savings / monthlyNetIncome) * 100 : 0;
  const nextYearIncome = monthlyNetIncome * (1 + (annualRaisePct || 0) / 100);
  const pensionRate = pensionRateFor(home.currentIncome, budget.taxPrep?.policy.pension) ?? budget.pensionTaxCreditRate;
  const tp = budget.taxPrep;

  const setBudget = (patch: Partial<BudgetData>) => onBudgetChange({ ...budget, ...patch });
  function updateCategory(i: number, patch: Partial<BudgetCategory>) {
    setBudget({ expenseCategories: expenseCategories.map((c, idx) => (idx === i ? { ...c, ...patch } : c)) });
  }

  return (
    <section className="panel active" id="panel-budget">
      <p className="note" style={{ marginTop: 0 }}>
        여러 화면이 같이 쓰는 금액과 날짜는 이 탭에서만 입력해. 여기서 바꾸면 '쓰이는 곳'에 적힌 화면이 모두 함께 바뀌어. 다른 탭에서는 이 값들이 읽기 전용으로 보이고 '내 정보에서 수정' 버튼으로 이리 올 수 있어.
      </p>

      <SectionTitle>소득</SectionTitle>
      <div className="card">
        <div className="field-row">
          <div className="field">
            <label>월 실수령액 (원)</label>
            <MoneyInput value={monthlyNetIncome} onChange={(v) => setBudget({ monthlyNetIncome: v })} />
            <Uses where={["개요 월급·예산", "집 마련 월 저축액", "시뮬레이션 적립액(자동)"]} />
          </div>
          <div className="field">
            <label>연 총보수 (원, 세전 · 상여·과세 복지 포함)</label>
            <MoneyInput value={home.currentIncome} onChange={(v) => onHomeChange({ ...home, currentIncome: v })} />
            <Uses where={["내 집 마련(대출 심사·세후 월급 추정)", "연말정산 총급여", "연금 세액공제율", "알림"]} />
          </div>
        </div>
        <div className="field" style={{ maxWidth: 360 }}>
          <label>연봉 상승률 (%/년)</label>
          <input type="number" step={0.1} value={annualRaisePct} onChange={(e) => setBudget({ annualRaisePct: parseFloat(e.target.value) || 0 })} />
          <Uses where={["내 집 마련(매수 시점 연봉)", "시뮬레이션 적립액 증가", "알림"]} />
        </div>
        <p className="note">
          1년 뒤 예상 월 실수령액은 약 {fmtWon(nextYearIncome)}원이야. 연 총보수는 매달 받는 실수령액과 달리 상여·과세 복지까지 포함한 세전 금액이라 대출 심사와 연말정산에 쓰여.
        </p>
      </div>

      <SectionTitle>지출 예산 (월)</SectionTitle>
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
                    <input type="text" value={c.name} onChange={(e) => updateCategory(i, { name: e.target.value })} className="cell-input" />
                  </td>
                  <td className="num">
                    <MoneyInput value={c.amount} onChange={(v) => updateCategory(i, { amount: v })} />
                  </td>
                  <td>
                    <button className="btn ghost sm" onClick={() => setBudget({ expenseCategories: expenseCategories.filter((_, idx) => idx !== i) })}>
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
        <button className="btn ghost" style={{ marginTop: 10 }} onClick={() => setBudget({ expenseCategories: [...expenseCategories, { id: newId("bud"), name: "새 항목", amount: 0 }] })}>
          + 항목 추가
        </button>
        <Uses where={["개요 월급·예산", "집 마련 월 저축액", "시뮬레이션 적립액(자동)"]} />
        <div style={{ marginTop: 14 }}>
          <BudgetBreakdown categories={expenseCategories} savings={savings} />
        </div>
        <div className="result-line" style={{ marginTop: 12 }}>
          <span className="k">저축 가능액 (실수령액 − 지출 예산)</span>
          <span className="v">
            {fmtWon(savings)}원 <small style={{ color: "var(--ink-soft)" }}>저축률 {savingsRate.toFixed(1)}%</small>
          </span>
        </div>
        <p className="note">예산의 월세는 내가 실제로 내는 몫이야. 연말정산 공제에 쓰는 계약상 월세는 아래 '집·주거'에서 따로 입력해.</p>
      </div>

      <SectionTitle>연금저축·IRP 납입 계획</SectionTitle>
      <div className="card">
        <div className="field-row">
          <div className="field">
            <label>연간 납입액 (원)</label>
            <MoneyInput value={budget.pensionAnnualContribution} onChange={(v) => setBudget({ pensionAnnualContribution: v })} />
            <Uses where={["집 마련 월 저축액(납입만큼 빠짐)", "시뮬레이션 적립액(환급 포함)", "개요 연금 비교"]} />
          </div>
          <div className="field">
            <label>세액공제율 (자동)</label>
            <div className="info-value">
              <span>{pensionRate}%</span>
            </div>
            <p className="uses">
              연 총보수 {fmtWon(home.currentIncome)}원 기준으로 자동 결정 (총급여 {fmtWon(budget.taxPrep?.policy.pension?.lowIncomeMax ?? 5500)}원 이하{" "}
              {budget.taxPrep?.policy.pension?.rateLowPct ?? 16.5}%, 초과 {budget.taxPrep?.policy.pension?.ratePct ?? 13.2}%)
            </p>
          </div>
        </div>
        <div className="result-line">
          <span className="k">연금 납입·환급을 반영한 집 마련 월 저축액</span>
          <span className="v">{fmtWon(monthlyHouseSavings({ ...budget, pensionTaxCreditRate: pensionRate }))}원</span>
        </div>
        <p className="note">올해 실제로 납입한 금액은 연말정산 탭에서 입력해 (올해 누적값이라 해가 바뀌면 0부터 시작).</p>
      </div>

      <SectionTitle>집·주거</SectionTitle>
      <div className="card">
        <div className="field-row">
          <div className="field">
            <label>집 매수 예정일</label>
            <input type="date" value={strategy.housePurchaseDate} onChange={(e) => onStrategyChange({ ...strategy, housePurchaseDate: e.target.value })} />
            <Uses where={["개요 집 마련 그래프", "리밸런싱 목표 비중", "내 집 마련", "알림"]} />
          </div>
          <div className="field">
            <label>목표 집값 (원)</label>
            <MoneyInput value={loan.price} onChange={(v) => onLoanChange({ ...loan, price: v })} />
            <Uses where={["개요 필요 자기자금·판정", "내 집 마련 '목표' 행", "알림"]} />
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label>대출 금리 (연 %)</label>
            <input type="number" step={0.1} value={loan.ratePct} onChange={(e) => onLoanChange({ ...loan, ratePct: parseFloat(e.target.value) || 0 })} />
            <Uses where={["내 집 마련 월 상환·최대 적정 집값", "개요 판정", "알림"]} />
          </div>
          {tp && (
            <div className="field">
              <label>계약상 월세 (원/월, 연말정산 공제용)</label>
              <MoneyInput value={tp.rentMonthly} onChange={(v) => setBudget({ taxPrep: { ...tp, rentMonthly: v } })} />
              <Uses where={["연말정산 월세 세액공제"]} />
            </div>
          )}
        </div>
        <p className="note">목표 집값은 '내 집 마련' 탭 비교표의 '목표로' 버튼으로도 바꿀 수 있어 (같은 값).</p>
      </div>

      <SectionTitle>주요 날짜</SectionTitle>
      <div className="card">
        <div className="field" style={{ maxWidth: 360 }}>
          <label>ISA 의무가입 종료일</label>
          <input type="date" value={strategy.isaDutyEndDate} onChange={(e) => onStrategyChange({ ...strategy, isaDutyEndDate: e.target.value })} />
          <Uses where={["개요 D-day", "알림(90일 전)"]} />
        </div>
      </div>
    </section>
  );
}
