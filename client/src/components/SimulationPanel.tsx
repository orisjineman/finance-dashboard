import { useMemo } from "react";
import type { AssetRow, BudgetData, SimulationAssumptions } from "../types";
import { autoAnnualContribution, computeReturnTotals, computeTotals, fmtEok, fmtWon } from "../utils";
import { runSimulation } from "../simulation";
import MoneyInput from "./MoneyInput";
import RetirementCard from "./RetirementCard";
import { SimSensitivityCard } from "./SensitivityCard";
import SectionTitle from "./SectionTitle";

interface Props {
  rows: AssetRow[];
  sim: SimulationAssumptions;
  onChange: (sim: SimulationAssumptions) => void;
  annualRaisePct: number;
  budget: BudgetData; // 연간 적립액 자동 계산용
}

export default function SimulationPanel({ rows, sim: stored, onChange, annualRaisePct, budget }: Props) {
  // 연간 적립액: 자동이면 내 정보 탭 값으로 계산 (월 저축 가능액 × 12 + 연금 세액공제 환급)
  const autoContribution = autoAnnualContribution(budget);
  const isAuto = stored.contributionMode === "auto";
  const sim: SimulationAssumptions = useMemo(() => (isAuto ? { ...stored, annualContribution: autoContribution } : stored), [isAuto, stored, autoContribution]);
  const t = computeReturnTotals(rows);
  const riskPct0 = t.investBase > 0 ? t.risk / t.investBase : 0.5;
  // 전체 자산 기준이면 투자자산 밖의 자산(통장·보증금·청약 등)을 수익 0%로 더한다
  const totalMode = stored.baseMode === "total";
  const allTotal = computeTotals(rows).total;
  const idle = totalMode ? Math.max(0, allTotal - t.total) : 0;
  const startTotal = t.total + idle;
  const results = useMemo(() => runSimulation(t.total, riskPct0, sim, annualRaisePct, idle), [t.total, riskPct0, sim, annualRaisePct, idle]);

  const thisYear = new Date().getFullYear();

  const maxVal = Math.max(...results.map((r) => r.total), 1);
  const showEvery = sim.years > 12 ? Math.ceil(sim.years / 12) : 1;
  const barRows = results.filter((_, i) => (i + 1) % showEvery === 0 || i === results.length - 1);

  function set<K extends keyof SimulationAssumptions>(key: K, value: SimulationAssumptions[K]) {
    onChange({ ...stored, [key]: value });
  }

  return (
    <section className="panel active" id="panel-sim">
      <SectionTitle>가정 입력</SectionTitle>
      <div className="card">
        <div className="field-row">
          <div className="field">
            <label>시작 자산 기준</label>
            <select value={totalMode ? "total" : "invest"} onChange={(e) => set("baseMode", e.target.value as "invest" | "total")}>
              <option value="invest">투자자산 ('수익률' 체크 항목)</option>
              <option value="total">전체 자산 (통장·보증금·청약 포함)</option>
            </select>
          </div>
          <div className="field">
            <label>시작 자산 (자동)</label>
            <MoneyInput value={startTotal} readOnly />
          </div>
        </div>
        {totalMode && (
          <p className="note" style={{ marginTop: 0 }}>
            투자자산 {fmtWon(t.total)}원에만 수익률이 붙고, 나머지 {fmtWon(idle)}원(통장·보증금 등)은 그대로 더해.
          </p>
        )}
        <div className="field-row">
          <div className="field">
            <label>연간 신규 적립액 (원)</label>
            <select value={isAuto ? "auto" : "manual"} onChange={(e) => set("contributionMode", e.target.value as "auto" | "manual")} style={{ marginBottom: 6 }}>
              <option value="auto">자동: 내 정보 탭 기준</option>
              <option value="manual">직접 입력</option>
            </select>
            {isAuto ? (
              <>
                <MoneyInput value={Math.round(autoContribution)} readOnly />
                <p className="note" style={{ margin: "4px 0 0" }}>
                  월 저축 가능액 × 12 + 연금 환급 (남는 돈을 모두 투자한다고 봄)
                </p>
              </>
            ) : (
              <MoneyInput value={stored.annualContribution} onChange={(v) => set("annualContribution", v)} />
            )}
          </div>
          <div className="field">
            <label>시뮬레이션 기간 (년)</label>
            <input type="number" value={sim.years} onChange={(e) => set("years", parseInt(e.target.value) || 1)} />
          </div>
        </div>
        <div className="field" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            id="apply-raise"
            checked={sim.applySalaryRaise}
            onChange={(e) => set("applySalaryRaise", e.target.checked)}
            style={{ width: 16, height: 16 }}
          />
          <label htmlFor="apply-raise" style={{ marginBottom: 0 }}>
            매년 적립액에 연봉 상승률 반영 (내 정보 탭 기준 {annualRaisePct}%)
          </label>
        </div>
        <div className="field-row">
          <div className="field">
            <label>위험자산 연 기대수익률 (%)</label>
            <input
              type="number"
              step={0.5}
              value={sim.riskRate}
              onChange={(e) => set("riskRate", parseFloat(e.target.value) || 0)}
            />
          </div>
          <div className="field">
            <label>안전자산 연 기대수익률 (%)</label>
            <input
              type="number"
              step={0.1}
              value={sim.safeRate}
              onChange={(e) => set("safeRate", parseFloat(e.target.value) || 0)}
            />
          </div>
        </div>
        <div className="field">
          <label>신규 적립금의 위험자산 비중 (%)</label>
          <input
            type="number"
            value={sim.contributionRiskRatio}
            onChange={(e) => set("contributionRiskRatio", parseFloat(e.target.value) || 0)}
          />
        </div>
      </div>

      <SectionTitle>연도별 예상 자산</SectionTitle>
      <div className="card">
        <div className="bars">
          {barRows.map((r) => (
            <div className="bar-col" key={r.year}>
              <div className="bar-value">{fmtEok(r.total)}</div>
              <div className="bar" style={{ height: `${Math.max(4, Math.round((r.total / maxVal) * 140))}px` }} />
              <div className="bar-label" title={`${r.year}년차 (${thisYear + r.year}년)`}>{`${String(thisYear + r.year).slice(2)}년`}</div>
            </div>
          ))}
        </div>
        <div className="table-scroll">
<table className="grid" style={{ marginTop: 14 }}>
          <thead>
            <tr>
              <th>연차</th>
              {sim.applySalaryRaise && <th className="num">연간 적립액</th>}
              <th className="num">연말 예상 자산</th>
              <th className="num">누적 수익</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r) => (
              <tr key={r.year}>
                <td style={{ whiteSpace: "nowrap" }}>
                  {r.year}년차 <span style={{ color: "var(--ink-soft)" }}>({thisYear + r.year}년)</span>
                </td>
                {sim.applySalaryRaise && <td className="num">{fmtWon(r.contribution)}원</td>}
                <td className="num">{fmtWon(r.total)}원</td>
                <td className="num">{fmtWon(r.profit)}원</td>
              </tr>
            ))}
          </tbody>
        </table>
</div>
        <p className="note">복리 · 매달 적립(연간 적립액 ÷ 12) · 1년차 = 지금부터 1년 뒤. 개요의 집 마련 예상 경로와 같은 계산이고, 참고용 시나리오야.</p>
      </div>

      <SimSensitivityCard base={t.total} riskPct0={riskPct0} sim={sim} raisePct={annualRaisePct} idle={idle} />

      <RetirementCard stored={stored} sim={sim} onChange={onChange} base={t.total} riskPct0={riskPct0} idle={idle} raisePct={annualRaisePct} />
    </section>
  );
}
