import type { BudgetData } from "./types";

export const DEFAULT_PENSION_LIMIT = 900; // 만원 (연금저축+IRP 합산 세액공제 대상 한도). 제도가 바뀌면 화면에서 고칠 수 있다.

export interface PensionCredit {
  limit: number; // 만원
  paid: number; // 만원, 올해 납입액
  counted: number; // 만원, 한도 안에서 공제 대상이 되는 금액
  remaining: number; // 만원, 한도까지 남은 금액
  refund: number; // 만원, 지금까지 납입분의 예상 세액공제액
  extraRefundIfFilled: number; // 만원, 남은 한도를 다 채우면 더 받을 수 있는 예상 세액공제액
  daysToYearEnd: number;
}

// 올해 납입액. 값이 다른 해의 것이면 새 해가 시작된 것으로 보고 0으로 친다.
export function paidThisYear(budget: BudgetData, now: Date): number {
  return budget.pensionPaidYear === now.getFullYear() ? Math.max(0, budget.pensionPaidThisYear ?? 0) : 0;
}

export function computePensionCredit(budget: BudgetData, now: Date): PensionCredit {
  const limit = budget.pensionCreditLimit ?? DEFAULT_PENSION_LIMIT;
  const paid = paidThisYear(budget, now);
  const rate = (budget.pensionTaxCreditRate || 0) / 100;
  const counted = Math.min(paid, limit);
  const remaining = Math.max(0, limit - paid);
  const yearEnd = new Date(now.getFullYear(), 11, 31);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return {
    limit,
    paid,
    counted,
    remaining,
    refund: counted * rate,
    extraRefundIfFilled: remaining * rate,
    daysToYearEnd: Math.round((yearEnd.getTime() - today.getTime()) / 86400000),
  };
}
