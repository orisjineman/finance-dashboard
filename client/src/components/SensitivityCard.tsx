import { RETURN_DELTAS, SAVING_SCALES, housingSensitivity, simulationSensitivity } from "../sensitivity";
import type { SimulationAssumptions } from "../types";
import type { HousingPlan } from "../housing";
import { fmtEok } from "../utils";
import SectionTitle from "./SectionTitle";

const dLabel = (d: number) => (d === 0 ? "기대수익률 그대로" : `기대수익률 ${d > 0 ? "+" : "−"}${Math.abs(d)}%p`);
const sLabel = (s: number) => (s === 1 ? "저축 그대로" : `저축 ${s > 1 ? "+" : "−"}${Math.round(Math.abs(s - 1) * 100)}%`);
const ym = (d: Date) => `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}`;

function Grid({ cell }: { cell: (di: number, si: number) => { text: string; sub?: string; tone?: string } }) {
  return (
    <div className="table-scroll">
      <table className="grid" style={{ marginTop: 8, minWidth: 420 }}>
        <thead>
          <tr>
            <th />
            {SAVING_SCALES.map((s) => (
              <th className="num" key={s}>{sLabel(s)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {RETURN_DELTAS.map((d, di) => (
            <tr key={d}>
              <td style={{ whiteSpace: "nowrap" }}>{dLabel(d)}</td>
              {SAVING_SCALES.map((s, si) => {
                const c = cell(di, si);
                const base = d === 0 && s === 1;
                return (
                  <td className="num" key={s} style={{ fontWeight: base ? 700 : 400, background: base ? "var(--gold-soft)" : undefined, color: c.tone }}>
                    {c.text}
                    {c.sub && <div style={{ fontSize: 11.5, color: "var(--ink-soft)", fontWeight: 400 }}>{c.sub}</div>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface SimProps {
  base: number;
  riskPct0: number;
  sim: SimulationAssumptions;
  raisePct: number;
  idle: number;
}

// 시뮬레이션 마지막 해의 예상 자산이 수익률·저축액에 따라 얼마나 달라지는지
export function SimSensitivityCard({ base, riskPct0, sim, raisePct, idle }: SimProps) {
  const grid = simulationSensitivity(base, riskPct0, sim, raisePct, idle);
  const center = grid[1][1];
  return (
    <>
      <SectionTitle>민감도: {sim.years}년 뒤 예상 자산</SectionTitle>
      <div className="card">
        <Grid
          cell={(di, si) => {
            const v = grid[di][si];
            const diff = v - center;
            return { text: fmtEok(v), sub: di === 1 && si === 1 ? "기준" : `${diff >= 0 ? "+" : "−"}${fmtEok(Math.abs(diff))}`, tone: undefined };
          }}
        />
        <p className="note">위험·안전자산 수익률을 함께 ±2%p, 연간 적립액을 ±20% 바꿨을 때야. 수익률보다 저축을 늘리는 게 확실한 쪽이야.</p>
      </div>
    </>
  );
}

interface HouseProps {
  plan: HousingPlan;
  needs: { key: string; label: string; need: number }[];
  pick: string;
  onPick: (key: string) => void;
  now: Date;
  hasPurchaseDate: boolean;
}

// 집 마련 목표에 닿는 시점이 수익률·저축액에 따라 얼마나 달라지는지
export function HousingSensitivityCard({ plan, needs, pick, onPick, now, hasPurchaseDate }: HouseProps) {
  const chosen = needs.find((n) => n.key === pick) ?? needs[0];
  if (!chosen) return null;
  const grid = housingSensitivity(plan, chosen.need, now);
  const center = grid[1][1].months;
  return (
    <>
      <SectionTitle>민감도: 집 마련 도달 시점</SectionTitle>
      <div className="card">
        {needs.length > 1 && (
          <div className="field" style={{ maxWidth: 360 }}>
            <label>목표</label>
            <select value={chosen.key} onChange={(e) => onPick(e.target.value)}>
              {needs.map((n) => (
                <option key={n.key} value={n.key}>{n.label}</option>
              ))}
            </select>
          </div>
        )}
        <Grid
          cell={(di, si) => {
            const c = grid[di][si];
            const m = c.months;
            const diff = m !== null && center !== null && !(di === 1 && si === 1) ? m - center : null;
            const sub = diff === null ? (di === 1 && si === 1 ? "기준" : undefined) : diff === 0 ? "차이 없음" : `${diff < 0 ? `${-diff}개월 빠름` : `${diff}개월 늦음`}`;
            const gapSub = hasPurchaseDate && c.gap !== null ? ` · 예정일 ${c.gap >= 0 ? "여유" : "부족"} ${fmtEok(Math.abs(c.gap))}` : "";
            return { text: c.reachAt ? (m === 0 ? "이미 도달" : ym(c.reachAt)) : "못 닿음", sub: `${sub ?? ""}${gapSub}`.replace(/^ · /, "") || undefined, tone: c.reachAt ? undefined : "var(--risk)" };
          }}
        />
        <p className="note">수익률을 흔드는 분석이라 수익률을 반영해서 계산해. 위험·안전 수익률을 함께 ±2%p, 집 마련 월 저축을 ±20% 바꿨어. 가운데가 지금 가정이야.</p>
      </div>
    </>
  );
}
