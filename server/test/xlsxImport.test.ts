import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { parseWorkbook } from "../src/xlsxImport";

function workbook(sheets: Record<string, unknown[][]>): Buffer {
  const wb = XLSX.utils.book_new();
  for (const [name, aoa] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name);
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

describe("parseWorkbook", () => {
  const buf = workbook({
    잔액: [
      ["계좌종류", "금융사", "종목명", "잔액"],
      ["ISA", "A증권", "RISE 미국S&P500", 1000],
      ["ISA", "A증권", "국고채 10년", "2,000원"],
      ["ISA", "A증권", "KODEX 금ETF", 300],
      ["연금저축", "B증권", "TIGER 펀드", 400],
      ["IRP", "C증권", "예수금", 50],
      ["기타", "은행", "입출금통장", 70],
      ["기타", "은행", "", 99],
      ["기타", "은행", "빈금액", null],
    ],
    메모: [["아무", "말"], ["관련", "없음"]],
  });

  const result = parseWorkbook(buf);
  const byItem = (item: string) => result.rows.find((r) => r.item === item)!;

  it("헤더가 있는 시트만 읽는다", () => {
    expect(result.sheetsExamined).toEqual(["잔액"]);
  });

  it("품목이나 금액이 비어 있는 행은 건너뛴다", () => {
    expect(result.rows.map((r) => r.item)).not.toContain("빈금액");
    expect(result.rows).toHaveLength(6);
  });

  it("계좌 열들을 이어 붙이고 금액의 쉼표·'원'을 처리한다", () => {
    expect(byItem("국고채 10년").account).toBe("ISA A증권");
    expect(byItem("국고채 10년").amount).toBe(2000);
  });

  it("분류를 종목·계좌 이름으로 추정한다", () => {
    expect(byItem("RISE 미국S&P500").category).toBe("risk");
    expect(byItem("국고채 10년").category).toBe("safe");
    expect(byItem("KODEX 금ETF").category).toBe("safe");
    expect(byItem("입출금통장").category).toBe("cash");
  });

  it("'현금'에 들어 있는 '금'만으로 안전자산(금)으로 오인하지 않는다", () => {
    const b = workbook({ s: [["항목", "금액"], ["현금", 10]] });
    expect(parseWorkbook(b).rows[0].category).toBe("cash");
  });

  it("연금저축·IRP 계좌는 집 마련 가용자산에서 제외한다", () => {
    expect(byItem("TIGER 펀드").housingEligible).toBe(false);
    expect(byItem("예수금").housingEligible).toBe(false);
    expect(byItem("RISE 미국S&P500").housingEligible).toBe(true);
  });

  it("각 행에 시트 이름과 고유 id가 붙는다", () => {
    expect(new Set(result.rows.map((r) => r.id)).size).toBe(result.rows.length);
    expect(result.rows.every((r) => r.sheet === "잔액")).toBe(true);
  });

  it("읽을 수 있는 시트가 없으면 빈 결과", () => {
    const empty = parseWorkbook(workbook({ x: [["가", "나"], [1, 2]] }));
    expect(empty.rows).toEqual([]);
    expect(empty.sheetsExamined).toEqual([]);
  });
});
