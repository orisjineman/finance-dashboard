import express from "express";
import cors from "cors";
import multer from "multer";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readData, writeData } from "./store.js";
import { parseWorkbook } from "./xlsxImport.js";
import type { AssetRow, BudgetData, ChecklistItem, HistoryEntry, LoanInput, SimulationAssumptions, StrategyData } from "./types.js";

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
