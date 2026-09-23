import { useMemo } from "react";
import type { AssetRow, SimulationAssumptions } from "../types";
import { computeTotals, fmtEok, fmtWon } from "../utils";
import MoneyInput from "./MoneyInput";

interface Props {
  rows: AssetRow[];
  sim: SimulationAssumptions;
  onChange: (sim: SimulationAssumptions) => void;
}

interface YearResult {
  year: number;
  total: number;
  profit: number;
}

function runSimulation(base: number, riskPct0: number, sim: SimulationAssumptions): YearResult[] {
  const years = Math.max(1, Math.min(40, sim.years || 10));
  const riskRate = (sim.riskRate || 0) / 100;
  const safeRate = (sim.safeRate || 0) / 100;
  const contribRiskRatio = (sim.contributionRiskRatio || 0) / 100;

  let riskBal = base * riskPct0;
  let safeBal = base * (1 - riskPct0);
  const out: YearResult[] = [];
  for (let y = 1; y <= years; y++) {
    riskBal += sim.annualContribution * contribRiskRatio;
    safeBal += sim.annualContribution * (1 - contribRiskRatio);
    riskBal *= 1 + riskRate;
    safeBal *= 1 + safeRate;
    const total = riskBal + safeBal;
    const principal = base + sim.annualContribution * y;
    out.push({ year: y, total, profit: total - principal });
  }
  return out;
}

export default function SimulationPanel({ rows, sim, onChange }: Props) {
  const t = computeTotals(rows);
  const riskPct0 = t.investBase > 0 ? t.risk / t.investBase : 0.5;
  const results = useMemo(() => runSimulation(t.total, riskPct0, sim), [t.total, riskPct0, sim]);

  const maxVal = Math.max(...results.map((r) => r.total), 1);
  const showEvery = sim.years > 12 ? Math.ceil(sim.years / 12) : 1;
  const barRows = results.filter((_, i) => (i + 1) % showEvery === 0 || i === results.length - 1);

  function set<K extends keyof SimulationAssumptions>(key: K, value: SimulationAssumptions[K]) {
    onChange({ ...sim, [key]: value });
  }

  return (
    <section className="panel active" id="panel-sim">
      <h2 className="section-title">
        <span className="num">01</span> 가정 입력
      </h2>
      <div className="card">
        <div className="field">
          <label>현재 총자산 (원, 자동)</label>
          <MoneyInput value={t.total} readOnly />
        </div>
        <div className="field-row">
          <div className="field">
            <label>연간 신규 적립액 (원)</label>
            <MoneyInput value={sim.annualContribution} onChange={(v) => set("annualContribution", v)} />
          </div>
          <div className="field">
            <label>시뮬레이션 기간 (년)</label>
            <input type="number" value={sim.years} onChange={(e) => set("years", parseInt(e.target.value) || 1)} />
          </div>
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

      <h2 className="section-title">
        <span className="num">02</span> 연도별 예상 자산
      </h2>
      <div className="card">
        <div className="bars">
          {barRows.map((r) => (
            <div className="bar-col" key={r.year}>
              <div className="bar-value">{fmtEok(r.total)}</div>
              <div className="bar" style={{ height: `${Math.max(4, Math.round((r.total / maxVal) * 140))}px` }} />
              <div className="bar-label">{r.year}y</div>
            </div>
          ))}
        </div>
        <table className="grid" style={{ marginTop: 14 }}>
          <thead>
            <tr>
              <th>연차</th>
              <th className="num">연말 예상 자산</th>
              <th className="num">누적 수익</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r) => (
              <tr key={r.year}>
                <td>{r.year}년차</td>
                <td className="num">{fmtWon(r.total)}원</td>
                <td className="num">{fmtWon(r.profit)}원</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="note">단리가 아니라 복리로 계산하고, 매년 초 적립금이 들어온다고 가정한 값이야. 실제 수익률은 시장 상황에 따라 크게 달라질 수 있어서, 참고용 시나리오로만 써줘.</p>
      </div>
    </section>
  );
}
