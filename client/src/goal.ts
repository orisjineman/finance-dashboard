import { addMonths, growBalances, monthsToReach, type HousingPlan } from "./housing";

// 집 마련 목표 하나(필요 금액)에 대해 '이대로 모으면 매수 예정일에 맞는지'를 요약한다. 금액은 만원.

export type GoalState = "reached" | "ontrack" | "behind" | "unreachable";

export interface GoalStatus {
  need: number;
  state: GoalState;
  reachAt: Date | null; // 목표에 처음 닿는 예상 시점 (이미 닿았으면 지금, 못 닿으면 null)
  monthsEarly: number | null; // 예정일보다 몇 달 빠른지 (음수면 늦음). 예정일이 없으면 null
  gapAtPurchase: number | null; // 매수 예정일의 예상 가용자산 − 필요 금액 (음수면 부족). 예정일이 없거나 지났으면 null
  extraMonthly: number | null; // 예정일에 맞추려면 월 저축을 이만큼 더 해야 함. 이미 맞으면 0, 계산할 수 없으면 null
}

// 매달 모으는 돈은 최종 잔액에 선형으로 반영되므로, 1만원 늘렸을 때 늘어나는 금액으로 필요한 추가분을 바로 구한다.
export function extraMonthlyNeeded(plan: HousingPlan, need: number): number | null {
  if (plan.monthsLeft <= 0) return null;
  if (plan.atPurchase >= need) return 0;
  const finalWith = (monthlyAdd: number) => growBalances({ ...plan.growth, monthlyAdd }, plan.monthsLeft).at(-1)!;
  const base = Math.max(0, plan.growth.monthlyAdd);
  const perManwon = finalWith(base + 1) - finalWith(base);
  return perManwon > 0 ? (need - plan.atPurchase) / perManwon : null;
}

export function goalStatus(plan: HousingPlan, need: number, purchase: Date | null, now: Date): GoalStatus {
  const months = plan.current >= need ? 0 : monthsToReach(plan.growth, need);
  const reachAt = months === null ? null : months === 0 ? now : addMonths(now, months);
  const monthsBetween = (a: Date, b: Date) => (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  const monthsEarly = reachAt && purchase ? monthsBetween(reachAt, purchase) : null;
  const hasPlan = !!purchase && plan.monthsLeft > 0;
  const state: GoalState = plan.current >= need ? "reached" : reachAt === null ? "unreachable" : monthsEarly !== null && monthsEarly < 0 ? "behind" : "ontrack";
  return {
    need,
    state,
    reachAt,
    monthsEarly,
    gapAtPurchase: hasPlan ? plan.atPurchase - need : null,
    extraMonthly: hasPlan ? extraMonthlyNeeded(plan, need) : null,
  };
}
