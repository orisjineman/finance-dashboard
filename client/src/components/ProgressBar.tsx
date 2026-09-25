import { useState, type PointerEvent } from "react";
import { fmtWon } from "../utils";

interface Props {
  value: number; // 만원
  max: number; // 만원
  valueLabel: string; // 예: "가용자산"
  maxLabel: string; // 예: "필요 자기자금"
  remainingLabel?: string; // 예: "더 모아야 할 금액"
  done?: boolean; // true면 초록, 아니면 금색 (없으면 value >= max)
  height?: number;
}

// 가로 진행 막대. 마우스를 올리거나 누르면 금액·목표·남은 금액·달성률을 보여준다.
export default function ProgressBar({ value, max, valueLabel, maxLabel, remainingLabel = "남은 금액", done, height = 14 }: Props) {
  const [tipX, setTipX] = useState<number | null>(null);
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const reached = done ?? (max > 0 && value >= max);
  const remaining = max - value;

  function onPointer(e: PointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width > 0) setTipX((e.clientX - rect.left) / rect.width);
  }

  return (
    <div
      className="progress"
      style={{ height }}
      onPointerMove={onPointer}
      onPointerDown={onPointer}
      onPointerLeave={() => setTipX(null)}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`${valueLabel} ${fmtWon(value)}원 / ${maxLabel} ${fmtWon(max)}원`}
    >
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${pct}%`, background: reached ? "var(--safe)" : "var(--gold)" }} />
      </div>
      {tipX !== null && (
        <div className="chart-tip progress-tip" role="status" style={tipX > 0.6 ? { right: `${(1 - tipX) * 100}%` } : { left: `${tipX * 100}%` }}>
          <div className="chart-tip-row">
            <span>{valueLabel}</span>
            <b>{fmtWon(value)}원</b>
          </div>
          <div className="chart-tip-row">
            <span>{maxLabel}</span>
            <b>{fmtWon(max)}원</b>
          </div>
          <div className="chart-tip-row">
            <span>{remaining > 0 ? remainingLabel : "초과"}</span>
            <b>{fmtWon(Math.abs(remaining))}원</b>
          </div>
          <div className="chart-tip-row">
            <span>달성률</span>
            <b>{max > 0 ? `${Math.round((value / max) * 100)}%` : "-"}</b>
          </div>
        </div>
      )}
    </div>
  );
}
