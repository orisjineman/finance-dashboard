import { useState } from "react";
import type { AssetRow, HistoryEntry } from "../types";
import { computeTotals, fmtEok, fmtWon, newId } from "../utils";
import MoneyInput from "./MoneyInput";

interface Props {
  rows: AssetRow[];
  history: HistoryEntry[];
  onChange: (history: HistoryEntry[]) => void;
}

function todayIso(): string {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

export default function HistoryPanel({ rows, history, onChange }: Props) {
  const [date, setDate] = useState(todayIso());
  const [newContribution, setNewContribution] = useState(0);

  const t = computeTotals(rows);
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));

  function addEntry() {
    const prev = sorted[sorted.length - 1];
    const cumulativePrincipal = (prev?.cumulativePrincipal ?? 0) + newContribution;
    const totalValue = t.total;
    const profit = totalValue - cumulativePrincipal;
    const returnRate = cumulativePrincipal !== 0 ? profit / cumulativePrincipal : 0;
    const entry: HistoryEntry = {
      id: newId("hist"),
      date,
      newContribution,
      cumulativePrincipal,
      totalValue,
      riskValue: t.risk,
      safeValue: t.safe,
      cashValue: t.cash,
      profit,
      returnRate,
    };
    onChange([...history, entry]);
    setNewContribution(0);
  }

  function removeEntry(id: string) {
    onChange(history.filter((h) => h.id !== id));
  }

  const maxVal = Math.max(...sorted.map((h) => h.totalValue), 1);

  return (
    <>
      <h2 className="section-title">
        <span className="num">02</span> 히스토리
      </h2>
      <div className="card">
        <div className="field-row" style={{ alignItems: "end" }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>기록 날짜</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>이번 기록의 신규 납입액 (원)</label>
            <MoneyInput value={newContribution} onChange={setNewContribution} />
          </div>
        </div>
        <p className="note">
          지금 자산 스냅샷 합계({fmtWon(t.total)}원)를 오늘 기준 총평가금액으로 기록해. 누적원금은 직전 기록에 신규 납입액을 더해서 자동 계산돼.
        </p>
        <button className="btn" style={{ marginTop: 10 }} onClick={addEntry}>
          + 기록 추가
        </button>

        {sorted.length > 0 && (
          <>
            <div className="bars" style={{ marginTop: 20 }}>
              {sorted.map((h) => (
                <div className="bar-col" key={h.id}>
                  <div className="bar-value">{fmtEok(h.totalValue)}</div>
                  <div className="bar" style={{ height: `${Math.max(4, Math.round((h.totalValue / maxVal) * 140))}px` }} />
                  <div className="bar-label">{h.date.slice(5)}</div>
                </div>
              ))}
            </div>

            <table className="grid" style={{ marginTop: 16 }}>
              <thead>
                <tr>
                  <th>날짜</th>
                  <th className="num">신규납입(원)</th>
                  <th className="num">누적원금(원)</th>
                  <th className="num">총평가금액(원)</th>
                  <th className="num">수익(원)</th>
                  <th className="num">수익률</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {[...sorted].reverse().map((h) => (
                  <tr key={h.id}>
                    <td>{h.date}</td>
                    <td className="num">{fmtWon(h.newContribution)}</td>
                    <td className="num">{fmtWon(h.cumulativePrincipal)}</td>
                    <td className="num">{fmtWon(h.totalValue)}</td>
                    <td className="num" style={{ color: h.profit >= 0 ? "var(--safe)" : "var(--risk)" }}>
                      {fmtWon(h.profit)}
                    </td>
                    <td className="num" style={{ color: h.profit >= 0 ? "var(--safe)" : "var(--risk)" }}>
                      {pct(h.returnRate)}
                    </td>
                    <td>
                      <button
                        className="btn ghost"
                        style={{ padding: "6px 10px", fontSize: 12 }}
                        onClick={() => removeEntry(h.id)}
                      >
                        삭제
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </>
  );
}
