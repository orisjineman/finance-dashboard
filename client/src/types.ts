export type AssetCategory = "risk" | "safe" | "cash";

export interface AssetRow {
  id: string;
  account: string;
  item: string;
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
  isaDutyEndDate: string;
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
  date: string;
  newContribution: number;
  cumulativePrincipal: number;
  totalValue: number;
  riskValue: number;
  safeValue: number;
  cashValue: number;
  profit: number;
  returnRate: number;
}

export interface DashboardData {
  rows: AssetRow[];
  simulation: SimulationAssumptions;
  loan: LoanInput;
  checklist: ChecklistItem[];
  strategy: StrategyData;
  history: HistoryEntry[];
}

export interface ImportPreviewRow extends AssetRow {
  sheet: string;
}

export interface ImportPreview {
  rows: ImportPreviewRow[];
  sheetsExamined: string[];
}
