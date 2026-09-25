import type { SimulationAssumptions, SimulationScenario } from "./types";

export interface YearResult {
  year: number;
  contribution: number;
  total: number;
  profit: number;
}

// 복리로 매년 초 적립금이 들어온다고 보고 연도별 자산을 계산한다. (base: 시작 자산, riskPct0: 시작 위험 비중 0~1)
export function runSimulation(base: number, riskPct0: number, sim: SimulationAssumptions, raisePct: number): YearResult[] {
  const years = Math.max(1, Math.min(40, sim.years || 10));
  const riskRate = (sim.riskRate || 0) / 100;
  const safeRate = (sim.safeRate || 0) / 100;
  const contribRiskRatio = (sim.contributionRiskRatio || 0) / 100;
  const raise = sim.applySalaryRaise ? (raisePct || 0) / 100 : 0;

  let riskBal = base * riskPct0;
  let safeBal = base * (1 - riskPct0);
  let principal = base;
  const out: YearResult[] = [];
  for (let y = 1; y <= years; y++) {
    const contribution = sim.annualContribution * Math.pow(1 + raise, y - 1);
    riskBal += contribution * contribRiskRatio;
    safeBal += contribution * (1 - contribRiskRatio);
    riskBal *= 1 + riskRate;
    safeBal *= 1 + safeRate;
    principal += contribution;
    const total = riskBal + safeBal;
    out.push({ year: y, contribution, total, profit: total - principal });
  }
  return out;
}

export interface ScenarioOutcome {
  results: YearResult[];
  final: number;
  profit: number;
}

// 기본 가정(sim)에 시나리오의 수익률·적립 가정을 덮어써서 결과를 낸다. scenario 가 null 이면 sim 그대로.
export function evaluateScenario(
  o: { base: number; riskPct0: number; raisePct: number },
  sim: SimulationAssumptions,
  scenario: SimulationScenario | null
): ScenarioOutcome {
  const merged: SimulationAssumptions = scenario
    ? { ...sim, riskRate: scenario.riskRate, safeRate: scenario.safeRate, annualContribution: scenario.annualContribution, contributionRiskRatio: scenario.contributionRiskRatio }
    : sim;
  const results = runSimulation(o.base, o.riskPct0, merged, o.raisePct);
  const last = results[results.length - 1];
  return { results, final: last.total, profit: last.profit };
}
