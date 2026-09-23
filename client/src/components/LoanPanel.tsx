import { useMemo } from "react";
import type { LoanInput } from "../types";
import { fmtWon } from "../utils";
import MoneyInput from "./MoneyInput";

interface Props {
  loan: LoanInput;
  onChange: (loan: LoanInput) => void;
}

function calcLoan(loan: LoanInput) {
  const ltv = (loan.ltvPct || 0) / 100;
  const rate = (loan.ratePct || 0) / 100 / 12;
  const term = (loan.termYears || 1) * 12;

  const limit = loan.price * ltv;
  const equity = loan.price - limit;
  let monthly: number;
  if (rate === 0) monthly = limit / term;
  else monthly = (limit * rate * Math.pow(1 + rate, term)) / (Math.pow(1 + rate, term) - 1);

  return { limit, equity, monthly };
}

export default function LoanPanel({ loan, onChange }: Props) {
  const result = useMemo(() => calcLoan(loan), [loan]);

  function set<K extends keyof LoanInput>(key: K, value: LoanInput[K]) {
    onChange({ ...loan, [key]: value });
  }

  return (
    <section className="panel active" id="panel-loan">
      <h2 className="section-title">
        <span className="num">01</span> 조건 입력
      </h2>
      <div className="card">
        <div className="field-row">
          <div className="field">
            <label>목표 집값 (원)</label>
            <MoneyInput value={loan.price} onChange={(v) => set("price", v)} />
          </div>
          <div className="field">
            <label>LTV (%)</label>
            <input type="number" value={loan.ltvPct} onChange={(e) => set("ltvPct", parseFloat(e.target.value) || 0)} />
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label>대출금리 (연 %)</label>
            <input
              type="number"
              step={0.1}
              value={loan.ratePct}
              onChange={(e) => set("ratePct", parseFloat(e.target.value) || 0)}
            />
          </div>
          <div className="field">
            <label>상환기간 (년)</label>
            <input type="number" value={loan.termYears} onChange={(e) => set("termYears", parseInt(e.target.value) || 1)} />
          </div>
        </div>
      </div>

      <h2 className="section-title">
        <span className="num">02</span> 결과
      </h2>
      <div className="card">
        <div className="result-line">
          <span className="k">대출 한도 (LTV 기준)</span>
          <span className="v">{fmtWon(result.limit)}원</span>
        </div>
        <div className="result-line">
          <span className="k">필요 자기자금</span>
          <span className="v">{fmtWon(result.equity)}원</span>
        </div>
        <div className="result-line total">
          <span className="k">월 상환액 (원리금균등)</span>
          <span className="v">{fmtWon(result.monthly)}원/월</span>
        </div>
        <p className="note">LTV는 지역·규제·소득에 따라 실제 한도가 달라질 수 있어. DSR(총부채원리금상환비율) 규제로 한도가 더 줄어들 수도 있으니 실제 대출 전엔 은행 상담이 꼭 필요해.</p>
      </div>
    </section>
  );
}
