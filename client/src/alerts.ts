import type { DashboardData } from "./types";
import { computeRebalance, groupTarget } from "./rebalance";
import { computePensionCredit } from "./pension";
import { evaluateTarget, incomeAt, policyStale } from "./home";
import { computeSubscription, thisYearValues } from "./tax";

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
    out.push({ id: "snapshot-none", level: "info", text: "히스토리 기록이 아직 없어. 자산 스냅샷 탭에서 첫 기록을 남기면 수익률과 그래프가 생겨.", tab: "snapshot" });
  } else {
    const age = daysBetween(latest.date, now);
    if (age !== null && age >= SNAPSHOT_STALE_DAYS) {
      out.push({ id: "snapshot-stale", level: "warn", text: `마지막 스냅샷 기록이 ${age}일 전이야. 잔액을 갱신하고 새 기록을 남겨줘.`, tab: "snapshot" });
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
        text: `${g.name}: 위험 비중 ${r.riskPct.toFixed(1)}%가 목표 ${target.toFixed(1)}%에서 ${Math.abs(r.driftPct).toFixed(1)}%p 벗어났어 (허용 ±${data.rebalance.tolerancePct}%p).`,
        tab: "rebalance",
      });
    }
  }

  // 3) ISA 의무가입 종료가 가까운지
  if (data.strategy.isaDutyEndDate) {
    const left = daysBetween(data.strategy.isaDutyEndDate, now);
    if (left !== null && left <= 0 && left >= -ISA_DUTY_WARN_DAYS) {
      out.push({ id: "isa-duty", level: "info", text: `ISA 의무가입 종료까지 D-${-left}일 남았어.`, tab: "overview" });
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
    out.push({ id: "price-stale", level: "info", text: `1주 가격 기준일이 ${PRICE_STALE_DAYS}일 넘게 지난 상품이 ${stale.size}개 있어. 거래 전에 가격을 다시 불러와줘.`, tab: "rebalance" });
  }

  // 5) 연말이 가까운데 세액공제 한도가 남았는지
  const pension = computePensionCredit(data.budget, now);
  if (pension.remaining > 0 && pension.daysToYearEnd <= PENSION_WARN_DAYS) {
    out.push({
      id: "pension-limit",
      level: "info",
      text: `연말까지 ${pension.daysToYearEnd}일 남았고 연금저축·IRP 세액공제 한도가 ${Math.round(pension.remaining * 10000).toLocaleString("ko-KR")}원 남았어.`,
      tab: "tax",
    });
  }

  // 6) 내 집 마련: 정책 숫자가 오래됐거나, 매수 전에 연봉이 보금자리론 소득 기준을 넘을 것 같으면
  const home = data.home;
  if (home) {
    if (policyStale(home.policy.updatedAt, now)) {
      out.push({ id: "home-policy-stale", level: "info", text: `대출 정책 숫자를 마지막으로 확인한 날(${home.policy.updatedAt})이 1년 넘게 지났어. 내 집 마련 탭에서 다시 확인해줘.`, tab: "loan" });
    }
    const d = data.strategy.housePurchaseDate ? new Date(`${data.strategy.housePurchaseDate}T00:00:00`) : null;
    if (home.currentIncome > 0 && d && !Number.isNaN(d.getTime())) {
      const raise = data.budget.annualRaisePct || 0;
      const at = incomeAt(home.currentIncome, raise, now.getFullYear(), d.getFullYear());
      if (at > home.policy.bogeumjari.maxIncome) {
        out.push({
          id: "home-income",
          level: "warn",
          text: `연봉 상승률 ${raise}%(내 정보 탭)로 보면 ${d.getFullYear()}년 매수 때 연봉이 보금자리론 소득 기준(${Math.round(home.policy.bogeumjari.maxIncome * 10000).toLocaleString("ko-KR")}원)을 넘어. 집을 먼저 사고 이직하는 순서를 고려해줘.`,
          tab: "loan",
        });
      }
    }
  }

  // 연말정산 준비: 공제 기준 숫자가 오래됐거나, 연말이 가까운데 주택청약 소득공제 한도가 남았으면
  const tp = data.budget.taxPrep;
  if (tp) {
    if (policyStale(tp.policy.updatedAt, now)) {
      out.push({ id: "tax-policy-stale", level: "info", text: `연말정산 공제 기준 숫자를 마지막으로 확인한 날(${tp.policy.updatedAt})이 1년 넘게 지났어. 연말정산 탭에서 다시 확인해줘.`, tab: "tax" });
    }
    const income = data.home?.currentIncome ?? 0;
    const sub = computeSubscription(thisYearValues(tp, now), income);
    // 올해 납입액을 입력한 경우(청약을 넣고 있는 경우)에만 알린다
    if (sub.eligible && sub.paid > 0 && sub.remaining > 0 && pension.daysToYearEnd <= PENSION_WARN_DAYS) {
      out.push({
        id: "tax-subscription",
        level: "info",
        text: `주택청약 소득공제 한도까지 ${Math.round(sub.remaining * 10000).toLocaleString("ko-KR")}원 더 넣을 수 있어 (연말까지 ${pension.daysToYearEnd}일).`,
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
      out.push({ id: "home-target-heavy", level: "warn", text: `목표 집값 ${price}은 40년 만기로도 월 상환이 세후 월급의 ${ratio40}라 부담이야.`, tab: "loan" });
    } else if (row.judge40 === "tight") {
      out.push({ id: "home-target-tight", level: "info", text: `목표 집값 ${price}은 40년 만기 기준 월 상환이 세후 월급의 ${ratio40}라 빠듯해.`, tab: "loan" });
    }
    if (row.overLtv) {
      out.push({ id: "home-target-ltv", level: "warn", text: `목표 집값 ${price}은 필요 대출이 집값의 LTV 한도를 넘어. 자기자금을 더 모으거나 집값을 낮춰야 해.`, tab: "loan" });
    }
    if (!row.bogeumjari.ok) {
      out.push({ id: "home-target-bogeumjari", level: "info", text: `목표 집값 ${price}은 보금자리론 조건에 안 맞아 (${row.bogeumjari.reasons.join(", ")}).`, tab: "loan" });
    }
  }

  return out;
}
