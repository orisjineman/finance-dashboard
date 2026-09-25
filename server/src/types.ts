export type AssetCategory = "risk" | "safe" | "cash";

export interface AssetRow {
  id: string;
  account: string; // 계좌 (예: "A증권 IRP", "CMA")
  item: string; // 항목/종목 (예: "미국 S&P500 ETF", "예수금")
  category: AssetCategory;
  amount: number; // 만원
  unitPrice?: number; // 만원, 1주(1좌) 가격. 비워두면 금액 단위(소수점·RP·예수금)로 거래한다고 본다
  ticker?: string; // 종목코드(예: 360750). 시세 자동 불러오기에 사용
  priceDate?: string; // 1주 가격을 자동으로 불러온 기준일(YYYY-MM-DD). 없으면 직접 입력한 값
  rebalanceRule?: "hold" | "preferred"; // hold: 리밸런싱 때 팔지도 더 사지도 않음(만기 보유 채권 등), preferred: 매수는 이 상품에만
  excludeFromReturn?: boolean; // true면 투자 수익률 계산에서 제외 (입출금 통장, 전세·월세 보증금 등). 비어 있으면 포함
  costBasis?: number; // 만원, 이 행의 매입 원금. 일반 과세 계좌에서 팔 때 예상 세금을 계산하는 데 쓴다
  housingEligible: boolean; // false면 집 마련 가용자산 계산에서 제외 (연금저축·IRP 등)
}

export interface SimulationAssumptions {
  contributionMode?: "auto" | "manual"; // auto: 내 정보 탭 (월 저축 가능액 × 12 + 연금 세액공제 환급), manual: annualContribution
  annualContribution: number; // 만원 (manual일 때)
  years: number;
  riskRate: number; // %
  safeRate: number; // %
  contributionRiskRatio: number; // %
  scenarios?: SimulationScenario[]; // 시나리오 비교용 추가 가정 (현재 입력값과 나란히 비교)
  baseMode?: "invest" | "total"; // 시뮬레이션 시작 자산: 투자자산(기본) / 전체 자산 (통장·보증금 등은 수익 0%)
  applySalaryRaise: boolean; // true면 매년 적립액에 예산 탭의 연봉 상승률을 복리로 반영
}

export interface SimulationScenario {
  id: string;
  name: string;
  riskRate: number; // %
  safeRate: number; // %
  annualContribution: number; // 만원
  contributionRiskRatio: number; // %
}

export interface LoanInput {
  price: number; // 만원
  ratePct: number;
}

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface GlidePathRow {
  id: string;
  yearsLeft: number; // 집 매수까지 남은 기간(년)
  riskPct: number; // 그때의 목표 위험자산 비중(%). 지점 사이는 직선으로 이어서 계산
}

export interface StrategyData {
  housePurchaseDate: string; // 집 매수 예정일 (ISO), 글리드 패스 계산 기준
  isaDutyEndDate: string; // ISO date, e.g. "2028-10-17", or "" if unset
  overviewSummary: string[];
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
  housingLiquid?: number; // 만원, 기록 시점의 집 마련 가용자산
  totalAssets?: number; // 만원, 기록 시점의 전체 자산 (통장·보증금·청약 포함)
  profit: number; // 만원, 자동 계산 (totalValue - cumulativePrincipal)
  returnRate: number; // 비율(0~1), 자동 계산 (profit / cumulativePrincipal)
}

export interface BudgetCategory {
  id: string;
  name: string; // 예: "주거비", "생활비"
  amount: number; // 만원, 월 예산
}

export interface TaxPrepPolicy {
  pension?: { lowIncomeMax: number; rateLowPct: number; ratePct: number }; // 연금저축·IRP 세액공제율: 총급여가 lowIncomeMax 이하면 rateLowPct, 넘으면 ratePct
  rent: { incomeMax: number; lowIncomeMax: number; rateLowPct: number; ratePct: number; limit: number }; // 월세 세액공제 (만원, %)
  subscription: { incomeMax: number; limit: number; ratePct: number }; // 주택청약 소득공제
  card: { thresholdPct: number; creditRatePct: number; debitRatePct: number; limitLow: number; limitHigh: number; limitIncome: number }; // 신용·체크카드 소득공제
  marginalRatePct: number; // 소득공제액을 세금으로 환산할 때 쓰는 한계세율(지방소득세 포함)
  updatedAt: string; // 숫자를 마지막으로 확인한 날 (YYYY-MM-DD)
}

