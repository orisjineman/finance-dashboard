import { useMemo, useState } from "react";
import type { AssetCategory, AssetRow, HistoryEntry, ImportPreviewRow } from "../types";
import { fmtWon, newId, uniqueAccounts } from "../utils";
import ImportXlsxModal from "./ImportXlsxModal";
import HistoryPanel from "./HistoryPanel";
import MoneyInput from "./MoneyInput";
import SectionTitle from "./SectionTitle";

interface Props {
  rows: AssetRow[];
  onChange: (rows: AssetRow[]) => void;
  history: HistoryEntry[];
  onHistoryChange: (history: HistoryEntry[]) => void;
}

const catLabel: Record<AssetCategory, string> = { risk: "위험", safe: "안전", cash: "현금성" };

type SortKey = "account" | "item" | "category" | "amount";

// 분류별 색 (위험=붉은 계열, 안전=초록 계열, 현금성=금색 계열). 라이트/다크 테마 변수를 그대로 따른다.
const catColor: Record<AssetCategory, { bg: string; fg: string }> = {
  risk: { bg: "var(--risk-soft)", fg: "var(--risk)" },
  safe: { bg: "var(--safe-soft)", fg: "var(--safe)" },
  cash: { bg: "var(--gold-soft)", fg: "var(--gold)" },
};

