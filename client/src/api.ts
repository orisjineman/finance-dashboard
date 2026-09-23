import type {
  AssetRow,
  BudgetData,
  ChecklistItem,
  DashboardData,
  HistoryEntry,
  ImportPreview,
  LoanInput,
  SimulationAssumptions,
  StrategyData,
} from "./types";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    throw new Error(`요청 실패: ${path} (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export function fetchData(): Promise<DashboardData> {
  return request<DashboardData>("/api/data");
}

export function saveRows(rows: AssetRow[]): Promise<AssetRow[]> {
  return request<AssetRow[]>("/api/rows", { method: "PUT", body: JSON.stringify(rows) });
}

export function saveSimulation(sim: SimulationAssumptions): Promise<SimulationAssumptions> {
  return request<SimulationAssumptions>("/api/simulation", { method: "PUT", body: JSON.stringify(sim) });
}

export function saveLoan(loan: LoanInput): Promise<LoanInput> {
  return request<LoanInput>("/api/loan", { method: "PUT", body: JSON.stringify(loan) });
}

export function saveChecklist(items: ChecklistItem[]): Promise<ChecklistItem[]> {
  return request<ChecklistItem[]>("/api/checklist", { method: "PUT", body: JSON.stringify(items) });
}

export function saveStrategy(strategy: StrategyData): Promise<StrategyData> {
  return request<StrategyData>("/api/strategy", { method: "PUT", body: JSON.stringify(strategy) });
}

export function saveHistory(history: HistoryEntry[]): Promise<HistoryEntry[]> {
  return request<HistoryEntry[]>("/api/history", { method: "PUT", body: JSON.stringify(history) });
}

export function saveBudget(budget: BudgetData): Promise<BudgetData> {
  return request<BudgetData>("/api/budget", { method: "PUT", body: JSON.stringify(budget) });
}

export async function importXlsx(file: File): Promise<ImportPreview> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch("/api/import-xlsx", { method: "POST", body: formData });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `업로드 실패 (${res.status})`);
  }
  return res.json() as Promise<ImportPreview>;
}
