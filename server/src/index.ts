import express from "express";
import cors from "cors";
import multer from "multer";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readData, writeData } from "./store.js";
import { parseWorkbook } from "./xlsxImport.js";
import { getPublicDataKey, setPublicDataKey } from "./secrets.js";
import { fetchQuotes } from "./quotes.js";
import type { AssetRow, BudgetData, RebalanceSettings, ChecklistItem, HistoryEntry, LoanInput, SimulationAssumptions, StrategyData } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.API_PORT ? Number(process.env.API_PORT) : 4300;

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

app.get("/api/data", async (_req, res) => {
  const data = await readData();
  res.json(data);
});

app.put("/api/rows", async (req, res) => {
  const rows = req.body as AssetRow[];
  const data = await readData();
  data.rows = rows;
  await writeData(data);
  res.json(data.rows);
});

app.put("/api/simulation", async (req, res) => {
  const simulation = req.body as SimulationAssumptions;
  const data = await readData();
  data.simulation = simulation;
  await writeData(data);
  res.json(data.simulation);
});

app.put("/api/loan", async (req, res) => {
  const loan = req.body as LoanInput;
  const data = await readData();
  data.loan = loan;
  await writeData(data);
  res.json(data.loan);
});

app.put("/api/checklist", async (req, res) => {
  const checklist = req.body as ChecklistItem[];
  const data = await readData();
  data.checklist = checklist;
  await writeData(data);
  res.json(data.checklist);
});

app.put("/api/strategy", async (req, res) => {
  const strategy = req.body as StrategyData;
  const data = await readData();
  data.strategy = strategy;
  await writeData(data);
  res.json(data.strategy);
});

app.put("/api/history", async (req, res) => {
  const history = req.body as HistoryEntry[];
  const data = await readData();
  data.history = history;
  await writeData(data);
  res.json(data.history);
});

app.put("/api/budget", async (req, res) => {
  const budget = req.body as BudgetData;
  const data = await readData();
  data.budget = budget;
  await writeData(data);
  res.json(data.budget);
});

app.put("/api/rebalance", async (req, res) => {
  const rebalance = req.body as RebalanceSettings;
  const data = await readData();
  data.rebalance = rebalance;
  await writeData(data);
  res.json(data.rebalance);
});

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

app.listen(PORT, () => {
  console.log(`finance-dashboard server listening on http://localhost:${PORT}`);
});
