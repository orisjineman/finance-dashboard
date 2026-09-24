import { promises as fs } from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./store.js";

// API 키처럼 화면(브라우저)에 내려보내면 안 되는 값은 data.json과 분리해서 서버만 읽는다. data/ 폴더는 gitignore 대상.
const SECRETS_FILE = path.join(DATA_DIR, "secrets.json");

interface Secrets {
  publicDataKey?: string;
}

async function readSecrets(): Promise<Secrets> {
  try {
    return JSON.parse(await fs.readFile(SECRETS_FILE, "utf-8")) as Secrets;
  } catch {
    return {};
  }
}

export async function getPublicDataKey(): Promise<string | null> {
  return (await readSecrets()).publicDataKey ?? null;
}

export async function setPublicDataKey(key: string): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const next: Secrets = { ...(await readSecrets()), publicDataKey: key };
  await fs.writeFile(SECRETS_FILE, JSON.stringify(next, null, 2), { encoding: "utf-8", mode: 0o600 });
}
