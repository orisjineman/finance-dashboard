import express from "express";
import cors from "cors";
import multer from "multer";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readData, updateData } from "./store.js";
import { parseWorkbook } from "./xlsxImport.js";
import { getPublicDataKey, setPublicDataKey } from "./secrets.js";
import { fetchQuotes } from "./quotes.js";
import type { DashboardData } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 화면에서 섹션 단위로 저장하는 항목과, 각 항목이 배열이어야 하는지(객체여야 하는지)
const SECTIONS = {
  rows: "array",
  simulation: "object",
  loan: "object",
  checklist: "array",
  strategy: "object",
  history: "array",
  budget: "object",
  rebalance: "object",
} as const satisfies Record<keyof DashboardData, "array" | "object">;
type Section = keyof typeof SECTIONS;

function validShape(kind: "array" | "object", body: unknown): boolean {
  return kind === "array" ? Array.isArray(body) : typeof body === "object" && body !== null && !Array.isArray(body);
}

export function createApp() {
  const app = express();
  app.use(cors({ exposedHeaders: ["X-Version"] }));
  app.use(express.json({ limit: "5mb" }));

  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

  // 섹션별 버전. 다른 탭·화면이 먼저 저장했는데 오래된 화면이 덮어쓰려 하면 409로 막는다.
  // 서버를 다시 켜면 버전이 바뀌므로 그 전에 열어 둔 화면도 한 번은 새로고침을 요구한다.
  const boot = Date.now().toString(36);
  const counters = new Map<Section, number>();
  const tokenOf = (s: Section) => `${boot}.${counters.get(s) ?? 0}`;
  const allTokens = () => Object.fromEntries((Object.keys(SECTIONS) as Section[]).map((s) => [s, tokenOf(s)]));

  app.get("/api/data", async (_req, res) => {
    try {
      res.json({ ...(await readData()), _versions: allTokens() });
    } catch {
      res.status(500).json({ error: "데이터를 읽지 못했어." });
    }
  });

  for (const section of Object.keys(SECTIONS) as Section[]) {
    app.put(`/api/${section}`, async (req, res) => {
      if (!validShape(SECTIONS[section], req.body)) {
        res.status(400).json({ error: `${section} 형식이 올바르지 않아.` });
        return;
      }
      const ifMatch = req.header("if-match");
      if (ifMatch && ifMatch !== tokenOf(section)) {
        res.status(409).json({ error: "다른 화면에서 먼저 바뀌었어. 새로고침한 뒤 다시 시도해줘.", version: tokenOf(section) });
        return;
      }
      try {
        await updateData((data) => {
          (data as unknown as Record<string, unknown>)[section] = req.body;
        });
      } catch {
        res.status(500).json({ error: "저장하지 못했어." });
        return;
      }
      counters.set(section, (counters.get(section) ?? 0) + 1);
      res.setHeader("X-Version", tokenOf(section));
      res.json(req.body);
    });
  }

  app.get("/api/quotes/status", async (_req, res) => {
    res.json({ hasKey: (await getPublicDataKey()) !== null });
  });

  app.put("/api/quotes/key", async (req, res) => {
    const key = typeof req.body?.key === "string" ? req.body.key.trim() : "";
    if (key.length < 10 || key.length > 400 || /\s/.test(key)) {
      res.status(400).json({ error: "서비스 키 형식이 올바르지 않아." });
      return;
    }
    await setPublicDataKey(key);
    res.json({ hasKey: true });
  });

  app.post("/api/quotes", async (req, res) => {
    const key = await getPublicDataKey();
    if (!key) {
      res.status(400).json({ error: "서비스 키가 아직 등록되지 않았어." });
      return;
    }
    const raw: unknown = req.body?.codes;
    const codes = Array.isArray(raw) ? Array.from(new Set(raw.filter((c): c is string => typeof c === "string").map((c) => c.trim()).filter((c) => /^[A-Za-z0-9]{4,12}$/.test(c)))) : [];
    if (codes.length === 0 || codes.length > 60) {
      res.status(400).json({ error: "조회할 종목코드가 없거나 너무 많아." });
      return;
    }
    res.json({ results: await fetchQuotes(key, codes) });
  });

  app.post("/api/import-xlsx", upload.single("file"), async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: "파일이 없습니다." });
      return;
    }
    try {
      const preview = parseWorkbook(req.file.buffer);
      res.json(preview);
    } catch (err) {
      res.status(400).json({ error: "xlsx 파일을 파싱할 수 없습니다.", detail: String(err) });
    }
  });

  // Serve the built client in production.
  const clientDist = path.resolve(__dirname, "../../client/dist");
  app.use(express.static(clientDist));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });

  return app;
}
