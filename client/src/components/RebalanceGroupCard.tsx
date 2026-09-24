import { useMemo, useState } from "react";
import type { AssetRow, RebalanceGroup } from "../types";
import { fmtWon } from "../utils";
import { computeRebalance, deriveGroupPlan } from "../rebalance";
import { computeContribution, contributionNeeded } from "../contribution";
import MoneyInput from "./MoneyInput";
import { DEFAULT_FEE_PCT, DEFAULT_TAX_RATE_PCT, estimateCosts } from "../costs";

interface Props {
  group: RebalanceGroup;
  rows: AssetRow[];
  allAccounts: string[];
  tolerancePct: number;
  feePct?: number;
  taxRatePct?: number;
  targetRiskPct: number | null;
  targetLabel: string;
  riskAccess: Record<string, "allowed" | "blocked">;
  depositLimit: Record<string, number>;
  onChange: (group: RebalanceGroup) => void;
  onToggleAccount: (account: string, on: boolean) => void;
}

const barPct = (n: number) => `${Math.max(0, Math.min(100, n))}%`;

// 한 묶음(집 자금·노후 자금 등)의 목표·현재 비중, 필요한 조치, 추천 거래를 보여주는 카드
export default function RebalanceGroupCard({ group, rows, allAccounts, tolerancePct, feePct, taxRatePct, targetRiskPct, targetLabel, riskAccess, depositLimit, onChange, onToggleAccount }: Props) {
  const result = useMemo(
    () => (targetRiskPct === null ? null : computeRebalance(rows, group.accounts, targetRiskPct, tolerancePct, riskAccess, depositLimit)),
    [rows, group.accounts, targetRiskPct, tolerancePct, riskAccess, depositLimit]
  );

  const plan = useMemo(
    () => (targetRiskPct === null ? null : deriveGroupPlan(rows, group.accounts, targetRiskPct, riskAccess)),
    [rows, group.accounts, targetRiskPct, riskAccess]
  );

  const sellLabel = result?.sellCategory === "risk" ? "위험자산" : "안전자산";
  const buyLabel = result?.sellCategory === "risk" ? "안전자산" : "위험자산";
  const [payIn, setPayIn] = useState(0);
  const [payAccount, setPayAccount] = useState("");
  const contribAccounts = group.accounts.filter((a) => rows.some((r) => r.account === a && (r.category === "risk" || r.category === "safe")));
  const account = contribAccounts.includes(payAccount) ? payAccount : contribAccounts.find((a) => (depositLimit[a] ?? 0) > 0 && riskAccess[a] !== "blocked") ?? contribAccounts.find((a) => riskAccess[a] !== "blocked") ?? contribAccounts[0] ?? "";
  const scopeRows = rows.filter((r) => group.accounts.includes(r.account) && (r.category === "risk" || r.category === "safe"));
  const scopeTotal = scopeRows.reduce((sum, r) => sum + r.amount, 0);
  const scopeRisk = scopeRows.filter((r) => r.category === "risk").reduce((sum, r) => sum + r.amount, 0);
  const needed = targetRiskPct === null ? null : contributionNeeded(scopeRisk, scopeTotal, targetRiskPct);
  const contribution = targetRiskPct !== null && payIn > 0 && account ? computeContribution(rows, group.accounts, targetRiskPct, account, payIn, riskAccess) : null;
  const costs = result && result.trades.length > 0 ? estimateCosts(result.trades, rows, { feePct, taxRatePct }) : null;
  const sells = result?.trades.filter((t) => t.action === "sell") ?? [];
  const buys = result?.trades.filter((t) => t.action === "buy") ?? [];

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <div className="field-row">
        <div className="field">
          <label>묶음 이름</label>
          <input type="text" value={group.name} onChange={(e) => onChange({ ...group, name: e.target.value })} />
        </div>
        <div className="field">
          <label>목표 비중 방식</label>
          <select value={group.targetType} onChange={(e) => onChange({ ...group, targetType: e.target.value as "glide" | "fixed" })}>
            <option value="glide">집 매수 시점에 맞춰 낮추기 (글리드 패스)</option>
            <option value="fixed">고정 비중</option>
          </select>
        </div>
      </div>
      {group.targetType === "fixed" && (
        <div className="field">
          <label>목표 위험자산 비중 (%)</label>
          <input
            type="number"
            min={0}
            max={100}
            value={group.fixedRiskPct}
            onChange={(e) => onChange({ ...group, fixedRiskPct: Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)) })}
          />
        </div>
      )}
      <div className="field">
        <label>이 묶음에 들어가는 계좌</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 16px", fontSize: 13.5 }}>
          {allAccounts.map((a) => (
            <label key={a} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 0, color: "var(--ink)" }}>
              <input
                type="checkbox"
                checked={group.accounts.includes(a)}
                onChange={(e) => onToggleAccount(a, e.target.checked)}
                style={{ width: 16, height: 16, padding: 0, flex: "0 0 auto" }}
              />
              {a}
            </label>
          ))}
        </div>
      </div>
      <div className="field" style={{ marginBottom: 12 }}>
        <label>메모</label>
        <input type="text" value={group.note} onChange={(e) => onChange({ ...group, note: e.target.value })} />
      </div>

      {result === null || targetRiskPct === null ? (
        <p className="note" style={{ color: "var(--risk)" }}>
          목표 비중을 계산할 수 없어. "집 자금" 탭의 "집 매수 예정일 · 목표 비중표"에서 집 매수 예정일과 글리드 패스 표를 입력해줘.
        </p>
      ) : (
        <>
          <div style={{ position: "relative", height: 18, borderRadius: 999, background: "var(--safe)", overflow: "hidden" }}>
            <div style={{ width: barPct(result.riskPct), height: "100%", background: "var(--risk)" }} />
          </div>
          <div style={{ position: "relative", height: 10 }}>
            <div
              style={{ position: "absolute", left: barPct(targetRiskPct), top: -22, width: 2, height: 26, background: "var(--ink)", transform: "translateX(-1px)" }}
              title="목표"
            />
          </div>
          <div className="legend" style={{ marginTop: 10 }}>
            <div className="row">
              <span className="swatch" style={{ background: "var(--risk)" }} />
              위험자산 {fmtWon(result.risk)}원 ({result.riskPct.toFixed(1)}%) · 목표 {targetRiskPct.toFixed(1)}% ({targetLabel})
            </div>
            <div className="row">
              <span className="swatch" style={{ background: "var(--safe)" }} />
              안전자산 {fmtWon(result.safe)}원 ({(100 - result.riskPct).toFixed(1)}%)
            </div>
          </div>
          <p className="note" style={{ color: result.needsRebalance ? "var(--risk)" : "var(--safe)", fontWeight: 600 }}>
            {result.scopeTotal <= 0
              ? "이 묶음에 계좌를 하나 이상 선택해줘."
              : result.needsRebalance
                ? `목표보다 위험자산이 ${Math.abs(result.driftPct).toFixed(1)}%p ${result.driftPct > 0 ? "많아" : "적어"}. 리밸런싱이 필요해.`
                : `목표 대비 ${result.driftPct >= 0 ? "+" : ""}${result.driftPct.toFixed(1)}%p — 허용 오차 안이라 그대로 둬도 돼.`}
          </p>

          {plan && plan.total > 0 && (
            <div style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 12, padding: 12, margin: "10px 0" }}>
              <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 6 }}>
                이 목표를 이루려면 (목표 위험 {plan.targetRiskPct.toFixed(1)}% = {fmtWon(plan.requiredRisk)}원)
              </div>
              {plan.capable.length > 0 && (
                <p className="note" style={{ margin: "4px 0", color: "var(--ink)" }}>
                  <strong>{plan.capable.map((a) => a.account).join(", ")}</strong> (합계 {fmtWon(plan.capableTotal)}원):{" "}
                  {plan.feasible ? (
                    <>
                      위험 <strong>{(plan.capableRiskPct ?? 0).toFixed(1)}%</strong> / 안전 {(100 - (plan.capableRiskPct ?? 0)).toFixed(1)}%로 구성
                    </>
                  ) : plan.tooLow ? (
                    <>편입 불가 계좌에 이미 있는 위험자산만으로도 목표보다 많아</>
                  ) : (
                    <>전부 위험자산으로 채워도 목표에 모자라</>
                  )}
                </p>
              )}
              {plan.capable
                .filter((a) => !a.holdsRisk)
                .map((a) => (
                  <p className="note" key={`norow-${a.account}`} style={{ margin: "4px 0", color: "var(--ink-soft)" }}>
                    {a.account}는 위험자산 편입 가능으로 설정했지만 스냅샷에 위험 상품이 없어서 추천 거래에는 아직 못 잡혀. 스냅샷에 위험 상품(0원도 괜찮아)을 추가해줘.
                  </p>
                ))}
              {plan.safeOnly.map((a) => (
                <p className="note" key={a.account} style={{ margin: "4px 0", color: "var(--ink)" }}>
                  <strong>{a.account}</strong> ({fmtWon(a.amount)}원, 묶음의 {((a.amount / plan.total) * 100).toFixed(0)}%):{" "}
                  {a.policy === "blocked"
                    ? `위험자산 편입 불가로 설정해서 안전으로 둬${a.riskAmount > 0 ? ` (이미 있는 위험 ${fmtWon(a.riskAmount)}원은 그대로)` : ""}`
                    : "위험 상품이 없어서 전액 안전으로 둬"}
                </p>
              ))}
              {!plan.feasible && (
                <p className="note" style={{ margin: "6px 0 0", color: "var(--risk)", fontWeight: 600 }}>
                  {plan.tooLow
                    ? `이 묶음의 위험 비중은 최소 약 ${plan.minRiskPct.toFixed(1)}%라서(편입 불가 계좌에 이미 있는 위험자산) 목표 ${plan.targetRiskPct.toFixed(1)}%는 달성할 수 없어. 목표를 올리거나 그 계좌의 위험자산을 옮겨야 해.`
                    : `이 묶음이 낼 수 있는 최대 위험 비중은 약 ${plan.maxRiskPct.toFixed(1)}%라서 목표 ${plan.targetRiskPct.toFixed(1)}%는 달성할 수 없어. 위쪽 목표 비중표의 값을 낮추거나, 위험자산 편입 가능 계좌를 늘리거나 자금을 더 넣어야 해.`}
                </p>
              )}
            </div>
          )}

          {result.needsRebalance && (
            <>
              <div className="result-line total">
                <span className="k">
                  {sellLabel} 매도 → {buyLabel} 매수
                </span>
                <span className="v">{fmtWon(result.achievedShift)}원</span>
              </div>
              {result.transfers.length > 0 && (
                <div style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 12, padding: 12, marginTop: 10 }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 6 }}>먼저 계좌 간 이동이 필요해</div>
                  {result.transfers.map((tr) => (
                    <p className="note" key={`${tr.from}-${tr.to}`} style={{ margin: "4px 0", color: "var(--ink)" }}>
                      <strong>{tr.from}</strong>에서 <strong>{fmtWon(tr.amount)}원</strong>을 빼서 <strong>{tr.to}</strong>로 옮겨줘.
                    </p>
                  ))}
                  <p className="note" style={{ margin: "6px 0 0" }}>아래 표에서 '이동 자금'으로 표시된 거래가 이 돈으로 하는 거래야.</p>
                </div>
              )}
              {result.trades.length > 0 && (
                <table className="grid" style={{ marginTop: 12 }}>
                  <thead>
                    <tr>
                      <th>구분</th>
                      <th>계좌</th>
                      <th>상품</th>
                      <th className="num">수량</th>
                      <th className="num">금액 (원)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...sells, ...buys].map((t, i) => (
                      <tr key={`${t.action}-${t.rowId}-${i}`}>
                        <td>
                          <span className={`tag ${t.action === "sell" ? "risk" : "safe"}`}>{t.action === "sell" ? "매도" : "매수"}</span>
                          {t.crossAccount && <span style={{ fontSize: 11, color: "var(--ink-soft)", marginLeft: 6 }}>이동 자금</span>}
                        </td>
                        <td>{t.account}</td>
                        <td>{t.item}</td>
                        <td className="num">{t.shares !== undefined ? `${t.shares}주` : "금액 단위"}</td>
                        <td className="num">{fmtWon(t.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {costs && (
                <div className="cost-box">
                  <div className="result-line">
                    <span className="k">예상 수수료 (매매율 {feePct ?? DEFAULT_FEE_PCT}%)</span>
                    <span className="v">{fmtWon(costs.fee)}원</span>
                  </div>
                  <div className="result-line">
                    <span className="k">예상 세금 (일반 과세 계좌 매도 차익 × {taxRatePct ?? DEFAULT_TAX_RATE_PCT}%)</span>
                    <span className="v">{fmtWon(costs.tax)}원</span>
                  </div>
                  {costs.unknown.length > 0 && (
                    <p className="note" style={{ margin: "6px 0 0" }}>
                      매입 원금을 입력하지 않아 세금을 계산하지 못한 상품: {costs.unknown.join(", ")}. '상품별 조건' 탭에서 매입 원금을 넣으면 반영돼.
                    </p>
                  )}
                  <p className="note" style={{ margin: "6px 0 0" }}>
                    참고용 추정치야. 실제 세금은 상품 종류(국내·해외 상장), 연간 손익 통산, 공제에 따라 달라지니 거래 전에 확인해줘.
                  </p>
                </div>
              )}
              <p className="note">
                거래 후 위험자산 비중은 약 {result.afterRiskPct.toFixed(1)}%가 돼. 계좌 안에서 판 돈은 같은 계좌에 머무르기 때문에, ISA·IRP·연금저축처럼 세금 없이
                굴릴 수 있는 계좌부터 먼저 배정했어. 매도는 보유금액 비율대로, 매수는 이미 들고 있는 상품에 비율대로 나눴어('매수 우선'으로 지정한 상품이 있으면 그 상품에만).
              </p>
              {result.notes.map((n, i) => (
                <p className="note" key={i} style={{ color: "var(--risk)" }}>
                  {n}
                </p>
              ))}
            </>
          )}
          {targetRiskPct !== null && contribAccounts.length > 0 && (
            <div className="contrib-box">
              <div className="chart-title">새로 넣을 돈으로 맞추기 (팔지 않고)</div>
              <p className="note" style={{ marginTop: 0 }}>
                월급에서 이번에 새로 넣을 돈으로만 목표 비중에 가깝게 사는 방법이야. 기존 자산을 팔지 않으니 세금이 생기지 않아. 올해 납입 한도를 다 채운 ISA처럼 이번에 넣을 수 없는 계좌는 고르지 마.
                {needed !== null && needed > 0 && (
                  <>
                    {" "}지금 비중을 팔지 않고 목표에 맞추려면 <strong>약 {fmtWon(needed)}원</strong>을 {result && result.driftPct < 0 ? "위험" : "안전"}자산으로 넣어야 해.
                  </>
                )}
              </p>
              <div className="field-row" style={{ maxWidth: 560 }}>
                <div className="field">
                  <label>이번에 새로 넣을 금액 (원)</label>
                  <MoneyInput value={payIn} onChange={setPayIn} />
                </div>
                <div className="field">
                  <label>넣을 계좌</label>
                  <select value={account} onChange={(e) => setPayAccount(e.target.value)} style={{ textAlign: "left" }}>
                    {contribAccounts.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {contribution && (
                <>
                  <div className="result-line">
                    <span className="k">위험자산으로 넣을 금액</span>
                    <span className="v">{fmtWon(contribution.buys.filter((b) => b.category === "risk").reduce((s, b) => s + b.amount, 0))}원</span>
                  </div>
                  <div className="result-line">
                    <span className="k">안전자산으로 넣을 금액</span>
                    <span className="v">{fmtWon(contribution.buys.filter((b) => b.category === "safe").reduce((s, b) => s + b.amount, 0))}원</span>
                  </div>
                  <div className="result-line total">
                    <span className="k">위험 비중</span>
                    <span className="v">
                      {contribution.riskPct.toFixed(1)}% → {contribution.afterRiskPct.toFixed(1)}% (목표 {targetRiskPct.toFixed(1)}%)
                    </span>
                  </div>
                  {contribution.buys.length > 0 && (
                    <table className="grid" style={{ marginTop: 10 }}>
                      <thead>
                        <tr>
                          <th>구분</th>
                          <th>계좌</th>
                          <th>상품</th>
                          <th className="num">수량</th>
                          <th className="num">금액 (원)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {contribution.buys.map((b) => (
                          <tr key={b.rowId}>
                            <td>
                              <span className="tag safe">매수</span>
                            </td>
                            <td>{account}</td>
                            <td>{b.item}</td>
                            <td className="num">{b.shares !== undefined ? `${b.shares}주` : "금액 단위"}</td>
                            <td className="num">{fmtWon(b.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {contribution.unspent * 10000 >= 1 && <p className="note">사지 못하고 예수금으로 남는 금액: {fmtWon(contribution.unspent)}원</p>}
                  {!contribution.reachesTarget && (
                    <p className="note">이 금액만으로는 목표 비중({targetRiskPct.toFixed(1)}%)에 닿지 못해. 위의 매도·매수 추천을 함께 쓰거나 다음 달에도 이어서 넣으면 돼.</p>
                  )}
                  {contribution.notes.map((n, i) => (
                    <p className="note" key={i} style={{ color: "var(--risk)" }}>
                      {n}
                    </p>
                  ))}
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
