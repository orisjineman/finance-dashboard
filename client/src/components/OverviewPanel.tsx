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
import SectionTitle from "./SectionTitle";

interface Props {
  rows: AssetRow[];
  strategy: StrategyData;
  onStrategyChange: (strategy: StrategyData) => void;
  budget: BudgetData;
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

export default function OverviewPanel({ rows, strategy, onStrategyChange, budget, loan, history, alerts, home, onHomeChange, rebalance, simulation, onNavigate }: Props) {
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

  const { pensionAnnualContribution } = budget;
  const now = new Date();
  const withReturns = !!home.projectWithReturns;
  // 집 마련 예상 경로 (내 집 마련 탭의 '더 모을 돈'과 같은 계산). 수익률 반영은 토글로 고른다.
  const plan = planHousing(rows, budget, simulation, strategy.housePurchaseDate, now, withReturns);
  const planNoPension = planHousing(rows, { ...budget, pensionAnnualContribution: 0 }, simulation, strategy.housePurchaseDate, now, withReturns);
  const target = evaluateTarget({ rows, rebalance, home, loan, strategy, budget, simulation }, now);
  // 적정 상환 기준: 목표 집값을 월 상환이 세후 월급의 목표 비중(40년 만기) 안에 들게 사려면 필요한 가용자산
  const affordNeeded = target ? assetsNeededAffordable(target, 40, home.closingCost) : null;
  const housingPoints = [
    ...history.filter((h) => h.housingLiquid !== undefined).map((h) => ({ t: new Date(`${h.date}T00:00:00`).getTime(), y: h.housingLiquid as number })),
    { t: now.getTime(), y: housingLiquid },
  ].sort((a, b) => a.t - b.t);
  // 전체 자산 추이: 히스토리에 기록된 전체 자산 + 지금 값
  const totalPoints = [
    ...history.filter((h) => h.totalAssets !== undefined).map((h) => ({ t: new Date(`${h.date}T00:00:00`).getTime(), y: h.totalAssets as number })),
    { t: now.getTime(), y: t.total },
  ].sort((a, b) => a.t - b.t);
  const purchaseT = strategy.housePurchaseDate ? new Date(`${strategy.housePurchaseDate}T00:00:00`).getTime() : NaN;
  const purchase = Number.isFinite(purchaseT) ? new Date(purchaseT) : null;
  const ltvPct = Math.round(home.policy.bogeumjari.ltv * 100);
  const monthsBetween = (a: Date, b: Date) => (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());

  // 목표 하나에 대한 한 줄 요약: 도달 시점과 매수 예정일 대비
  function reachSummary(need: number): { text: string; tone: "safe" | "risk" | "ink" } {
    if (housingLiquid >= need) return { text: "이미 도달", tone: "safe" };
    const at = reachDate(plan, need, now);
    if (!at) return { text: "지금 속도로는 못 닿음", tone: "risk" };
    const label = `${at.getFullYear()}.${String(at.getMonth() + 1).padStart(2, "0")} 도달`;
    if (!purchase) return { text: label, tone: "ink" };
    const diff = monthsBetween(at, purchase);
    return diff >= 0 ? { text: `${label} · 예정일보다 ${diff}개월 빠름`, tone: "safe" } : { text: `${label} · 예정일보다 ${-diff}개월 늦음`, tone: "risk" };
  }
  const goals = [
    { key: "min", title: `최소 자기자금 (대출 LTV ${ltvPct}% 다 쓸 때)`, need: equityNeeded },
    ...(affordNeeded !== null ? [{ key: "afford", title: `적정 상환 기준 (40년, 월 상환 ≤ 세후 월급 ${home.targetRatioPct}%)`, need: affordNeeded }] : []),
  ];
  const minReachMonths = housingLiquid < equityNeeded ? monthsToReach(plan.growth, equityNeeded) : null;
  const minReachMonthsNoPension = housingLiquid < equityNeeded ? monthsToReach(planNoPension.growth, equityNeeded) : null;
  const pensionDelayMonths = minReachMonths !== null && minReachMonthsNoPension !== null ? minReachMonths - minReachMonthsNoPension : null;
  const eok = (m: number) => `${(m / 10000).toFixed(2)}억`;

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

      <SectionTitle>전체 자산 추이</SectionTitle>
      <div className="card">
        {totalPoints.length >= 2 ? (
          <LineChart
            yFormat={fmtEok}
            valueFormat={(v) => `${fmtWon(v)}원`}
            series={[{ label: "전체 자산 (통장·보증금·연금 포함)", color: "var(--gold)", points: totalPoints }]}
          />
        ) : (
          <p className="note" style={{ margin: 0 }}>
            지금 전체 자산 {fmtWon(t.total)}원. 스냅샷 히스토리에 기록하면 다음 기록부터 추이가 그려져.
          </p>
        )}
      </div>

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
        <p className="note">투자 항목 {fmtWon(inv.total)}원 기준</p>
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
        <p className="note">
          실수령액·상승률·예산은{" "}
          <button className="link-btn" onClick={() => onNavigate("budget")}>
            내 정보
          </button>
          에서 고쳐.
        </p>
      </div>

      <SectionTitle>집 마련 자금</SectionTitle>
      <div className="card">
        <div className="goal-head">
          <span>
            지금 가용자산 <strong>{fmtWon(housingLiquid)}원</strong>
          </span>
          {purchase && plan.monthsLeft > 0 && (
            <span style={{ color: "var(--ink-soft)" }}>
              매수일({purchase.getFullYear()}.{String(purchase.getMonth() + 1).padStart(2, "0")}) 예상 {fmtWon(plan.atPurchase)}원
            </span>
          )}
        </div>
        {equityNeeded > 0 &&
          goals.map((g) => {
            const r = reachSummary(g.need);
            return (
              <div className="goal-row" key={g.key}>
                <div className="goal-line">
                  <span>{g.title}</span>
                  <span>{fmtWon(g.need)}원</span>
                </div>
                <ProgressBar value={housingLiquid} max={g.need} valueLabel="가용자산 (지금)" maxLabel={g.title} remainingLabel="더 모아야 할 금액" />
                <div className="goal-meta">
                  {g.need > 0 ? Math.min(100, Math.round((housingLiquid / g.need) * 100)) : 0}% · <span style={{ color: `var(--${r.tone})` }}>{r.text}</span>
                </div>
              </div>
            );
          })}
        {equityNeeded <= 0 && <p className="note">내 정보 탭에서 목표 집값을 넣으면 필요 자기자금과 진행 막대가 나와.</p>}

        {equityNeeded > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div className="chart-title">진행과 예상 경로</div>
              <label className="toggle" htmlFor="house-returns">
                <input id="house-returns" type="checkbox" checked={withReturns} onChange={(e) => onHomeChange({ ...home, projectWithReturns: e.target.checked })} />
                수익률 반영 (위험 {simulation.riskRate}% · 안전 {simulation.safeRate}%)
              </label>
            </div>
            <LineChart
              yFormat={fmtEok}
              valueFormat={(v) => `${fmtWon(v)}원`}
              series={[
                { label: "가용자산(기록·현재)", color: "var(--accent)", points: housingPoints },
                ...(plan.series.length > 1 ? [{ label: "이대로 모으면(예상)", color: "var(--gold)", dashed: true, dots: false, points: plan.series }] : []),
              ]}
              hLines={[
                { label: `최소 자기자금`, y: equityNeeded, color: "var(--safe)" },
                ...(affordNeeded !== null ? [{ label: `적정 상환 기준`, y: affordNeeded, color: "var(--risk)" }] : []),
              ]}
              vLines={purchase ? [{ label: "매수 예정일", t: purchaseT, color: "var(--ink-soft)" }] : []}
            />
            <p className="note" style={{ marginTop: 6 }}>
              월 {fmtWon(plan.monthly)}원 · {withReturns ? "기대수익률 반영" : "수익률 없이"} · 부대비용 {fmtWon(home.closingCost)}원 포함
            </p>
          </div>
        )}

