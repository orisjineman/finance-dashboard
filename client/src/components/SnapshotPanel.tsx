import { useState } from "react";
import type { AssetCategory, AssetRow, ImportPreviewRow } from "../types";
import { computeTotals, fmt, newId } from "../utils";
import ImportXlsxModal from "./ImportXlsxModal";

interface Props {
  rows: AssetRow[];
  onChange: (rows: AssetRow[]) => void;
}

const catLabel: Record<AssetCategory, string> = { risk: "위험", safe: "안전", cash: "현금성" };

export default function SnapshotPanel({ rows, onChange }: Props) {
  const [showImport, setShowImport] = useState(false);
  const t = computeTotals(rows);

  function updateRow(i: number, patch: Partial<AssetRow>) {
    const next = rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r));
    onChange(next);
  }

  function removeRow(i: number) {
    onChange(rows.filter((_, idx) => idx !== i));
  }

  function addRow() {
    onChange([...rows, { id: newId("row"), name: "새 항목", category: "cash", amount: 0 }]);
  }

  function handleImport(imported: ImportPreviewRow[]) {
    const added: AssetRow[] = imported.map((r) => ({
      id: newId("row"),
      name: r.name,
      category: r.category,
      amount: r.amount,
    }));
    onChange([...rows, ...added]);
    setShowImport(false);
  }

  return (
    <section className="panel active" id="panel-snapshot">
      <h2 className="section-title">
        <span className="num">01</span> 계좌별 현재 잔액
      </h2>
      <div className="card">
        <table className="grid">
          <thead>
            <tr>
              <th>계좌 / 항목</th>
              <th>분류</th>
              <th style={{ textAlign: "right" }}>잔액(만원)</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id}>
                <td>
                  <input
                    type="text"
                    value={r.name}
                    onChange={(e) => updateRow(i, { name: e.target.value })}
                    style={{ textAlign: "left", border: "none", background: "none", padding: 0, width: "100%", font: "inherit", color: "inherit" }}
                  />
                </td>
                <td>
                  <select value={r.category} onChange={(e) => updateRow(i, { category: e.target.value as AssetCategory })}>
                    {(["risk", "safe", "cash"] as AssetCategory[]).map((c) => (
                      <option key={c} value={c}>
                        {catLabel[c]}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="num">
                  <input
                    type="number"
                    value={r.amount}
                    onChange={(e) => updateRow(i, { amount: parseFloat(e.target.value) || 0 })}
                  />
                </td>
                <td>
                  <button
                    className="btn ghost"
                    style={{ padding: "6px 10px", fontSize: 12 }}
                    onClick={() => removeRow(i)}
                    aria-label="행 삭제"
                  >
                    삭제
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2} style={{ fontWeight: 700 }}>
                합계
              </td>
              <td className="num" style={{ fontWeight: 700 }}>
                {fmt(t.total)}
              </td>
              <td></td>
            </tr>
          </tfoot>
        </table>
        <p className="note">잔액만 입력하면 위험/안전 비중과 총자산이 자동 계산돼. 필요하면 행을 추가해서 종목을 더 쪼갤 수 있어.</p>
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button className="btn ghost" onClick={addRow}>
            + 행 추가
          </button>
          <button className="btn ghost" onClick={() => setShowImport(true)}>
            xlsx에서 가져오기
          </button>
        </div>
      </div>
      {showImport && <ImportXlsxModal onClose={() => setShowImport(false)} onImport={handleImport} />}
    </section>
  );
}
