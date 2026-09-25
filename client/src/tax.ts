import type { BudgetData, TaxPrepInput } from "./types";
import { computePensionCredit, type PensionCredit } from "./pension";

// 연말정산 준비 카드: 올해 안에 행동으로 바꿀 수 있는 항목만 추정한다. 환급액 전체가 아니라 "각 항목으로 줄어드는 세금"이다.
// 금액은 모두 만원.

export interface RentCredit {
  eligible: boolean; // 총급여 기준 통과 (무주택 세대주 여부는 사용자가 확인)
  ratePct: number;
  paid: number; // 올해 낸 월세
  projected: number; // 올해 말까지 낼 월세 (이미 낸 것 + 월세 × 남은 달)
  credit: number; // 지금까지 낸 월세로 받는 세액공제
  projectedCredit: number; // 연말까지 내면 받는 세액공제
  limit: number;
}

export interface SubscriptionDeduction {
  eligible: boolean;
  paid: number;
  remaining: number; // 한도까지 남은 납입액
  deduction: number; // 소득공제액
  taxSaved: number; // 소득공제액 × 한계세율
  extraTaxIfFilled: number; // 남은 한도를 채우면 더 줄어드는 세금
}

export interface CardDeduction {
  threshold: number; // 총급여 × 25%
  used: number;
  toThreshold: number; // 문턱까지 남은 사용액 (0이면 넘음)
  creditOver: number; // 문턱을 넘은 신용카드 사용액 (문턱은 신용카드 사용분부터 채운다)
  debitOver: number; // 문턱을 넘은 체크카드·현금영수증 사용액
  deduction: number; // 소득공제액 (한도 적용)
  limit: number;
  capped: boolean; // 한도에 걸렸는지
  taxSaved: number;
}

export interface TaxPrepResult {
  income: number; // 총급여 (내 집 마련 탭의 연 총보수)
  monthsLeft: number; // 이번 달 다음부터 연말까지 남은 달 수
  pension: PensionCredit;
  rent: RentCredit;
  subscription: SubscriptionDeduction;
  card: CardDeduction;
  totalTaxSaved: number; // 지금까지 기준 합계 (연금 + 월세 + 청약 + 카드)
}

// 올해 값인지 확인해서, 다른 해 값이면 0으로 본다.
export function thisYearValues(t: TaxPrepInput, now: Date): TaxPrepInput {
  if (t.year === now.getFullYear()) return t;
  return { ...t, rentPaid: 0, subscriptionPaid: 0, creditCardUsed: 0, debitCardUsed: 0 };
}

export function computeRentCredit(t: TaxPrepInput, income: number, monthsLeft: number): RentCredit {
  const p = t.policy.rent;
  const eligible = income > 0 && income <= p.incomeMax;
  const ratePct = income <= p.lowIncomeMax ? p.rateLowPct : p.ratePct;
  const paid = Math.max(0, t.rentPaid);
  const projected = paid + Math.max(0, t.rentMonthly) * monthsLeft;
  const credit = eligible ? (Math.min(paid, p.limit) * ratePct) / 100 : 0;
  const projectedCredit = eligible ? (Math.min(projected, p.limit) * ratePct) / 100 : 0;
  return { eligible, ratePct, paid, projected, credit, projectedCredit, limit: p.limit };
}

export function computeSubscription(t: TaxPrepInput, income: number): SubscriptionDeduction {
  const p = t.policy.subscription;
  const eligible = income > 0 && income <= p.incomeMax;
  const paid = Math.max(0, t.subscriptionPaid);
  const remaining = Math.max(0, p.limit - paid);
  const deduction = eligible ? (Math.min(paid, p.limit) * p.ratePct) / 100 : 0;
  const m = t.policy.marginalRatePct / 100;
  return {
    eligible,
    paid,
    remaining,
    deduction,
    taxSaved: deduction * m,
    extraTaxIfFilled: eligible ? ((remaining * p.ratePct) / 100) * m : 0,
  };
}

export function computeCardDeduction(t: TaxPrepInput, income: number): CardDeduction {
  const p = t.policy.card;
  const credit = Math.max(0, t.creditCardUsed);
  const debit = Math.max(0, t.debitCardUsed);
  const threshold = (Math.max(0, income) * p.thresholdPct) / 100;
  const creditOver = Math.max(0, credit - threshold);
  const debitOver = Math.max(0, debit - Math.max(0, threshold - credit));
  const raw = (creditOver * p.creditRatePct + debitOver * p.debitRatePct) / 100;
  const limit = income <= p.limitIncome ? p.limitLow : p.limitHigh;
  const deduction = income > 0 ? Math.min(raw, limit) : 0;
  return {
    threshold,
    used: credit + debit,
    toThreshold: Math.max(0, threshold - credit - debit),
    creditOver,
    debitOver,
    deduction,
    limit,
    capped: raw > limit,
    taxSaved: (deduction * t.policy.marginalRatePct) / 100,
  };
}

export function computeTaxPrep(budget: BudgetData, taxPrep: TaxPrepInput, income: number, now: Date): TaxPrepResult {
  const t = thisYearValues(taxPrep, now);
  const monthsLeft = 11 - now.getMonth();
  const pension = computePensionCredit(budget, now);
  const rent = computeRentCredit(t, income, monthsLeft);
  const subscription = computeSubscription(t, income);
  const card = computeCardDeduction(t, income);
  return {
    income,
    monthsLeft,
    pension,
    rent,
    subscription,
    card,
    totalTaxSaved: pension.refund + rent.credit + subscription.taxSaved + card.taxSaved,
  };
}

// 1년 전체 기준 환급 예상액 (만원): 연금은 계획 납입액 × 공제율, 월세는 연말까지 낼 금액, 청약·카드는 지금까지 입력값.
export function estimateAnnualRefund(budget: BudgetData, taxPrep: TaxPrepInput, income: number, now: Date): number {
  const r = computeTaxPrep(budget, taxPrep, income, now);
  const pensionPlanned = (Math.min(budget.pensionAnnualContribution || 0, r.pension.limit) * (budget.pensionTaxCreditRate || 0)) / 100;
  return pensionPlanned + r.rent.projectedCredit + r.subscription.taxSaved + r.card.taxSaved;
}
