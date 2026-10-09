import { useState } from "react";
import type { AssetRow, BudgetData, IncomeEntry } from "../types";
import { expectedAnnualIncome, yearIncome } from "../income";
import { fmtWon, newId, uniqueAccounts } from "../utils";
import { isoDate } from "../monthly";
import MoneyInput from "./MoneyInput";
import SectionTitle from "./SectionTitle";

interface Props {
  rows: AssetRow[];
  onRowsChange: (rows: AssetRow[]) => void;
  budget: BudgetData;
  onBudgetChange: (budget: BudgetData) => void;
}

const KIND_LABEL = { dividend: "배당", interest: "이자" } as const;

// 받은 배당·이자를 기록하고, 상품별 예상 수익률로 앞으로의 연 수입을 본다.
export default function IncomePanel({ rows, onRowsChange, budget, onBudgetChange }: Props) {
  const log = budget.incomeLog ?? [];
  const year = new Date().getFullYear();
  const summary = yearIncome(log, year);
  const expected = expectedAnnualIncome(rows);
  const accounts = uniqueAccounts(rows);
  const [date, setDate] = useState(isoDate(new Date()));
  const [account, setAccount] = useState("");
  const [kind, setKind] = useState<IncomeEntry["kind"]>("dividend");
  const [amount, setAmount] = useState(0);

  const setLog = (next: IncomeEntry[]) => onBudgetChange({ ...budget, incomeLog: next });
  function add() {
    if (!(amount > 0) || !date) return;
    setLog([...log, { id: newId("inc"), date, account: account || accounts[0] || "", kind, amount }]);
    setAmount(0);
  }
  const setYield = (id: string, v: string) => onRowsChange(rows.map((r) => (r.id === id ? { ...r, yieldPct: v === "" ? undefined : parseFloat(v) || 0 } : r)));
  const thisYear = log.filter((e) => e.date.startsWith(`${year}-`)).sort((a, b) => b.date.localeCompare(a.date));
  const monthNow = new Date().getMonth() + 1;
  const pace = expected.total > 0 ? summary.total / ((expected.total * monthNow) / 12) : null; // 지금까지 받았어야 할 금액 대비

  return (
    <>
      <SectionTitle>배당·이자 수입</SectionTitle>
      <div className="card">
        <div className="result-line total">
          <span className="k">{year}년 받은 금액</span>
          <span className="v">{fmtWon(summary.total)}원</span>
        </div>
        <div className="result-line">
          <span className="k">배당 / 이자</span>
          <span className="v">
            {fmtWon(summary.dividend)}원 / {fmtWon(summary.interest)}원
          </span>
        </div>
        <div className="result-line">
          <span className="k">보유 상품 기준 예상 연 수입</span>
          <span className="v">
            {expected.total > 0 ? `${fmtWon(expected.total)}원 (월 평균 ${fmtWon(expected.total / 12)}원)` : "예상 수익률을 적으면 계산돼"}
            {pace !== null && <small style={{ color: "var(--ink-soft)", fontWeight: 400 }}> · 이번 달까지 예상의 {Math.round(pace * 100)}%</small>}
          </span>
        </div>

        <div className="table-scroll">
          <table className="grid" style={{ marginTop: 10, minWidth: 560 }}>
            <thead>
              <tr>
                {summary.byMonth.map((_, i) => (
                  <th className="num" key={i}>{i + 1}월</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {summary.byMonth.map((v, i) => (
                  <td className="num" key={i} style={{ color: v > 0 ? undefined : "var(--ink-soft)" }}>{v > 0 ? fmtWon(v) : "-"}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        {summary.byAccount.length > 0 && (
          <p className="note">
            계좌별: {summary.byAccount.map((a) => `${a.account || "(이름 없음)"} ${fmtWon(a.amount)}원`).join(" · ")}
          </p>
        )}

        <div className="field-row" style={{ marginTop: 12 }}>
          <div className="field">
            <label>받은 날</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="field">
            <label>계좌</label>
            <select value={account || accounts[0] || ""} onChange={(e) => setAccount(e.target.value)}>
              {accounts.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>종류</label>
            <select value={kind} onChange={(e) => setKind(e.target.value as IncomeEntry["kind"])}>
              <option value="dividend">배당</option>
              <option value="interest">이자</option>
            </select>
          </div>
          <div className="field">
            <label>금액 (원, 세후 입금액)</label>
            <MoneyInput value={amount} onChange={setAmount} />
          </div>
        </div>
        <button className="btn" onClick={add} disabled={!(amount > 0)}>
          + 수입 기록
        </button>

        {thisYear.length > 0 && (
          <details style={{ marginTop: 12 }}>
            <summary>{year}년 기록 {thisYear.length}건</summary>
            <div className="table-scroll">
              <table className="grid" style={{ marginTop: 8, minWidth: 420 }}>
                <tbody>
                  {thisYear.map((e) => (
                    <tr key={e.id}>
                      <td>{e.date}</td>
                      <td>{e.account || "(이름 없음)"}</td>
                      <td>{KIND_LABEL[e.kind]}</td>
                      <td className="num">{fmtWon(e.amount)}원</td>
                      <td>
                        <button className="btn ghost sm" onClick={() => setLog(log.filter((x) => x.id !== e.id))}>삭제</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}

        <details style={{ marginTop: 12 }}>
          <summary>상품별 예상 연 배당·이자율 (%){expected.missingYield > 0 ? ` · 안 적은 상품 ${expected.missingYield}개` : ""}</summary>
          <div className="table-scroll">
            <table className="grid" style={{ marginTop: 8, minWidth: 420 }}>
              <thead>
                <tr>
                  <th>계좌</th>
                  <th>상품</th>
                  <th className="num">잔액 (원)</th>
                  <th className="num">연 %</th>
                </tr>
              </thead>
              <tbody>
                {rows.filter((r) => r.amount > 0).map((r) => (
                  <tr key={r.id}>
                    <td>{r.account}</td>
                    <td>{r.item}</td>
                    <td className="num">{fmtWon(r.amount)}</td>
                    <td className="num">
                      <input type="number" step={0.1} min={0} style={{ width: 70 }} value={r.yieldPct ?? ""} placeholder="-" onChange={(e) => setYield(r.id, e.target.value)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
        <p className="note">
          성장형 주식·ETF는 0%로 두면 돼. 예상 수익률은 위 '예상 연 수입', 연말정산 탭의 종합과세 점검, 자산 위치 추천에 쓰여.
        </p>
      </div>
    </>
  );
}