export default function SnapshotPanel({ rows, onChange, history, onHistoryChange }: Props) {
  const [showImport, setShowImport] = useState(false);
  const [accountFilter, setAccountFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<AssetCategory | "">("");
  const [itemSearch, setItemSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const accounts = useMemo(() => uniqueAccounts(rows), [rows]);

  // 계좌마다 서로 멀리 떨어진 색상(황금각)을 배정해 계좌끼리 구분이 잘 되게 한다.
  const accountHue = useMemo(() => {
    const map = new Map<string, number>();
    accounts.forEach((a, idx) => map.set(a, (idx * 137.5) % 360));
    return map;
  }, [accounts]);

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

  const sorted = useMemo(() => {
    if (!sortKey) {
      return [...filtered].sort((a, b) => {
        if (!a.r.account && b.r.account) return 1;
        if (a.r.account && !b.r.account) return -1;
        return a.r.account.localeCompare(b.r.account);
      });
    }
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = sortKey === "category" ? catLabel[a.r.category] : a.r[sortKey];
      const bv = sortKey === "category" ? catLabel[b.r.category] : b.r[sortKey];
      if (typeof av === "string" && typeof bv === "string") {
        return av.localeCompare(bv) * dir;
      }
      return ((av as number) - (bv as number)) * dir;
    });
  }, [filtered, sortKey, sortDir]);

  const filteredTotal = filtered.reduce((sum, { r }) => sum + r.amount, 0);
  const grandTotal = rows.reduce((sum, r) => sum + r.amount, 0);
  const filtersActive = accountFilter !== "" || categoryFilter !== "" || itemSearch.trim() !== "";

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function sortIndicator(key: SortKey) {
    if (sortKey !== key) return "";
    return sortDir === "asc" ? " ▲" : " ▼";
  }

  function updateRow(i: number, patch: Partial<AssetRow>) {
    const next = rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r));
    onChange(next);
  }

  function removeRow(i: number) {
    onChange(rows.filter((_, idx) => idx !== i));
  }

  function addRow() {
    onChange([...rows, { id: newId("row"), account: "", item: "새 항목", category: "cash", amount: 0, housingEligible: true }]);
  }

  function handleImport(imported: ImportPreviewRow[]) {
    const added: AssetRow[] = imported.map((r) => ({
      id: newId("row"),
      account: r.account,
      item: r.item,
      category: r.category,
      amount: r.amount,
      housingEligible: r.housingEligible,
    }));
    onChange([...rows, ...added]);
    setShowImport(false);
  }

  return (
    <section className="panel active" id="panel-snapshot">
      <SectionTitle>계좌별 현재 잔액</SectionTitle>
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

        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 14, fontSize: 12, color: "var(--ink-soft)", flexWrap: "wrap" }}>
          <span>분류 색:</span>
          <span className="tag risk">위험</span>
          <span className="tag safe">안전</span>
          <span className="tag cash">현금성</span>
          <span style={{ marginLeft: 8 }}>계좌는 왼쪽 색 띠로 구분하고, 계좌가 바뀌는 곳에는 굵은 선이 그어져.</span>
        </div>
        <div className="table-scroll">
        <table className="grid" style={{ marginTop: 8, minWidth: 820 }}>
          <thead>
            <tr>
              <th style={{ cursor: "pointer" }} onClick={() => toggleSort("account")}>
                계좌{sortIndicator("account")}
              </th>
              <th title="집 마련 자금 가용자산 계산에 포함할지">집자금</th>
              <th style={{ cursor: "pointer" }} onClick={() => toggleSort("item")}>
                항목{sortIndicator("item")}
              </th>
              <th style={{ cursor: "pointer" }} onClick={() => toggleSort("category")}>
                분류{sortIndicator("category")}
              </th>
              <th style={{ textAlign: "right", cursor: "pointer" }} onClick={() => toggleSort("amount")}>
                잔액 (원){sortIndicator("amount")}
              </th>
              <th title="투자 수익률(투자원금 대비) 계산에 포함할지">수익률</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(({ r, i }, idx) => {
              const hue = accountHue.get(r.account);
              const accountSolid = hue === undefined ? "var(--line)" : `hsl(${hue} 55% 52%)`;
              const accountTint = hue === undefined ? undefined : `hsl(${hue} 55% 52% / 0.13)`;
              const newGroup = idx > 0 && sorted[idx - 1].r.account !== r.account;
              const cat = catColor[r.category];
              return (
              <tr key={r.id} style={newGroup ? { borderTop: "2px solid var(--ink-soft)" } : undefined}>
                <td style={{ borderLeft: `5px solid ${accountSolid}`, background: accountTint }}>
                  <input
                    type="text"
                    value={r.account}
                    onChange={(e) => updateRow(i, { account: e.target.value })}
                    className="cell-input"
                  />
                </td>
                <td style={{ textAlign: "center" }}>
                  <input
                    type="checkbox"
                    checked={r.housingEligible}
                    onChange={(e) => updateRow(i, { housingEligible: e.target.checked })}
                    title="집 마련 가용자산에 포함"
                  />
                </td>
                <td>
                  <input
                    type="text"
                    value={r.item}
                    onChange={(e) => updateRow(i, { item: e.target.value })}
                    className="cell-input"
                  />
                </td>
                <td>
                  <select
                    value={r.category}
                    onChange={(e) => updateRow(i, { category: e.target.value as AssetCategory })}
                    style={{ background: cat.bg, color: cat.fg, fontWeight: 600, borderColor: cat.fg }}
                  >
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
                <td style={{ textAlign: "center" }}>
                  <input
                    type="checkbox"
                    checked={!r.excludeFromReturn}
                    onChange={(e) => updateRow(i, { excludeFromReturn: !e.target.checked })}
                    title="투자 수익률 계산에 포함"
                  />
                </td>
                <td>
                  <button
                    className="btn ghost sm"
                    onClick={() => removeRow(i)}
                    aria-label="행 삭제"
                  >
                    삭제
                  </button>
                </td>
              </tr>
              );
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", color: "var(--ink-soft)" }}>
                  조건에 맞는 항목이 없어.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4} style={{ fontWeight: 700 }}>
                {filtersActive ? "합계 (필터됨)" : "합계"}
              </td>
              <td className="num" style={{ fontWeight: 700 }}>
                {fmtWon(filteredTotal)}
              </td>
              <td></td>
              <td></td>
            </tr>
          </tfoot>
        </table>
        </div>
        {filtersActive && (
          <p className="note">
            필터 적용 중 · 전체 합계는 {fmtWon(grandTotal)}원이야.
          </p>
        )}
        <p className="note">
          <strong>집자금</strong> 해제: 집 마련 가용자산에서 제외(연금·IRP) · <strong>수익률</strong> 해제: 수익률 계산에서 제외(통장·보증금). 머리글을 누르면 정렬돼.
        </p>
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
