import { useEffect, useState } from "react";
import type { AssetRow, BenchmarkSetting, HistoryEntry, StrategyData } from "../types";
import { computeCurrentReturn, computeReturnTotals, fmtEok, fmtWon, newId } from "../utils";
import { describePeriod, overallReturn, yearlyReturns } from "../returns";
import { fetchBenchmarkSeries } from "../api";
import { benchmarkReturn, benchmarksOf, DEFAULT_BENCHMARKS, earliestDate, type PricePoint } from "../benchmark";
import { makeHistoryEntry } from "../report";
import LineChart from "./LineChart";
import MoneyInput from "./MoneyInput";
import MonthlyReport from "./MonthlyReport";
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

// 내 수익률이 비교 기준보다 얼마나 높은지(낮은지) %p
const gapLabel = (mine: number, bench: number) => `${mine >= bench ? "+" : "−"}${(Math.abs(mine - bench) * 100).toFixed(1)}%p`;

const KIND_LABEL = { full: "", ytd: " (진행 중)", partial: " (일부 기간)" };

export default function HistoryPanel({ rows, history, onChange, strategy, onStrategyChange }: Props) {
  const targetPct = strategy.targetReturnPct ?? 7;
  const periods = yearlyReturns(history);
  const overall = overallReturn(periods);
  const now = new Date();
  const [date, setDate] = useState(todayIso());
  const [principalInput, setPrincipalInput] = useState<number | null>(null);

  const t = computeReturnTotals(rows);
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
  const current = computeCurrentReturn(rows, history);
  const latestPrincipal = sorted[sorted.length - 1]?.cumulativePrincipal ?? 0;
  const principal = principalInput ?? latestPrincipal;
  const newContribution = principal - latestPrincipal;

  function addEntry() {
    onChange([...history, makeHistoryEntry(rows, date, principal, latestPrincipal)]);
    setPrincipalInput(null);
  }

  // 비교 기준: 지수 ETF는 서버에서 일별 종가를 받아 오고(최근에 받은 건 서버가 캐시), 금리는 계산만 한다.
  const benchmarks = benchmarksOf(strategy.benchmarks);
  const etfCodes = Array.from(new Set(benchmarks.filter((b) => b.kind === "etf" && b.ticker?.trim()).map((b) => b.ticker!.trim())));
  const since = earliestDate(history.map((h) => h.date));
  const codesKey = etfCodes.join(",");
  const [seriesByCode, setSeriesByCode] = useState<Record<string, PricePoint[]>>({});
  const [benchNote, setBenchNote] = useState<string | null>(null);
  useEffect(() => {
    if (!since || codesKey === "") return;
    let cancelled = false;
    fetchBenchmarkSeries(codesKey.split(","), since)
      .then((res) => {
        if (cancelled) return;
        const next: Record<string, PricePoint[]> = {};
        const failed: string[] = [];
        for (const [code, r] of Object.entries(res)) {
          if (r.ok && r.series) next[code] = r.series;
          else failed.push(`${code}: ${r.error ?? "시세를 찾지 못했어"}`);
        }
        setSeriesByCode(next);
        setBenchNote(failed.length > 0 ? failed.join(" / ") : null);
      })
      .catch((e) => {
        if (!cancelled) setBenchNote(e instanceof Error ? e.message : "비교 기준 시세를 불러오지 못했어.");
      });
    return () => {
      cancelled = true;
    };
  }, [since, codesKey]);

  const rateOf = (b: BenchmarkSetting, fromIso: string, toIso: string) => benchmarkReturn(b, b.ticker ? seriesByCode[b.ticker.trim()] : undefined, fromIso, toIso);
  const setBenchmarks = (next: BenchmarkSetting[]) => onStrategyChange({ ...strategy, benchmarks: next });
  const patchBenchmark = (id: string, patch: Partial<BenchmarkSetting>) => setBenchmarks(benchmarks.map((b) => (b.id === id ? { ...b, ...patch } : b)));

  function removeEntry(id: string) {
    onChange(history.filter((h) => h.id !== id));
  }

  // 신규 납입액은 저장된 값이 아니라 이웃한 기록의 원금 차이로 그때그때 계산한다 (기록을 지워도 어긋나지 않게).
  const contributionOf = new Map<string, number>();
  sorted.forEach((h, i) => contributionOf.set(h.id, h.cumulativePrincipal - (i > 0 ? sorted[i - 1].cumulativePrincipal : 0)));

  return (
    <>
      <MonthlyReport rows={rows} history={history} today={todayIso()} benchmarkFor={(a, z) => benchmarks.map((b) => ({ name: b.name, rate: rateOf(b, a, z) }))} />

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
                  {benchmarks.map((b) => (
                    <th className="num" key={b.id} title="같은 기간 비교 기준 수익률">
                      {b.name}
                    </th>
                  ))}
                  <th>목표 (연 {targetPct}%)</th>
                </tr>
              </thead>
              <tbody>
                {[...periods].reverse().map((p) => {
                  const v = describePeriod(p, now, targetPct);
                  const tone = p.rate >= 0 ? "var(--safe)" : "var(--risk)";
                  const met = p.rate >= v.target;
                  return (
                    <tr key={p.year}>
                      <td>{p.year}</td>
                      <td>
                        {v.range}
                        {KIND_LABEL[v.kind]}
                      </td>
                      <td className="num">{fmtWon(p.flows)}</td>
                      <td className="num" style={{ color: tone }}>
                        {fmtWon(p.profit)}
                      </td>
                      <td className="num" style={{ color: tone, fontWeight: 700 }}>
                        {pct(p.rate)}
                      </td>
                      {benchmarks.map((b) => {
                        const br = rateOf(b, p.start.date, p.end.date);
                        return (
                          <td className="num" key={b.id}>
                            {br === null ? (
                              <span style={{ color: "var(--ink-soft)" }}>-</span>
                            ) : (
                              <>
                                {pct(br)}
                                <div style={{ fontSize: 11.5, color: p.rate >= br ? "var(--safe)" : "var(--risk)" }}>내가 {gapLabel(p.rate, br)}</div>
                              </>
                            )}
                          </td>
                        );
                      })}
                      <td style={{ whiteSpace: "nowrap" }}>
                        <span className={`tag ${met ? "safe" : "risk"}`}>{v.kind === "full" ? (met ? "달성" : "미달") : met ? "순항" : "뒤처짐"}</span>
                        {v.kind !== "full" && <span style={{ color: "var(--ink-soft)", fontSize: 12 }}> 기간 목표 {pct(v.target)}</span>}
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
        {benchNote && <p className="note" style={{ color: "var(--risk)" }}>{benchNote}</p>}
        <details style={{ marginTop: 12 }}>
          <summary>비교 기준 설정 ({benchmarks.length}개)</summary>
          <div className="table-scroll">
            <table className="grid" style={{ marginTop: 8, minWidth: 520 }}>
              <thead>
                <tr>
                  <th>이름</th>
                  <th>종류</th>
                  <th>종목코드 / 연 금리(%)</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {benchmarks.map((b) => (
                  <tr key={b.id}>
                    <td>
                      <input type="text" value={b.name} onChange={(e) => patchBenchmark(b.id, { name: e.target.value })} style={{ width: 150, textAlign: "left" }} />
                    </td>
                    <td>
                      <select value={b.kind} onChange={(e) => patchBenchmark(b.id, { kind: e.target.value as BenchmarkSetting["kind"] })}>
                        <option value="etf">지수 ETF</option>
                        <option value="rate">고정 금리</option>
                      </select>
                    </td>
                    <td>
                      {b.kind === "etf" ? (
                        <input type="text" value={b.ticker ?? ""} placeholder="예: 360750" onChange={(e) => patchBenchmark(b.id, { ticker: e.target.value })} style={{ width: 110, textAlign: "left" }} />
                      ) : (
                        <input type="number" step={0.1} value={b.ratePct ?? 0} onChange={(e) => patchBenchmark(b.id, { ratePct: parseFloat(e.target.value) || 0 })} style={{ width: 90 }} />
                      )}
                    </td>
                    <td>
                      <button className="btn ghost sm" onClick={() => setBenchmarks(benchmarks.filter((x) => x.id !== b.id))}>
                        삭제
                      </button>
                    </td>
                  </tr>
                ))}
                {benchmarks.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ textAlign: "center", color: "var(--ink-soft)" }}>비교 기준이 없어.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            <button className="btn ghost" onClick={() => setBenchmarks([...benchmarks, { id: newId("bm"), name: "새 기준", kind: "etf", ticker: "" }])}>
              + 기준 추가
            </button>
            <button className="btn ghost" onClick={() => onStrategyChange({ ...strategy, benchmarks: DEFAULT_BENCHMARKS.map((b) => ({ ...b })) })}>
              기본값으로
            </button>
          </div>
          <p className="note">
            지수 ETF는 그 종목 종가가 오른 비율이야 (분배금은 빠져서 실제보다 조금 낮게 나와). 시세는 리밸런싱 탭에 등록한 공공데이터포털 키로 가져오고, 키가 없으면 금리 기준만 비교돼.
          </p>
        </details>
        <div className="field-row" style={{ marginTop: 12 }}>
          <div className="field">
            <label>목표 연 수익률 (%)</label>
            <input type="number" step={0.5} value={targetPct} onChange={(e) => onStrategyChange({ ...strategy, targetReturnPct: parseFloat(e.target.value) || 0 })} />
          </div>
          <div className="field">
            <label>매달 기록일 (1~28일, 28 = 월말, 0이면 끔)</label>
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
          넣은 돈을 뺀 순수 운용 수익률. 해마다 1월~12월로 끊고(12월 말 기록 기준), 올해는 1월~최근 기록까지. 진행 중인 해는 지난 기간만큼 줄인 목표와 비교해.
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
