import { useMemo } from "react";
import type { AssetRow, BudgetData, SimulationAssumptions, SimulationScenario } from "../types";
import { autoAnnualContribution, computeReturnTotals, fmtEok, fmtWon, newId } from "../utils";
import { evaluateScenario, runSimulation } from "../simulation";
import LineChart from "./LineChart";
import MoneyInput from "./MoneyInput";
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
  const results = useMemo(() => runSimulation(t.total, riskPct0, sim, annualRaisePct), [t.total, riskPct0, sim, annualRaisePct]);

  const scenarios = sim.scenarios ?? [];
  const evalCtx = { base: t.total, riskPct0, raisePct: annualRaisePct };
  const outcomes = useMemo(
    () => [evaluateScenario(evalCtx, sim, null), ...scenarios.map((sc) => evaluateScenario(evalCtx, sim, sc))],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t.total, riskPct0, sim, annualRaisePct]
  );
  const names = ["현재 입력값", ...scenarios.map((sc) => sc.name || "이름 없음")];
  const palette = ["var(--accent)", "var(--gold)", "var(--safe)", "var(--ink-soft)", "var(--risk)"];
  const thisYear = new Date().getFullYear();

  function setScenario(id: string, patch: Partial<SimulationScenario>) {
    set("scenarios", scenarios.map((sc) => (sc.id === id ? { ...sc, ...patch } : sc)));
  }
  function addScenario() {
    set("scenarios", [
      ...scenarios,
      { id: newId("sc"), name: `시나리오 ${scenarios.length + 1}`, riskRate: sim.riskRate, safeRate: sim.safeRate, annualContribution: sim.annualContribution, contributionRiskRatio: sim.contributionRiskRatio },
    ]);
  }

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
        <div className="field">
          <label>현재 투자자산 (원, 자동)</label>
          <MoneyInput value={t.total} readOnly />
          <p className="note" style={{ marginTop: 6 }}>
            자산 스냅샷에서 '수익률'이 체크된 항목만 계산해. 입출금 통장·전세·월세 보증금·청약처럼 체크를 해제한 항목은 빠져.
          </p>
        </div>
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
                  월 저축 가능액 × 12 + 연금 세액공제 환급. 월급에서 쓰고 남는 돈을 모두 투자한다고 봐. 생활 예비비로 따로 떼어 두는 돈이 있으면 직접 입력으로 바꿔줘.
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
        <p className="note">단리가 아니라 복리로 계산하고, 매년 초 적립금이 들어온다고 가정한 값이야. 1년차는 지금부터 1년 뒤(내년 이맘때)를 뜻해. 실제 수익률은 시장 상황에 따라 크게 달라질 수 있어서, 참고용 시나리오로만 써줘.</p>
      </div>

      <SectionTitle>시나리오 비교</SectionTitle>
      <div className="card">
        <p className="note" style={{ marginTop: 0 }}>
          위쪽 가정(현재 입력값)과 나란히 놓고 볼 다른 가정을 추가해. 수익률·연간 적립액·신규 적립금의 위험 비중만 다르게 하고, 기간·연봉 상승률·시작 자산은 위쪽 값을 그대로 써.
        </p>
        <div className="table-scroll">
          <table className="grid" style={{ minWidth: 640 }}>
            <thead>
              <tr>
                <th>이름</th>
                <th className="num">위험 수익률 (%)</th>
                <th className="num">안전 수익률 (%)</th>
                <th className="num">연간 적립액 (원)</th>
                <th className="num">적립 위험 비중 (%)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>현재 입력값</td>
                <td className="num">{sim.riskRate}</td>
                <td className="num">{sim.safeRate}</td>
                <td className="num">{fmtWon(sim.annualContribution)}</td>
                <td className="num">{sim.contributionRiskRatio}</td>
                <td></td>
              </tr>
              {scenarios.map((sc) => (
                <tr key={sc.id}>
                  <td>
                    <input type="text" value={sc.name} onChange={(e) => setScenario(sc.id, { name: e.target.value })} style={{ width: 120, textAlign: "left" }} />
                  </td>
                  <td className="num">
                    <input type="number" step={0.5} value={sc.riskRate} onChange={(e) => setScenario(sc.id, { riskRate: parseFloat(e.target.value) || 0 })} />
                  </td>
                  <td className="num">
                    <input type="number" step={0.1} value={sc.safeRate} onChange={(e) => setScenario(sc.id, { safeRate: parseFloat(e.target.value) || 0 })} />
                  </td>
                  <td className="num">
                    <MoneyInput value={sc.annualContribution} onChange={(v) => setScenario(sc.id, { annualContribution: v })} />
                  </td>
                  <td className="num">
                    <input type="number" value={sc.contributionRiskRatio} onChange={(e) => setScenario(sc.id, { contributionRiskRatio: parseFloat(e.target.value) || 0 })} />
                  </td>
                  <td>
                    <button className="btn ghost sm" onClick={() => set("scenarios", scenarios.filter((x) => x.id !== sc.id))}>
                      삭제
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {scenarios.length < 4 && (
          <button className="btn ghost" style={{ marginTop: 10 }} onClick={addScenario}>
            + 시나리오 추가
          </button>
        )}

        <div className="table-scroll">
          <table className="grid" style={{ marginTop: 16, minWidth: 560 }}>
            <thead>
              <tr>
                <th>시나리오</th>
                <th className="num">{sim.years}년 뒤 자산</th>
                <th className="num">누적 수익</th>
              </tr>
            </thead>
            <tbody>
              {outcomes.map((o, i) => (
                <tr key={names[i] + i}>
                  <td>
                    <span className="swatch" style={{ background: palette[i % palette.length], display: "inline-block", marginRight: 8 }} />
                    {names[i]}
                  </td>
                  <td className="num">{fmtWon(o.final)}원</td>
                  <td className="num">{fmtWon(o.profit)}원</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: 14 }}>
          <LineChart
            yFormat={fmtEok}
            valueFormat={(v) => `${fmtWon(v)}원`}
            series={outcomes.map((o, i) => ({
              label: names[i],
              color: palette[i % palette.length],
              dots: false,
              points: [{ t: new Date(thisYear, 0, 1).getTime(), y: evalCtx.base }, ...o.results.map((r) => ({ t: new Date(thisYear + r.year, 0, 1).getTime(), y: r.total }))],
            }))}
          />
        </div>
        <p className="note">
          전체 투자자산(연금저축·IRP 포함)의 장기 성장을 보는 화면이야. 집 마련 시점과 자금은 개요의 '집 마련 자금'과 '내 집 마련' 탭에서 봐줘(수익률 반영 여부도 거기서 고를 수 있어). 미래 수익률은 알 수 없으니 여러 가정을 비교해 보는 용도로만 써줘.
        </p>
      </div>
    </section>
  );
}
