import type { AssetRow, BudgetData, SimulationAssumptions } from "./types";
import { monthlyHouseSavings } from "./utils";

// 집 마련 가용자산이 매수 예정일까지 어떻게 늘어나는지 예상한다. 개요 그래프와 내 집 마련 탭('더 모을 돈' 자동)이 같이 쓴다.
// 금액은 만원.

// 날짜까지 남은 달 수 (이번 달 기준, 지났거나 날짜가 없으면 0)
export function monthsUntil(dateStr: string, now: Date): number {
  const d = dateStr ? new Date(`${dateStr}T00:00:00`) : null;
  if (!d || Number.isNaN(d.getTime())) return 0;
  return Math.max(0, (d.getFullYear() - now.getFullYear()) * 12 + (d.getMonth() - now.getMonth()));
}

export function addMonths(d: Date, months: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + months, d.getDate());
}

export interface GrowthInput {
  risk: number;
  safe: number;
  cash: number; // 보증금·통장 등, 수익 없음
  monthlyAdd: number; // 매달 새로 모으는 돈
  contribRiskPct: number; // 새로 모으는 돈 중 위험자산 비중 (%)
  riskRatePct: number; // 연 기대수익률 (%)
  safeRatePct: number;
  withReturns: boolean; // false면 수익률 0 (단순 합산)
}

// month = 0..months 각 달의 잔액. 매달 초 저축액을 넣고, 한 달 치 수익(연 수익률을 월로 환산)을 붙인다.
export function growBalances(g: GrowthInput, months: number): number[] {
  const mr = (pct: number) => (g.withReturns ? Math.pow(1 + pct / 100, 1 / 12) - 1 : 0);
  const rr = mr(g.riskRatePct);
  const sr = mr(g.safeRatePct);
  const add = Math.max(0, g.monthlyAdd);
  const share = Math.min(1, Math.max(0, g.contribRiskPct / 100));
  let risk = g.risk;
  let safe = g.safe;
  const out = [risk + safe + g.cash];
  for (let m = 1; m <= months; m++) {
    risk = (risk + add * share) * (1 + rr);
    safe = (safe + add * (1 - share)) * (1 + sr);
    out.push(risk + safe + g.cash);
  }
  return out;
}

// 목표 금액에 처음 닿는 달 (지금 이미 넘었으면 0, maxMonths 안에 못 닿으면 null)
export function monthsToReach(g: GrowthInput, target: number, maxMonths = 600): number | null {
  const bal = growBalances(g, maxMonths);
  const i = bal.findIndex((v) => v >= target);
  return i === -1 ? null : i;
}

export interface HousingPlan {
  withReturns: boolean;
  current: number; // 지금 집 마련 가용자산 ('집자금' 체크 항목 합계)
  monthly: number; // 집 마련 월 저축액 (연금 납입·환급 반영)
  monthsLeft: number; // 매수 예정일까지 남은 달
  atPurchase: number; // 매수 예정일의 예상 가용자산
  extra: number; // 매수 때까지 늘어나는 금액 (= atPurchase − current)
  series: { t: number; y: number }[]; // 지금부터 매수 예정일까지 달마다
  growth: GrowthInput;
}

export function planHousing(
  rows: AssetRow[],
  budget: BudgetData,
  sim: Pick<SimulationAssumptions, "riskRate" | "safeRate" | "contributionRiskRatio">,
  purchaseDate: string,
  now: Date,
  withReturns: boolean
): HousingPlan {
  const house = rows.filter((r) => r.housingEligible);
  const sum = (c: AssetRow["category"]) => house.filter((r) => r.category === c).reduce((s, r) => s + r.amount, 0);
  const growth: GrowthInput = {
    risk: sum("risk"),
    safe: sum("safe"),
    cash: sum("cash"),
    monthlyAdd: monthlyHouseSavings(budget),
    contribRiskPct: sim.contributionRiskRatio,
    riskRatePct: sim.riskRate,
    safeRatePct: sim.safeRate,
    withReturns,
  };
  const monthsLeft = monthsUntil(purchaseDate, now);
  const bal = growBalances(growth, monthsLeft);
  const current = bal[0];
  const atPurchase = bal[bal.length - 1];
  return {
    withReturns,
    current,
    monthly: growth.monthlyAdd,
    monthsLeft,
    atPurchase,
    extra: atPurchase - current,
    series: bal.map((y, m) => ({ t: (m === 0 ? now : addMonths(now, m)).getTime(), y })),
    growth,
  };
}

// 목표 금액에 닿는 예상 시점 (못 닿으면 null)
export function reachDate(plan: HousingPlan, target: number, now: Date): Date | null {
  const m = monthsToReach(plan.growth, target);
  return m === null ? null : m === 0 ? now : addMonths(now, m);
}
