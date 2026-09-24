export interface HousingProjection {
  reachDate: Date | null; // 목표 자기자금에 닿는 예상 시점 (닿을 수 없으면 null)
  points: { t: number; y: number }[]; // 지금부터 예상 경로 (만원)
  onTrack: boolean | null; // 집 매수 예정일 안에 닿는지 (예정일이 없으면 null)
  monthsToReach: number | null;
}

const MONTH_MS = 30.4375 * 86400000;

// 지금 가용자산에서 매달 monthlyAdd(만원)씩 모을 때 필요 자기자금(target)에 언제 닿는지 직선으로 예상한다. (수익률은 반영하지 않는다)
export function projectHousing(o: { current: number; target: number; monthlyAdd: number; now: Date; purchaseDate: string }): HousingProjection {
  const { current, target, monthlyAdd, now, purchaseDate } = o;
  const purchase = purchaseDate ? new Date(`${purchaseDate}T00:00:00`) : null;
  const purchaseOk = purchase !== null && !Number.isNaN(purchase.getTime());
  const start = { t: now.getTime(), y: current };

  if (target > 0 && current >= target) {
    return { reachDate: now, points: [start], onTrack: purchaseOk ? true : null, monthsToReach: 0 };
  }
  if (target <= 0 || monthlyAdd <= 0) {
    return { reachDate: null, points: [start], onTrack: purchaseOk ? false : null, monthsToReach: null };
  }
  const months = (target - current) / monthlyAdd;
  const reach = new Date(now.getTime() + months * MONTH_MS);
  return {
    reachDate: reach,
    points: [start, { t: reach.getTime(), y: target }],
    onTrack: purchaseOk ? reach.getTime() <= (purchase as Date).getTime() : null,
    monthsToReach: months,
  };
}
