import { useMemo } from "react";
import type { AssetRow, RebalanceSettings } from "../types";
import { fmtWon } from "../utils";
import { computeRebalance } from "../rebalance";

interface Props {
  rows: AssetRow[];
  settings: RebalanceSettings;
  onChange: (settings: RebalanceSettings) => void;
}

export default function RebalancePanel({ rows, settings, onChange }: Props) {
  const result = useMemo(() => computeRebalance(rows, settings), [rows, settings]);
  const accounts = useMemo(() => Array.from(new Set(rows.map((r) => r.account).filter(Boolean))).sort(), [rows]);
  const included = (a: string) => !settings.excludedAccounts.includes(a);

  function toggleAccount(a: string, on: boolean) {
    const excludedAccounts = on ? settings.excludedAccounts.filter((x) => x !== a) : [...settings.excludedAccounts, a];
    onChange({ ...settings, excludedAccounts });
  }

  const sellLabel = result.sellCategory === "risk" ? "위험자산" : "안전자산";
  const buyLabel = result.sellCategory === "risk" ? "안전자산" : "위험자산";
  const sells = result.trades.filter((t) => t.action === "sell");
  const buys = result.trades.filter((t) => t.action === "buy");
  const barPct = (n: number) => `${Math.max(0, Math.min(100, n))}%`;

  return (
    <section className="panel active" id="panel-rebalance">
      <h2 className="section-title">
        <span className="num">01</span> 목표 비중
      </h2>
      <div className="card">
        <div className="field-row">
          <div className="field">
            <label>목표 위험자산 비중 (%)</label>
            <input
              type="number"
              min={0}
              max={100}
              value={settings.targetRiskPct}
              onChange={(e) => onChange({ ...settings, targetRiskPct: Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)) })}
            />
          </div>
          <div className="field">
            <label>허용 오차 (±%p)</label>
            <input
              type="number"
              min={0}
              step={0.5}
              value={settings.tolerancePct}
              onChange={(e) => onChange({ ...settings, tolerancePct: Math.max(0, parseFloat(e.target.value) || 0) })}
            />
          </div>
        </div>
        <p className="note">안전자산 목표는 {100 - settings.targetRiskPct}%야. 허용 오차 안이면 리밸런싱하지 않아도 돼.</p>
        <div className="field" style={{ marginTop: 12, marginBottom: 0 }}>
          <label>리밸런싱 대상 계좌 (체크 해제하면 제외)</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 16px", fontSize: 13.5 }}>
            {accounts.map((a) => (
              <label key={a} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 0, color: "var(--ink)" }}>
                <input
                  type="checkbox"
                  checked={included(a)}
                  onChange={(e) => toggleAccount(a, e.target.checked)}
                  style={{ width: 16, height: 16, padding: 0, flex: "0 0 auto" }}
                />
                {a}
              </label>
            ))}
          </div>
        </div>
        <p className="note">월세보증금처럼 사고팔 수 없는 자산이 든 계좌나, 집 자금으로 묶어둔 계좌는 빼두는 게 좋아.</p>
      </div>

      <h2 className="section-title">
        <span className="num">02</span> 현재 vs 목표
      </h2>
      <div className="card">
        <div style={{ position: "relative", height: 18, borderRadius: 999, background: "var(--safe)", overflow: "hidden" }}>
          <div style={{ width: barPct(result.riskPct), height: "100%", background: "var(--risk)" }} />
        </div>
        <div style={{ position: "relative", height: 10 }}>
          <div
            style={{
              position: "absolute", left: barPct(settings.targetRiskPct), top: -22, width: 2, height: 26,
              background: "var(--ink)", transform: "translateX(-1px)",
            }}
            title="목표"
          />
        </div>
        <div className="legend" style={{ marginTop: 10 }}>
          <div className="row">
            <span className="swatch" style={{ background: "var(--risk)" }} />
            위험자산 {fmtWon(result.risk)}원 ({result.riskPct.toFixed(1)}%) · 목표 {settings.targetRiskPct}%
          </div>
          <div className="row">
            <span className="swatch" style={{ background: "var(--safe)" }} />
            안전자산 {fmtWon(result.safe)}원 ({(100 - result.riskPct).toFixed(1)}%)
          </div>
        </div>
        <p className="note" style={{ color: result.needsRebalance ? "var(--risk)" : "var(--safe)", fontWeight: 600 }}>
          {result.scopeTotal <= 0
            ? "대상 자산이 없어. 위에서 계좌를 선택해줘."
            : result.needsRebalance
              ? `목표보다 위험자산이 ${Math.abs(result.driftPct).toFixed(1)}%p ${result.driftPct > 0 ? "많아" : "적어"}. 리밸런싱이 필요해.`
              : `목표 대비 ${result.driftPct >= 0 ? "+" : ""}${result.driftPct.toFixed(1)}%p — 허용 오차 안이라 그대로 둬도 돼.`}
        </p>
      </div>

      {result.needsRebalance && (
        <>
          <h2 className="section-title">
            <span className="num">03</span> 추천 거래
          </h2>
          <div className="card">
            <div className="result-line total">
              <span className="k">
                {sellLabel} 매도 → {buyLabel} 매수
              </span>
              <span className="v">{fmtWon(result.achievedShift)}원</span>
            </div>
            <table className="grid" style={{ marginTop: 12 }}>
              <thead>
                <tr>
                  <th>구분</th>
                  <th>계좌</th>
                  <th>상품</th>
                  <th className="num">금액(원)</th>
                </tr>
              </thead>
              <tbody>
                {[...sells, ...buys].map((t, i) => (
                  <tr key={`${t.action}-${t.rowId}-${i}`}>
                    <td>
                      <span className={`tag ${t.action === "sell" ? "risk" : "safe"}`}>{t.action === "sell" ? "매도" : "매수"}</span>
                    </td>
                    <td>{t.account}</td>
                    <td>{t.item}</td>
                    <td className="num">{fmtWon(t.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="note">
              거래 후 위험자산 비중은 약 {result.afterRiskPct.toFixed(1)}%가 돼. 계좌 안에서 팔고 산 돈은 같은 계좌에 머무르기 때문에, ISA·IRP·연금저축처럼
              세금 없이 굴릴 수 있는 계좌부터 먼저 배정했어. 매도는 그 계좌의 {sellLabel} 상품을 보유금액 비율대로, 매수는 이미 들고 있는 {buyLabel} 상품에 비율대로 나눴어.
            </p>
            {result.notes.map((n, i) => (
              <p className="note" key={i} style={{ color: "var(--risk)" }}>
                {n}
              </p>
            ))}
            <p className="note">실제 주문 전에 현재가·수수료·세금을 확인하고, 최종 판단은 직접 해줘. 이 화면은 참고용 계산 결과야.</p>
          </div>
        </>
      )}
    </section>
  );
}
