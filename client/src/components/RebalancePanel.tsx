import { useMemo } from "react";
import type { AssetRow, RebalanceGroup, RebalanceSettings, StrategyData } from "../types";
import { fmtWon } from "../utils";
import { computeRebalance, deriveGroupPlan, glideRiskPct, yearsUntil } from "../rebalance";
import GlidePathEditor from "./GlidePathEditor";
import MoneyInput from "./MoneyInput";
import QuoteBar from "./QuoteBar";
import type { QuoteResult } from "../api";

interface Props {
  rows: AssetRow[];
  strategy: StrategyData;
  settings: RebalanceSettings;
  onChange: (settings: RebalanceSettings) => void;
  onRowsChange: (rows: AssetRow[]) => void;
  onStrategyChange: (strategy: StrategyData) => void;
}

interface GroupProps {
  group: RebalanceGroup;
  rows: AssetRow[];
  allAccounts: string[];
  tolerancePct: number;
  targetRiskPct: number | null;
  targetLabel: string;
  riskAccess: Record<string, "allowed" | "blocked">;
  depositLimit: Record<string, number>;
  onChange: (group: RebalanceGroup) => void;
  onToggleAccount: (account: string, on: boolean) => void;
}

const barPct = (n: number) => `${Math.max(0, Math.min(100, n))}%`;
const NO_ACCESS: Record<string, "allowed" | "blocked"> = {};
const NO_LIMIT: Record<string, number> = {};

function GroupSection({ group, rows, allAccounts, tolerancePct, targetRiskPct, targetLabel, riskAccess, depositLimit, onChange, onToggleAccount }: GroupProps) {
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
          목표 비중을 계산할 수 없어. ISA·CMA 전략 탭에서 집 매수 예정일과 글리드 패스 표를 입력해줘.
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
                      <th className="num">금액(원)</th>
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
        </>
      )}
    </div>
  );
}

