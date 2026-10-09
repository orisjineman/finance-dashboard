import type { RetirementInput } from "./types";

// 은퇴 시뮬레이션 (4% 룰 + 소진 나이). 금액은 만원. 생활비·연금은 오늘 물가로 입력받아 물가상승률로 불린다.

export const DEFAULT_RETIREMENT: RetirementInput = {
  currentAge: 35,
  retireAge: 60,
  lifeExpectancy: 90,
  monthlySpend: 250,
  inflationPct: 2.5,
  withdrawRatePct: 4,
  postRetireRatePct: 4,
  pensionMonthly: 0,
  pensionStartAge: 65,
};

export interface RetirementPlan {
  yearsToRetire: number;
  annualSpendAtRetire: number; // 은퇴 시점 물가의 연 생활비
  annualPensionAtRetire: number; // 은퇴 시점 물가의 연금 수령(은퇴 직후부터 받는다고 본 값)
  required: number; // 4% 룰로 필요한 자산 = (생활비 − 연금) ÷ 인출률
  assetsAtRetire: number;
  gap: number; // 은퇴 시점 자산 − 필요 자산 (음수면 부족)
  fundedPct: number; // 필요 자산 대비 준비율 (0~)
  depletionAge: number | null; // 자산이 바닥나는 나이 (기대수명까지 버티면 null)
  endBalance: number; // 기대수명 시점 잔액 (소진되면 0)
}

const infl = (pct: number, years: number) => Math.pow(1 + (pct || 0) / 100, years);

export function planRetirement(input: RetirementInput, assetsAtRetire: number): RetirementPlan {
  const yearsToRetire = Math.max(0, input.retireAge - input.currentAge);
  const annualSpendAtRetire = input.monthlySpend * 12 * infl(input.inflationPct, yearsToRetire);
  const annualPensionAtRetire = input.pensionMonthly * 12 * infl(input.inflationPct, yearsToRetire);
  // 연금을 은퇴와 동시에 받을 때만 4% 룰의 필요 자산에서 뺀다 (늦게 시작하면 아래 소진 시뮬레이션이 그 공백을 반영)
  const net = Math.max(0, annualSpendAtRetire - (input.pensionStartAge <= input.retireAge ? annualPensionAtRetire : 0));
  const required = input.withdrawRatePct > 0 ? net / (input.withdrawRatePct / 100) : 0;

  // 해마다: 초에 생활비(연금 시작 후엔 연금을 뺀 몫)를 꺼내고, 남은 돈이 수익을 낸다.
  let balance = assetsAtRetire;
  let depletionAge: number | null = null;
  for (let age = input.retireAge; age < input.lifeExpectancy; age++) {
    const t = age - input.retireAge;
    const spend = annualSpendAtRetire * infl(input.inflationPct, t);
    const pension = age >= input.pensionStartAge ? annualPensionAtRetire * infl(input.inflationPct, t) : 0;
    balance -= Math.max(0, spend - pension);
    if (balance < 0) {
      depletionAge = age;
      balance = 0;
      break;
    }
    balance *= 1 + (input.postRetireRatePct || 0) / 100;
  }
  return {
    yearsToRetire,
    annualSpendAtRetire,
    annualPensionAtRetire,
    required,
    assetsAtRetire,
    gap: assetsAtRetire - required,
    fundedPct: required > 0 ? (assetsAtRetire / required) * 100 : 100,
    depletionAge,
    endBalance: balance,
  };
}
