import { useEffect, useMemo, useRef, useState } from "react";
import type { AssetRow, ChecklistItem, DashboardData, HistoryEntry, LoanInput, SimulationAssumptions, StrategyData } from "./types";
import { fetchData, saveChecklist, saveHistory, saveLoan, saveRows, saveSimulation, saveStrategy } from "./api";
import { debounce } from "./utils";
import OverviewPanel from "./components/OverviewPanel";
import SnapshotPanel from "./components/SnapshotPanel";
import SimulationPanel from "./components/SimulationPanel";
import IsaPanel from "./components/IsaPanel";
import LoanPanel from "./components/LoanPanel";
import ChecklistPanel from "./components/ChecklistPanel";

const TABS = [
  { key: "overview", label: "개요" },
  { key: "snapshot", label: "자산 스냅샷" },
  { key: "sim", label: "연도별 시뮬레이션" },
  { key: "isa", label: "ISA·CMA 전략" },
  { key: "loan", label: "대출 계산기" },
  { key: "checklist", label: "체크리스트" },
] as const;

type TabKey = (typeof TABS)[number]["key"];
type Theme = "light" | "dark";

function todayTag(): string {
  const t = new Date();
  return `${t.getFullYear()}.${String(t.getMonth() + 1).padStart(2, "0")}.${String(t.getDate()).padStart(2, "0")}`;
}

function initialTheme(): Theme {
  const saved = localStorage.getItem("fd_theme");
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export default function App() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [tab, setTab] = useState<TabKey>("overview");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [theme, setTheme] = useState<Theme>(initialTheme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("fd_theme", theme);
  }, [theme]);

  useEffect(() => {
    fetchData()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "데이터를 불러오지 못했어."));
  }, []);

  const debouncedSaveRows = useMemo(
    () =>
      debounce((rows: AssetRow[]) => {
        setSaving(true);
        saveRows(rows).finally(() => setSaving(false));
      }, 400),
    []
  );
  const debouncedSaveSim = useMemo(
    () =>
      debounce((sim: SimulationAssumptions) => {
        setSaving(true);
        saveSimulation(sim).finally(() => setSaving(false));
      }, 400),
    []
  );
  const debouncedSaveLoan = useMemo(
    () =>
      debounce((loan: LoanInput) => {
        setSaving(true);
        saveLoan(loan).finally(() => setSaving(false));
      }, 400),
    []
  );
  const debouncedSaveChecklist = useMemo(
    () =>
      debounce((items: ChecklistItem[]) => {
        setSaving(true);
        saveChecklist(items).finally(() => setSaving(false));
      }, 400),
    []
  );
  const debouncedSaveStrategy = useMemo(
    () =>
      debounce((strategy: StrategyData) => {
        setSaving(true);
        saveStrategy(strategy).finally(() => setSaving(false));
      }, 400),
    []
  );
  const debouncedSaveHistory = useMemo(
    () =>
      debounce((history: HistoryEntry[]) => {
        setSaving(true);
        saveHistory(history).finally(() => setSaving(false));
      }, 400),
    []
  );

  const dataRef = useRef(data);
  dataRef.current = data;

  function updateRows(rows: AssetRow[]) {
    if (!dataRef.current) return;
    setData({ ...dataRef.current, rows });
    debouncedSaveRows(rows);
  }
  function updateSim(sim: SimulationAssumptions) {
    if (!dataRef.current) return;
    setData({ ...dataRef.current, simulation: sim });
    debouncedSaveSim(sim);
  }
  function updateLoan(loan: LoanInput) {
    if (!dataRef.current) return;
    setData({ ...dataRef.current, loan });
    debouncedSaveLoan(loan);
  }
  function updateChecklist(items: ChecklistItem[]) {
    if (!dataRef.current) return;
    setData({ ...dataRef.current, checklist: items });
    debouncedSaveChecklist(items);
  }
  function updateStrategy(strategy: StrategyData) {
    if (!dataRef.current) return;
    setData({ ...dataRef.current, strategy });
    debouncedSaveStrategy(strategy);
  }
  function updateHistory(history: HistoryEntry[]) {
    if (!dataRef.current) return;
    setData({ ...dataRef.current, history });
    debouncedSaveHistory(history);
  }

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
          <h1 className="serif">재무 대시보드</h1>
          <div className="brand-right">
            <div className="sub">
              {todayTag()}
              {saving ? " · 저장 중…" : ""}
            </div>
            <button
              className="theme-toggle"
              onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
              aria-label="라이트/다크 모드 전환"
              title="라이트/다크 모드 전환"
            >
              {theme === "dark" ? "🌙" : "☀️"}
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
          <OverviewPanel rows={data.rows} strategy={data.strategy} onStrategyChange={updateStrategy} />
        )}
        {tab === "snapshot" && (
          <SnapshotPanel rows={data.rows} onChange={updateRows} history={data.history} onHistoryChange={updateHistory} />
        )}
        {tab === "sim" && <SimulationPanel rows={data.rows} sim={data.simulation} onChange={updateSim} />}
        {tab === "isa" && <IsaPanel strategy={data.strategy} onChange={updateStrategy} />}
        {tab === "loan" && <LoanPanel loan={data.loan} onChange={updateLoan} />}
        {tab === "checklist" && <ChecklistPanel items={data.checklist} onChange={updateChecklist} />}
      </main>

      <footer className="foot">개인 참고용 재무 대시보드 · 실제 실행 전 최신 금리·세제·대출 규제를 다시 확인할 것</footer>
    </>
  );
}
