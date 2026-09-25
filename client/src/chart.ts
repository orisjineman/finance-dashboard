// 그래프용 눈금 계산. [min, max] 를 덮는 깔끔한 눈금(1·2·5 × 10^n 간격)을 돌려준다.
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0];
  if (max <= min) return [min];
  const raw = (max - min) / Math.max(1, count);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  const first = Math.floor(min / step);
  const last = Math.ceil(max / step);
  const ticks: number[] = [];
  for (let i = first; i <= last; i++) ticks.push(Number((i * step).toPrecision(12)));
  return ticks;
}

// 시각 t에서 꺾은선의 값 (양옆 점을 직선으로 이어 읽는다). 선이 없는 구간(처음 점 이전·마지막 점 이후)이면 null.
export function valueAt(points: { t: number; y: number }[], t: number): number | null {
  if (points.length === 0) return null;
  const pts = [...points].sort((a, b) => a.t - b.t);
  if (t < pts[0].t || t > pts[pts.length - 1].t) return null;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (t >= a.t && t <= b.t) return b.t === a.t ? b.y : a.y + ((b.y - a.y) * (t - a.t)) / (b.t - a.t);
  }
  return pts[pts.length - 1].y;
}
