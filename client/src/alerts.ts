import type { DashboardData } from "./types";
import { computeRebalance, groupTarget } from "./rebalance";
import { computePensionCredit } from "./pension";
import { evaluateTarget, incomeAt, policyStale } from "./home";
import { computeSubscription, thisYearValues } from "./tax";
import { lastRecordDue } from "./returns";

export interface Alert {
  id: string;
  level: "warn" | "info";
  text: string;
  tab?: "snapshot" | "rebalance" | "budget" | "tax" | "overview" | "loan";
}

const DAY = 86400000;
export const SNAPSHOT_STALE_DAYS = 30;
export const PRICE_STALE_DAYS = 14;
export const ISA_DUTY_WARN_DAYS = 90;
export const PENSION_WARN_DAYS = 100;

function daysBetween(fromIso: string, now: Date): number | null {
  const d = new Date(`${fromIso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((today.getTime() - d.getTime()) / DAY);
}

// 지금 점검하면 좋은 것들을 모아서 돌려준다. (조치가 필요하면 warn, 참고면 info)
export function computeAlerts(data: DashboardData, now: Date = new Date()): Alert[] {
  const out: Alert[] = [];

  // 1) 스냅샷 기록이 오래됐는지
  const latest = [...data.history].sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!latest) {
    out.push({ id: "snapshot-none", level: "info", text: "히스토리 기록이 없어. 스냅샷 탭에서 첫 기록을 남겨줘.", tab: "snapshot" });
  } else if (data.strategy.recordDay) {
    // 매달 기록일을 정했으면: 가장 최근 기록일 3일 전 이후 기록이 없을 때 알린다 (조금 일찍 기록해도 괜찮게)
    const due = lastRecordDue(data.strategy.recordDay, now);
    const grace = new Date(`${due}T00:00:00`);
    grace.setDate(grace.getDate() - 3);
    const graceIso = `${grace.getFullYear()}-${String(grace.getMonth() + 1).padStart(2, "0")}-${String(grace.getDate()).padStart(2, "0")}`;
    if (latest.date < graceIso) {
      out.push({ id: "snapshot-due", level: "warn", text: `기록일(${Number(due.slice(5, 7))}월 ${Number(due.slice(8))}일)이 지났어. 잔액 갱신 후 히스토리에 기록해줘.`, tab: "snapshot" });
    }
  } else {
    const age = daysBetween(latest.date, now);
    if (age !== null && age >= SNAPSHOT_STALE_DAYS) {
      out.push({ id: "snapshot-stale", level: "warn", text: `마지막 스냅샷 기록이 ${age}일 전이야. 잔액 갱신 후 기록해줘.`, tab: "snapshot" });
    }
  }

  // 2) 묶음별 리밸런싱 필요 여부
  for (const g of data.rebalance.groups) {
    const target = groupTarget(g, data.strategy);
    if (target === null) continue;
    const r = computeRebalance(data.rows, g.accounts, target, data.rebalance.tolerancePct, data.rebalance.riskAccess ?? {}, data.rebalance.depositLimit ?? {});
    if (r.needsRebalance) {
      out.push({
        id: `rebalance-${g.id}`,
        level: "warn",
        text: `${g.name}: 위험 ${r.riskPct.toFixed(1)}% (목표 ${target.toFixed(1)}%, ${Math.abs(r.driftPct).toFixed(1)}%p 벗어남)`,
        tab: "rebalance",
      });
    }
  }

  // 3) ISA 의무가입 종료가 가까운지
  if (data.strategy.isaDutyEndDate) {
    const left = daysBetween(data.strategy.isaDutyEndDate, now);
    if (left !== null && left <= 0 && left >= -ISA_DUTY_WARN_DAYS) {
      out.push({ id: "isa-duty", level: "info", text: `ISA 의무가입 종료 D-${-left}`, tab: "overview" });
    }
  }

  // 4) 자동으로 불러온 1주 가격이 오래됐는지
  const stale = new Set<string>();
  for (const r of data.rows) {
    if (!r.priceDate || !(r.unitPrice && r.unitPrice > 0)) continue;
    const age = daysBetween(r.priceDate, now);
    if (age !== null && age >= PRICE_STALE_DAYS) stale.add(r.item);
  }
  if (stale.size > 0) {
    out.push({ id: "price-stale", level: "info", text: `1주 가격이 ${PRICE_STALE_DAYS}일 넘은 상품 ${stale.size}개. 거래 전에 다시 불러와줘.`, tab: "rebalance" });
  }

  // 5) 연말이 가까운데 세액공제 한도가 남았는지
  const pension = computePensionCredit(data.budget, now);
  if (pension.remaining > 0 && pension.daysToYearEnd <= PENSION_WARN_DAYS) {
    out.push({
      id: "pension-limit",
      level: "info",
      text: `연금 세액공제 한도 ${Math.round(pension.remaining * 10000).toLocaleString("ko-KR")}원 남음 (연말까지 ${pension.daysToYearEnd}일)`,
      tab: "tax",
    });
  }

  // 6) 내 집 마련: 정책 숫자가 오래됐거나, 매수 전에 연봉이 보금자리론 소득 기준을 넘을 것 같으면
  const home = data.home;
  if (home) {
    if (policyStale(home.policy.updatedAt, now)) {
      out.push({ id: "home-policy-stale", level: "info", text: `대출 정책 숫자 확인 1년 경과 (${home.policy.updatedAt})`, tab: "loan" });
    }
    const d = data.strategy.housePurchaseDate ? new Date(`${data.strategy.housePurchaseDate}T00:00:00`) : null;
    if (home.currentIncome > 0 && d && !Number.isNaN(d.getTime())) {
      const raise = data.budget.annualRaisePct || 0;
      const at = incomeAt(home.currentIncome, raise, now.getFullYear(), d.getFullYear());
      if (at > home.policy.bogeumjari.maxIncome) {
        out.push({
          id: "home-income",
          level: "warn",
          text: `${d.getFullYear()}년 매수 때 연봉이 보금자리론 소득 기준(${Math.round(home.policy.bogeumjari.maxIncome * 10000).toLocaleString("ko-KR")}원)을 넘어 (상승률 ${raise}%). 집 먼저, 이직은 나중에.`,
          tab: "loan",
        });
      }
    }
  }

  // 연말정산 준비: 공제 기준 숫자가 오래됐거나, 연말이 가까운데 주택청약 소득공제 한도가 남았으면
  const tp = data.budget.taxPrep;
  if (tp) {
    if (policyStale(tp.policy.updatedAt, now)) {
      out.push({ id: "tax-policy-stale", level: "info", text: `연말정산 공제 기준 확인 1년 경과 (${tp.policy.updatedAt})`, tab: "tax" });
    }
    const income = data.home?.currentIncome ?? 0;
    const sub = computeSubscription(thisYearValues(tp, now), income);
    // 올해 납입액을 입력한 경우(청약을 넣고 있는 경우)에만 알린다
    if (sub.eligible && sub.paid > 0 && sub.remaining > 0 && pension.daysToYearEnd <= PENSION_WARN_DAYS) {
      out.push({
        id: "tax-subscription",
        level: "info",
        text: `주택청약 공제 한도 ${Math.round(sub.remaining * 10000).toLocaleString("ko-KR")}원 남음 (연말까지 ${pension.daysToYearEnd}일)`,
        tab: "tax",
      });
    }
  }

  // 7) 목표 집값(내 집 마련 탭 '목표로')이 상환 부담·LTV·대출 자격에 걸리는지
  const target = evaluateTarget(data, now);
  if (target) {
    const { row } = target;
    const price = `${(row.price / 10000).toFixed(row.price % 1000 === 0 ? 1 : 2)}억`;
    const ratio40 = `${(row.ratio40 * 100).toFixed(1)}%`;
    if (row.judge40 === "heavy") {
      out.push({ id: "home-target-heavy", level: "warn", text: `목표 ${price}: 40년 월 상환이 세후 월급의 ${ratio40} (부담)`, tab: "loan" });
    } else if (row.judge40 === "tight") {
      out.push({ id: "home-target-tight", level: "info", text: `목표 ${price}: 40년 월 상환이 세후 월급의 ${ratio40} (빠듯)`, tab: "loan" });
    }
    if (row.overLtv) {
      out.push({ id: "home-target-ltv", level: "warn", text: `목표 ${price}: 필요 대출이 LTV 한도 초과`, tab: "loan" });
    }
    if (!row.bogeumjari.ok) {
      out.push({ id: "home-target-bogeumjari", level: "info", text: `목표 ${price}: 보금자리론 불가 (${row.bogeumjari.reasons.join(", ")})`, tab: "loan" });
    }
  }

  return out;
}
