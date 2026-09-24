import type { CSSProperties } from "react";
import type { GlidePathRow, LadderRung, StrategyData } from "../types";
import { glideRiskPct, yearsUntil } from "../rebalance";
import { fmtWon, newId } from "../utils";
import MoneyInput from "./MoneyInput";

interface Props {
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

export default function IsaPanel({ strategy, onChange }: Props) {
  const { isaPortfolio, cmaLadder, glidePath, isaDutyEndDate, housePurchaseDate } = strategy;
  const yearsLeft = yearsUntil(housePurchaseDate);
  const todayTarget = yearsLeft === null ? null : glideRiskPct(glidePath, yearsLeft);

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

  function updateGlideRow(i: number, patch: Partial<GlidePathRow>) {
    const rows = glidePath.map((r, idx) => (idx === i ? { ...r, ...patch } : r));
    onChange({ ...strategy, glidePath: rows });
  }

  function addGlideRow() {
    onChange({ ...strategy, glidePath: [...glidePath, { id: newId("glide"), yearsLeft: 0, riskPct: 0 }] });
  }

  function removeGlideRow(i: number) {
    onChange({ ...strategy, glidePath: glidePath.filter((_, idx) => idx !== i) });
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
              <td>
                <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
                  <input
                    type="number"
                    style={{ width: 60 }}
                    value={isaPortfolio.riskPct}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value) || 0;
                      setPortfolio({ riskPct: v, safePct: 100 - v });
                    }}
                  />
                  <span>%</span>
                </div>
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
              <td>{isaPortfolio.safePct}%</td>
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
        <div className="field" style={{ marginTop: 14 }}>
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
        <div className="field">
          <label>집 매수 예정일</label>
          <input type="date" value={housePurchaseDate} onChange={(e) => onChange({ ...strategy, housePurchaseDate: e.target.value })} />
        </div>
        <p className="note" style={{ marginTop: 0, marginBottom: 12 }}>
          {yearsLeft === null || todayTarget === null
            ? "집 매수 예정일을 입력하면 지금 시점의 목표 위험자산 비중을 계산해줘."
            : `집 매수까지 약 ${yearsLeft.toFixed(1)}년 남았어. 아래 표의 지점 사이를 직선으로 이어서 계산하면 지금 목표 위험자산 비중은 약 ${todayTarget.toFixed(1)}%야.`}
        </p>
        <table className="grid">
          <thead>
            <tr>
              <th>집 매수까지 남은 기간(년)</th>
              <th>목표 위험자산 비중(%)</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {glidePath.map((row, i) => (
              <tr key={row.id}>
                <td>
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    value={row.yearsLeft}
                    onChange={(e) => updateGlideRow(i, { yearsLeft: Math.max(0, parseFloat(e.target.value) || 0) })}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={row.riskPct}
                    onChange={(e) => updateGlideRow(i, { riskPct: Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)) })}
                  />
                </td>
                <td>
                  <button className="btn ghost" style={{ padding: "6px 10px", fontSize: 12 }} onClick={() => removeGlideRow(i)}>
                    삭제
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="note">
          표에 없는 기간은 양옆 지점을 직선으로 이어서 계산해. 가장 먼 지점보다 멀면 그 지점 비중을, 가장 가까운 지점보다 가까우면 그 지점 비중을 그대로 써.
        </p>
        <button className="btn ghost" style={{ marginTop: 10 }} onClick={addGlideRow}>
          + 지점 추가
        </button>
      </div>
    </section>
  );
}
