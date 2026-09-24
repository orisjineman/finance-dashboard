import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { DashboardData } from "./types.js";
import { defaultData } from "./defaults.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = process.env.FD_DATA_DIR ? path.resolve(process.env.FD_DATA_DIR) : path.resolve(__dirname, "../../data");
const DATA_FILE = path.join(DATA_DIR, "finance-dashboard.json");

async function ensureFile(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.writeFile(DATA_FILE, JSON.stringify(defaultData(), null, 2), "utf-8");
  }
}

// 예전 형식의 파일을 지금 형식으로 맞춘다. 새로 생긴 항목은 기본값으로 채우고, 없어진 항목은 버린다.
// (최상위 항목뿐 아니라 섹션 안쪽 필드와 행 안쪽 필드도 채워서, 스키마가 바뀌어도 손으로 옮기지 않게 한다.)
export function migrate(parsed: Partial<DashboardData> & Record<string, unknown>): DashboardData {
  const d = defaultData();
  const strategy = { ...d.strategy, ...(parsed.strategy ?? {}) } as DashboardData["strategy"] & Record<string, unknown>;
  delete strategy.isaPortfolio; // 삭제된 'ISA·CMA 운용 계획' 탭의 데이터
  delete strategy.cmaLadder;
  return {
    ...d,
    ...parsed,
    rows: (parsed.rows ?? d.rows).map((r) => ({ ...r, housingEligible: r.housingEligible ?? true })),
    simulation: { ...d.simulation, ...(parsed.simulation ?? {}) },
    loan: { ...d.loan, ...(parsed.loan ?? {}) },
    budget: { ...d.budget, ...(parsed.budget ?? {}) },
    strategy,
    rebalance: { ...d.rebalance, ...(parsed.rebalance ?? {}) },
  };
}

export async function readData(): Promise<DashboardData> {
  await ensureFile();
  const raw = await fs.readFile(DATA_FILE, "utf-8");
  return migrate(JSON.parse(raw));
}

// Serialize writes so concurrent requests can't interleave and corrupt the file.
let writeQueue: Promise<void> = Promise.resolve();

async function persist(data: DashboardData): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmpFile = `${DATA_FILE}.tmp`;
  await fs.writeFile(tmpFile, JSON.stringify(data, null, 2), "utf-8");
  await fs.rename(tmpFile, DATA_FILE);
}

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = writeQueue.then(task);
  writeQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

export function writeData(data: DashboardData): Promise<void> {
  return enqueue(() => persist(data));
}

// 읽고 → 고치고 → 쓰는 과정을 통째로 한 줄에 세운다. 서로 다른 섹션 저장이 동시에 들어와도 앞의 변경을 덮어쓰지 않는다.
export function updateData(mutate: (data: DashboardData) => void): Promise<DashboardData> {
  return enqueue(async () => {
    const data = await readData();
    mutate(data);
    await persist(data);
    return data;
  });
}
