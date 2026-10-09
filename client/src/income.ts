import type { AssetRow, IncomeEntry } from "./types";

// 받은 배당·이자 기록과, 상품별 예상 수익률로 본 앞으로의 예상 수입. 금액은 만원.

export interface IncomeSummary {
  total: number;
  dividend: number;
  interest: number;
  byMonth: number[]; // 1~12월 (index 0 = 1월)
  byAccount: { account: string; amount: number }[]; // 많은 순
}

export function yearIncome(log: IncomeEntry[], year: number): IncomeSummary {
  const prefix = `${year}-`;
  const byMonth = Array<number>(12).fill(0);
  const acc = new Map<string, number>();
  let dividend = 0;
  let interest = 0;
  for (const e of log) {
    if (!e.date.startsWith(prefix)) continue;
    const month = Number(e.date.slice(5, 7));
    if (month >= 1 && month <= 12) byMonth[month - 1] += e.amount;
    if (e.kind === "dividend") dividend += e.amount;
    else interest += e.amount;
    acc.set(e.account, (acc.get(e.account) ?? 0) + e.amount);
  }
  return {
    total: dividend + interest,
    dividend,
    interest,
    byMonth,
    byAccount: [...acc].map(([account, amount]) => ({ account, amount })).sort((a, b) => b.amount - a.amount),
  };
}

export interface ExpectedIncome {
  total: number; // 만원/년
  byAccount: { account: string; amount: number }[];
  missingYield: number; // 수익률을 안 적은 상품 수 (잔액이 있는 것만)
}

// 잔액 × 예상 수익률. 수익률을 적지 않은 상품은 0으로 본다.
export function expectedAnnualIncome(rows: AssetRow[]): ExpectedIncome {
  const acc = new Map<string, number>();
  let missing = 0;
  for (const r of rows) {
    if (r.amount <= 0) continue;
    if (r.yieldPct === undefined) {
      missing += 1;
      continue;
    }
    acc.set(r.account, (acc.get(r.account) ?? 0) + (r.amount * r.yieldPct) / 100);
  }
  const byAccount = [...acc].map(([account, amount]) => ({ account, amount })).filter((a) => a.amount > 0).sort((a, b) => b.amount - a.amount);
  return { total: byAccount.reduce((s, a) => s + a.amount, 0), byAccount, missingYield: missing };
}
