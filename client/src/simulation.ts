import type { SimulationAssumptions } from "./types";
import { growBalances } from "./housing";

export interface YearResult {
  year: number;
  contribution: number;
  total: number;
  profit: number;
}

// 매달 적립(그해 적립액 ÷ 12)하고 월 복리로 불리는 계산을 해마다 끝 시점에서 끊어 본다. 집 마련 예상 경로와 같은 계산(growBalances)이라 같은 가정이면 같은 값이 나온다.
// base: 시작 투자자산, riskPct0: 시작 위험 비중 0~1
// idle: 수익이 없는 자산(통장·보증금·청약 등). 전체 자산 기준으로 볼 때만 넣고, 금액 그대로 더해진다.
export function runSimulation(base: number, riskPct0: number, sim: SimulationAssumptions, raisePct: number, idle = 0): YearResult[] {
  const years = Math.max(1, Math.min(40, sim.years || 10));
  const raise = sim.applySalaryRaise ? (raisePct || 0) / 100 : 0;
  const contributionOf = (year: number) => sim.annualContribution * Math.pow(1 + raise, year - 1);

  const balances = growBalances(
    {
      risk: base * riskPct0,
      safe: base * (1 - riskPct0),
      cash: idle,
      monthlyAdd: 0,
      addAt: (month) => contributionOf(Math.ceil(month / 12)) / 12,
      contribRiskPct: sim.contributionRiskRatio || 0,
      riskRatePct: sim.riskRate || 0,
      safeRatePct: sim.safeRate || 0,
      withReturns: true,
    },
    years * 12
  );

  let principal = base + idle;
  const out: YearResult[] = [];
  for (let y = 1; y <= years; y++) {
    const contribution = contributionOf(y);
    principal += contribution;
    const total = balances[y * 12];
    out.push({ year: y, contribution, total, profit: total - principal });
  }
  return out;
}
