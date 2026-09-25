import { useState, type PointerEvent } from "react";
import { niceTicks, valueAt } from "../chart";

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
  valueFormat?: (v: number) => string; // 마우스를 올렸을 때 보여줄 값 형식 (없으면 yFormat)
}

const W = 640;
const H = 240;
const M = { l: 62, r: 18, t: 14, b: 30 };

const dateLabel = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
};

const ymLabel = (t: number) => {
  const d = new Date(t);
  return `${String(d.getFullYear()).slice(2)}.${String(d.getMonth() + 1).padStart(2, "0")}`;
};

// 시간축 꺾은선 그래프 (SVG). 색과 글자는 테마 변수를 따라서 라이트/다크 모두 읽힌다.
export default function LineChart({ series, yFormat, hLines = [], vLines = [], valueFormat }: Props) {
  const [hoverT, setHoverT] = useState<number | null>(null);
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
  const fmt = valueFormat ?? yFormat;

  // 마우스(터치) 위치의 시각을 구해 그 세로선의 값들을 보여준다
  function onPointer(e: PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const vx = ((e.clientX - rect.left) / rect.width) * W;
    const clamped = Math.min(W - M.r, Math.max(M.l, vx));
    setHoverT(tMin + ((clamped - M.l) / (W - M.l - M.r)) * (tMax - tMin));
  }
  const hover =
    hoverT === null
      ? null
      : {
          x: x(hoverT),
          rows: [
            ...series.map((s) => ({ label: s.label, color: s.color, v: valueAt(s.points, hoverT) })).filter((r) => r.v !== null),
            ...hLines.map((h) => ({ label: h.label, color: h.color, v: h.y as number | null })),
          ] as { label: string; color: string; v: number }[],
        };

  return (
    <div className="chart">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={series.map((s) => s.label).join(", ")}
        onPointerMove={onPointer}
        onPointerDown={onPointer}
        onPointerLeave={() => setHoverT(null)}
      >
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
        {hover && (
          <g pointerEvents="none">
            <line x1={hover.x} x2={hover.x} y1={M.t} y2={H - M.b} stroke="var(--ink-soft)" strokeWidth={1} strokeDasharray="3 3" />
            {hover.rows
              .filter((r) => series.some((s) => s.label === r.label))
              .map((r) => (
                <circle key={r.label} cx={hover.x} cy={y(r.v)} r={4.5} fill={r.color} stroke="var(--paper)" strokeWidth={1.5} />
              ))}
          </g>
        )}
      </svg>
      {hover && hoverT !== null && (
        <div
          className="chart-tip"
          role="status"
          style={hover.x / W > 0.6 ? { right: `${(1 - hover.x / W) * 100 + 1.5}%` } : { left: `${(hover.x / W) * 100 + 1.5}%` }}
        >
          <div className="chart-tip-date">{dateLabel(hoverT)}</div>
          {hover.rows.map((r) => (
            <div key={r.label} className="chart-tip-row">
              <i style={{ background: r.color }} />
              <span>{r.label}</span>
              <b>{fmt(r.v)}</b>
            </div>
          ))}
        </div>
      )}
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
