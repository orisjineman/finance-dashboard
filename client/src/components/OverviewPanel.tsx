import { useState } from "react";
import type { AssetRow, BudgetData, HistoryEntry, LoanInput, StrategyData } from "../types";
import { computeCurrentReturn, computeHousingLiquid, computeLoanEquity, computeReturnTotals, computeTotals, fmtWon } from "../utils";
import { yearsUntil } from "../rebalance";
import BudgetBreakdown from "./BudgetBreakdown";
import MoneyInput from "./MoneyInput";

interface Props {
  rows: AssetRow[];
  strategy: StrategyData;
  onStrategyChange: (strategy: StrategyData) => void;
  budget: BudgetData;
  onBudgetChange: (budget: BudgetData) => void;
  loan: LoanInput;
  history: HistoryEntry[];
}

function formatYearsMonths(years: number): string {
  let y = Math.floor(years);
  let m = Math.round((years - y) * 12);
  if (m === 12) {
    m = 0;
    y += 1;
  }
  if (y === 0) return `${m}개월`;
  if (m === 0) return `${y}년`;
  return `${y}년 ${m}개월`;
}

function daysUntil(dateStr: string): number | null {
  if (!dateStr) return null;
  const target = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

export default function OverviewPanel({ rows, strategy, onStrategyChange, budget, onBudgetChange, loan, history }: Props) {
  const t = computeTotals(rows);
  const inv = computeReturnTotals(rows);
  const dday = daysUntil(strategy.isaDutyEndDate);
  const houseYears = yearsUntil(strategy.housePurchaseDate);
  const currentReturn = computeCurrentReturn(rows, history);
  const [editingSummary, setEditingSummary] = useState(false);
  const [draft, setDraft] = useState(strategy.overviewSummary.join("\n"));

  const totalBudget = budget.expenseCategories.reduce((sum, c) => sum + c.amount, 0);
  const savings = budget.monthlyNetIncome - totalBudget;
  const savingsRate = budget.monthlyNetIncome > 0 ? (savings / budget.monthlyNetIncome) * 100 : 0;

  const housingLiquid = computeHousingLiquid(rows);
  const equityNeeded = computeLoanEquity(loan);
  const housingProgress = equityNeeded > 0 ? Math.min(100, Math.round((housingLiquid / equityNeeded) * 100)) : 0;
  const housingRemaining = equityNeeded - housingLiquid;

  const { pensionAnnualContribution, pensionTaxCreditRate } = budget;
  const pensionMonthly = pensionAnnualContribution / 12;
  const taxRefundMonthly = (pensionAnnualContribution * (pensionTaxCreditRate || 0)) / 100 / 12;
  const houseMonthlyNoPension = savings;
  const houseMonthlyWithPension = savings - pensionMonthly + taxRefundMonthly;

  const yearsToGoalNoPension =
    housingRemaining > 0 && houseMonthlyNoPension > 0 ? housingRemaining / (houseMonthlyNoPension * 12) : null;
  const yearsToGoalWithPension =
    housingRemaining > 0 && houseMonthlyWithPension > 0 ? housingRemaining / (houseMonthlyWithPension * 12) : null;
  const yearsToGoal = pensionAnnualContribution > 0 ? yearsToGoalWithPension : yearsToGoalNoPension;
  const pensionDelayYears =
    yearsToGoalWithPension !== null && yearsToGoalNoPension !== null
      ? yearsToGoalWithPension - yearsToGoalNoPension
      : null;

  function setPensionContribution(v: number) {
    onBudgetChange({ ...budget, pensionAnnualContribution: v });
  }
  function setPensionTaxCreditRate(v: number) {
    onBudgetChange({ ...budget, pensionTaxCreditRate: v });
  }

  function saveSummary() {
    const lines = draft.split("\n").map((l) => l.trim()).filter(Boolean);
    onStrategyChange({ ...strategy, overviewSummary: lines });
    setEditingSummary(false);
  }

  return (
    <section className="panel active" id="panel-overview">
      <h2 className="section-title">
        <span className="num">01</span> 지금 상태
      </h2>
      <div className="stat-grid">
        <div className="stat">
          <div className="label">전체 자산 합계</div>
          <div className="value">
            {fmtWon(t.total)}
            <small> 원</small>
          </div>
        </div>
        <div className="stat">
          <div className="label">목표 연 수익률</div>
          <div className="value">
            7<small>% 이상</small>
          </div>
        </div>
        <div className="stat">
          <div className="label">ISA 의무가입 종료</div>
          <div className="value">
            {dday !== null ? `D-${dday}` : "-"}
          </div>
        </div>
        <div className="stat">
          <div className="label">집 매수 목표까지</div>
          <div className="value">
            {houseYears === null ? "-" : formatYearsMonths(houseYears)}
          </div>
        </div>
        <div className="stat">
          <div className="label">투자원금 대비 수익률</div>
          <div
            className="value"
            style={currentReturn ? { color: currentReturn.profit >= 0 ? "var(--safe)" : "var(--risk)" } : undefined}
          >
            {currentReturn ? `${(currentReturn.returnRate * 100).toFixed(1)}` : "-"}
            {currentReturn && <small>%</small>}
          </div>
        </div>
      </div>
      {!currentReturn && (
        <p className="note">투자원금 대비 수익률은 자산 스냅샷 탭의 히스토리에서 첫 기록을 추가하면 계산돼.</p>
      )}

      <h2 className="section-title">
        <span className="num">02</span> 위험 / 안전 비중 (투자 항목 기준)
      </h2>
      <div className="card">
        <div className="donut-wrap">
          <div
            className="donut"
            style={{ ["--risk-deg" as string]: `${inv.riskPct * 3.6}deg` }}
          />
          <div className="legend">
            <div className="row">
              <span className="swatch" style={{ background: "var(--risk)" }} />
              위험자산 {fmtWon(inv.risk)}원 ({inv.riskPct}%)
            </div>
            <div className="row">
              <span className="swatch" style={{ background: "var(--safe)" }} />
              안전자산 {fmtWon(inv.safe)}원 ({inv.safePct}%)
            </div>
          </div>
        </div>
        <p className="note">투자 항목 {fmtWon(inv.total)}원 기준이야. 자산 스냅샷에서 '수익률' 체크를 해제한 항목(입출금 통장, 월세보증금, 청약 등)은 빠져.</p>
      </div>

      <h2 className="section-title">
        <span className="num">03</span> 이번 달 월급·예산
      </h2>
      <div className="card">
        <div className="stat-grid" style={{ marginBottom: 14 }}>
          <div className="stat">
            <div className="label">월 실수령액</div>
            <div className="value">
              {fmtWon(budget.monthlyNetIncome)}
              <small> 원</small>
            </div>
          </div>
          <div className="stat">
            <div className="label">저축 가능액 ({savingsRate.toFixed(0)}%)</div>
            <div className="value" style={{ color: savings >= 0 ? "var(--safe)" : "var(--risk)" }}>
              {fmtWon(savings)}
              <small> 원</small>
            </div>
          </div>
        </div>
        <BudgetBreakdown categories={budget.expenseCategories} savings={Math.max(savings, 0)} />
        <p className="note">월급·예산 탭에서 실수령액, 상승률, 생활비·주거비 항목을 편집할 수 있어.</p>
      </div>

      <h2 className="section-title">
        <span className="num">04</span> 집 마련 자금
      </h2>
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, marginBottom: 6 }}>
          <span>가용자산 {fmtWon(housingLiquid)}원</span>
          <span style={{ color: "var(--ink-soft)" }}>필요 자기자금 {fmtWon(equityNeeded)}원</span>
        </div>
        <div style={{ height: 14, borderRadius: 999, background: "var(--line)", overflow: "hidden" }}>
          <div
            style={{
              width: `${housingProgress}%`,
              height: "100%",
              background: housingProgress >= 100 ? "var(--safe)" : "var(--gold)",
            }}
          />
        </div>
        <p className="note" style={{ marginTop: 10 }}>
          {housingRemaining > 0
            ? `연금저축·IRP를 뺀 가용자산 기준으로 ${fmtWon(housingRemaining)}원을 더 모아야 해 (달성률 ${housingProgress}%).`
            : "가용자산이 필요 자기자금을 이미 넘었어."}
          {housingRemaining > 0 && yearsToGoal !== null && (
            <>
              {" "}
              연금 납입 계획을 반영하면 약{" "}
              <strong style={{ color: "var(--ink)" }}>{formatYearsMonths(yearsToGoal)}</strong> 후 달성할 수 있어.
            </>
          )}
          {housingRemaining > 0 && yearsToGoal === null && " 월급·예산 탭에서 저축 가능액을 입력하면 예상 달성 시기도 볼 수 있어."}
        </p>

        <div
          style={{
            marginTop: 14,
            paddingTop: 14,
            borderTop: "1px solid var(--line)",
          }}
        >
          <div className="field-row">
            <div className="field">
              <label>연금저축·IRP 연간 납입액 (원)</label>
              <MoneyInput value={pensionAnnualContribution} onChange={setPensionContribution} />
            </div>
            <div className="field">
              <label>세액공제율 (%)</label>
              <select
                value={pensionTaxCreditRate}
                onChange={(e) => setPensionTaxCreditRate(parseFloat(e.target.value))}
              >
                <option value={16.5}>16.5% (총급여 5,500만원 이하)</option>
                <option value={13.2}>13.2% (총급여 5,500만원 초과)</option>
              </select>
            </div>
          </div>

          {housingRemaining > 0 && (
            <p className="note" style={{ marginTop: 10 }}>
              {yearsToGoalNoPension !== null && (
                <>
                  연금 납입 없이 전액 집 마련에 모으면 약{" "}
                  <strong style={{ color: "var(--ink)" }}>{formatYearsMonths(yearsToGoalNoPension)}</strong> 후 달성.
                </>
              )}
              {pensionAnnualContribution > 0 && yearsToGoalWithPension !== null && (
                <>
                  {" "}
                  세액공제 환급금({fmtWon(pensionAnnualContribution * (pensionTaxCreditRate || 0) / 100)}원/년)을
                  재투자해도 연금 {fmtWon(pensionAnnualContribution)}원/년을 납입하면 약{" "}
                  <strong style={{ color: "var(--ink)" }}>{formatYearsMonths(yearsToGoalWithPension)}</strong> 후 달성이라,{" "}
                  {pensionDelayYears !== null && pensionDelayYears > 0 && (
                    <strong style={{ color: "var(--risk)" }}>{formatYearsMonths(pensionDelayYears)} 더 늦게</strong>
                  )}
                  {pensionDelayYears !== null && pensionDelayYears <= 0 && "달성 시기 차이는 거의 없어"} 도달해.
                </>
              )}
            </p>
          )}
        </div>
      </div>

      <h2 className="section-title">
        <span className="num">05</span> 요약
      </h2>
      <div className="card">
        {!editingSummary ? (
          <>
            <ul className="plain">
              {strategy.overviewSummary.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
            <button
              className="btn ghost"
              style={{ marginTop: 12 }}
              onClick={() => {
                setDraft(strategy.overviewSummary.join("\n"));
                setEditingSummary(true);
              }}
            >
              편집
            </button>
          </>
        ) : (
          <>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={6}
              style={{
                width: "100%",
                border: "1px solid var(--line)",
                borderRadius: 10,
                padding: 10,
                background: "var(--paper)",
                color: "var(--ink)",
                fontFamily: "inherit",
                fontSize: 13.5,
              }}
              placeholder="한 줄에 한 항목씩 적어줘"
            />
            <div className="modal-actions" style={{ marginTop: 10 }}>
              <button className="btn ghost" onClick={() => setEditingSummary(false)}>
                취소
              </button>
              <button className="btn" onClick={saveSummary}>
                저장
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
