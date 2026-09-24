export type AssetCategory = "risk" | "safe" | "cash";

export interface AssetRow {
  id: string;
  account: string; // 계좌 (예: "신한투자증권 IRP", "CMA")
  item: string; // 항목/종목 (예: "RISE 미국S&P500", "예수금")
  category: AssetCategory;
  amount: number; // 만원
  unitPrice?: number; // 만원, 1주(1좌) 가격. 비워두면 금액 단위(소수점·RP·예수금)로 거래한다고 본다
  ticker?: string; // 종목코드(예: 360750). 시세 자동 불러오기에 사용
  priceDate?: string; // 1주 가격을 자동으로 불러온 기준일(YYYY-MM-DD). 없으면 직접 입력한 값
  rebalanceRule?: "hold" | "preferred"; // hold: 리밸런싱 때 팔지도 더 사지도 않음(만기 보유 채권 등), preferred: 매수는 이 상품에만
  excludeFromReturn?: boolean; // true면 투자 수익률 계산에서 제외 (입출금 통장, 월세보증금 등). 비어 있으면 포함
  housingEligible: boolean; // false면 집 마련 가용자산 계산에서 제외 (연금저축·IRP 등)
}

export interface SimulationAssumptions {
  annualContribution: number; // 만원
  years: number;
  riskRate: number; // %
  safeRate: number; // %
  contributionRiskRatio: number; // %
  applySalaryRaise: boolean; // true면 매년 적립액에 예산 탭의 연봉 상승률을 복리로 반영
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

export interface BudgetCategory {
  id: string;
  name: string; // 예: "주거비", "생활비"
  amount: number; // 만원, 월 예산
}

export interface BudgetData {
  monthlyNetIncome: number; // 만원, 월 실수령액
  annualRaisePct: number; // %, 예상 연간 월급 상승률
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
