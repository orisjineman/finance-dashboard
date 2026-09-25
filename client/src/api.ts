import type {
  AssetRow,
  BudgetData,
  ChecklistItem,
  DashboardData,
  HistoryEntry,
  HomeSimInput,
  ImportPreview,
  LoanInput,
  RebalanceSettings,
  SimulationAssumptions,
  StrategyData,
} from "./types";

// 섹션별로 마지막으로 본 서버 버전. 저장할 때 If-Match로 보내서, 다른 화면이 먼저 바꿨으면 서버가 409로 막는다.
const versions: Record<string, string> = {};

export class ConflictError extends Error {
  constructor() {
    super("다른 화면에서 먼저 바뀌었어. 새로고침한 뒤 다시 시도해줘.");
    this.name = "ConflictError";
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (res.status === 409) throw new ConflictError();
  if (!res.ok) {
    throw new Error(`요청 실패: ${path} (${res.status})`);
  }
  return res.json() as Promise<T>;
}

async function saveSection<T>(section: string, value: T): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (versions[section]) headers["If-Match"] = versions[section];
  const res = await fetch(`/api/${section}`, { method: "PUT", headers, body: JSON.stringify(value) });
  if (res.status === 409) throw new ConflictError();
  if (!res.ok) throw new Error(`요청 실패: /api/${section} (${res.status})`);
  const next = res.headers.get("X-Version");
  if (next) versions[section] = next;
  return (await res.json()) as T;
}

export async function fetchData(): Promise<DashboardData> {
  const { _versions, ...data } = await request<DashboardData & { _versions?: Record<string, string> }>("/api/data");
  Object.assign(versions, _versions);
  return data;
}

export const saveRows = (rows: AssetRow[]) => saveSection("rows", rows);
export const saveSimulation = (sim: SimulationAssumptions) => saveSection("simulation", sim);
export const saveLoan = (loan: LoanInput) => saveSection("loan", loan);
export const saveChecklist = (items: ChecklistItem[]) => saveSection("checklist", items);
export const saveStrategy = (strategy: StrategyData) => saveSection("strategy", strategy);
export const saveHistory = (history: HistoryEntry[]) => saveSection("history", history);
export const saveBudget = (budget: BudgetData) => saveSection("budget", budget);
export const saveRebalance = (rebalance: RebalanceSettings) => saveSection("rebalance", rebalance);
export const saveHome = (home: HomeSimInput) => saveSection("home", home);

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

export interface QuoteResult {
  ok: boolean;
  price?: number; // 원
  basDt?: string; // YYYYMMDD
  name?: string;
  source?: string;
  error?: string;
}

export async function getQuoteStatus(): Promise<{ hasKey: boolean }> {
  return request<{ hasKey: boolean }>("/api/quotes/status");
}

export async function saveQuoteKey(key: string): Promise<void> {
  const res = await fetch("/api/quotes/key", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `키 저장 실패 (${res.status})`);
  }
}

export async function fetchQuotes(codes: string[]): Promise<Record<string, QuoteResult>> {
  const res = await fetch("/api/quotes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ codes }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `시세 조회 실패 (${res.status})`);
  return body.results as Record<string, QuoteResult>;
}

export interface BackupInfo {
  name: string;
  createdAt: string;
  size: number;
}

export async function listBackups(): Promise<BackupInfo[]> {
  return (await request<{ backups: BackupInfo[] }>("/api/backups")).backups;
}

export async function createBackup(): Promise<void> {
  await request("/api/backups", { method: "POST", body: "{}" });
}

export async function restoreBackup(name: string): Promise<void> {
  await request("/api/backups/restore", { method: "POST", body: JSON.stringify({ name }) });
}

export async function importJson(data: unknown): Promise<void> {
  const res = await fetch("/api/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `가져오기 실패 (${res.status})`);
  }
}
