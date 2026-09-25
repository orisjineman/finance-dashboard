import type { AssetRow, BudgetData, HomeSimInput, LoanInput, RebalanceGroup, SimulationAssumptions, StrategyData } from "../types";
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
  simulation: SimulationAssumptions;
  onBudgetChange: (budget: BudgetData) => void;
}

// '내 집 마련' 탭. 지금 기준 진행 상황(가용자산·더 모을 금액)은 개요의 집 마련 자금 카드에서 본다.
export default function LoanPanel({ rows, loan, onChange, groups, home, onHomeChange, strategy, onStrategyChange, budget, simulation, onBudgetChange }: Props) {
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
        simulation={simulation}
        onBudgetChange={onBudgetChange}
      />
      <p className="note">
        지금 기준으로 가용자산이 필요 자기자금(목표 집값 × (1 − LTV) + 부대비용)에 얼마나 찼는지, 이대로 모으면 언제 닿는지는 개요의 '집 마련 자금' 카드에서 볼 수 있어.
      </p>
    </section>
  );
}
