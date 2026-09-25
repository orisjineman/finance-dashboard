import { useMemo, useState } from "react";
import type { AssetRow, RebalanceGroup, RebalanceSettings, StrategyData } from "../types";
import { fmtWon, uniqueAccounts } from "../utils";
import { glideRiskPct, yearsUntil } from "../rebalance";
import { DEFAULT_FEE_PCT, DEFAULT_TAX_RATE_PCT } from "../costs";
import GlidePathEditor from "./GlidePathEditor";
import MoneyInput from "./MoneyInput";
import SectionTitle from "./SectionTitle";
import ProductConditions from "./ProductConditions";
import RebalanceGroupCard from "./RebalanceGroupCard";

interface Props {
  rows: AssetRow[];
  strategy: StrategyData;
  settings: RebalanceSettings;
  onChange: (settings: RebalanceSettings) => void;
  onRowsChange: (rows: AssetRow[]) => void;
  onStrategyChange: (strategy: StrategyData) => void;
  onEditInfo: () => void;
}


const NO_ACCESS: Record<string, "allowed" | "blocked"> = {};
const NO_LIMIT: Record<string, number> = {};


export default function RebalancePanel({ rows, strategy, settings, onChange, onRowsChange, onStrategyChange, onEditInfo }: Props) {
  const allAccounts = useMemo(() => uniqueAccounts(rows), [rows]);
  const yearsLeft = yearsUntil(strategy.housePurchaseDate);
  const glideTarget = yearsLeft === null ? null : glideRiskPct(strategy.glidePath, yearsLeft);

  const [view, setView] = useState<string>("");
  const activeGroup = settings.groups.find((g) => g.id === view) ?? (view === "settings" || view === "products" ? null : settings.groups[0] ?? null);
  const activeView = activeGroup ? activeGroup.id : view === "products" ? "products" : "settings";

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


  return (
    <section className="panel active" id="panel-rebalance">
      <div className="subtabs" role="tablist">
        {settings.groups.map((g) => (
          <button key={g.id} role="tab" aria-selected={activeView === g.id} className={activeView === g.id ? "active" : ""} onClick={() => setView(g.id)}>
            <span className="subtab-name">{g.name}</span>
            <span className="subtab-sub">
              {g.accounts.length}개 계좌 · {g.targetType === "fixed" ? `고정 위험 ${g.fixedRiskPct}%` : "집 매수 시점에 맞춰 조정"}
            </span>
          </button>
        ))}
        <button role="tab" aria-selected={activeView === "settings"} className={activeView === "settings" ? "active" : ""} onClick={() => setView("settings")}>
          <span className="subtab-name">공통 기준</span>
          <span className="subtab-sub">허용 오차 · 계좌별 편입</span>
        </button>
        <button role="tab" aria-selected={activeView === "products"} className={activeView === "products" ? "active" : ""} onClick={() => setView("products")}>
          <span className="subtab-name">상품별 조건</span>
          <span className="subtab-sub">1주 가격 · 매매 규칙</span>
        </button>
      </div>

      {activeView === "settings" && (
        <>
      <SectionTitle>리밸런싱 기준</SectionTitle>
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
            ? "집 매수 예정일이 아직 없어. '집 자금' 탭의 '집 매수 예정일 · 목표 비중표'에서 입력해줘."
            : `집 매수 예정일은 ${strategy.housePurchaseDate}이고, 약 ${yearsLeft.toFixed(1)}년 남았어.`}
        </p>
        <div className="field-row" style={{ maxWidth: 520 }}>
          <div className="field">
            <label>매매 수수료율 (%)</label>
            <input type="number" min={0} step={0.005} value={settings.feePct ?? DEFAULT_FEE_PCT} onChange={(e) => onChange({ ...settings, feePct: Math.max(0, parseFloat(e.target.value) || 0) })} />
          </div>
          <div className="field">
            <label>매도 차익 세율 (%)</label>
            <input type="number" min={0} step={0.1} value={settings.taxRatePct ?? DEFAULT_TAX_RATE_PCT} onChange={(e) => onChange({ ...settings, taxRatePct: Math.max(0, parseFloat(e.target.value) || 0) })} />
          </div>
        </div>
        <p className="note" style={{ marginTop: 0 }}>
          추천 거래의 '예상 비용'을 계산할 때만 쓰는 값이야. 기본값은 수수료 0.015%, 세율 15.4%(국내 상장 ETF 배당소득세 기준)이고, 해외 상장 상품(양도세 22% 등)은 세율을 직접 바꿔서 봐.
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
                  <th className="num">이번에 넣을 수 있는 금액 (원)</th>
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

        </>
      )}

      {activeGroup && (
        <>
          {activeGroup.targetType === "glide" && (
            <>
              <SectionTitle>집 매수 예정일 · 목표 비중표</SectionTitle>
              <GlidePathEditor strategy={strategy} onChange={onStrategyChange} onEditInfo={onEditInfo} />
              <p className="note">
                '집 매수 시점에 맞춰 낮추기'를 고른 묶음은 이 표의 목표를 따라가. 표의 비중은 <strong>그 묶음 전체</strong>(CMA처럼 위험 상품이 없는 계좌 포함)에 대한 비율이야.
              </p>
            </>
          )}
          <SectionTitle>{activeGroup.name} 리밸런싱</SectionTitle>
          <RebalanceGroupCard
            group={activeGroup}
            rows={rows}
            allAccounts={allAccounts}
            tolerancePct={settings.tolerancePct}
            feePct={settings.feePct}
            taxRatePct={settings.taxRatePct}
            targetRiskPct={activeGroup.targetType === "fixed" ? activeGroup.fixedRiskPct : glideTarget}
            targetLabel={activeGroup.targetType === "fixed" ? "고정 비중" : "글리드 패스"}
            riskAccess={riskAccess}
            depositLimit={depositLimit}
            onChange={updateGroup}
            onToggleAccount={(a, on) => toggleAccount(activeGroup.id, a, on)}
          />
        </>
      )}

      {activeView === "products" && <ProductConditions rows={rows} tradableRows={tradableRows} onRowsChange={onRowsChange} />}
    </section>
  );
}
