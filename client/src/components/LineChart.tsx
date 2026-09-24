import { niceTicks } from "../chart";

export interface ChartSeries {
  label: string;
  color: string; // CSS 색 (테마 변수 권장)
  points: { t: number; y: number }[]; // t: 시각(ms)
  dashed?: boolean;
  dots?: boolean;
}

interface Props {
  series: ChartSeries[];
  yFormat: (v: number) => string;
  hLines?: { label: string; y: number; color: string }[];
  vLines?: { label: string; t: number; color: string }[];
}

const W = 640;
const H = 240;
const M = { l: 62, r: 18, t: 14, b: 30 };

const ymLabel = (t: number) => {
  const d = new Date(t);
  return `${String(d.getFullYear()).slice(2)}.${String(d.getMonth() + 1).padStart(2, "0")}`;
};

// 시간축 꺾은선 그래프 (SVG). 색과 글자는 테마 변수를 따라서 라이트/다크 모두 읽힌다.
export default function LineChart({ series, yFormat, hLines = [], vLines = [] }: Props) {
  const all = series.flatMap((s) => s.points);
  if (all.length === 0) return null;

  let tMin = Math.min(...all.map((p) => p.t), ...vLines.map((v) => v.t));
  let tMax = Math.max(...all.map((p) => p.t), ...vLines.map((v) => v.t));
  if (tMax - tMin < 86400000) {
    tMin -= 43200000;
    tMax += 43200000;
  }
  const ys = [...all.map((p) => p.y), ...hLines.map((h) => h.y)];
  const yLo = Math.min(...ys);
  const yHi = Math.max(...ys);
  const yTicks = niceTicks(yLo >= 0 ? 0 : yLo, yHi, 4);
  const yMin = yTicks[0];
  const yMax = yTicks[yTicks.length - 1] === yMin ? yMin + 1 : yTicks[yTicks.length - 1];

  const x = (t: number) => M.l + ((t - tMin) / (tMax - tMin)) * (W - M.l - M.r);
  const y = (v: number) => H - M.b - ((v - yMin) / (yMax - yMin)) * (H - M.t - M.b);
  const xTicks = Array.from({ length: 4 }, (_, i) => tMin + ((tMax - tMin) * i) / 3);

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={series.map((s) => s.label).join(", ")}>
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={M.l} x2={W - M.r} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth={1} />
            <text x={M.l - 8} y={y(v) + 4} textAnchor="end" fontSize={11} fill="var(--ink-soft)">
              {yFormat(v)}
            </text>
          </g>
        ))}
        {xTicks.map((t) => (
          <text key={t} x={x(t)} y={H - 8} textAnchor="middle" fontSize={11} fill="var(--ink-soft)">
            {ymLabel(t)}
          </text>
        ))}
        {hLines.map((h) => (
          <g key={h.label}>
            <line x1={M.l} x2={W - M.r} y1={y(h.y)} y2={y(h.y)} stroke={h.color} strokeWidth={1.5} strokeDasharray="6 4" />
            <text x={M.l + 6} y={y(h.y) - 5} textAnchor="start" fontSize={11} fill={h.color}>
              {h.label}
            </text>
          </g>
        ))}
        {vLines.map((v) => (
          <g key={v.label}>
            <line x1={x(v.t)} x2={x(v.t)} y1={M.t} y2={H - M.b} stroke={v.color} strokeWidth={1.5} strokeDasharray="2 4" />
            <text x={x(v.t) - 4} y={M.t + 10} textAnchor="end" fontSize={11} fill={v.color}>
              {v.label}
            </text>
          </g>
        ))}
        {series.map((s) => (
          <g key={s.label}>
            <polyline
              fill="none"
              stroke={s.color}
              strokeWidth={2.2}
              strokeLinejoin="round"
              strokeLinecap="round"
              strokeDasharray={s.dashed ? "7 5" : undefined}
              points={s.points.map((p) => `${x(p.t)},${y(p.y)}`).join(" ")}
            />
            {(s.dots ?? true) && s.points.map((p, i) => <circle key={i} cx={x(p.t)} cy={y(p.y)} r={3.2} fill={s.color} />)}
          </g>
        ))}
      </svg>
      <div className="chart-legend">
        {series.map((s) => (
          <span key={s.label}>
            <i style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
