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
  budget: BudgetData;
  simulation: SimulationAssumptions;
  onEditInfo: () => void;
}

// '내 집 마련' 탭. 지금 기준 진행 상황(가용자산·더 모을 금액)은 개요의 집 마련 자금 카드에서 본다.
export default function LoanPanel({ rows, loan, onChange, groups, home, onHomeChange, strategy, budget, simulation, onEditInfo }: Props) {
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
        budget={budget}
        simulation={simulation}
        onEditInfo={onEditInfo}
      />
      <p className="note">
        지금 진행 상황과 도달 시점은 개요의 '집 마련 자금'에서 봐.
      </p>
    </section>
  );
}
