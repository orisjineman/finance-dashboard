export type AssetCategory = "risk" | "safe" | "cash";

export interface AssetRow {
  id: string;
  account: string; // 계좌 (예: "신한투자증권 IRP", "CMA")
  item: string; // 항목/종목 (예: "RISE 미국S&P500", "예수금")
  category: AssetCategory;
  amount: number; // 만원
}

export interface SimulationAssumptions {
  annualContribution: number; // 만원
  years: number;
  riskRate: number; // %
  safeRate: number; // %
  contributionRiskRatio: number; // %
}

export interface LoanInput {
  price: number; // 만원
  ltvPct: number;
  ratePct: number;
  termYears: number;
}

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface LadderRung {
  id: string;
  when: string;
  amount: number; // 만원
  why: string;
}

export interface GlidePathRow {
  id: string;
  horizon: string;
  riskPct: string;
}

export interface IsaPortfolio {
  riskPct: number;
  safePct: number;
  riskProduct: string;
  safeProduct: string;
  dutyNote: string;
}

export interface StrategyData {
  isaDutyEndDate: string; // ISO date, e.g. "2028-10-17", or "" if unset
  overviewSummary: string[];
  isaPortfolio: IsaPortfolio;
  cmaLadder: {
    rungs: LadderRung[];
    note: string;
  };
  glidePath: GlidePathRow[];
}

export interface HistoryEntry {
  id: string;
  date: string; // ISO date, e.g. "2026-09-23"
  newContribution: number; // 만원, 이번 기록 시점에 새로 납입한 금액
  cumulativePrincipal: number; // 만원, 자동 계산 (직전 기록의 누적원금 + newContribution)
  totalValue: number; // 만원, 기록 시점의 총 평가금액 (스냅샷 rows 합계)
  riskValue: number; // 만원
  safeValue: number; // 만원
  cashValue: number; // 만원
  profit: number; // 만원, 자동 계산 (totalValue - cumulativePrincipal)
  returnRate: number; // 비율(0~1), 자동 계산 (profit / cumulativePrincipal)
}

export interface DashboardData {
  rows: AssetRow[];
  simulation: SimulationAssumptions;
  loan: LoanInput;
  checklist: ChecklistItem[];
  strategy: StrategyData;
  history: HistoryEntry[];
}
