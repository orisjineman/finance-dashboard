import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { DashboardData } from "./types.js";
import { defaultData } from "./defaults.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../../data");
const DATA_FILE = path.join(DATA_DIR, "finance-dashboard.json");

async function ensureFile(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.writeFile(DATA_FILE, JSON.stringify(defaultData(), null, 2), "utf-8");
  }
}

export async function readData(): Promise<DashboardData> {
  await ensureFile();
  const raw = await fs.readFile(DATA_FILE, "utf-8");
  const parsed = JSON.parse(raw) as Partial<DashboardData>;
  // Backfill fields introduced after this file was first created.
  const merged: DashboardData = { ...defaultData(), ...parsed };
  return merged;
}

// Serialize writes so concurrent requests can't interleave and corrupt the file.
let writeQueue: Promise<void> = Promise.resolve();

export function writeData(data: DashboardData): Promise<void> {
  writeQueue = writeQueue.then(async () => {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const tmpFile = `${DATA_FILE}.tmp`;
    await fs.writeFile(tmpFile, JSON.stringify(data, null, 2), "utf-8");
    await fs.rename(tmpFile, DATA_FILE);
  });
  return writeQueue;
}