export default function RebalancePanel({ rows, strategy, settings, onChange, onRowsChange, onStrategyChange }: Props) {
  const allAccounts = useMemo(() => Array.from(new Set(rows.map((r) => r.account).filter(Boolean))).sort(), [rows]);
  const yearsLeft = yearsUntil(strategy.housePurchaseDate);
  const glideTarget = yearsLeft === null ? null : glideRiskPct(strategy.glidePath, yearsLeft);

  const riskAccess = settings.riskAccess ?? NO_ACCESS;
  const depositLimit = settings.depositLimit ?? NO_LIMIT;

  function setDeposit(account: string, manwon: number) {
    const next = { ...depositLimit };
    if (manwon > 0) next[account] = manwon;
    else delete next[account];
    onChange({ ...settings, depositLimit: next });
  }

  function setAccess(account: string, value: string) {
    const next = { ...riskAccess };
    if (value === "allowed" || value === "blocked") next[account] = value;
    else delete next[account];
    onChange({ ...settings, riskAccess: next });
  }

  const grouped = new Set(settings.groups.flatMap((g) => g.accounts));
  const ungrouped = allAccounts.filter((a) => !grouped.has(a));
  const tradableRows = rows.filter((r) => grouped.has(r.account) && (r.category === "risk" || r.category === "safe"));

  function updateGroup(next: RebalanceGroup) {
    onChange({ ...settings, groups: settings.groups.map((g) => (g.id === next.id ? next : g)) });
  }

  function toggleAccount(groupId: string, account: string, on: boolean) {
    onChange({
      ...settings,
      groups: settings.groups.map((g) => {
        if (g.id === groupId) {
          return { ...g, accounts: on ? [...g.accounts.filter((a) => a !== account), account] : g.accounts.filter((a) => a !== account) };
        }
        return on ? { ...g, accounts: g.accounts.filter((a) => a !== account) } : g;
      }),
    });
  }

  // 같은 상품이 여러 계좌에 있어도 한 줄로 묶어서 보여주고, 입력하면 그 상품이 있는 모든 계좌에 적용한다.
  const products = Array.from(
    tradableRows.reduce((map, r) => {
      const cur = map.get(r.item) ?? { item: r.item, accounts: [] as string[], amount: 0, rules: new Set<string>() };
      if (!cur.accounts.includes(r.account)) cur.accounts.push(r.account);
      cur.amount += r.amount;
      cur.rules.add(r.rebalanceRule ?? "");
      return map.set(r.item, cur);
    }, new Map<string, { item: string; accounts: string[]; amount: number; rules: Set<string> }>())
  ).map(([, v]) => {
    const priced = rows.find((r) => r.item === v.item && (r.unitPrice ?? 0) > 0);
    const withTicker = rows.find((r) => r.item === v.item && r.ticker);
    return { ...v, price: priced?.unitPrice, priceDate: priced?.priceDate, ticker: withTicker?.ticker ?? "" };
  });

  const tickers = Array.from(new Set(products.map((p) => p.ticker).filter(Boolean)));

  function applyQuotes(results: Record<string, QuoteResult>) {
    const toDate = (d?: string) => (d && d.length === 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : undefined);
    onRowsChange(
      rows.map((r) => {
        const q = r.ticker ? results[r.ticker] : undefined;
        return q?.ok && q.price ? { ...r, unitPrice: q.price / 10000, priceDate: toDate(q.basDt) } : r;
      })
    );
  }

  function updateProduct(item: string, patch: Partial<AssetRow>) {
    onRowsChange(rows.map((r) => (r.item === item ? { ...r, ...patch } : r)));
  }

  return (
    <section className="panel active" id="panel-rebalance">
      <h2 className="section-title">
        <span className="num">01</span> 리밸런싱 기준
      </h2>
      <div className="card">
        <div className="field" style={{ maxWidth: 240 }}>
          <label>허용 오차 (±%p)</label>
          <input
            type="number"
            min={0}
            step={0.5}
            value={settings.tolerancePct}
            onChange={(e) => onChange({ ...settings, tolerancePct: Math.max(0, parseFloat(e.target.value) || 0) })}
          />
        </div>
        <p className="note" style={{ marginTop: 0 }}>
          목표 비중에서 이 값 이상 벗어났을 때만 팔고 사라고 알려줘.{" "}
          {yearsLeft === null
            ? "집 매수 예정일이 아직 없어. ISA·CMA 전략 탭에서 입력해줘."
            : `집 매수 예정일은 ${strategy.housePurchaseDate}이고, 약 ${yearsLeft.toFixed(1)}년 남았어.`}
        </p>
        <div className="field" style={{ marginTop: 4 }}>
          <label>계좌별 위험자산 편입</label>
          <div className="table-scroll">
            <table className="grid" style={{ minWidth: 700 }}>
              <thead>
                <tr>
                  <th>계좌</th>
                  <th className="num">지금 들고 있는 위험자산</th>
                  <th>편입 설정</th>
                  <th className="num">이번에 넣을 수 있는 금액(원)</th>
                </tr>
              </thead>
              <tbody>
                {allAccounts
                  .filter((a) => grouped.has(a))
                  .map((a) => {
                    const riskNow = rows.filter((r) => r.account === a && r.category === "risk").reduce((sum, r) => sum + r.amount, 0);
                    const holds = rows.some((r) => r.account === a && r.category === "risk");
                    return (
                      <tr key={a}>
                        <td>{a}</td>
                        <td className="num">{holds ? `${fmtWon(riskNow)}원` : "없음"}</td>
                        <td>
                          <select value={riskAccess[a] ?? ""} onChange={(e) => setAccess(a, e.target.value)} style={{ textAlign: "left" }}>
                            <option value="">자동 ({holds ? "위험 상품 있음 → 가능" : "위험 상품 없음 → 불가"})</option>
                            <option value="allowed">위험자산 편입 가능</option>
                            <option value="blocked">위험자산 편입 불가</option>
                          </select>
                        </td>
                        <td className="num">
                          <MoneyInput value={depositLimit[a] ?? 0} onChange={(v) => setDeposit(a, v)} />
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
          <p className="note">
            '편입 불가'로 두면 그 계좌에는 위험자산을 새로 사지 않고, 나머지 계좌가 목표 위험 비중을 맡아. '자동'은 위험 상품이 있는 계좌만 가능으로 봐.
            <br />
            '이번에 넣을 수 있는 금액'은 다른 계좌에서 이 계좌로 옮겨 올 수 있는 한도야. 0이면 이 계좌로는 돈을 옮기지 않아(예: ISA는 올해 납입 한도를 다 채웠으면 0, 2027년에 새 한도가 생기면 그때 입력).
            돈을 뺄 수 있는 계좌는 ISA·IRP·연금저축처럼 묶인 계좌를 뺀 일반 계좌(CMA·위탁 등)만이야.
          </p>
        </div>
        <p className="note">
          자금의 용도별로 묶음을 나눠서 각각 목표 비중을 정해. CMA·예금·주택청약처럼 어느 묶음에도 넣지 않은 계좌는 리밸런싱하지 않아
          {ungrouped.length > 0 ? ` (지금은: ${ungrouped.join(", ")}).` : "."}
        </p>
      </div>

      <h2 className="section-title">
        <span className="num">02</span> 집 매수 예정일 · 목표 비중표
      </h2>
      <GlidePathEditor strategy={strategy} onChange={onStrategyChange} />
      <p className="note">
        '집 매수 시점에 맞춰 낮추기'를 고른 묶음은 이 표의 목표를 따라가. 표의 비중은 <strong>그 묶음 전체</strong>(CMA처럼 위험 상품이 없는 계좌 포함)에 대한 비율이야.
      </p>

      {settings.groups.map((g, i) => (
        <div key={g.id}>
          <h2 className="section-title">
            <span className="num">{String(i + 3).padStart(2, "0")}</span> {g.name}
          </h2>
          <GroupSection
            group={g}
            rows={rows}
            allAccounts={allAccounts}
            tolerancePct={settings.tolerancePct}
            targetRiskPct={g.targetType === "fixed" ? g.fixedRiskPct : glideTarget}
            targetLabel={g.targetType === "fixed" ? "고정 비중" : "글리드 패스"}
            riskAccess={riskAccess}
            depositLimit={depositLimit}
            onChange={updateGroup}
            onToggleAccount={(a, on) => toggleAccount(g.id, a, on)}
          />
        </div>
      ))}

      <h2 className="section-title">
        <span className="num">{String(settings.groups.length + 3).padStart(2, "0")}</span> 상품별 거래 조건 (선택)
      </h2>
      <div className="card">
        <p className="note" style={{ marginTop: 0 }}>
          <strong>1주 가격</strong>을 넣으면 정수 주수로 계산하고, 비워두면 금액 단위(소수점 거래, RP·예수금 등)로 계산해. 가격은 시세에 따라 바뀌니 거래 직전에 다시 확인해줘. 같은 상품이 여러 계좌에 있으면 한 번만 입력해도 모든 계좌에 적용돼.
          <br />
          <strong>매매 안 함</strong>은 만기까지 들고 갈 채권처럼 팔지도 더 사지도 않을 상품에, <strong>매수 우선</strong>은 새로 살 때 그 상품에만 몰아서 사고 싶을 때(예: S&P500만 살 때) 지정해.
        </p>
        <QuoteBar tickers={tickers} onResults={applyQuotes} />
        <div className="table-scroll">
        <table className="grid" style={{ marginTop: 8, minWidth: 780 }}>
          <thead>
            <tr>
              <th>상품</th>
              <th>보유 계좌</th>
              <th>종목코드</th>
              <th className="num">보유 수량</th>
              <th className="num">1주 가격(원)</th>
              <th>규칙</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => {
              const mixed = p.rules.size > 1;
              return (
                <tr key={p.item}>
                  <td>{p.item}</td>
                  <td style={{ fontSize: 12, color: "var(--ink-soft)" }}>{p.accounts.join(", ")}</td>
                  <td>
                    <input
                      type="text"
                      value={p.ticker}
                      placeholder="예: 360750"
                      onChange={(e) => updateProduct(p.item, { ticker: e.target.value.trim().toUpperCase() || undefined })}
                      style={{ textAlign: "left", width: 110 }}
                    />
                  </td>
                  <td className="num">{p.price && p.price > 0 ? `${(p.amount / p.price).toFixed(2)}주` : "-"}</td>
                  <td className="num">
                    <MoneyInput value={p.price ?? 0} onChange={(v) => updateProduct(p.item, { unitPrice: v > 0 ? v : undefined, priceDate: undefined })} />
                    {p.priceDate && <div style={{ fontSize: 11, color: "var(--ink-soft)", marginTop: 2 }}>{p.priceDate} 종가</div>}
                  </td>
                  <td>
                    <select
                      value={mixed ? "mixed" : Array.from(p.rules)[0]}
                      onChange={(e) => updateProduct(p.item, { rebalanceRule: (e.target.value || undefined) as AssetRow["rebalanceRule"] })}
                      style={{ textAlign: "left" }}
                    >
                      {mixed && (
                        <option value="mixed" disabled>
                          계좌마다 다름
                        </option>
                      )}
                      <option value="">기본</option>
                      <option value="hold">매매 안 함</option>
                      <option value="preferred">매수 우선</option>
                    </select>
                  </td>
                </tr>
              );
            })}
            {products.length === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: "center", color: "var(--ink-soft)" }}>
                  위에서 묶음에 계좌를 넣으면 여기에 상품이 나타나.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>
    </section>
  );
}
