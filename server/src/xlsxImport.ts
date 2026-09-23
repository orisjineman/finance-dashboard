import * as XLSX from "xlsx";
import type { AssetCategory, AssetRow } from "./types.js";

const NAME_HEADERS = ["항목", "계좌", "이름", "종목", "구분", "계좌/항목"];
const AMOUNT_HEADERS = ["잔액", "금액", "평가금액", "잔고", "만원", "amount", "평가액"];
const CATEGORY_HEADERS = ["분류", "카테고리", "위험/안전", "위험\\안전"];

export interface ImportPreviewRow extends AssetRow {
  sheet: string;
}

export interface ImportPreview {
  rows: ImportPreviewRow[];
  sheetsExamined: string[];
}

function normalizeHeader(cell: unknown): string {
  return String(cell ?? "").trim().toLowerCase();
}

function findColumn(header: string[], candidates: string[]): number {
  for (let i = 0; i < header.length; i++) {
    const h = header[i];
    if (candidates.some((c) => h.includes(c.toLowerCase()))) return i;
  }
  return -1;
}

function classifyCategory(nameCell: string, categoryCell: string | null): AssetCategory {
  const text = `${categoryCell ?? ""} ${nameCell}`.toLowerCase();
  if (text.includes("위험") || text.includes("risk") || text.includes("s&p") || text.includes("주식") || text.includes("펀드")) {
    return "risk";
  }
  if (
    text.includes("안전") ||
    text.includes("safe") ||
    text.includes("채권") ||
    text.includes("irp") ||
    text.includes("국채") ||
    text.includes("금etf") ||
    text.includes("금 etf") ||
    text.includes("골드")
  ) {
    return "safe";
  }
  return "cash";
}

function parseAmount(cell: unknown): number | null {
  if (typeof cell === "number") return cell;
  if (typeof cell === "string") {
    const cleaned = cell.replace(/[,\s원]/g, "");
    const n = parseFloat(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function parseWorkbook(buffer: Buffer): ImportPreview {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const rows: ImportPreviewRow[] = [];
  const sheetsExamined: string[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const grid: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, blankrows: false });
    if (grid.length === 0) continue;

    let headerRowIdx = -1;
    let nameCol = -1;
    let amountCol = -1;
    let categoryCol = -1;

    for (let r = 0; r < Math.min(grid.length, 5); r++) {
      const header = (grid[r] as unknown[]).map(normalizeHeader);
      const nc = findColumn(header, NAME_HEADERS);
      const ac = findColumn(header, AMOUNT_HEADERS);
      if (nc !== -1 && ac !== -1) {
        headerRowIdx = r;
        nameCol = nc;
        amountCol = ac;
        categoryCol = findColumn(header, CATEGORY_HEADERS);
        break;
      }
    }

    if (headerRowIdx === -1) continue;
    sheetsExamined.push(sheetName);

    for (let r = headerRowIdx + 1; r < grid.length; r++) {
      const row = grid[r] as unknown[];
      const name = row[nameCol];
      const amount = parseAmount(row[amountCol]);
      if (!name || amount === null) continue;
      const nameStr = String(name).trim();
      const categoryCell = categoryCol !== -1 ? String(row[categoryCol] ?? "").trim() : null;
      rows.push({
        id: `import-${sheetName}-${r}`,
        name: nameStr,
        category: classifyCategory(nameStr, categoryCell),
        amount,
        sheet: sheetName
      });
    }
  }

  return { rows, sheetsExamined };
}
