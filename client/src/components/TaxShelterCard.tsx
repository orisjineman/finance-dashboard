import type { AssetRow, BudgetData } from "../types";
import { COMPREHENSIVE_WARN_RATIO, ISA_ANNUAL_LIMIT, comprehensiveStatus, isaStatus, placementTips } from "../taxplan";
import { fmtWon } from "../utils";
import MoneyInput from "./MoneyInput";
import ProgressBar from "./ProgressBar";
import SectionTitle from "./SectionTitle";

interface Props {
  rows: AssetRow[];
  budget: BudgetData;
  onChange: (budget: BudgetData) => void;
}

const LEVEL = { ok: { tag: "safe", text: "여유" }, near: { tag: "cash", text: "접근 중" }, over: { tag: "risk", text: "초과 예상" } } as const;

// ISA 납입·비과세 한도, 금융소득종합과세 접근, 배당·이자 큰 상품의 계좌 위치를 점검한다.
export default function TaxShelterCard({ rows, budget, onChange }: Props) {
  const year = new Date().getFullYear();
  const isa = isaStatus(budget, rows, year);
  const compre = comprehensiveStatus(budget.incomeLog ?? [], rows, year);
  const tips = placementTips(rows);
  const lv = LEVEL[compre.level];
  return (
    <>
      <SectionTitle>세금 우대 계좌 점검 ({year}년)</SectionTitle>
      <div className="card">
        <div className="field-row">
          <div className="field">
            <label>ISA 유형</label>
            <select value={isa.kind} onChange={(e) => onChange({ ...budget, isaKind: e.target.value as "general" | "low" })}>
              <option value="general">일반형 (비과세 {fmtWon(200)}원)</option>
              <option value="low">서민형 (비과세 {fmtWon(400)}원)</option>
            </select>
          </div>
          <div className="field">
            <label>올해 ISA 납입액 (원)</label>
            <MoneyInput value={isa.paid} onChange={(v) => onChange({ ...budget, isaPaid: { year, amount: v } })} />
          </div>
        </div>
        <ProgressBar value={isa.paid} max={ISA_ANNUAL_LIMIT} valueLabel="올해 납입" maxLabel="연 납입 한도" remainingLabel="더 넣을 수 있는 금액" />
        <div className="result-line">
          <span className="k">ISA 올해 받은 배당·이자 / 비과세 한도</span>
          <span className="v">
            {fmtWon(isa.isaIncome)}원 / {fmtWon(isa.taxFreeLimit)}원 (남은 비과세 {fmtWon(isa.taxFreeLeft)}원)
          </span>
        </div>

        <div className="result-line total" style={{ marginTop: 12 }}>
          <span className="k">일반 과세 계좌 이자·배당 (종합과세 기준 {fmtWon(compre.threshold)}원)</span>
          <span className="v">
            <span className={`tag ${lv.tag}`}>{lv.text}</span> 올해 예상 {fmtWon(compre.expected)}원
          </span>
        </div>
        <p className="note">
          받은 금액 {fmtWon(compre.received)}원, 보유 상품의 예상 수익률로 본 연 수입 중 큰 쪽이야. ISA·연금계좌는 제외하고, 기준의 {COMPREHENSIVE_WARN_RATIO * 100}%부터 알려줘.
        </p>

        <h3 style={{ fontSize: 14, margin: "14px 0 6px" }}>계좌 위치 추천</h3>
        {tips.length === 0 ? (
          <p className="note" style={{ margin: 0 }}>
            배당·이자가 큰 상품이 일반 과세 계좌에 있지 않아. (예상 수익률은 자산 스냅샷의 '배당·이자 수입'에서 적어.)
          </p>
        ) : (
          <ul className="alert-list">
            {tips.map((t) => (
              <li key={t.rowId} className="alert info">
                <span className="alert-text">
                  {t.account} · {t.item} ({fmtWon(t.amount)}원, 연 {t.yieldPct}%) → ISA·연금계좌로 옮기면 해마다 세금 약 {fmtWon(t.yearlyTax)}원 아낄 수 있어
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="note">배당·이자가 큰 상품은 세금이 없거나 미뤄지는 계좌에, 배당이 적은 성장형은 일반 계좌에 두는 게 일반적이야. ISA 한도·세율은 세법 개정으로 바뀌니 참고용으로 봐줘.</p>
      </div>
    </>
  );
}
