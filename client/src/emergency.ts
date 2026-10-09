import type { AssetRow, BudgetData } from "./types";

// 비상금: 바로 꺼내 쓸 수 있는 현금성 자산이 몇 달 치 지출을 버티는지. 금액은 만원.
export const DEFAULT_EMERGENCY_MONTHS = 6;

// 보증금·청약은 급할 때 꺼내 쓸 수 없으니 뺀다. (집 계약금처럼 따로 정해둔 현금은 포함되니 해석에 주의)
export const isLiquidCash = (r: AssetRow) => r.category === "cash" && !/보증금|청약/.test(`${r.account}${r.item}`);

export interface EmergencyStatus {
  liquid: number;
  monthlyExpense: number;
  months: number | null; // 지출이 0이면 null
  targetMonths: number;
  shortfall: number; // 목표까지 모자란 금액 (0이면 충분)
}

export function emergencyStatus(rows: AssetRow[], budget: BudgetData): EmergencyStatus {
  const liquid = rows.filter(isLiquidCash).reduce((s, r) => s + r.amount, 0);
  const monthlyExpense = budget.expenseCategories.reduce((s, c) => s + c.amount, 0);
  const targetMonths = budget.emergencyTargetMonths && budget.emergencyTargetMonths > 0 ? budget.emergencyTargetMonths : DEFAULT_EMERGENCY_MONTHS;
  const months = monthlyExpense > 0 ? liquid / monthlyExpense : null;
  return { liquid, monthlyExpense, months, targetMonths, shortfall: Math.max(0, monthlyExpense * targetMonths - liquid) };
}
