import * as XLSX from "xlsx";
import type { AssetCategory, AssetRow } from "./types.js";

const ITEM_HEADERS = ["종목명", "종목", "항목", "이름"];
const ACCOUNT_HEADERS = ["계좌종류", "계좌", "금융사"];
const AMOUNT_HEADERS = ["잔액", "금액", "평가금액", "잔고", "만원", "amount", "평가액"];
const CATEGORY_HEADERS = ["분류", "카테고리", "자산유형", "위험/안전", "위험\\안전"];

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

function findAllColumns(header: string[], candidates: string[]): number[] {
  const found: number[] = [];
  header.forEach((h, i) => {
    if (candidates.some((c) => h.includes(c.toLowerCase()))) found.push(i);
  });
  return found;
}

function classifyCategory(itemCell: string, accountCell: string, categoryCell: string | null): AssetCategory {
  const text = `${categoryCell ?? ""} ${accountCell} ${itemCell}`.toLowerCase();
  if (text.includes("위험") || text.includes("risk") || text.includes("s&p") || text.includes("주식") || text.includes("펀드")) {
    return "risk";
  }
  if (
    text.includes("안전") ||
    text.includes("safe") ||
    text.includes("채권") ||
    text.includes("irp") ||
    text.includes("국채") ||
    text.includes("국고채") ||
    text.includes("회사채") ||
    text.includes("은행채") ||
    text.includes("국공채") ||
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
    let itemCol = -1;
    let amountCol = -1;
    let categoryCol = -1;
    let accountCols: number[] = [];

    for (let r = 0; r < Math.min(grid.length, 5); r++) {
      const header = (grid[r] as unknown[]).map(normalizeHeader);
      const ic = findColumn(header, ITEM_HEADERS);
      const ac = findColumn(header, AMOUNT_HEADERS);
      if (ic !== -1 && ac !== -1) {
        headerRowIdx = r;
        itemCol = ic;
        amountCol = ac;
        categoryCol = findColumn(header, CATEGORY_HEADERS);
        accountCols = findAllColumns(header, ACCOUNT_HEADERS);
        break;
      }
    }

    if (headerRowIdx === -1) continue;
    sheetsExamined.push(sheetName);

    for (let r = headerRowIdx + 1; r < grid.length; r++) {
      const row = grid[r] as unknown[];
      const item = row[itemCol];
      const amount = parseAmount(row[amountCol]);
      if (!item || amount === null) continue;
      const itemStr = String(item).trim();
      const accountStr = accountCols
        .map((c) => String(row[c] ?? "").trim())
        .filter(Boolean)
        .join(" ");
      const categoryCell = categoryCol !== -1 ? String(row[categoryCol] ?? "").trim() : null;
      const isRetirementAccount = accountStr.includes("IRP") || accountStr.includes("연금");
      rows.push({
        id: `import-${sheetName}-${r}`,
        account: accountStr,
        item: itemStr,
        category: classifyCategory(itemStr, accountStr, categoryCell),
        amount,
        housingEligible: !isRetirementAccount,
        sheet: sheetName
      });
    }
  }

  return { rows, sheetsExamined };
}
