import type { DashboardData } from "./types";
import { computeRebalance, groupTarget } from "./rebalance";
import { computePensionCredit } from "./pension";

export interface Alert {
  id: string;
  level: "warn" | "info";
  text: string;
  tab?: "snapshot" | "rebalance" | "budget" | "overview";
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
      tab: "budget",
    });
  }

  return out;
}
