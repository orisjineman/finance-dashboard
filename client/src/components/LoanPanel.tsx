import { useMemo } from "react";
import type { AssetRow, BudgetData, HomeSimInput, LoanInput, RebalanceGroup, StrategyData } from "../types";
import { computeHousingLiquid, computeLoanEquity, fmtWon } from "../utils";
import MoneyInput from "./MoneyInput";
import SectionTitle from "./SectionTitle";
import HomeSimulator from "./HomeSimulator";

interface Props {
  rows: AssetRow[];
  loan: LoanInput;
  onChange: (loan: LoanInput) => void;
  groups: RebalanceGroup[];
  home: HomeSimInput;
  onHomeChange: (home: HomeSimInput) => void;
  strategy: StrategyData;
  onStrategyChange: (strategy: StrategyData) => void;
  budget: BudgetData;
  onBudgetChange: (budget: BudgetData) => void;
}

function calcLoan(loan: LoanInput, ltv: number, closingCost: number) {
  const rate = (loan.ratePct || 0) / 100 / 12;
  const term = (loan.termYears || 1) * 12;

  const equity = computeLoanEquity(loan.price, ltv, closingCost);
  const limit = loan.price * ltv;
  let monthly: number;
  if (rate === 0) monthly = limit / term;
  else monthly = (limit * rate * Math.pow(1 + rate, term)) / (Math.pow(1 + rate, term) - 1);

  return { limit, equity, monthly };
}

export default function LoanPanel({ rows, loan, onChange, groups, home, onHomeChange, strategy, onStrategyChange, budget, onBudgetChange }: Props) {
  const ltv = home.policy.bogeumjari.ltv;
  const result = useMemo(() => calcLoan(loan, ltv, home.closingCost), [loan, ltv, home.closingCost]);
  const housingLiquid = computeHousingLiquid(rows);
  const remaining = result.equity - housingLiquid;

  function set<K extends keyof LoanInput>(key: K, value: LoanInput[K]) {
    onChange({ ...loan, [key]: value });
  }

  return (
    <section className="panel active" id="panel-loan">
      <HomeSimulator
        rows={rows}
        groups={groups}
        home={home}
        onChange={onHomeChange}
        loan={loan}
        onLoanChange={onChange}
        strategy={strategy}
        onStrategyChange={onStrategyChange}
        budget={budget}
        onBudgetChange={onBudgetChange}
      />

      <SectionTitle>목표 집값 (개요·시뮬레이션 기준)</SectionTitle>
      <p className="note" style={{ marginTop: 0 }}>
        개요의 집 마련 진행과 시뮬레이션의 '집 자기자금 도달'은 이 집값과 LTV로 계산한 필요 자기자금을 써. 위 비교표의 '목표로' 버튼으로도 바꿀 수 있어.
      </p>
      <div className="card">
        <div className="field-row">
          <div className="field">
            <label>목표 집값 (원)</label>
            <MoneyInput value={loan.price} onChange={(v) => set("price", v)} />
          </div>
          <div className="field">
            <label>LTV (%, 위쪽 정책 숫자 설정과 같은 값)</label>
            <input
              type="number"
              value={Math.round(ltv * 1000) / 10}
              onChange={(e) => onHomeChange({ ...home, policy: { ...home.policy, bogeumjari: { ...home.policy.bogeumjari, ltv: (parseFloat(e.target.value) || 0) / 100 } } })}
            />
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

      <SectionTitle>목표 집값 결과</SectionTitle>
      <div className="card">
        <div className="result-line">
          <span className="k">대출 한도 (LTV 기준)</span>
          <span className="v">{fmtWon(result.limit)}원</span>
        </div>
        <div className="result-line">
          <span className="k">필요 자기자금 (부대비용 {fmtWon(home.closingCost)}원 포함)</span>
          <span className="v">{fmtWon(result.equity)}원</span>
        </div>
        <div className="result-line total">
          <span className="k">월 상환액 (원리금균등)</span>
          <span className="v">{fmtWon(result.monthly)}원/월</span>
        </div>
        <p className="note">LTV는 지역·규제·소득에 따라 실제 한도가 달라질 수 있어. DSR(총부채원리금상환비율) 규제로 한도가 더 줄어들 수도 있으니 실제 대출 전엔 은행 상담이 꼭 필요해.</p>
      </div>

      <SectionTitle>집 마련 가용자산 갭</SectionTitle>
      <div className="card">
        <div className="result-line">
          <span className="k">가용자산 (연금저축·IRP 등 제외)</span>
          <span className="v">{fmtWon(housingLiquid)}원</span>
        </div>
        <div className="result-line">
          <span className="k">필요 자기자금</span>
          <span className="v">{fmtWon(result.equity)}원</span>
        </div>
        <div className="result-line total">
          <span className="k">{remaining > 0 ? "추가로 모아야 할 금액" : "이미 마련됨 (여유)"}</span>
          <span className="v" style={{ color: remaining > 0 ? "var(--risk)" : "var(--safe)" }}>
            {fmtWon(Math.abs(remaining))}원
          </span>
        </div>
        <p className="note">
          자산 스냅샷 탭에서 "집자금" 체크를 해제한 항목(연금저축·IRP처럼 집 마련에는 쓸 수 없는 자산)은 이 계산에서 빠져.
        </p>
      </div>
    </section>
  );
}
