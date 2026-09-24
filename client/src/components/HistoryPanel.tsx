import { useState } from "react";
import type { AssetRow, HistoryEntry } from "../types";
import { computeCurrentReturn, computeReturnTotals, fmtEok, fmtWon, newId } from "../utils";
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
  const [principalInput, setPrincipalInput] = useState<number | null>(null);

  const t = computeReturnTotals(rows);
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
  const current = computeCurrentReturn(rows, history);
  const latestPrincipal = sorted[sorted.length - 1]?.cumulativePrincipal ?? 0;
  const principal = principalInput ?? latestPrincipal;
  const newContribution = principal - latestPrincipal;

  function addEntry() {
    const cumulativePrincipal = principal;
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
    setPrincipalInput(null);
  }

  function removeEntry(id: string) {
    onChange(history.filter((h) => h.id !== id));
  }

  const maxVal = Math.max(...sorted.map((h) => h.totalValue), 1);

  // 신규 납입액은 저장된 값이 아니라 이웃한 기록의 원금 차이로 그때그때 계산한다 (기록을 지워도 어긋나지 않게).
  const contributionOf = new Map<string, number>();
  sorted.forEach((h, i) => contributionOf.set(h.id, h.cumulativePrincipal - (i > 0 ? sorted[i - 1].cumulativePrincipal : 0)));

  return (
    <>
      <h2 className="section-title">
        <span className="num">02</span> 지금 투자원금 대비 수익률
      </h2>
      <div className="card">
        {current ? (
          <>
            <div className="result-line">
              <span className="k">누적 투자원금 (최근 기록 기준)</span>
              <span className="v">{fmtWon(current.principal)}원</span>
            </div>
            <div className="result-line">
              <span className="k">지금 평가금액 (수익률 포함 항목)</span>
              <span className="v">{fmtWon(current.currentTotal)}원</span>
            </div>
            <div className="result-line total">
              <span className="k">수익 / 수익률</span>
              <span className="v" style={{ color: current.profit >= 0 ? "var(--safe)" : "var(--risk)" }}>
                {fmtWon(current.profit)}원 ({pct(current.returnRate)})
              </span>
            </div>
            <p className="note">
              아래 히스토리에 새 기록을 추가할 때마다 투자원금이 갱신돼. 자산 스냅샷 잔액을 바꾸면 이 수익률도 실시간으로 따라 움직여.
            </p>
          </>
        ) : (
          <p className="note">아직 기록된 투자원금이 없어. 아래에서 첫 기록을 추가하면(현재 총 투자원금 = 지금까지 실제로 넣은 돈 전체) 수익률이 계산돼.</p>
        )}
      </div>

      <h2 className="section-title">
        <span className="num">03</span> 히스토리
      </h2>
      <div className="card">
        <div className="field-row" style={{ alignItems: "end" }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>기록 날짜</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>현재 총 투자원금 (원)</label>
            <MoneyInput value={principal} onChange={setPrincipalInput} />
          </div>
        </div>
        <p className="note">
          스냅샷에서 '수익률' 체크된 항목의 합계({fmtWon(t.total)}원)를 총평가금액으로 기록해. 입출금 통장 등 체크 해제한 항목은 빠져. 투자원금은 지금까지 내가 실제로 넣은 돈의 합계야. 직전 기록 이후 새로 넣은 돈이
          없으면 그대로 두면 돼. 새로 넣었다면 그만큼 늘린 값으로 고쳐줘
          {newContribution !== 0 ? ` (직전보다 ${newContribution > 0 ? "+" : ""}${fmtWon(newContribution)}원)` : ""}.
          증권사 앱 계좌 화면의 "투자원금"이나 "매입금액"을 더해서 넣어도 돼.
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
                    <td className="num">{fmtWon(contributionOf.get(h.id) ?? 0)}</td>
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
