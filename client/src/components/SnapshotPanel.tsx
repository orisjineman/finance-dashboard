import { useMemo, useState } from "react";
import type { AssetCategory, AssetRow, HistoryEntry, ImportPreviewRow } from "../types";
import { fmtWon, newId } from "../utils";
import ImportXlsxModal from "./ImportXlsxModal";
import HistoryPanel from "./HistoryPanel";
import MoneyInput from "./MoneyInput";

interface Props {
  rows: AssetRow[];
  onChange: (rows: AssetRow[]) => void;
  history: HistoryEntry[];
  onHistoryChange: (history: HistoryEntry[]) => void;
}

const catLabel: Record<AssetCategory, string> = { risk: "위험", safe: "안전", cash: "현금성" };

export default function SnapshotPanel({ rows, onChange, history, onHistoryChange }: Props) {
  const [showImport, setShowImport] = useState(false);
  const [accountFilter, setAccountFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<AssetCategory | "">("");
  const [itemSearch, setItemSearch] = useState("");

  const accounts = useMemo(() => Array.from(new Set(rows.map((r) => r.account).filter(Boolean))).sort(), [rows]);

  const filtered = useMemo(() => {
    const q = itemSearch.trim().toLowerCase();
    return rows
      .map((r, i) => ({ r, i }))
      .filter(
        ({ r }) =>
          (accountFilter === "" || r.account === accountFilter) &&
          (categoryFilter === "" || r.category === categoryFilter) &&
          (q === "" || r.item.toLowerCase().includes(q))
      );
  }, [rows, accountFilter, categoryFilter, itemSearch]);

  const filteredTotal = filtered.reduce((sum, { r }) => sum + r.amount, 0);
  const grandTotal = rows.reduce((sum, r) => sum + r.amount, 0);
  const filtersActive = accountFilter !== "" || categoryFilter !== "" || itemSearch.trim() !== "";

  function updateRow(i: number, patch: Partial<AssetRow>) {
    const next = rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r));
    onChange(next);
  }

  function removeRow(i: number) {
    onChange(rows.filter((_, idx) => idx !== i));
  }

  function addRow() {
    onChange([...rows, { id: newId("row"), account: "", item: "새 항목", category: "cash", amount: 0 }]);
  }

  function handleImport(imported: ImportPreviewRow[]) {
    const added: AssetRow[] = imported.map((r) => ({
      id: newId("row"),
      account: r.account,
      item: r.item,
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
        <div className="field-row" style={{ gridTemplateColumns: "1fr 1fr 1.2fr" }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>계좌 필터</label>
            <select value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)}>
              <option value="">전체 계좌</option>
              {accounts.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>분류 필터</label>
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value as AssetCategory | "")}>
              <option value="">전체 분류</option>
              {(["risk", "safe", "cash"] as AssetCategory[]).map((c) => (
                <option key={c} value={c}>
                  {catLabel[c]}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>항목 검색</label>
            <input type="text" value={itemSearch} onChange={(e) => setItemSearch(e.target.value)} placeholder="종목명으로 검색" />
          </div>
        </div>

        <table className="grid" style={{ marginTop: 16 }}>
          <thead>
            <tr>
              <th>계좌</th>
              <th>항목</th>
              <th>분류</th>
              <th style={{ textAlign: "right" }}>잔액(원)</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(({ r, i }) => (
              <tr key={r.id}>
                <td>
                  <input
                    type="text"
                    value={r.account}
                    onChange={(e) => updateRow(i, { account: e.target.value })}
                    style={{ textAlign: "left", border: "none", background: "none", padding: 0, width: "100%", font: "inherit", color: "inherit" }}
                  />
                </td>
                <td>
                  <input
                    type="text"
                    value={r.item}
                    onChange={(e) => updateRow(i, { item: e.target.value })}
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
                  <MoneyInput value={r.amount} onChange={(v) => updateRow(i, { amount: v })} />
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
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} style={{ textAlign: "center", color: "var(--ink-soft)" }}>
                  조건에 맞는 항목이 없어.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} style={{ fontWeight: 700 }}>
                {filtersActive ? "합계 (필터됨)" : "합계"}
              </td>
              <td className="num" style={{ fontWeight: 700 }}>
                {fmtWon(filteredTotal)}
              </td>
              <td></td>
            </tr>
          </tfoot>
        </table>
        {filtersActive && (
          <p className="note">
            필터 적용 중 · 전체 합계는 {fmtWon(grandTotal)}원이야.
          </p>
        )}
        <p className="note">잔액은 원 단위로 입력해(1원 단위까지 정확하게). 위험/안전 비중과 총자산은 자동으로 계산돼. 필요하면 행을 추가해서 종목을 더 쪼갤 수 있어.</p>
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button className="btn ghost" onClick={addRow}>
            + 행 추가
          </button>
          <button className="btn ghost" onClick={() => setShowImport(true)}>
            xlsx에서 가져오기
          </button>
        </div>
      </div>

      <HistoryPanel rows={rows} history={history} onChange={onHistoryChange} />

      {showImport && <ImportXlsxModal onClose={() => setShowImport(false)} onImport={handleImport} />}
    </section>
  );
}
