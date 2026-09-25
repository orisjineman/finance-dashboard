import type { BudgetData, TaxPrepInput, TaxPrepPolicy } from "../types";
import { fmtWon } from "../utils";
import { DEFAULT_PENSION_LIMIT } from "../pension";
import { computeTaxPrep } from "../tax";
import { policyStale } from "../home";
import MoneyInput from "./MoneyInput";
import SectionTitle from "./SectionTitle";

interface Props {
  budget: BudgetData;
  onChange: (budget: BudgetData) => void;
  grossIncome: number; // 만원, 내 집 마련 탭의 연 총보수를 총급여로 쓴다
}

function Bar({ value, max, done }: { value: number; max: number; done: boolean }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div style={{ height: 12, borderRadius: 999, background: "var(--line)", overflow: "hidden", margin: "6px 0 4px" }}>
      <div style={{ width: `${pct}%`, height: "100%", background: done ? "var(--safe)" : "var(--gold)" }} />
    </div>
  );
}

function Line({ k, v, total }: { k: string; v: string; total?: boolean }) {
  return (
    <div className={`result-line${total ? " total" : ""}`}>
      <span className="k">{k}</span>
      <span className="v">{v}</span>
    </div>
  );
}

function PctInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return <input type="number" step={0.1} value={value} onChange={(e) => onChange(parseFloat(e.target.value) || 0)} />;
}

