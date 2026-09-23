import { useState } from "react";
import type { AssetRow, StrategyData } from "../types";
import { computeTotals, fmtWon } from "../utils";

interface Props {
  rows: AssetRow[];
  strategy: StrategyData;
  onStrategyChange: (strategy: StrategyData) => void;
}

function daysUntil(dateStr: string): number | null {
  if (!dateStr) return null;
  const target = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

export default function OverviewPanel({ rows, strategy, onStrategyChange }: Props) {
  const t = computeTotals(rows);
  const dday = daysUntil(strategy.isaDutyEndDate);
  const [editingSummary, setEditingSummary] = useState(false);
  const [draft, setDraft] = useState(strategy.overviewSummary.join("\n"));

  function saveSummary() {
    const lines = draft.split("\n").map((l) => l.trim()).filter(Boolean);
    onStrategyChange({ ...strategy, overviewSummary: lines });
    setEditingSummary(false);
  }

  return (
    <section className="panel active" id="panel-overview">
      <h2 className="section-title">
        <span className="num">01</span> 지금 상태
      </h2>
      <div className="stat-grid">
        <div className="stat">
          <div className="label">전체 자산 합계</div>
          <div className="value">
            {fmtWon(t.total)}
            <small> 원</small>
          </div>
        </div>
        <div className="stat">
          <div className="label">목표 연 수익률</div>
          <div className="value">
            7<small>% 이상</small>
          </div>
        </div>
        <div className="stat">
          <div className="label">ISA 의무가입 종료</div>
          <div className="value">
            {dday !== null ? `D-${dday}` : "-"}
          </div>
        </div>
        <div className="stat">
          <div className="label">집 매수 목표까지</div>
          <div className="value">
            3~5<small>년</small>
          </div>
        </div>
      </div>

      <h2 className="section-title">
        <span className="num">02</span> 위험 / 안전 비중
      </h2>
      <div className="card">
        <div className="donut-wrap">
          <div
            className="donut"
            style={{ ["--risk-deg" as string]: `${t.riskPct * 3.6}deg` }}
          />
          <div className="legend">
            <div className="row">
              <span className="swatch" style={{ background: "var(--risk)" }} />
              위험자산 {fmtWon(t.risk)}원 ({t.riskPct}%)
            </div>
            <div className="row">
              <span className="swatch" style={{ background: "var(--safe)" }} />
              안전자산 {fmtWon(t.safe)}원 ({t.safePct}%)
            </div>
          </div>
        </div>
        <p className="note">자산 스냅샷 탭에서 숫자를 입력하면 여기 비중이 자동으로 계산돼.</p>
      </div>

      <h2 className="section-title">
        <span className="num">03</span> 요약
      </h2>
      <div className="card">
        {!editingSummary ? (
          <>
            <ul className="plain">
              {strategy.overviewSummary.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
            <button
              className="btn ghost"
              style={{ marginTop: 12 }}
              onClick={() => {
                setDraft(strategy.overviewSummary.join("\n"));
                setEditingSummary(true);
              }}
            >
              편집
            </button>
          </>
        ) : (
          <>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={6}
              style={{
                width: "100%",
                border: "1px solid var(--line)",
                borderRadius: 10,
                padding: 10,
                background: "var(--paper)",
                color: "var(--ink)",
                fontFamily: "inherit",
                fontSize: 13.5,
              }}
              placeholder="한 줄에 한 항목씩 적어줘"
            />
            <div className="modal-actions" style={{ marginTop: 10 }}>
              <button className="btn ghost" onClick={() => setEditingSummary(false)}>
                취소
              </button>
              <button className="btn" onClick={saveSummary}>
                저장
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
