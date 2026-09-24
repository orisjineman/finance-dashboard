import { useEffect, useRef, useState } from "react";
import type { AssetRow, BudgetData, ChecklistItem, DashboardData, HistoryEntry, LoanInput, RebalanceSettings, SimulationAssumptions, StrategyData } from "./types";
import { fetchData, saveBudget, saveRebalance, saveChecklist, saveHistory, saveLoan, saveRows, saveSimulation, saveStrategy } from "./api";
import OverviewPanel from "./components/OverviewPanel";
import SnapshotPanel from "./components/SnapshotPanel";
import BudgetPanel from "./components/BudgetPanel";
import RebalancePanel from "./components/RebalancePanel";
import SimulationPanel from "./components/SimulationPanel";
import LoanPanel from "./components/LoanPanel";
import ChecklistPanel from "./components/ChecklistPanel";

const TABS = [
  { key: "overview", label: "개요" },
  { key: "snapshot", label: "자산 스냅샷" },
  { key: "budget", label: "월급·예산" },
  { key: "rebalance", label: "리밸런싱" },
  { key: "sim", label: "연도별 시뮬레이션" },
  { key: "loan", label: "대출 계산기" },
  { key: "checklist", label: "체크리스트" },
] as const;

const SAVE_DELAY_MS = 400;

const SAVERS: { [K in keyof DashboardData]: (value: DashboardData[K]) => Promise<unknown> } = {
  rows: saveRows,
  simulation: saveSimulation,
  loan: saveLoan,
  checklist: saveChecklist,
  strategy: saveStrategy,
  history: saveHistory,
  budget: saveBudget,
  rebalance: saveRebalance,
};

type TabKey = (typeof TABS)[number]["key"];
type Theme = "light" | "dark";

// 라이트/다크 전환 아이콘 (현재 테마를 보여준다)
function ThemeIcon({ dark }: { dark: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {dark ? (
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
      ) : (
        <>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </>
      )}
    </svg>
  );
}

function todayTag(): string {
  const t = new Date();
  return `${t.getFullYear()}.${String(t.getMonth() + 1).padStart(2, "0")}.${String(t.getDate()).padStart(2, "0")}`;
}

function initialTheme(): Theme {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem("fd_theme");
  } catch {
    // 저장소를 못 쓰면 시스템 설정을 따른다
  }
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export default function App() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [tab, setTab] = useState<TabKey>("overview");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [theme, setTheme] = useState<Theme>(initialTheme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem("fd_theme", theme);
    } catch {
      // 무시
    }
  }, [theme]);

  useEffect(() => {
    fetchData()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "데이터를 불러오지 못했어."));
  }, []);

  // 섹션별로 400ms 뒤 서버에 저장한다. 화면 상태는 함수형 갱신이라 같은 이벤트에서 여러 섹션을 바꿔도 서로 덮어쓰지 않는다.
  const timers = useRef<Partial<Record<keyof DashboardData, ReturnType<typeof setTimeout>>>>({});
  const pending = useRef(0);

  function update<K extends keyof DashboardData>(key: K, value: DashboardData[K]) {
    setData((prev) => (prev ? { ...prev, [key]: value } : prev));
    clearTimeout(timers.current[key]);
    timers.current[key] = setTimeout(() => {
      pending.current += 1;
      setSaving(true);
      setSaveFailed(false);
      (SAVERS[key] as (v: DashboardData[K]) => Promise<unknown>)(value)
        .catch(() => setSaveFailed(true))
        .finally(() => {
          pending.current -= 1;
          if (pending.current === 0) setSaving(false);
        });
    }, SAVE_DELAY_MS);
  }

  const updateRows = (rows: AssetRow[]) => update("rows", rows);
  const updateSim = (sim: SimulationAssumptions) => update("simulation", sim);
  const updateLoan = (loan: LoanInput) => update("loan", loan);
  const updateChecklist = (items: ChecklistItem[]) => update("checklist", items);
  const updateStrategy = (strategy: StrategyData) => update("strategy", strategy);
  const updateHistory = (history: HistoryEntry[]) => update("history", history);
  const updateRebalance = (rebalance: RebalanceSettings) => update("rebalance", rebalance);
  const updateBudget = (budget: BudgetData) => update("budget", budget);

  if (error) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <p>{error}</p>
        <p className="note">서버(npm run dev)가 켜져 있는지 확인해줘.</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <p>불러오는 중…</p>
      </div>
    );
  }

  return (
    <>
      <header className="top">
        <div className="brand">
          <h1 className="brand-title">재무 대시보드</h1>
          <div className="brand-right">
            <div className="sub">
              {todayTag()}
              {saving ? " · 저장 중…" : ""}
              {saveFailed && !saving ? " · 저장 실패 (서버가 켜져 있는지 확인해줘)" : ""}
            </div>
            <button
              className="theme-toggle"
              onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
              aria-label="라이트/다크 모드 전환"
              title="라이트/다크 모드 전환"
            >
              <ThemeIcon dark={theme === "dark"} />
            </button>
          </div>
        </div>
        <nav className="tabs">
          {TABS.map((t) => (
            <button key={t.key} className={tab === t.key ? "active" : ""} onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main>
        {tab === "overview" && (
          <OverviewPanel
            rows={data.rows}
            strategy={data.strategy}
            onStrategyChange={updateStrategy}
            budget={data.budget}
            onBudgetChange={updateBudget}
            loan={data.loan}
            history={data.history}
          />
        )}
        {tab === "snapshot" && (
          <SnapshotPanel rows={data.rows} onChange={updateRows} history={data.history} onHistoryChange={updateHistory} />
        )}
        {tab === "rebalance" && <RebalancePanel rows={data.rows} strategy={data.strategy} settings={data.rebalance} onChange={updateRebalance} onRowsChange={updateRows} onStrategyChange={updateStrategy} />}
        {tab === "budget" && <BudgetPanel budget={data.budget} onChange={updateBudget} />}
        {tab === "sim" && (
          <SimulationPanel rows={data.rows} sim={data.simulation} onChange={updateSim} annualRaisePct={data.budget.annualRaisePct} />
        )}
        {tab === "loan" && <LoanPanel rows={data.rows} loan={data.loan} onChange={updateLoan} />}
        {tab === "checklist" && <ChecklistPanel items={data.checklist} onChange={updateChecklist} />}
      </main>

      <footer className="foot">개인 참고용 재무 대시보드 · 실제 실행 전 최신 금리·세제·대출 규제를 다시 확인할 것</footer>
    </>
  );
}
