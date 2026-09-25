import type { AssetRow, DashboardData, HomePolicy, HomeSimInput, RebalanceGroup } from "./types";
import { monthlyHouseSavings } from "./utils";

// 내 집 마련 시뮬레이터 계산. 금액은 모두 만원 단위.

// 원리금균등 월 상환액
export function monthlyPayment(principal: number, ratePct: number, years: number): number {
  if (principal <= 0) return 0;
  const n = Math.max(1, Math.round(years * 12));
  const r = ratePct / 100 / 12;
  if (r === 0) return principal / n;
  const f = Math.pow(1 + r, n);
  return (principal * r * f) / (f - 1);
}

// 원리금균등으로 끝까지 갚을 때 총이자
export function totalInterest(principal: number, ratePct: number, years: number): number {
  return monthlyPayment(principal, ratePct, years) * Math.max(1, Math.round(years * 12)) - principal;
}

// 월 상환액으로 빌릴 수 있는 최대 원금 (monthlyPayment의 역산)
export function maxPrincipal(monthly: number, ratePct: number, years: number): number {
  if (monthly <= 0) return 0;
  const n = Math.max(1, Math.round(years * 12));
  const r = ratePct / 100 / 12;
  if (r === 0) return monthly * n;
  const f = Math.pow(1 + r, n);
  return (monthly * (f - 1)) / (r * f);
}

// 올해 연봉에서 raisePct씩 해마다 올랐을 때 targetYear의 연봉
export function incomeAt(currentIncome: number, raisePct: number, currentYear: number, targetYear: number): number {
  const times = Math.max(0, targetYear - currentYear);
  return currentIncome * Math.pow(1 + raisePct / 100, times);
}

// 연봉이 threshold를 처음 넘는 해. 이미 넘었으면 올해, 인상률이 0 이하라 못 넘으면 null.
export function yearExceeding(currentIncome: number, raisePct: number, currentYear: number, threshold: number): number | null {
  if (currentIncome > threshold) return currentYear;
  if (currentIncome <= 0 || raisePct <= 0) return null;
  for (let y = currentYear + 1; y <= currentYear + 100; y++) {
    if (incomeAt(currentIncome, raisePct, currentYear, y) > threshold) return y;
  }
  return null;
}

// 연봉 구간별 세후 비율 표를 직선으로 이어서 읽는다. 표 밖은 양 끝 값.
export function afterTaxRatio(table: [number, number][], income: number): number {
  const pts = table.filter(([i, r]) => Number.isFinite(i) && Number.isFinite(r)).sort((a, b) => a[0] - b[0]);
  if (pts.length === 0) return 1;
  if (income <= pts[0][0]) return pts[0][1];
  const last = pts[pts.length - 1];
  if (income >= last[0]) return last[1];
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    if (income >= x0 && income <= x1) return x1 === x0 ? y0 : y0 + ((y1 - y0) * (income - x0)) / (x1 - x0);
  }
  return last[1];
}

export function monthlyAfterTax(table: [number, number][], income: number): number {
  return (income * afterTaxRatio(table, income)) / 12;
}

export type Judge = "ok" | "tight" | "heavy";

export function judgeRatio(ratio: number, judge: HomePolicy["judge"]): Judge {
  if (ratio <= judge.okMax) return "ok";
  if (ratio <= judge.tightMax) return "tight";
  return "heavy";
}

export interface Eligibility {
  ok: boolean;
  reasons: string[]; // 불가 사유
}

export function checkBogeumjari(price: number, loan: number, incomeAtPurchase: number, policy: HomePolicy): Eligibility {
  const p = policy.bogeumjari;
  const reasons: string[] = [];
  if (price > p.maxHousePrice) reasons.push("집값 초과");
  if (incomeAtPurchase > p.maxIncome) reasons.push("소득 초과");
  if (loan > p.maxLoanFirstTime) reasons.push("대출 한도 초과");
  return { ok: reasons.length === 0, reasons };
}

export function checkDidimdolSingle(price: number, loan: number, areaM2: number, policy: HomePolicy): Eligibility {
  const p = policy.didimdolSingle;
  const reasons: string[] = [];
  if (price > p.maxHousePrice) reasons.push("집값 초과");
  if (!(areaM2 > 0)) reasons.push("전용면적 미입력");
  else if (areaM2 > p.maxAreaM2) reasons.push("면적 초과");
  if (loan > p.maxLoanFirstTime) reasons.push("대출 한도 초과");
  return { ok: reasons.length === 0, reasons };
}

// 가용자산: 집 자금 묶음(또는 '집자금' 체크 전체) 합계 + 보증금(선택) + 추가 가용자산 - 부대비용
export interface HomeAssets {
  base: number; // 보증금을 뺀 기준 자산
  extra: number; // 매수 때까지 더 모을 돈 (자동이면 월 저축액 × 남은 달)
  deposit: number; // 항목 이름에 '보증금'이 든 행의 합계
  depositItems: string[];
  equity: number; // 실투입금
  groupName: string | null;
}

export function findHouseGroup(groups: RebalanceGroup[]): RebalanceGroup | null {
  return groups.find((g) => g.name.includes("집")) ?? groups.find((g) => g.targetType === "glide") ?? null;
}

// 매수 예정일까지 남은 달 수 (이번 달 기준, 지났으면 0)
export function monthsUntil(dateStr: string, now: Date): number {
  const d = dateStr ? new Date(`${dateStr}T00:00:00`) : null;
  if (!d || Number.isNaN(d.getTime())) return 0;
  return Math.max(0, (d.getFullYear() - now.getFullYear()) * 12 + (d.getMonth() - now.getMonth()));
}

