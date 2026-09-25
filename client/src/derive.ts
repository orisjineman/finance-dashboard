import type { DashboardData, TaxPrepPolicy } from "./types";

// 입력값끼리 정해지는 값을 한곳에서 계산한다. 화면과 알림은 원본 대신 이 결과를 읽는다.
// - 연금저축·IRP 세액공제율: '내 정보'의 연 총보수(총급여)로 자동 결정 (5,500만원 이하 16.5%, 초과 13.2% — 연말정산 탭 기준 숫자에서 변경 가능)

export const DEFAULT_PENSION_RATE_POLICY: NonNullable<TaxPrepPolicy["pension"]> = { lowIncomeMax: 5500, rateLowPct: 16.5, ratePct: 13.2 };

export function pensionRateFor(income: number, policy: TaxPrepPolicy["pension"] = DEFAULT_PENSION_RATE_POLICY): number | null {
  if (!(income > 0)) return null; // 총급여를 모르면 정할 수 없다 (저장된 값을 그대로 쓴다)
  return income <= policy.lowIncomeMax ? policy.rateLowPct : policy.ratePct;
}

export function deriveData(data: DashboardData): DashboardData {
  const rate = pensionRateFor(data.home?.currentIncome ?? 0, data.budget.taxPrep?.policy.pension);
  if (rate === null || rate === data.budget.pensionTaxCreditRate) return data;
  return { ...data, budget: { ...data.budget, pensionTaxCreditRate: rate } };
}
