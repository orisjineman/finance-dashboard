import type { RetirementInput, SimulationAssumptions } from "../types";
import { DEFAULT_RETIREMENT, planRetirement } from "../retirement";
import { runSimulation } from "../simulation";
import { fmtEok, fmtWon } from "../utils";
import MoneyInput from "./MoneyInput";
import ProgressBar from "./ProgressBar";
import SectionTitle from "./SectionTitle";

interface Props {
  stored: SimulationAssumptions;
  sim: SimulationAssumptions; // 적립액이 계산된 가정
  onChange: (sim: SimulationAssumptions) => void;
  base: number;
  riskPct0: number;
  idle: number;
  raisePct: number;
}

function Num({ label, value, onChange, step = 1 }: { label: string; value: number; onChange: (v: number) => void; step?: number }) {
  return (
    <div className="field">
      <label>{label}</label>
      <input type="number" step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value) || 0)} />
    </div>
  );
}

// 은퇴 시뮬레이션: 위 가정으로 은퇴 시점까지 불린 자산이 4% 룰 필요 자산에 닿는지, 기대수명까지 버티는지 본다.
export default function RetirementCard({ stored, sim, onChange, base, riskPct0, idle, raisePct }: Props) {
  const r = stored.retirement ?? DEFAULT_RETIREMENT;
  const set = (patch: Partial<RetirementInput>) => onChange({ ...stored, retirement: { ...r, ...patch } });
  const years = Math.max(0, r.retireAge - r.currentAge);
  const capped = Math.min(40, years);
  const grown = capped > 0 ? runSimulation(base, riskPct0, { ...sim, years: capped }, raisePct, idle).at(-1)!.total : base + idle;
  const plan = planRetirement(r, grown);
  const ok = plan.gap >= 0 && plan.depletionAge === null;

  return (
    <>
      <SectionTitle>은퇴 시뮬레이션</SectionTitle>
      <div className="card">
        <div className="field-row">
          <Num label="현재 나이" value={r.currentAge} onChange={(v) => set({ currentAge: v })} />
          <Num label="은퇴 나이" value={r.retireAge} onChange={(v) => set({ retireAge: v })} />
          <Num label="기대수명" value={r.lifeExpectancy} onChange={(v) => set({ lifeExpectancy: v })} />
        </div>
        <div className="field-row">
          <div className="field">
            <label>은퇴 후 월 생활비 (원, 오늘 물가)</label>
            <MoneyInput value={r.monthlySpend} onChange={(v) => set({ monthlySpend: v })} />
          </div>
          <div className="field">
            <label>국민연금 등 월 수령액 (원, 오늘 물가)</label>
            <MoneyInput value={r.pensionMonthly} onChange={(v) => set({ pensionMonthly: v })} />
          </div>
          <Num label="연금 수령 시작 나이" value={r.pensionStartAge} onChange={(v) => set({ pensionStartAge: v })} />
        </div>
        <div className="field-row">
          <Num label="물가상승률 (%)" value={r.inflationPct} step={0.1} onChange={(v) => set({ inflationPct: v })} />
          <Num label="인출률 (%, 4% 룰)" value={r.withdrawRatePct} step={0.1} onChange={(v) => set({ withdrawRatePct: v })} />
          <Num label="은퇴 후 연 수익률 (%)" value={r.postRetireRatePct} step={0.1} onChange={(v) => set({ postRetireRatePct: v })} />
        </div>

        {years <= 0 ? (
          <p className="note">은퇴 나이가 현재 나이보다 커야 계산돼.</p>
        ) : (
          <>
            <div className="result-line total">
              <span className="k">{years}년 뒤({r.retireAge}세) 예상 자산{years > 40 ? " (40년까지만 계산)" : ""}</span>
              <span className="v">{fmtWon(plan.assetsAtRetire)}원 ({fmtEok(plan.assetsAtRetire)})</span>
            </div>
            <div className="result-line">
              <span className="k">그때 물가의 월 생활비 (연금 {plan.annualPensionAtRetire > 0 ? `월 ${fmtWon(plan.annualPensionAtRetire / 12)}원` : "없음"})</span>
              <span className="v">{fmtWon(plan.annualSpendAtRetire / 12)}원</span>
            </div>
            <div className="result-line">
              <span className="k">4% 룰 필요 자산</span>
              <span className="v">{fmtWon(plan.required)}원 ({fmtEok(plan.required)})</span>
            </div>
            <ProgressBar value={plan.assetsAtRetire} max={plan.required} valueLabel="예상 자산" maxLabel="필요 자산" remainingLabel="부족한 금액" />
            <div className="result-line">
              <span className="k">{plan.gap >= 0 ? "여유" : "부족"}</span>
              <span className="v" style={{ color: plan.gap >= 0 ? "var(--safe)" : "var(--risk)" }}>
                {fmtWon(Math.abs(plan.gap))}원 (필요 자산의 {Math.round(plan.fundedPct)}%)
              </span>
            </div>
            <div className="result-line total">
              <span className="k">{r.lifeExpectancy}세까지 버티는지</span>
              <span className="v" style={{ color: plan.depletionAge === null ? "var(--safe)" : "var(--risk)" }}>
                {plan.depletionAge === null ? `버텨 (그때 잔액 ${fmtWon(plan.endBalance)}원)` : `${plan.depletionAge}세에 바닥나`}
              </span>
            </div>
            <p className="note">
              {ok ? "지금 가정대로면 은퇴 자금이 충분해." : "지금 가정으로는 모자라. 적립액을 늘리거나 은퇴 시점·생활비를 조정해 봐."} 위 가정(시작 자산·적립액·기대수익률)으로 은퇴 시점까지 불리고,
              은퇴 뒤엔 매년 초 생활비(연금 시작 후엔 연금을 뺀 몫)를 꺼내는 것으로 계산해. 참고용 시나리오야.
            </p>
          </>
        )}
      </div>
    </>
  );
}
