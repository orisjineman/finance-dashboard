import type { SimulationAssumptions } from "./types";

export interface YearResult {
  year: number;
  contribution: number;
  total: number;
  profit: number;
}

// 복리로 매년 초 적립금이 들어온다고 보고 연도별 자산을 계산한다. (base: 시작 투자자산, riskPct0: 시작 위험 비중 0~1)
// idle: 수익이 없는 자산(통장·보증금·청약 등). 전체 자산 기준으로 볼 때만 넣고, 금액 그대로 더해진다.
export function runSimulation(base: number, riskPct0: number, sim: SimulationAssumptions, raisePct: number, idle = 0): YearResult[] {
  const years = Math.max(1, Math.min(40, sim.years || 10));
  const riskRate = (sim.riskRate || 0) / 100;
  const safeRate = (sim.safeRate || 0) / 100;
  const contribRiskRatio = (sim.contributionRiskRatio || 0) / 100;
  const raise = sim.applySalaryRaise ? (raisePct || 0) / 100 : 0;

  let riskBal = base * riskPct0;
  let safeBal = base * (1 - riskPct0);
  let principal = base + idle;
  const out: YearResult[] = [];
  for (let y = 1; y <= years; y++) {
    const contribution = sim.annualContribution * Math.pow(1 + raise, y - 1);
    riskBal += contribution * contribRiskRatio;
    safeBal += contribution * (1 - contribRiskRatio);
    riskBal *= 1 + riskRate;
    safeBal *= 1 + safeRate;
    principal += contribution;
    const total = riskBal + safeBal + idle;
    out.push({ year: y, contribution, total, profit: total - principal });
  }
  return out;
}
