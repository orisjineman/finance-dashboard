export type AssetCategory = "risk" | "safe" | "cash";

export interface AssetRow {
  id: string;
  name: string;
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

export interface DashboardData {
  rows: AssetRow[];
  simulation: SimulationAssumptions;
  loan: LoanInput;
  checklist: ChecklistItem[];
  strategy: StrategyData;
}
