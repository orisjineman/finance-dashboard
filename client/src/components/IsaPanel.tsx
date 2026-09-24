import type { CSSProperties } from "react";
import type { AssetRow, LadderRung, RebalanceSettings, StrategyData } from "../types";
import { deriveGroupPlan, glideRiskPct, groupTarget, yearsUntil } from "../rebalance";
import { fmtWon, newId } from "../utils";
import MoneyInput from "./MoneyInput";

interface Props {
  rows: AssetRow[];
  rebalance: RebalanceSettings;
  strategy: StrategyData;
  onChange: (strategy: StrategyData) => void;
}

const textareaStyle: CSSProperties = {
  width: "100%",
  border: "1px solid var(--line)",
  borderRadius: 8,
  padding: "8px 10px",
  background: "var(--paper)",
  color: "var(--ink)",
  fontFamily: "inherit",
  fontSize: 13.5,
  resize: "vertical",
  lineHeight: 1.6,
};

export default function IsaPanel({ rows, rebalance, strategy, onChange }: Props) {
  const { isaPortfolio, cmaLadder, glidePath, isaDutyEndDate, housePurchaseDate } = strategy;
  const yearsLeft = yearsUntil(housePurchaseDate);
  const todayTarget = yearsLeft === null ? null : glideRiskPct(glidePath, yearsLeft);

  // 리밸런싱 탭이 기준: 그 묶음의 목표에서 ISA·CMA가 맡아야 할 몫을 계산한다.
  const isaGroup = rebalance.groups.find((g) => g.accounts.some((a) => /ISA/i.test(a)));
  const isaTarget = isaGroup ? groupTarget(isaGroup, strategy) : null;
  const isaPlan = isaGroup && isaTarget !== null ? deriveGroupPlan(rows, isaGroup.accounts, isaTarget, rebalance.riskAccess) : null;
  const cmaGroup = rebalance.groups.find((g) => g.accounts.some((a) => /CMA/i.test(a)));
  const cmaTarget = cmaGroup ? groupTarget(cmaGroup, strategy) : null;
  const cmaPlan = cmaGroup && cmaTarget !== null ? deriveGroupPlan(rows, cmaGroup.accounts, cmaTarget, rebalance.riskAccess) : null;
  const cmaAccounts = cmaPlan ? cmaPlan.accounts.filter((a) => /CMA/i.test(a.account)) : [];
  const capableRisk = isaPlan?.capableRiskPct ?? null;

  function setPortfolio(patch: Partial<StrategyData["isaPortfolio"]>) {
    onChange({ ...strategy, isaPortfolio: { ...isaPortfolio, ...patch } });
  }

  function setDutyEndDate(value: string) {
    onChange({ ...strategy, isaDutyEndDate: value });
  }

  function updateRung(i: number, patch: Partial<LadderRung>) {
    const rungs = cmaLadder.rungs.map((r, idx) => (idx === i ? { ...r, ...patch } : r));
    onChange({ ...strategy, cmaLadder: { ...cmaLadder, rungs } });
  }

  function addRung() {
    const rungs = [...cmaLadder.rungs, { id: newId("rung"), when: "만기 시점", amount: 0, why: "" }];
    onChange({ ...strategy, cmaLadder: { ...cmaLadder, rungs } });
  }

  function removeRung(i: number) {
    onChange({ ...strategy, cmaLadder: { ...cmaLadder, rungs: cmaLadder.rungs.filter((_, idx) => idx !== i) } });
  }

  function setCmaNote(note: string) {
    onChange({ ...strategy, cmaLadder: { ...cmaLadder, note } });
  }

  const ladderTotal = cmaLadder.rungs.reduce((sum, r) => sum + r.amount, 0);

  return (
    <section className="panel active" id="panel-isa">
      <h2 className="section-title">
        <span className="num">01</span> ISA 포트폴리오
      </h2>
      <div className="card">
        <table className="grid">
          <thead>
            <tr>
              <th>구분</th>
              <th>비중</th>
              <th>상품</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>위험자산</td>
              <td style={{ textAlign: "right", fontWeight: 700 }}>
                {isaPlan === null ? "-" : capableRisk === null ? "-" : isaPlan.feasible ? `${capableRisk.toFixed(1)}%` : "달성 불가"}
              </td>
              <td>
                <input
                  type="text"
                  value={isaPortfolio.riskProduct}
                  onChange={(e) => setPortfolio({ riskProduct: e.target.value })}
                  style={{ textAlign: "left" }}
                />
              </td>
            </tr>
            <tr>
              <td>안전자산</td>
              <td style={{ textAlign: "right", fontWeight: 700 }}>
                {isaPlan === null || capableRisk === null ? "-" : isaPlan.feasible ? `${(100 - capableRisk).toFixed(1)}%` : "-"}
              </td>
              <td>
                <input
                  type="text"
                  value={isaPortfolio.safeProduct}
                  onChange={(e) => setPortfolio({ safeProduct: e.target.value })}
                  style={{ textAlign: "left" }}
                />
              </td>
            </tr>
          </tbody>
        </table>
        <p className="note" style={{ marginTop: 10 }}>
          {isaPlan === null
            ? "이 비중은 리밸런싱 탭에서 자동으로 나와. 리밸런싱 탭에서 ISA가 들어간 묶음을 만들고 목표 비중을 정해줘."
            : isaPlan.feasible
              ? `리밸런싱 탭의 '${isaGroup?.name}' 묶음 목표(위험 ${isaPlan.targetRiskPct.toFixed(1)}%)를 이루려면 ${isaPlan.capable.map((a) => a.account).join(", ")}이(가) 이 비중이어야 해. 숫자는 여기서 고치지 않고 리밸런싱 탭에서 정해.`
              : `리밸런싱 탭의 목표(위험 ${isaPlan.targetRiskPct.toFixed(1)}%)는 ${isaPlan.tooLow ? "편입 불가 계좌에 이미 있는 위험자산 때문에 너무 낮아서" : "위험자산 편입 가능 계좌를 전부 위험자산으로 채워도"} 못 이뤄. 리밸런싱 탭에서 목표나 편입 설정을 조정해줘.`}
        </p>        <div className="field" style={{ marginTop: 14 }}>
          <label>ISA 의무가입 종료일</label>
          <input type="date" value={isaDutyEndDate} onChange={(e) => setDutyEndDate(e.target.value)} />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>메모</label>
          <textarea
            rows={3}
            value={isaPortfolio.dutyNote}
            onChange={(e) => setPortfolio({ dutyNote: e.target.value })}
            style={textareaStyle}
          />
        </div>
      </div>

      <h2 className="section-title">
        <span className="num">02</span> 만기 분산 계획 (합계 {fmtWon(ladderTotal)}원)
      </h2>
      <div className="card">
        <p className="note" style={{ marginTop: 0, marginBottom: 12 }}>
          {cmaPlan === null || cmaAccounts.length === 0
            ? "CMA를 리밸런싱 탭의 묶음에 넣으면 이 자금이 집 자금 전체에서 어떤 역할인지 여기에 나와."
            : `${cmaAccounts.map((a) => `${a.account} ${fmtWon(a.amount)}원`).join(", ")} — '${cmaGroup?.name}' 묶음의 ${((cmaAccounts.reduce((sum, a) => sum + a.amount, 0) / cmaPlan.total) * 100).toFixed(0)}%이고, ${cmaAccounts.every((a) => !a.canHoldRisk) ? (cmaAccounts.some((a) => a.policy === "blocked") ? "위험자산 편입 불가로 설정해서 안전으로 둬." : "위험 상품이 없어서 전액 안전으로 둬.") : "위험자산도 담을 수 있는 계좌로 계산돼."} 목표 비중은 리밸런싱 탭에서 정해.`}
        </p>
        <div className="ladder">
          {cmaLadder.rungs.map((r, i) => (
            <div className="rung" key={r.id}>
              <div className="field-row" style={{ gridTemplateColumns: "1fr 1fr auto", alignItems: "end", marginBottom: 6 }}>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>시점</label>
                  <input type="text" value={r.when} onChange={(e) => updateRung(i, { when: e.target.value })} />
                </div>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>금액(원)</label>
                  <MoneyInput value={r.amount} onChange={(v) => updateRung(i, { amount: v })} />
                </div>
                <button className="btn ghost" style={{ padding: "9px 10px", fontSize: 12 }} onClick={() => removeRung(i)}>
                  삭제
                </button>
              </div>
              <textarea
                rows={2}
                value={r.why}
                onChange={(e) => updateRung(i, { why: e.target.value })}
                placeholder="이 구간을 이렇게 나눈 이유"
                style={textareaStyle}
              />
            </div>
          ))}
        </div>
        <button className="btn ghost" style={{ marginTop: 10 }} onClick={addRung}>
          + 구간 추가
        </button>
        <div className="field" style={{ marginTop: 14, marginBottom: 0 }}>
          <label>메모</label>
          <textarea rows={3} value={cmaLadder.note} onChange={(e) => setCmaNote(e.target.value)} style={textareaStyle} />
        </div>
      </div>

      <h2 className="section-title">
        <span className="num">03</span> 집 매수 접근 글라이드 패스
      </h2>
      <div className="card">
        <p className="note" style={{ marginTop: 0 }}>
          집 매수 예정일과 남은 기간별 목표 비중표는 <strong>리밸런싱 탭</strong>에서 정해. 그 목표에서 ISA·CMA가 맡을 몫이 위에 자동으로 계산돼.
        </p>
        <div className="result-line">
          <span className="k">집 매수 예정일</span>
          <span className="v">{housePurchaseDate || "-"}</span>
        </div>
        <div className="result-line">
          <span className="k">남은 기간</span>
          <span className="v">{yearsLeft === null ? "-" : `약 ${yearsLeft.toFixed(1)}년`}</span>
        </div>
        <div className="result-line">
          <span className="k">지금 목표 위험 비중 (표 기준)</span>
          <span className="v">{todayTarget === null ? "-" : `${todayTarget.toFixed(1)}%`}</span>
        </div>
      </div>
    </section>
  );
}