// 월급·예산 탭의 '연말정산 준비' 카드. 환급액 전체가 아니라 올해 행동으로 바꿀 수 있는 항목의 세금 절감만 추정한다.
export default function TaxPrepCard({ budget, onChange, grossIncome }: Props) {
  const tp = budget.taxPrep;
  if (!tp) return null;
  const now = new Date();
  const year = now.getFullYear();
  const r = computeTaxPrep(budget, tp, grossIncome, now);
  const stale = policyStale(tp.policy.updatedAt, now);
  const won = (m: number) => `${fmtWon(m)}원`;

  // 올해 누적값을 고치면 '올해 값'으로 표시한다 (해가 바뀌면 자동으로 0부터)
  const setYearly = (patch: Partial<TaxPrepInput>) => {
    const base = tp.year === year ? tp : { ...tp, rentPaid: 0, subscriptionPaid: 0, creditCardUsed: 0, debitCardUsed: 0 };
    onChange({ ...budget, taxPrep: { ...base, ...patch, year } });
  };
  const setTp = (patch: Partial<TaxPrepInput>) => onChange({ ...budget, taxPrep: { ...tp, ...patch } });
  const setPolicy = (patch: Partial<TaxPrepPolicy>) => setTp({ policy: { ...tp.policy, ...patch } });
  const p = tp.policy;
  const v = tp.year === year ? tp : { ...tp, rentPaid: 0, subscriptionPaid: 0, creditCardUsed: 0, debitCardUsed: 0 };

  return (
    <>
      <SectionTitle>연말정산 준비 ({year}년)</SectionTitle>
      <div className="card">
        <Line k="총급여 (내 집 마련 탭의 연 총보수)" v={grossIncome > 0 ? won(grossIncome) : "입력 필요"} />
        <Line k="지금까지 기준 줄어드는 세금 (추정 합계)" v={won(r.totalTaxSaved)} total />
        <p className="note">
          환급액 전체가 아니라 연금·월세·청약·카드 네 항목으로 줄어드는 세금만 추정한 값이야. 정확한 환급액은 11월쯤 홈택스 '연말정산 미리보기'에서 확인해줘. 올해 입력값은
          해가 바뀌면 자동으로 0부터 다시 시작해.
          {grossIncome <= 0 && " 총급여를 모르면 월세·청약·카드 공제를 판정할 수 없어서 '내 집 마련' 탭에서 연 총보수를 먼저 넣어줘."}
        </p>

        <h3 className="sub-title">연금저축·IRP 세액공제</h3>
        <div className="field-row">
          <div className="field">
            <label>올해 납입한 금액 (원)</label>
            <MoneyInput value={r.pension.paid} onChange={(val) => onChange({ ...budget, pensionPaidThisYear: val, pensionPaidYear: year })} />
          </div>
          <div className="field">
            <label>세액공제 대상 한도 (원)</label>
            <MoneyInput value={r.pension.limit} onChange={(val) => onChange({ ...budget, pensionCreditLimit: val > 0 ? val : DEFAULT_PENSION_LIMIT })} />
          </div>
          <div className="field">
            <label>세액공제율 (%)</label>
            <select value={budget.pensionTaxCreditRate} onChange={(e) => onChange({ ...budget, pensionTaxCreditRate: parseFloat(e.target.value) })}>
              <option value={16.5}>16.5% (총급여 5,500만원 이하)</option>
              <option value={13.2}>13.2% (총급여 5,500만원 초과)</option>
            </select>
          </div>
        </div>
        <Bar value={r.pension.paid} max={r.pension.limit} done={r.pension.remaining <= 0} />
        <Line k="남은 한도" v={won(r.pension.remaining)} />
        <Line k="지금까지 세액공제 (추정)" v={won(r.pension.refund)} />
        <Line k="남은 한도를 채우면 더 줄어드는 세금" v={won(r.pension.extraRefundIfFilled)} />
        <p className="note">연금계좌에 넣은 돈은 집 마련에 쓸 수 없다는 점도 함께 고려해줘.</p>

        <h3 className="sub-title">월세 세액공제</h3>
        <div className="field-row">
          <div className="field">
            <label>월세 (원/월)</label>
            <MoneyInput value={tp.rentMonthly} onChange={(val) => setTp({ rentMonthly: val })} />
          </div>
          <div className="field">
            <label>올해 이미 낸 월세 (원)</label>
            <MoneyInput value={v.rentPaid} onChange={(val) => setYearly({ rentPaid: val })} />
          </div>
        </div>
        {r.rent.eligible ? (
          <>
            <Line k={`지금까지 세액공제 (${r.rent.ratePct}%)`} v={won(r.rent.credit)} />
            <Line k={`연말까지 ${r.monthsLeft}달 더 내면 (올해 월세 ${won(r.rent.projected)})`} v={won(r.rent.projectedCredit)} />
          </>
        ) : (
          grossIncome > 0 && <p className="note">총급여가 {won(p.rent.incomeMax)}를 넘어서 월세 세액공제 대상이 아니야.</p>
        )}
        <p className="note">
          무주택 세대주(요건을 갖춘 세대원 포함)이고, 임대차계약서 주소로 전입신고가 돼 있어야 해. 계좌이체 내역을 챙겨두고, 함께 사는 가족이 있으면 누가 세대주인지 확인해줘.
        </p>

        <h3 className="sub-title">주택청약 소득공제</h3>
        <div className="field" style={{ maxWidth: 280 }}>
          <label>올해 납입한 금액 (원)</label>
          <MoneyInput value={v.subscriptionPaid} onChange={(val) => setYearly({ subscriptionPaid: val })} />
        </div>
        {r.subscription.eligible ? (
          <>
            <Bar value={r.subscription.paid} max={p.subscription.limit} done={r.subscription.remaining <= 0} />
            <Line k={`소득공제 (납입액 × ${p.subscription.ratePct}%, 한도 ${won(p.subscription.limit)} 납입까지)`} v={won(r.subscription.deduction)} />
            <Line k="그만큼 줄어드는 세금 (추정)" v={won(r.subscription.taxSaved)} />
            {r.subscription.remaining > 0 && <Line k={`한도까지 ${won(r.subscription.remaining)} 더 넣으면 더 줄어드는 세금`} v={won(r.subscription.extraTaxIfFilled)} />}
          </>
        ) : (
          grossIncome > 0 && <p className="note">총급여가 {won(p.subscription.incomeMax)}를 넘어서 주택청약 소득공제 대상이 아니야.</p>
        )}
        <p className="note">무주택 세대주만 받을 수 있고, 은행에 '무주택 확인서'를 내야 공제돼.</p>

        <h3 className="sub-title">신용·체크카드 소득공제</h3>
        <div className="field-row">
          <div className="field">
            <label>올해 신용카드 사용액 (원)</label>
            <MoneyInput value={v.creditCardUsed} onChange={(val) => setYearly({ creditCardUsed: val })} />
          </div>
          <div className="field">
            <label>올해 체크카드·현금영수증 (원)</label>
            <MoneyInput value={v.debitCardUsed} onChange={(val) => setYearly({ debitCardUsed: val })} />
          </div>
        </div>
        {grossIncome > 0 && (
          <>
            <Bar value={r.card.used} max={r.card.threshold} done={r.card.toThreshold <= 0} />
            <Line k={`문턱 (총급여의 ${p.card.thresholdPct}%)`} v={won(r.card.threshold)} />
            {r.card.toThreshold > 0 ? (
              <Line k="문턱까지 남은 사용액" v={won(r.card.toThreshold)} />
            ) : (
              <Line k={`소득공제${r.card.capped ? " (한도 도달)" : ""}`} v={won(r.card.deduction)} />
            )}
            <Line k="그만큼 줄어드는 세금 (추정)" v={won(r.card.taxSaved)} />
            <p className="note">
              {r.card.toThreshold > 0
                ? `문턱을 넘기 전 사용액은 공제가 없어서, 문턱까지는 혜택이 좋은 신용카드를 써도 돼. 문턱을 넘은 뒤에는 체크카드·현금영수증 공제율(${p.card.debitRatePct}%)이 신용카드(${p.card.creditRatePct}%)의 두 배야.`
                : `문턱을 넘었으니 남은 기간은 체크카드·현금영수증(${p.card.debitRatePct}%)이 신용카드(${p.card.creditRatePct}%)보다 공제율이 높아. 한도는 ${won(r.card.limit)}이야.`}{" "}
              카드사 앱이나 홈택스에서 올해 사용액을 확인해 넣어줘.
            </p>
          </>
        )}

        <details className="policy-details">
          <summary>공제 기준 숫자 (설정) · 마지막 확인일 {p.updatedAt}{stale ? " · 1년 넘음" : ""}</summary>
          <p className="note" style={{ color: stale ? "var(--risk)" : undefined }}>
            {stale ? "마지막 확인일이 1년 넘게 지났어. " : ""}세법 개정으로 자주 바뀌는 숫자라 국세청 안내를 보고 고쳐줘.
          </p>
          <div className="field-row">
            <div className="field">
              <label>월세: 총급여 상한 (원)</label>
              <MoneyInput value={p.rent.incomeMax} onChange={(val) => setPolicy({ rent: { ...p.rent, incomeMax: val } })} />
            </div>
            <div className="field">
              <label>월세: 높은 공제율 기준 총급여 (원)</label>
              <MoneyInput value={p.rent.lowIncomeMax} onChange={(val) => setPolicy({ rent: { ...p.rent, lowIncomeMax: val } })} />
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label>월세: 공제율 높은/기본 (%)</label>
              <div style={{ display: "flex", gap: 8 }}>
                <PctInput value={p.rent.rateLowPct} onChange={(val) => setPolicy({ rent: { ...p.rent, rateLowPct: val } })} />
                <PctInput value={p.rent.ratePct} onChange={(val) => setPolicy({ rent: { ...p.rent, ratePct: val } })} />
              </div>
            </div>
            <div className="field">
              <label>월세: 공제 대상 한도 (원)</label>
              <MoneyInput value={p.rent.limit} onChange={(val) => setPolicy({ rent: { ...p.rent, limit: val } })} />
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label>청약: 총급여 상한 (원)</label>
              <MoneyInput value={p.subscription.incomeMax} onChange={(val) => setPolicy({ subscription: { ...p.subscription, incomeMax: val } })} />
            </div>
            <div className="field">
              <label>청약: 납입 한도 (원) / 공제율 (%)</label>
              <div style={{ display: "flex", gap: 8 }}>
                <MoneyInput value={p.subscription.limit} onChange={(val) => setPolicy({ subscription: { ...p.subscription, limit: val } })} />
                <PctInput value={p.subscription.ratePct} onChange={(val) => setPolicy({ subscription: { ...p.subscription, ratePct: val } })} />
              </div>
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label>카드: 문턱 (총급여 %) / 신용 (%) / 체크 (%)</label>
              <div style={{ display: "flex", gap: 8 }}>
                <PctInput value={p.card.thresholdPct} onChange={(val) => setPolicy({ card: { ...p.card, thresholdPct: val } })} />
                <PctInput value={p.card.creditRatePct} onChange={(val) => setPolicy({ card: { ...p.card, creditRatePct: val } })} />
                <PctInput value={p.card.debitRatePct} onChange={(val) => setPolicy({ card: { ...p.card, debitRatePct: val } })} />
              </div>
            </div>
            <div className="field">
              <label>카드: 한도 (기준 총급여 이하 / 초과, 원)</label>
              <div style={{ display: "flex", gap: 8 }}>
                <MoneyInput value={p.card.limitLow} onChange={(val) => setPolicy({ card: { ...p.card, limitLow: val } })} />
                <MoneyInput value={p.card.limitHigh} onChange={(val) => setPolicy({ card: { ...p.card, limitHigh: val } })} />
              </div>
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label>카드: 한도 기준 총급여 (원)</label>
              <MoneyInput value={p.card.limitIncome} onChange={(val) => setPolicy({ card: { ...p.card, limitIncome: val } })} />
            </div>
            <div className="field">
              <label>한계세율 (%, 지방소득세 포함 · 소득공제를 세금으로 환산)</label>
              <PctInput value={p.marginalRatePct} onChange={(val) => setPolicy({ marginalRatePct: val })} />
            </div>
          </div>
          <button className="btn ghost sm" onClick={() => setPolicy({ updatedAt: new Date().toISOString().slice(0, 10) })}>
            오늘 날짜로 확인 완료 표시
          </button>
        </details>
      </div>
    </>
  );
}