// autoExtra: extraMode가 auto일 때 쓸 '매수 때까지 더 모을 돈' (보통 월 저축액 × 남은 달)
export function computeHomeAssets(rows: AssetRow[], groups: RebalanceGroup[], input: HomeSimInput, autoExtra = 0): HomeAssets {
  const isDeposit = (r: AssetRow) => r.item.includes("보증금");
  const group = findHouseGroup(groups);
  const inBase = (r: AssetRow) => (input.assetSource === "group" ? !!group && group.accounts.includes(r.account) : r.housingEligible);
  const base = rows.filter((r) => inBase(r) && !isDeposit(r)).reduce((s, r) => s + r.amount, 0);
  const deposits = rows.filter(isDeposit);
  const deposit = deposits.reduce((s, r) => s + r.amount, 0);
  const extra = input.extraMode === "auto" ? Math.max(0, autoExtra) : input.extraAssets || 0;
  const equity = base + (input.includeDeposit ? deposit : 0) + extra - (input.closingCost || 0);
  return { base, extra, deposit, depositItems: deposits.map((r) => r.item), equity, groupName: group?.name ?? null };
}

export interface PriceRow {
  price: number;
  loan: number;
  monthly30: number;
  monthly40: number;
  ratio30: number;
  ratio40: number;
  judge30: Judge;
  judge40: Judge;
  bogeumjari: Eligibility;
  didimdol: Eligibility;
  overLtv: boolean; // 필요 대출이 집값 × LTV를 넘는지
}

export interface HomeResult {
  purchaseYear: number;
  incomeAtPurchase: number;
  afterTaxMonthly: number;
  maxPrice30: number;
  maxPrice40: number;
  rows: PriceRow[];
}

export function computeHome(input: HomeSimInput, equity: number, ratePct: number, purchaseDate: string, now: Date, raisePct: number): HomeResult {
  const currentYear = now.getFullYear();
  const d = purchaseDate ? new Date(`${purchaseDate}T00:00:00`) : null;
  const purchaseYear = d && !Number.isNaN(d.getTime()) ? d.getFullYear() : currentYear;
  const incomeAtPurchase = incomeAt(input.currentIncome, raisePct, currentYear, purchaseYear);
  const afterTaxMonthly = monthlyAfterTax(input.policy.afterTaxRatioTable, incomeAtPurchase);
  const maxMonthly = (afterTaxMonthly * input.targetRatioPct) / 100;
  const ratio = (m: number) => (afterTaxMonthly > 0 ? m / afterTaxMonthly : Infinity);
  const rows = [...input.prices]
    .filter((p) => p > 0)
    .sort((a, b) => a - b)
    .map((price) => {
      const loan = Math.max(0, price - equity);
      const monthly30 = monthlyPayment(loan, ratePct, 30);
      const monthly40 = monthlyPayment(loan, ratePct, 40);
      return {
        price,
        loan,
        monthly30,
        monthly40,
        ratio30: ratio(monthly30),
        ratio40: ratio(monthly40),
        judge30: judgeRatio(ratio(monthly30), input.policy.judge),
        judge40: judgeRatio(ratio(monthly40), input.policy.judge),
        bogeumjari: checkBogeumjari(price, loan, incomeAtPurchase, input.policy),
        didimdol: checkDidimdolSingle(price, loan, input.areaM2, input.policy),
        overLtv: loan > price * input.policy.bogeumjari.ltv,
      };
    });
  return {
    purchaseYear,
    incomeAtPurchase,
    afterTaxMonthly,
    maxPrice30: maxPrincipal(maxMonthly, ratePct, 30) + equity,
    maxPrice40: maxPrincipal(maxMonthly, ratePct, 40) + equity,
    rows,
  };
}

// 정책 숫자를 마지막으로 확인한 지 1년이 넘었는지
export function policyStale(updatedAt: string, now: Date): boolean {
  const d = new Date(`${updatedAt}T00:00:00`);
  if (Number.isNaN(d.getTime())) return true;
  const yearLater = new Date(d);
  yearLater.setFullYear(d.getFullYear() + 1);
  return now.getTime() > yearLater.getTime();
}

// 개요·알림용: 지금 목표 집값(loan.price) 한 채에 대한 판정. 목표 집값이나 연봉이 없으면 null.
export interface TargetCheck {
  result: HomeResult;
  row: PriceRow;
  equity: number;
}

export function evaluateTarget(data: Pick<DashboardData, "rows" | "rebalance" | "home" | "loan" | "strategy" | "budget">, now: Date): TargetCheck | null {
  const { home, loan } = data;
  if (!home || !(loan.price > 0) || !(home.currentIncome > 0)) return null;
  const autoExtra = monthlyHouseSavings(data.budget) * monthsUntil(data.strategy.housePurchaseDate, now);
  const assets = computeHomeAssets(data.rows, data.rebalance.groups, home, autoExtra);
  const result = computeHome({ ...home, prices: [loan.price] }, assets.equity, loan.ratePct, data.strategy.housePurchaseDate, now, data.budget.annualRaisePct);
  return result.rows[0] ? { result, row: result.rows[0], equity: assets.equity } : null;
}

// 목표 집값을 '적정 상환 비중'(목표 비중) 안에서 사려면 매수 때 필요한 가용자산 (부대비용 포함, 개요 그래프와 같은 기준)
// = 집값 − 목표 비중으로 갚을 수 있는 최대 대출 + 부대비용
export function assetsNeededAffordable(check: TargetCheck, years: 30 | 40, closingCost: number): number {
  const maxLoan = (years === 40 ? check.result.maxPrice40 : check.result.maxPrice30) - check.equity;
  return Math.max(0, check.row.price - maxLoan) + Math.max(0, closingCost);
}
