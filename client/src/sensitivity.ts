import type { SimulationAssumptions } from "./types";
import { addMonths, growBalances, monthsToReach, type HousingPlan } from "./housing";
import { runSimulation } from "./simulation";

// 가정을 조금씩 흔들었을 때 결과가 얼마나 달라지는지 본다. 금액은 만원.

export const RETURN_DELTAS = [-2, 0, 2]; // 기대수익률 변화 (%p, 위험·안전 모두)
export const SAVING_SCALES = [0.8, 1, 1.2]; // 저축액 배율

export interface HousingCell {
  months: number | null; // 목표에 닿는 데까지 걸리는 달 (못 닿으면 null)
  reachAt: Date | null;
  gap: number | null; // 매수 예정일 예상 가용자산 − 필요 금액 (예정일이 없으면 null)
}

// 집 마련 가용자산을 수익률×저축액 조합별로 다시 계산한다. 수익률을 바꾸는 분석이라 항상 수익률을 반영해 계산한다.
export function housingSensitivity(plan: HousingPlan, need: number, now: Date, deltas = RETURN_DELTAS, scales = SAVING_SCALES): HousingCell[][] {
  return deltas.map((d) =>
    scales.map((s) => {
      const growth = {
        ...plan.growth,
        withReturns: true,
        riskRatePct: plan.growth.riskRatePct + d,
        safeRatePct: plan.growth.safeRatePct + d,
        monthlyAdd: Math.max(0, plan.growth.monthlyAdd) * s,
        addAt: undefined,
      };
      const months = plan.current >= need ? 0 : monthsToReach(growth, need);
      return {
        months,
        reachAt: months === null ? null : addMonths(now, months),
        gap: plan.monthsLeft > 0 ? growBalances(growth, plan.monthsLeft).at(-1)! - need : null,
      };
    })
  );
}

// 시뮬레이션 마지막 해의 예상 자산을 수익률×저축액 조합별로 계산한다.
export function simulationSensitivity(base: number, riskPct0: number, sim: SimulationAssumptions, raisePct: number, idle: number, deltas = RETURN_DELTAS, scales = SAVING_SCALES): number[][] {
  return deltas.map((d) =>
    scales.map((s) => {
      const r = runSimulation(base, riskPct0, { ...sim, riskRate: sim.riskRate + d, safeRate: sim.safeRate + d, annualContribution: sim.annualContribution * s }, raisePct, idle);
      return r.at(-1)?.total ?? base + idle;
    })
  );
}
