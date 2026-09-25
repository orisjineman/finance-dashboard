import { useState } from "react";
import type { AssetRow, BudgetData, HistoryEntry, HomeSimInput, LoanInput, RebalanceSettings, SimulationAssumptions, StrategyData } from "../types";
import { computeCurrentReturn, computeHousingLiquid, computeLoanEquity, computeReturnTotals, computeTotals, fmtEok, fmtWon } from "../utils";
import { yearsUntil } from "../rebalance";
import { planHousing, reachDate, monthsToReach } from "../housing";
import { assetsNeededAffordable, evaluateTarget } from "../home";
import LineChart from "./LineChart";
import ProgressBar from "./ProgressBar";
import type { Alert } from "../alerts";
import BudgetBreakdown from "./BudgetBreakdown";
import MoneyInput from "./MoneyInput";
import SectionTitle from "./SectionTitle";

interface Props {
  rows: AssetRow[];
  strategy: StrategyData;
  onStrategyChange: (strategy: StrategyData) => void;
  budget: BudgetData;
  onBudgetChange: (budget: BudgetData) => void;
  loan: LoanInput;
  history: HistoryEntry[];
  alerts: Alert[];
  home: HomeSimInput;
  onHomeChange: (home: HomeSimInput) => void;
  rebalance: RebalanceSettings;
  simulation: SimulationAssumptions;
  onNavigate: (tab: NonNullable<Alert["tab"]>) => void;
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

export default function OverviewPanel({ rows, strategy, onStrategyChange, budget, onBudgetChange, loan, history, alerts, home, onHomeChange, rebalance, simulation, onNavigate }: Props) {
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
  const equityNeeded = computeLoanEquity(loan.price, home.policy.bogeumjari.ltv, home.closingCost);
  const housingProgress = equityNeeded > 0 ? Math.min(100, Math.round((housingLiquid / equityNeeded) * 100)) : 0;
  const housingRemaining = equityNeeded - housingLiquid;

  const { pensionAnnualContribution, pensionTaxCreditRate } = budget;
  const now = new Date();
  const withReturns = !!home.projectWithReturns;
  // 집 마련 예상 경로 (내 집 마련 탭의 '더 모을 돈'과 같은 계산). 수익률 반영은 토글로 고른다.
  const plan = planHousing(rows, budget, simulation, strategy.housePurchaseDate, now, withReturns);
  const planNoPension = planHousing(rows, { ...budget, pensionAnnualContribution: 0 }, simulation, strategy.housePurchaseDate, now, withReturns);
  const houseMonthly = plan.monthly;
  const reachMonths = housingRemaining > 0 ? monthsToReach(plan.growth, equityNeeded) : 0;
  const reachMonthsNoPension = housingRemaining > 0 ? monthsToReach(planNoPension.growth, equityNeeded) : 0;
  const yearsToGoal = reachMonths !== null && reachMonths > 0 ? reachMonths / 12 : null;
  const yearsToGoalNoPension = reachMonthsNoPension !== null && reachMonthsNoPension > 0 ? reachMonthsNoPension / 12 : null;
  const yearsToGoalWithPension = yearsToGoal;
  const pensionDelayYears = yearsToGoalWithPension !== null && yearsToGoalNoPension !== null ? yearsToGoalWithPension - yearsToGoalNoPension : null;

  const target = evaluateTarget({ rows, rebalance, home, loan, strategy, budget, simulation }, now);
  const housingPoints = [
    ...history.filter((h) => h.housingLiquid !== undefined).map((h) => ({ t: new Date(`${h.date}T00:00:00`).getTime(), y: h.housingLiquid as number })),
    { t: now.getTime(), y: housingLiquid },
  ].sort((a, b) => a.t - b.t);
  const purchaseT = strategy.housePurchaseDate ? new Date(`${strategy.housePurchaseDate}T00:00:00`).getTime() : NaN;
  const minReach = reachDate(plan, equityNeeded, now);
  const monthsDiff = minReach && Number.isFinite(purchaseT) ? Math.round((purchaseT - minReach.getTime()) / (30.4375 * 86400000)) : null;
  const monthsLeft = plan.monthsLeft;
  const atPurchase = plan.atPurchase;
  const pathPoints = plan.series;
  // 목표 집값을 적정 상환 비중(내 집 마련 탭의 목표 비중, 40년 만기) 안에서 사려면 필요한 가용자산
  const affordNeeded = target ? assetsNeededAffordable(target, 40, home.closingCost) : null;
  const affordReach = affordNeeded !== null ? reachDate(plan, affordNeeded, now) : null;
  const ym = (d: Date) => `${d.getFullYear()}년 ${d.getMonth() + 1}월`;
  const ltvPct = Math.round(home.policy.bogeumjari.ltv * 100);

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
      <SectionTitle>점검할 것</SectionTitle>
      <div className="card">
        {alerts.length === 0 ? (
          <p className="note" style={{ margin: 0 }}>지금은 따로 점검할 게 없어.</p>
        ) : (
          <ul className="alert-list">
            {alerts.map((al) => (
              <li key={al.id} className={`alert ${al.level}`}>
                <span className="alert-text">{al.text}</span>
                {al.tab && al.tab !== "overview" && (
                  <button className="btn ghost sm" onClick={() => onNavigate(al.tab!)}>
                    열기
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <SectionTitle>지금 상태</SectionTitle>
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

      <SectionTitle>위험 / 안전 비중 (투자 항목 기준)</SectionTitle>
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
        <p className="note">투자 항목 {fmtWon(inv.total)}원 기준이야. 자산 스냅샷에서 '수익률' 체크를 해제한 항목(입출금 통장, 전세·월세 보증금, 청약 등)은 빠져.</p>
      </div>

      <SectionTitle>이번 달 월급·예산</SectionTitle>
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

      <SectionTitle>집 마련 자금</SectionTitle>
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, marginBottom: 6 }}>
          <span>가용자산 {fmtWon(housingLiquid)}원</span>
          <span style={{ color: "var(--ink-soft)" }}>최소 필요 자기자금 (LTV {ltvPct}%) {fmtWon(equityNeeded)}원</span>
        </div>
        <ProgressBar value={housingLiquid} max={equityNeeded} valueLabel="가용자산 (지금)" maxLabel={`최소 필요 자기자금 (LTV ${ltvPct}%)`} remainingLabel="더 모아야 할 금액" />
        <p className="note" style={{ marginTop: 10 }}>
          {housingRemaining > 0
            ? `연금저축·IRP를 뺀 가용자산 기준으로 ${fmtWon(housingRemaining)}원을 더 모아야 해 (필요 자기자금에 부대비용 ${fmtWon(home.closingCost)}원 포함, 달성률 ${housingProgress}%).`
            : "가용자산이 필요 자기자금을 이미 넘었어."}
          {housingRemaining > 0 && yearsToGoal !== null && (
            <>
              {" "}
              {withReturns ? "기대수익률과 " : ""}연금 납입 계획을 반영하면 약{" "}
              <strong style={{ color: "var(--ink)" }}>{formatYearsMonths(yearsToGoal)}</strong> 후 달성할 수 있어.
            </>
          )}
          {housingRemaining > 0 && yearsToGoal === null && " 월급·예산 탭에서 저축 가능액을 입력하면 예상 달성 시기도 볼 수 있어."}
        </p>

        {equityNeeded > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div className="chart-title">집 마련 진행과 예상 경로</div>
              <label className="toggle" htmlFor="house-returns">
                <input id="house-returns" type="checkbox" checked={withReturns} onChange={(e) => onHomeChange({ ...home, projectWithReturns: e.target.checked })} />
                수익률 반영 (시뮬레이션 탭 가정: 위험 {simulation.riskRate}% · 안전 {simulation.safeRate}%)
              </label>
            </div>
            <LineChart
              yFormat={fmtEok}
              valueFormat={(v) => `${fmtWon(v)}원`}
              series={[
                { label: "가용자산(기록·현재)", color: "var(--accent)", points: housingPoints },
                ...(pathPoints.length > 1 ? [{ label: "이대로 모으면(예상)", color: "var(--gold)", dashed: true, dots: false, points: pathPoints }] : []),
              ]}
              hLines={[
                { label: `최소 자기자금 (LTV ${ltvPct}%)`, y: equityNeeded, color: "var(--safe)" },
                ...(affordNeeded !== null ? [{ label: `적정 상환 기준 (40년, 월급의 ${home.targetRatioPct}%)`, y: affordNeeded, color: "var(--risk)" }] : []),
              ]}
              vLines={Number.isFinite(purchaseT) ? [{ label: "집 매수 예정일", t: purchaseT, color: "var(--ink-soft)" }] : []}
            />
            <p className="note" style={{ marginTop: 6 }}>
              {withReturns
                ? `매달 ${fmtWon(houseMonthly)}원씩 모으고, 위험자산 ${simulation.riskRate}% · 안전자산 ${simulation.safeRate}%(보증금·통장은 0%) 기대수익률이 붙는다고 가정했어. 실제 수익률은 달라질 수 있어.`
                : `수익률 없이 매달 ${fmtWon(houseMonthly)}원씩 모은다고 가정했어 (보수적으로 보기).`}{" "}
              {minReach === null
                ? "지금 저축 가능액으로는 최소 자기자금에 닿지 않아."
                : housingRemaining <= 0
                  ? "최소 자기자금(대출 한도를 다 쓰는 경우)에는 이미 도달했어."
                  : `최소 자기자금(대출 한도를 다 쓰는 경우)에는 ${ym(minReach)}쯤 닿아${monthsDiff !== null ? (monthsDiff >= 0 ? `, 매수 예정일보다 약 ${monthsDiff}개월 빨라` : `, 매수 예정일보다 약 ${-monthsDiff}개월 늦어`) : ""}.`}
              {affordNeeded !== null && (
                <>
                  {" "}
                  하지만 월 상환을 세후 월급의 {home.targetRatioPct}% 안(40년 만기)으로 두려면 <strong style={{ color: "var(--ink)" }}>{fmtWon(affordNeeded)}원</strong>이 필요하고,{" "}
                  {affordReach === null
                    ? "지금 저축 속도로는 닿지 않아."
                    : affordNeeded <= housingLiquid
                      ? "이미 넘었어."
                      : `${ym(affordReach)}쯤 닿아${Number.isFinite(purchaseT) && affordReach.getTime() > purchaseT ? " (매수 예정일보다 늦어)" : ""}.`}
                </>
              )}
              {Number.isFinite(purchaseT) && monthsLeft > 0 && ` 매수 예정일에는 약 ${fmtWon(atPurchase)}원이 돼 (내 집 마련 탭의 실투입금 + 부대비용과 같은 값).`}
              {" "}스냅샷 히스토리에 기록을 추가할 때마다 가용자산 점이 하나씩 쌓여.
            </p>
          </div>
        )}

        {target && (
          <div className="home-verdict">
            <div>
              <strong>목표 집값 {(target.row.price / 10000).toFixed(target.row.price % 1000 === 0 ? 1 : 2)}억</strong> · 필요 대출 {fmtWon(target.row.loan)}원 · 월 상환 30년 {fmtWon(target.row.monthly30)}원 / 40년{" "}
              {fmtWon(target.row.monthly40)}원 · 세후 월급 대비 {(target.row.ratio30 * 100).toFixed(1)}% / {(target.row.ratio40 * 100).toFixed(1)}%{" "}
              <span className={`tag ${target.row.judge40 === "ok" ? "safe" : target.row.judge40 === "tight" ? "cash" : "risk"}`}>
                40년 {target.row.judge40 === "ok" ? "적정" : target.row.judge40 === "tight" ? "빠듯" : "부담"}
              </span>
            </div>
            <div style={{ marginTop: 4, color: "var(--ink-soft)" }}>
              매수 시점({target.result.purchaseYear}년) 기준 · 실투입금 {fmtWon(target.equity)}원(지금 가용자산 + 매수 때까지 더 모을 돈 − 부대비용) · 최대 적정 집값(상환 {home.targetRatioPct}%) 30년 {(target.result.maxPrice30 / 10000).toFixed(2)}억 · 40년 {(target.result.maxPrice40 / 10000).toFixed(2)}억
            </div>
            <button className="btn ghost sm" style={{ marginTop: 8 }} onClick={() => onNavigate("loan")}>
              내 집 마련 탭에서 자세히
            </button>
          </div>
        )}
        {!target && loan.price > 0 && (
          <p className="note">내 집 마련 탭에서 연 총보수를 입력하면 목표 집값의 월 상환 부담과 최대 적정 집값이 여기에 나와.</p>
        )}

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

      <SectionTitle>요약</SectionTitle>
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
