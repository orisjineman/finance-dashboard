import { useMemo, useState } from "react";
import type { AssetRow, HistoryEntry } from "../types";
import { fmtWon } from "../utils";
import { accountJumps, buildReport, makeHistoryEntry, monthlyReports, reportText, type MonthlyReport as Report } from "../report";
import SectionTitle from "./SectionTitle";

export interface BenchmarkRate {
  name: string;
  rate: number | null; // 같은 기간 비교 기준 수익률 (0~1). 계산할 수 없으면 null
}

interface Props {
  rows: AssetRow[];
  history: HistoryEntry[];
  today: string; // YYYY-MM-DD
  benchmarkFor: (fromIso: string, toIso: string) => BenchmarkRate[];
}

const LIVE = "live";

const md = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8))}`;
const signed = (v: number) => `${v < 0 ? "−" : "+"}${fmtWon(Math.abs(v))}원`;
const tone = (v: number) => (v < 0 ? "var(--risk)" : v > 0 ? "var(--safe)" : "var(--ink-soft)");
const pct = (r: number) => `${r >= 0 ? "+" : "−"}${(Math.abs(r) * 100).toFixed(1)}%`;

// 이웃한 두 기록 사이에 자산이 얼마나, 왜 바뀌었는지. '지금'을 고르면 마지막 기록 이후 변화를 기록 전에 미리 본다.
// 잔액이 크게 달라진 계좌 목록 (입력 실수 점검용). 기록 전 미리보기와 기록 추가 버튼 위에서도 쓴다.
export function JumpWarning({ jumps }: { jumps: ReturnType<typeof accountJumps> }) {
  if (jumps.length === 0) return null;
  return (
    <div className="alert warn" style={{ margin: "10px 0" }}>
      <span className="alert-text">
        잔액이 크게 달라진 계좌: {jumps.map((j) => `${j.account || "(이름 없음)"} ${j.pct === Infinity ? "새로 생김" : `${j.pct > 0 ? "+" : "−"}${Math.abs(j.pct * 100).toFixed(0)}%`}`).join(", ")}. 입력이 맞는지 확인해줘.
      </span>
    </div>
  );
}

export default function MonthlyReport({ rows, history, today, benchmarkFor }: Props) {
  const reports = useMemo(() => monthlyReports(history), [history]);
  const sorted = useMemo(() => [...history].sort((a, b) => a.date.localeCompare(b.date)), [history]);
  const latest = sorted.at(-1);
  const [copied, setCopied] = useState(false);
  const [pick, setPick] = useState<string | null>(null); // null이면 가장 최근 기록 구간 (기록이 하나뿐이면 '지금' 미리보기)

  const live: Report | null = useMemo(() => {
    if (!latest) return null;
    return buildReport(latest, makeHistoryEntry(rows, today, latest.cumulativePrincipal, latest.cumulativePrincipal));
  }, [latest, rows, today]);

  const options = [...(live ? [{ key: LIVE, label: `${md(latest!.date)} → 지금 (기록 전 미리보기)` }] : []), ...reports.map((r) => ({ key: r.to.id, label: `${md(r.from.date)} → ${md(r.to.date)}` }))];
  const report = (pick === LIVE ? live : reports.find((r) => r.to.id === pick)) ?? reports[0] ?? live;
  const selected = report === live ? LIVE : report?.to.id;

  if (!report) {
    return (
      <>
        <SectionTitle>월간 리포트</SectionTitle>
        <div className="card">
          <p className="note" style={{ margin: 0 }}>히스토리에 기록이 하나 이상 있으면, 그 뒤로 자산이 어떻게 바뀌었는지 요약해서 보여줘.</p>
        </div>
      </>
    );
  }

  const isLive = report === live;
  const parts = [
    { key: "flows", label: "넣은 돈", value: report.flows, hint: isLive ? "기록할 때 투자원금을 늘려야 잡혀" : undefined },
    { key: "profit", label: "운용 수익", value: report.profit },
    ...(report.coversAllAssets ? [{ key: "other", label: "그 외 (통장·보증금 등)", value: report.other, hint: undefined }] : []),
  ];
  const maxAbs = Math.max(1e-9, ...parts.map((p) => Math.abs(p.value)));
  const jumps = accountJumps(report.from, report.to);
  const bench = report.rate !== null ? benchmarkFor(report.from.date, report.to.date) : [];

  return (
    <>
      <SectionTitle>월간 리포트</SectionTitle>
      <div className="card">
        <div className="field" style={{ maxWidth: 320 }}>
          <label>기간</label>
          <select value={selected} onChange={(e) => setPick(e.target.value)}>
            {options.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div className="result-line total">
          <span className="k">
            {report.coversAllAssets ? "전체 자산" : "투자 항목 합계"} 변화 <small style={{ color: "var(--ink-soft)" }}>({report.from.date} → {report.to.date}, {report.days}일)</small>
          </span>
          <span className="v" style={{ color: tone(report.assetsDelta) }}>
            {signed(report.assetsDelta)}
          </span>
        </div>

        <div className="report-bars">
          {parts.map((p) => (
            <div className="report-bar-row" key={p.key}>
              <span className="report-bar-label">{p.label}</span>
              <span className="report-bar-track" aria-hidden="true">
                <span className="report-bar-fill" style={{ width: `${(Math.abs(p.value) / maxAbs) * 100}%`, background: tone(p.value) }} />
              </span>
              <span className="report-bar-value" style={{ color: tone(p.value) }}>
                {signed(p.value)}
              </span>
              {p.hint && <span className="report-bar-hint">{p.hint}</span>}
            </div>
          ))}
        </div>

        {report.rate !== null && (
          <div className="result-line">
            <span className="k">이 기간 수익률 (넣은 돈 제외)</span>
            <span className="v" style={{ color: tone(report.rate) }}>
              {pct(report.rate)}
              {bench.filter((b) => b.rate !== null).map((b) => (
                <small key={b.name} style={{ color: "var(--ink-soft)", fontWeight: 400 }}>
                  {" · "}
                  {b.name} {pct(b.rate as number)}
                </small>
              ))}
            </span>
          </div>
        )}

        <JumpWarning jumps={jumps} />

        <button
          className="btn ghost sm"
          onClick={() => {
            navigator.clipboard?.writeText(reportText(report)).then(
              () => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              },
              () => undefined
            );
          }}
        >
          {copied ? "복사했어 ✓" : "요약 복사"}
        </button>

        <details style={{ marginTop: 12 }}>
          <summary>분류별 · 계좌별 변화</summary>
          <div className="table-scroll">
            <table className="grid" style={{ marginTop: 8, minWidth: 360 }}>
              <thead>
                <tr>
                  <th>분류 (투자 항목)</th>
                  <th className="num">변화 (원)</th>
                </tr>
              </thead>
              <tbody>
                {report.categories.map((c) => (
                  <tr key={c.key}>
                    <td>{c.label}</td>
                    <td className="num" style={{ color: tone(c.delta) }}>{signed(c.delta)}</td>
                  </tr>
                ))}
                {report.housingDelta !== null && (
                  <tr>
                    <td>집 마련 가용자산</td>
                    <td className="num" style={{ color: tone(report.housingDelta) }}>{signed(report.housingDelta)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {report.accounts ? (
            <div className="table-scroll">
              <table className="grid" style={{ marginTop: 8, minWidth: 360 }}>
                <thead>
                  <tr>
                    <th>계좌</th>
                    <th className="num">변화 (원)</th>
                  </tr>
                </thead>
                <tbody>
                  {report.accounts.map((a) => (
                    <tr key={a.account || "(이름 없음)"}>
                      <td>{a.account || "(이름 없음)"}</td>
                      <td className="num" style={{ color: tone(a.delta) }}>{signed(a.delta)}</td>
                    </tr>
                  ))}
                  {report.accounts.length === 0 && (
                    <tr>
                      <td colSpan={2} style={{ textAlign: "center", color: "var(--ink-soft)" }}>계좌별로 달라진 게 없어.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="note">계좌별 변화는 두 기록 모두 계좌별 값이 있어야 보여. 지금부터 기록하는 건 계좌별 값도 함께 남겨.</p>
          )}
        </details>

        <p className="note">
          전체 자산 변화 = 넣은 돈 + 운용 수익 + 그 외. '그 외'는 수익률 계산에서 빠진 통장·보증금 등의 변동이야.
          {report.coversAllAssets ? "" : " 이 기록에는 전체 자산이 없어서 투자 항목만 비교해."}
        </p>
      </div>
    </>
  );
}
