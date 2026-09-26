import { useState } from "react";
import type { AssetRow, HistoryEntry, StrategyData } from "../types";
import { computeCurrentReturn, computeHousingLiquid, computeReturnTotals, computeTotals, fmtEok, fmtWon, newId } from "../utils";
import { overallReturn, yearlyReturns, type PeriodReturn } from "../returns";
import LineChart from "./LineChart";
import MoneyInput from "./MoneyInput";
import SectionTitle from "./SectionTitle";

interface Props {
  rows: AssetRow[];
  history: HistoryEntry[];
  onChange: (history: HistoryEntry[]) => void;
  strategy: StrategyData;
  onStrategyChange: (strategy: StrategyData) => void;
}

function todayIso(): string {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

const md = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8))}`;

// 연도별 수익률 표의 기간 표시: 1년이면 '연도', 부분 기간이면 날짜 범위
function periodLabel(p: PeriodReturn): string {
  return p.annualRate !== null ? `${p.start.date.slice(2).replace(/-/g, ".")} ~ ${p.end.date.slice(2).replace(/-/g, ".")}` : `${md(p.start.date)} ~ ${md(p.end.date)} (부분)`;
}

export default function HistoryPanel({ rows, history, onChange, strategy, onStrategyChange }: Props) {
  const targetPct = strategy.targetReturnPct ?? 7;
  const periods = yearlyReturns(history);
  const overall = overallReturn(periods);
  const [date, setDate] = useState(todayIso());
  const [principalInput, setPrincipalInput] = useState<number | null>(null);

  const t = computeReturnTotals(rows);
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
  const current = computeCurrentReturn(rows, history);
  const latestPrincipal = sorted[sorted.length - 1]?.cumulativePrincipal ?? 0;
  const principal = principalInput ?? latestPrincipal;
  const newContribution = principal - latestPrincipal;

  function addEntry() {
    const cumulativePrincipal = principal;
    const totalValue = t.total;
    const profit = totalValue - cumulativePrincipal;
    const returnRate = cumulativePrincipal !== 0 ? profit / cumulativePrincipal : 0;
    const entry: HistoryEntry = {
      id: newId("hist"),
      date,
      newContribution,
      cumulativePrincipal,
      totalValue,
      riskValue: t.risk,
      safeValue: t.safe,
      cashValue: t.cash,
      housingLiquid: computeHousingLiquid(rows),
      totalAssets: computeTotals(rows).total,
      profit,
      returnRate,
    };
    onChange([...history, entry]);
    setPrincipalInput(null);
  }

  function removeEntry(id: string) {
    onChange(history.filter((h) => h.id !== id));
  }

  // 신규 납입액은 저장된 값이 아니라 이웃한 기록의 원금 차이로 그때그때 계산한다 (기록을 지워도 어긋나지 않게).
  const contributionOf = new Map<string, number>();
  sorted.forEach((h, i) => contributionOf.set(h.id, h.cumulativePrincipal - (i > 0 ? sorted[i - 1].cumulativePrincipal : 0)));

  return (
    <>
      <SectionTitle>지금 투자원금 대비 수익률</SectionTitle>
      <div className="card">
        {current ? (
          <>
            <div className="result-line">
              <span className="k">누적 투자원금 (최근 기록 기준)</span>
              <span className="v">{fmtWon(current.principal)}원</span>
            </div>
            <div className="result-line">
              <span className="k">지금 평가금액 (수익률 포함 항목)</span>
              <span className="v">{fmtWon(current.currentTotal)}원</span>
            </div>
            <div className="result-line total">
              <span className="k">수익 / 수익률</span>
              <span className="v" style={{ color: current.profit >= 0 ? "var(--safe)" : "var(--risk)" }}>
                {fmtWon(current.profit)}원 ({pct(current.returnRate)})
              </span>
            </div>
            <p className="note">
              아래 히스토리에 새 기록을 추가할 때마다 투자원금이 갱신돼. 자산 스냅샷 잔액을 바꾸면 이 수익률도 실시간으로 따라 움직여.
            </p>
          </>
        ) : (
          <p className="note">아직 기록된 투자원금이 없어. 아래에서 첫 기록을 추가하면(현재 총 투자원금 = 지금까지 실제로 넣은 돈 전체) 수익률이 계산돼.</p>
        )}
      </div>

      <SectionTitle>연도별 수익률</SectionTitle>
      <div className="card">
        {periods.length > 0 ? (
          <div className="table-scroll">
            <table className="grid">
              <thead>
                <tr>
                  <th>연도</th>
                  <th>기간</th>
                  <th className="num">넣은 돈 (원)</th>
                  <th className="num">수익 (원)</th>
                  <th className="num">수익률</th>
                  <th>목표 {targetPct}%</th>
                </tr>
              </thead>
              <tbody>
                {[...periods].reverse().map((p) => {
                  const r = p.annualRate ?? p.rate;
                  const tone = r >= 0 ? "var(--safe)" : "var(--risk)";
                  return (
                    <tr key={p.year}>
                      <td>{p.year}</td>
                      <td>{periodLabel(p)}</td>
                      <td className="num">{fmtWon(p.flows)}</td>
                      <td className="num" style={{ color: tone }}>
                        {fmtWon(p.profit)}
                      </td>
                      <td className="num" style={{ color: tone, fontWeight: 700 }}>
                        {pct(r)}
                      </td>
                      <td>
                        {p.annualRate === null ? (
                          <span style={{ color: "var(--ink-soft)", fontSize: 12 }}>1년 차면 비교</span>
                        ) : (
                          <span className={`tag ${p.annualRate * 100 >= targetPct ? "safe" : "risk"}`}>{p.annualRate * 100 >= targetPct ? "달성" : "미달"}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="note" style={{ marginTop: 0 }}>기록이 2개 이상 쌓이면 기간별 수익률이 나와.</p>
        )}
        {overall && overall.annualRate !== null && periods.length > 1 && (
          <div className="result-line">
            <span className="k">첫 기록부터 연평균 ({Math.round((overall.days / 365) * 10) / 10}년)</span>
            <span className="v">{pct(overall.annualRate)}</span>
          </div>
        )}
        <div className="field-row" style={{ marginTop: 12 }}>
          <div className="field">
            <label>목표 연 수익률 (%)</label>
            <input type="number" step={0.5} value={targetPct} onChange={(e) => onStrategyChange({ ...strategy, targetReturnPct: parseFloat(e.target.value) || 0 })} />
          </div>
          <div className="field">
            <label>매달 기록일 (1~28일, 0이면 끔)</label>
            <input
              type="number"
              min={0}
              max={28}
              value={strategy.recordDay ?? 0}
              onChange={(e) => onStrategyChange({ ...strategy, recordDay: Math.min(28, Math.max(0, Math.round(parseFloat(e.target.value) || 0))) })}
            />
          </div>
        </div>
        <p className="note">
          넣은 돈을 빼고 계산한 순수 운용 수익률이야. 매달 투자금을 넣은 직후 같은 날 기록하면 가장 정확해. 1년이 안 된 기간은 연환산하지 않아.
          {strategy.recordDay ? ` 기록일이 지나면 알림이 떠.` : ""}
        </p>
      </div>

      <SectionTitle>히스토리</SectionTitle>
      <div className="card">
        <div className="field-row" style={{ alignItems: "end" }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>기록 날짜</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>현재 총 투자원금 (원)</label>
            <MoneyInput value={principal} onChange={setPrincipalInput} />
          </div>
        </div>
        <p className="note">
          총평가금액 = '수익률' 체크 항목 합계 {fmtWon(t.total)}원. 투자원금은 지금까지 넣은 돈 합계라 새로 넣은 만큼만 늘려줘
          {newContribution !== 0 ? ` (직전 대비 ${newContribution > 0 ? "+" : ""}${fmtWon(newContribution)}원)` : ""}.
        </p>
        <button className="btn" style={{ marginTop: 10 }} onClick={addEntry}>
          + 기록 추가
        </button>

        {sorted.length > 0 && (
          <>
            {sorted.length >= 2 ? (
              <div style={{ marginTop: 20, display: "grid", gap: 18 }}>
                <div>
                  <div className="chart-title">총평가금액 · 누적 투자원금 · 전체 자산</div>
                  <LineChart
                    yFormat={fmtEok}
                    valueFormat={(v) => `${fmtWon(v)}원`}
                    series={[
                      { label: "총평가금액", color: "var(--accent)", points: sorted.map((h) => ({ t: new Date(`${h.date}T00:00:00`).getTime(), y: h.totalValue })) },
                      { label: "누적 투자원금", color: "var(--ink-soft)", dashed: true, points: sorted.map((h) => ({ t: new Date(`${h.date}T00:00:00`).getTime(), y: h.cumulativePrincipal })) },
                      ...(sorted.some((h) => h.totalAssets !== undefined)
                        ? [{ label: "전체 자산", color: "var(--gold)", points: sorted.filter((h) => h.totalAssets !== undefined).map((h) => ({ t: new Date(`${h.date}T00:00:00`).getTime(), y: h.totalAssets as number })) }]
                        : []),
                    ]}
                  />
                </div>
                <div>
                  <div className="chart-title">투자원금 대비 수익률</div>
                  <LineChart
                    yFormat={(v) => `${v.toFixed(0)}%`}
                    valueFormat={(v) => `${v.toFixed(2)}%`}
                    series={[{ label: "수익률", color: "var(--safe)", points: sorted.map((h) => ({ t: new Date(`${h.date}T00:00:00`).getTime(), y: h.returnRate * 100 })) }]}
                  />
                </div>
              </div>
            ) : (
              <p className="note" style={{ marginTop: 16 }}>기록이 2개 이상 쌓이면 자산과 수익률 그래프가 그려져.</p>
            )}

            <div className="table-scroll">
<table className="grid" style={{ marginTop: 16 }}>
              <thead>
                <tr>
                  <th>날짜</th>
                  <th className="num">신규납입 (원)</th>
                  <th className="num">누적원금 (원)</th>
                  <th className="num">총평가금액 (원)</th>
                  <th className="num">수익 (원)</th>
                  <th className="num">수익률</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {[...sorted].reverse().map((h) => (
                  <tr key={h.id}>
                    <td>{h.date}</td>
                    <td className="num">{fmtWon(contributionOf.get(h.id) ?? 0)}</td>
                    <td className="num">{fmtWon(h.cumulativePrincipal)}</td>
                    <td className="num">{fmtWon(h.totalValue)}</td>
                    <td className="num" style={{ color: h.profit >= 0 ? "var(--safe)" : "var(--risk)" }}>
                      {fmtWon(h.profit)}
                    </td>
                    <td className="num" style={{ color: h.profit >= 0 ? "var(--safe)" : "var(--risk)" }}>
                      {pct(h.returnRate)}
                    </td>
                    <td>
                      <button
                        className="btn ghost sm"
                        onClick={() => removeEntry(h.id)}
                      >
                        삭제
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
</div>
          </>
        )}
      </div>
    </>
  );
}
