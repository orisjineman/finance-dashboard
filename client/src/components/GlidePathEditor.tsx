import type { GlidePathRow, StrategyData } from "../types";
import { glideRiskPct, yearsUntil } from "../rebalance";
import { newId } from "../utils";

interface Props {
  strategy: StrategyData;
  onChange: (strategy: StrategyData) => void;
  onEditInfo?: () => void; // 매수 예정일은 '내 정보' 탭에서 고친다
}

// 집 매수 예정일에서 남은 기간(년)만큼 거슬러 올라간 시점을 "2029년 6월" 형태로 표시
function whenLabel(purchaseDate: string, yearsLeft: number): string {
  const t = new Date(purchaseDate);
  if (!purchaseDate || Number.isNaN(t.getTime())) return "-";
  const d = new Date(t.getTime() - yearsLeft * 365.25 * 24 * 3600 * 1000);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월`;
}

// 집 매수 예정일과, 남은 기간별 목표 위험 비중 표 (지점 사이는 직선으로 이어서 계산)
export default function GlidePathEditor({ strategy, onChange, onEditInfo }: Props) {
  const { glidePath, housePurchaseDate } = strategy;
  const yearsLeft = yearsUntil(housePurchaseDate);
  const todayTarget = yearsLeft === null ? null : glideRiskPct(glidePath, yearsLeft);

  function updateRow(i: number, patch: Partial<GlidePathRow>) {
    onChange({ ...strategy, glidePath: glidePath.map((r, idx) => (idx === i ? { ...r, ...patch } : r)) });
  }

  return (
    <div className="card">
      <div className="field" style={{ maxWidth: 360 }}>
        <label>집 매수 예정일</label>
        <div className="info-value">
          <span>{housePurchaseDate || "-"}</span>
          {onEditInfo && (
            <button type="button" className="btn ghost sm" onClick={onEditInfo}>
              내 정보에서 수정
            </button>
          )}
        </div>
      </div>
      <p className="note" style={{ marginTop: 0, marginBottom: 12 }}>
        {yearsLeft === null || todayTarget === null
          ? "집 매수 예정일을 입력하면 지금 시점의 목표 위험 비중을 계산해줘."
          : `집 매수까지 약 ${yearsLeft.toFixed(1)}년 남았어. 아래 표의 지점 사이를 직선으로 이어서 계산하면 지금 목표는 위험 ${todayTarget.toFixed(1)}%야.`}
      </p>
      <div className="table-scroll">
<table className="grid">
        <thead>
          <tr>
            <th>집 매수까지 남은 기간(년)</th>
            <th>해당 시점</th>
            <th>목표 위험 비중(%)</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {glidePath.map((row, i) => (
            <tr key={row.id}>
              <td>
                <input type="number" min={0} step={0.5} value={row.yearsLeft} onChange={(e) => updateRow(i, { yearsLeft: Math.max(0, parseFloat(e.target.value) || 0) })} />
              </td>
              <td style={{ whiteSpace: "nowrap" }}>{whenLabel(housePurchaseDate, row.yearsLeft)}</td>
              <td>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={row.riskPct}
                  onChange={(e) => updateRow(i, { riskPct: Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)) })}
                />
              </td>
              <td>
                <button
                  className="btn ghost sm"
                  onClick={() => onChange({ ...strategy, glidePath: glidePath.filter((_, idx) => idx !== i) })}
                >
                  삭제
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
</div>
      <p className="note">표에 없는 기간은 양옆 지점을 직선으로 이어서 계산해. 가장 먼 지점보다 멀면 그 지점 값을, 가장 가까운 지점보다 가까우면 그 지점 값을 그대로 써.</p>
      <button
        className="btn ghost"
        style={{ marginTop: 10 }}
        onClick={() => onChange({ ...strategy, glidePath: [...glidePath, { id: newId("glide"), yearsLeft: 0, riskPct: 0 }] })}
      >
        + 지점 추가
      </button>
    </div>
  );
}