export interface TaxPrepInput {
  year?: number; // 아래 '올해' 값들이 어느 해 것인지 (해가 바뀌면 0으로 본다)
  rentMonthly: number; // 만원, 월세
  rentPaid: number; // 만원, 올해 이미 낸 월세
  subscriptionPaid: number; // 만원, 올해 주택청약 납입액
  creditCardUsed: number; // 만원, 올해 신용카드 사용액
  debitCardUsed: number; // 만원, 올해 체크카드·현금영수증 사용액
  policy: TaxPrepPolicy;
}

export interface BudgetData {
  monthlyNetIncome: number; // 만원, 월 실수령액
  annualRaisePct: number; // %, 예상 연간 월급 상승률
  expenseCategories: BudgetCategory[];
  pensionAnnualContribution: number; // 만원, 연금저축+IRP 연간 납입 계획액
  pensionTaxCreditRate: number; // %, 세액공제율 (13.2 또는 16.5)
  // 연말정산 환급을 어디에 쓰는지. pension: 연금 납입에 보탬(연간 납입액 = 월급 몫 + 환급 몫), retirement: 노후 자금에 따로, house: 집 마련 자금
  refundTo?: "pension" | "retirement" | "house";
  refundBasis?: "pension" | "estimate" | "manual"; // 환급 예상액 기준: 연금 세액공제분만(가장 확실) / 연말정산 탭 추정 합계 / 직접 입력
  refundManual?: number; // 만원, refundBasis가 manual일 때
  refundExpected?: number; // 만원, 위 기준으로 계산한 연간 환급 예상액 (화면에서 계산해서 채움, 저장값은 참고용)
  pensionCreditLimit?: number; // 만원, 세액공제 대상 납입 한도 (연금저축+IRP 합산). 없으면 900
  pensionPaidThisYear?: number; // 만원, 올해 실제로 납입한 금액
  taxPrep?: TaxPrepInput; // 연말정산 준비 카드
  pensionPaidYear?: number; // pensionPaidThisYear 가 어느 해의 값인지 (해가 바뀌면 0으로 본다)
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
  riskAccess?: Record<string, "allowed" | "blocked">; // 계좌별 위험자산 편입 가능/불가. 없으면 위험 상품이 있는 계좌를 가능으로 자동 판단
  feePct?: number; // 매매 수수료율(%). 없으면 0.015
  taxRatePct?: number; // 일반 과세 계좌 매도 차익에 붙는 세율(%). 없으면 15.4
  depositLimit?: Record<string, number>; // 계좌별 '이번에 넣을 수 있는 금액'(만원). 다른 계좌에서 옮겨 올 수 있는 한도이고, 없으면 0
}

export interface HomePolicy {
  bogeumjari: { maxHousePrice: number; maxIncome: number; maxLoanFirstTime: number; ltv: number }; // 만원, ltv는 0~1 (목표 집값의 필요 자기자금 계산에도 이 값 하나만 쓴다)
  didimdolSingle: { maxHousePrice: number; maxAreaM2: number; maxLoanFirstTime: number };
  afterTaxRatioTable: [number, number][]; // [연 총보수(만원), 세후 비율]
  judge: { okMax: number; tightMax: number }; // 상환비중(0~1) 판정 기준
  updatedAt: string; // 정책 숫자를 마지막으로 확인한 날 (YYYY-MM-DD)
}

export interface HomeSimInput {
  assetSource: "group" | "housing"; // 가용자산 기준: 자산 스냅샷에서 '집자금' 체크한 전체(기본, 개요·시뮬레이션과 같음) / 집 자금 리밸런싱 묶음
  includeDeposit: boolean; // 보증금(항목 이름에 '보증금'이 들어간 행)을 가용자산에 더할지
  projectWithReturns?: boolean; // 집 마련 예상 경로에 시뮬레이션 탭의 기대수익률을 반영할지 (기본: 반영 안 함)
  extraMode?: "auto" | "manual"; // auto: 집 마련 월 저축액 × 매수까지 남은 달 (개요 예상 경로와 같은 값), manual: extraAssets 그대로
  extraAssets: number; // 만원, 매수 시점까지 더 모을 금액 (extraMode가 manual일 때)
  closingCost: number; // 만원, 취득세·중개수수료·법무·이사
  currentIncome: number; // 만원, 대출 심사용 현재 연 총보수
  targetRatioPct: number; // %, 세후 월급 대비 목표 월 상환 비중
  areaM2: number; // 예상 전용면적(㎡), 0이면 미입력
  prices: number[]; // 만원, 비교할 집값
  incomeThreshold: number; // 만원, 도달 연도를 볼 연봉 기준 (보금자리론 소득 기준과 같게 두면 됨)
  policy: HomePolicy;
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
  home: HomeSimInput;
}
