import type { AssetRow } from "./types";

export interface Totals {
  risk: number;
  safe: number;
  cash: number;
  total: number;
  investBase: number;
  riskPct: number;
  safePct: number;
}

export function computeTotals(rows: AssetRow[]): Totals {
  let risk = 0;
  let safe = 0;
  let cash = 0;
  rows.forEach((r) => {
    if (r.category === "risk") risk += r.amount;
    else if (r.category === "safe") safe += r.amount;
    else cash += r.amount;
  });
  const investBase = risk + safe;
  const riskPct = investBase > 0 ? Math.round((risk / investBase) * 100) : 0;
  const safePct = investBase > 0 ? 100 - riskPct : 0;
  return { risk, safe, cash, total: risk + safe + cash, investBase, riskPct, safePct };
}

export function fmt(n: number | undefined | null): string {
  return Math.round(n || 0).toLocaleString("ko-KR");
}

export function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function debounce<Args extends unknown[]>(fn: (...args: Args) => void, wait: number) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (...args: Args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}
