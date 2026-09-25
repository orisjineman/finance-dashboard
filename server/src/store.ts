import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { DashboardData } from "./types.js";
import { defaultData, defaultTaxPrep } from "./defaults.js";

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
  const home = { ...d.home, ...(parsed.home ?? {}) } as DashboardData["home"] & Record<string, unknown>;
  delete home.raisePct; // 인상률은 내 정보 탭(budget.annualRaisePct) 하나로 통일
  // LTV는 정책 설정(home.policy.bogeumjari.ltv) 하나로 통일. 예전 loan.ltvPct만 있으면 그 값을 옮겨 온다.
  const loan = { ...d.loan, ...(parsed.loan ?? {}) } as DashboardData["loan"] & Record<string, unknown>;
  const oldLtvPct = typeof loan.ltvPct === "number" ? loan.ltvPct : undefined;
  delete loan.ltvPct;
  delete loan.termYears; // 상환기간은 내 집 마련 비교표에서 30·40년을 모두 계산하므로 쓰지 않는다
  const ltvFromOld = parsed.home?.policy?.bogeumjari?.ltv === undefined && oldLtvPct !== undefined ? { ltv: oldLtvPct / 100 } : {};
  return {
    ...d,
    ...parsed,
    rows: (parsed.rows ?? d.rows).map((r) => ({ ...r, housingEligible: r.housingEligible ?? true })),
    simulation: { ...d.simulation, ...(parsed.simulation ?? {}) },
    loan,
    budget: (() => {
      const t = defaultTaxPrep();
      const p = parsed.budget?.taxPrep;
      return {
        ...d.budget,
        ...(parsed.budget ?? {}),
        taxPrep: {
          ...t,
          ...(p ?? {}),
          policy: {
            ...t.policy,
            ...(p?.policy ?? {}),
            pension: { ...t.policy.pension!, ...(p?.policy?.pension ?? {}) },
            rent: { ...t.policy.rent, ...(p?.policy?.rent ?? {}) },
            subscription: { ...t.policy.subscription, ...(p?.policy?.subscription ?? {}) },
            card: { ...t.policy.card, ...(p?.policy?.card ?? {}) },
          },
        },
      };
    })(),
    strategy,
    rebalance: { ...d.rebalance, ...(parsed.rebalance ?? {}) },
    home: {
      ...home,
      policy: {
        ...d.home.policy,
        ...(parsed.home?.policy ?? {}),
        bogeumjari: { ...d.home.policy.bogeumjari, ...ltvFromOld, ...(parsed.home?.policy?.bogeumjari ?? {}) },
        didimdolSingle: { ...d.home.policy.didimdolSingle, ...(parsed.home?.policy?.didimdolSingle ?? {}) },
        // '적정' 상한은 목표 상환 비중(targetRatioPct) 하나로 통일. 예전 judge.okMax는 버린다
        judge: { tightMax: parsed.home?.policy?.judge?.tightMax ?? d.home.policy.judge.tightMax },
      },
    },
  };
}

export async function readData(): Promise<DashboardData> {
  await ensureFile();
  const raw = await fs.readFile(DATA_FILE, "utf-8");
  return migrate(JSON.parse(raw));
}

// Serialize writes so concurrent requests can't interleave and corrupt the file.
let writeQueue: Promise<void> = Promise.resolve();

const BACKUP_DIR = path.join(DATA_DIR, "backups");
const BACKUP_KEEP = 30; // 자동·수동 백업을 최근 이만큼만 보관
const AUTO_BACKUP_INTERVAL_MS = 10 * 60 * 1000; // 저장이 잦아도 자동 백업은 이 간격으로만
const BACKUP_NAME = /^finance-dashboard-[0-9-]+(-[a-z-]+)?\.json$/;
let lastAutoBackup = 0;

export interface BackupInfo {
  name: string;
  createdAt: string; // ISO
  size: number; // bytes
}

function stamp(d = new Date()): string {
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${p(d.getMilliseconds(), 3)}`;
}

// 지금 데이터 파일을 backups/ 에 복사해 두고, 오래된 백업은 정리한다. 데이터 파일이 아직 없으면 null.
async function createBackupFile(tag: string): Promise<string | null> {
  try {
    await fs.access(DATA_FILE);
  } catch {
    return null;
  }
  await fs.mkdir(BACKUP_DIR, { recursive: true });
  const name = `finance-dashboard-${stamp()}${tag ? `-${tag}` : ""}.json`;
  await fs.copyFile(DATA_FILE, path.join(BACKUP_DIR, name));
  const names = (await fs.readdir(BACKUP_DIR)).filter((n) => BACKUP_NAME.test(n)).sort();
  for (const old of names.slice(0, Math.max(0, names.length - BACKUP_KEEP))) await fs.rm(path.join(BACKUP_DIR, old), { force: true });
  return name;
}

export async function listBackups(): Promise<BackupInfo[]> {
  let names: string[] = [];
  try {
    names = (await fs.readdir(BACKUP_DIR)).filter((n) => BACKUP_NAME.test(n));
  } catch {
    return [];
  }
  const infos = await Promise.all(
    names.map(async (name) => {
      const st = await fs.stat(path.join(BACKUP_DIR, name));
      return { name, createdAt: st.mtime.toISOString(), size: st.size };
    })
  );
  return infos.sort((a, b) => b.name.localeCompare(a.name));
}

async function persist(data: DashboardData): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  if (Date.now() - lastAutoBackup >= AUTO_BACKUP_INTERVAL_MS) {
    lastAutoBackup = Date.now();
    await createBackupFile("auto"); // 바뀌기 전 상태를 남긴다
  }
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

// 지금 상태를 바로 백업한다 (화면의 '지금 백업').
export function backupNow(): Promise<string | null> {
  return enqueue(() => createBackupFile("manual"));
}

// 백업 파일로 되돌린다. 되돌리기 직전 상태도 백업으로 남겨서 되돌리기를 다시 되돌릴 수 있다. 이름이 올바르지 않거나 없으면 null.
export function restoreBackup(name: string): Promise<DashboardData | null> {
  return enqueue(async () => {
    if (!BACKUP_NAME.test(name)) return null;
    let raw: string;
    try {
      raw = await fs.readFile(path.join(BACKUP_DIR, name), "utf-8");
    } catch {
      return null;
    }
    const data = migrate(JSON.parse(raw));
    await createBackupFile("before-restore");
    lastAutoBackup = Date.now();
    await persist(data);
    return data;
  });
}

// 내보낸 파일 등으로 전체 데이터를 통째로 바꾼다. 바꾸기 직전 상태는 백업으로 남긴다.
export function replaceAll(input: Partial<DashboardData> & Record<string, unknown>): Promise<DashboardData> {
  return enqueue(async () => {
    const data = migrate(input);
    await createBackupFile("before-import");
    lastAutoBackup = Date.now();
    await persist(data);
    return data;
  });
}