        {target && (
          <div className="home-verdict">
            <div>
              <strong>목표 {eok(target.row.price)}</strong> · 대출 {eok(target.row.loan)} · 40년 월 {fmtWon(target.row.monthly40)}원 (세후 월급의 {(target.row.ratio40 * 100).toFixed(1)}%){" "}
              <span className={`tag ${target.row.judge40 === "ok" ? "safe" : target.row.judge40 === "tight" ? "cash" : "risk"}`}>
                {target.row.judge40 === "ok" ? "적정" : target.row.judge40 === "tight" ? "빠듯" : "부담"}
              </span>
            </div>
            <div style={{ marginTop: 2, color: "var(--ink-soft)" }}>
              최대 적정 집값 40년 {eok(target.result.maxPrice40)} · 30년 {eok(target.result.maxPrice30)} (매수 시점 기준){" "}
              <button className="link-btn" onClick={() => onNavigate("loan")}>
                자세히
              </button>
            </div>
          </div>
        )}
        {!target && loan.price > 0 && <p className="note">내 정보 탭에서 연 총보수를 넣으면 목표 집값의 상환 부담 판정이 여기에 나와.</p>}

        {pensionAnnualContribution > 0 && (
          <p className="note" style={{ marginTop: 12 }}>
            연금 {fmtWon(pensionAnnualContribution)}원/년 납입
            {pensionDelayMonths !== null && pensionDelayMonths > 0 ? ` → 최소 자기자금 도달 ${pensionDelayMonths}개월 늦어짐` : ""} · 환급은{" "}
            {budget.refundTo === "house" ? "집 자금에" : budget.refundTo === "retirement" ? "노후 자금에" : "연금 납입에"}{" "}
            <button className="link-btn" onClick={() => onNavigate("budget")}>
              수정
            </button>
          </p>
        )}
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
