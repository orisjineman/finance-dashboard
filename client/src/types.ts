export type AssetCategory = "risk" | "safe" | "cash";

export interface AssetRow {
  id: string;
  account: string;
  item: string;
  category: AssetCategory;
  amount: number; // 만원
  unitPrice?: number; // 만원, 1주(1좌) 가격. 비워두면 금액 단위(소수점·RP·예수금)로 거래한다고 본다
  rebalanceRule?: "hold" | "preferred"; // hold: 리밸런싱 때 매도하지 않음(만기 보유 채권 등), preferred: 매수는 이 상품에만
  housingEligible: boolean; // false면 집 마련 가용자산 계산에서 제외 (연금저축·IRP 등)
}

export interface SimulationAssumptions {
  annualContribution: number; // 만원
  years: number;
  riskRate: number; // %
  safeRate: number; // %
  contributionRiskRatio: number; // %
  applySalaryRaise: boolean; // 매년 적립액에 연봉 상승률을 복리로 반영할지
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
  yearsLeft: number; // 집 매수까지 남은 기간(년)
  riskPct: number; // 그때의 목표 위험자산 비중(%). 지점 사이는 직선으로 이어서 계산
}

export interface IsaPortfolio {
  riskPct: number;
  safePct: number;
  riskProduct: string;
  safeProduct: string;
  dutyNote: string;
}

export interface StrategyData {
  housePurchaseDate: string; // 집 매수 예정일 (ISO), 글리드 패스 계산 기준
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

export interface BudgetCategory {
  id: string;
  name: string;
  amount: number; // 만원
}

export interface BudgetData {
  monthlyNetIncome: number; // 만원
  annualRaisePct: number; // %
  expenseCategories: BudgetCategory[];
  pensionAnnualContribution: number; // 만원, 연금저축+IRP 연간 납입 계획액
  pensionTaxCreditRate: number; // %, 세액공제율 (13.2 또는 16.5)
}

export interface RebalanceGroup {
  id: string;
  name: string; // 예: "집 자금", "노후 자금"
  accounts: string[]; // 이 묶음에 들어가는 계좌
  targetType: "glide" | "fixed"; // glide: 집 매수 예정일까지 남은 기간에 따른 글리드 패스, fixed: 고정 비중
  fixedRiskPct: number; // targetType이 fixed일 때의 목표 위험자산 비중(%)
  note: string;
}

export interface RebalanceSettings {
  tolerancePct: number; // 허용 오차 (%p), 이 안이면 리밸런싱 불필요
  groups: RebalanceGroup[];
}

export interface DashboardData {
  rows: AssetRow[];
  simulation: SimulationAssumptions;
  loan: LoanInput;
  checklist: ChecklistItem[];
  strategy: StrategyData;
  history: HistoryEntry[];
  budget: BudgetData;
  rebalance: RebalanceSettings;
}

export interface ImportPreviewRow extends AssetRow {
  sheet: string;
}

export interface ImportPreview {
  rows: ImportPreviewRow[];
  sheetsExamined: string[];
}
