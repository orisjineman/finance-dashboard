import type { BudgetData, MonthlyEditKey, RentShare, TaxPrepInput, TaxPrepPolicy } from "../types";
import { expectedRefund, fmtWon } from "../utils";
import { DEFAULT_PENSION_LIMIT } from "../pension";
import { autoRentPaid, computeRefundSplit, computeTaxPrep } from "../tax";
import { isoDate } from "../monthly";
import { policyStale } from "../home";
import MoneyInput from "./MoneyInput";
import ProgressBar from "./ProgressBar";
import SectionTitle from "./SectionTitle";
import { InfoValue } from "./InfoLink";

interface Props {
  budget: BudgetData;
  onChange: (budget: BudgetData) => void;
  grossIncome: number; // 만원, 내 정보의 연 총보수를 총급여로 쓴다
  onEditInfo: () => void;
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

// '연말정산' 탭. 환급액 전체가 아니라 올해 행동으로 바꿀 수 있는 항목의 세금 절감만 추정한다.
export default function TaxPanel({ budget, onChange, grossIncome, onEditInfo }: Props) {
  const tp = budget.taxPrep;
  if (!tp) return null;
  const now = new Date();
  const year = now.getFullYear();
  const r = computeTaxPrep(budget, tp, grossIncome, now);
  const split = computeRefundSplit(budget, tp, grossIncome, now);
  const otherName = tp.rentSplitName || "분담자";
  const rentSplit = tp.rentSplit ?? [];
  const refundTo = budget.refundTo ?? "pension";
  const dest = refundTo === "house" ? "집 마련 자금" : refundTo === "retirement" ? "노후 자금" : "연금저축 재투자";
  const basis = budget.refundBasis ?? "pension";
  const stale = policyStale(tp.policy.updatedAt, now);
  const won = (m: number) => `${fmtWon(m)}원`;

  // 올해 누적값을 고치면 '올해 값'으로 표시한다 (해가 바뀌면 자동으로 0부터)
  const setYearly = (patch: Partial<TaxPrepInput>) => {
    const base = tp.year === year ? tp : { ...tp, rentPaid: 0, subscriptionPaid: 0, creditCardUsed: 0, debitCardUsed: 0 };
    onChange({ ...budget, taxPrep: { ...base, ...patch, year } });
  };
  const setTp = (patch: Partial<TaxPrepInput>) => onChange({ ...budget, taxPrep: { ...tp, ...patch } });
  // 매달 입력하는 값(연금·청약·카드)을 고치면 날짜를 찍어서 개요의 '이번 달 정리'에 반영한다
  const edited = (key: MonthlyEditKey) => ({ editedAt: { ...tp.editedAt, [key]: isoDate(now) } });
  const setPolicy = (patch: Partial<TaxPrepPolicy>) => setTp({ policy: { ...tp.policy, ...patch } });
  const setSplit = (i: number, patch: Partial<RentShare>) => setTp({ rentSplit: rentSplit.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  const p = tp.policy;
  const v = tp.year === year ? tp : { ...tp, rentPaid: 0, subscriptionPaid: 0, creditCardUsed: 0, debitCardUsed: 0 };

  return (
    <section className="panel active" id="panel-tax">
      <SectionTitle>연말정산 준비 ({year}년)</SectionTitle>
      <div className="card">
        <InfoValue label="총급여 (내 정보의 연 총보수)" onEdit={onEditInfo}>{grossIncome > 0 ? won(grossIncome) : "입력 필요"}</InfoValue>
        <Line k="지금까지 기준 줄어드는 세금 (추정 합계)" v={won(r.totalTaxSaved)} total />
        <Line k="연말 기준 예상 환급액 (전체)" v={won(split.total)} />
        {split.other > 0 && (
          <Line k={`${otherName}에게 돌려줄 금액 (월세 공제 ${won(split.rentCredit)} × ${(split.otherRatio * 100).toFixed(1)}%)`} v={won(split.other)} />
        )}
        <Line k={`내 몫 → ${dest}`} v={won(split.mine)} total />
        <p className="note">
          네 항목으로 줄어드는 세금만 추정한 값이야. 연금은 계획 납입액, 월세는 연말까지 낼 금액 기준. 정확한 환급액은 11월 홈택스 '연말정산 미리보기'에서.
          {basis !== "estimate" && ` 계획(내 정보)에는 '${basis === "manual" ? "직접 입력" : "연금 세액공제분만"}' 기준 ${won(expectedRefund(budget))}을 써.`}
          {grossIncome <= 0 && " 내 정보에서 연 총보수를 먼저 넣어줘."}
        </p>

        <h3 className="sub-title">연금저축·IRP 세액공제</h3>
        <div className="field-row">
          <div className="field">
            <label>올해 납입한 금액 (원)</label>
            <MoneyInput value={r.pension.paid} onChange={(val) => onChange({ ...budget, pensionPaidThisYear: val, pensionPaidYear: year, taxPrep: { ...tp, ...edited("pension") } })} />
          </div>
          <div className="field">
            <label>세액공제 대상 한도 (원)</label>
            <MoneyInput value={r.pension.limit} onChange={(val) => onChange({ ...budget, pensionCreditLimit: val > 0 ? val : DEFAULT_PENSION_LIMIT })} />
          </div>
          <div className="field">
            <label>세액공제율 (총급여로 자동)</label>
            <div className="info-value">
              <span>{budget.pensionTaxCreditRate}%</span>
            </div>
          </div>
        </div>
        <ProgressBar height={12} value={r.pension.paid} max={r.pension.limit} valueLabel="올해 납입" maxLabel="세액공제 한도" remainingLabel="남은 한도" />
        <Line k="남은 한도" v={won(r.pension.remaining)} />
        <Line k="지금까지 세액공제 (추정)" v={won(r.pension.refund)} />
        <Line k="남은 한도를 채우면 더 줄어드는 세금" v={won(r.pension.extraRefundIfFilled)} />
        <p className="note">연금계좌에 넣은 돈은 집 마련에 쓸 수 없다는 점도 함께 고려해줘.</p>

        <h3 className="sub-title">월세 세액공제</h3>
        <div className="field-row">
          <div className="field">
            <InfoValue label="계약상 월세" onEdit={onEditInfo}>{won(tp.rentMonthly)}/월</InfoValue>
          </div>
          <div className="field">
            <label>올해 이미 낸 월세 (원)</label>
            {tp.rentPaidManual ? (
              <MoneyInput value={v.rentPaid} onChange={(val) => setYearly({ rentPaid: val })} />
            ) : (
              <div className="info-value">
                <span>{won(r.rent.paid)}</span>
              </div>
            )}
            <label className="toggle" htmlFor="rent-manual" style={{ marginTop: 6 }}>
              <input
                id="rent-manual"
                type="checkbox"
                checked={!tp.rentPaidManual}
                onChange={(e) => (e.target.checked ? setTp({ rentPaidManual: false }) : setYearly({ rentPaidManual: true, rentPaid: autoRentPaid(v, now) }))}
              />
              자동 (1월~{now.getMonth() + 1}월{rentSplit.length > 0 ? ", 분담 구간 합계" : ""})
            </label>
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
        <p className="note">무주택 세대주 + 계약서 주소 전입신고 필요. 이체 내역을 챙겨둬.</p>

        <div className="field" style={{ maxWidth: 280 }}>
          <label>월세 분담자 (공제 중 그 몫은 환급 후 돌려줌)</label>
          <input type="text" value={tp.rentSplitName ?? ""} placeholder="분담자" onChange={(e) => setTp({ rentSplitName: e.target.value })} />
        </div>
        {rentSplit.length > 0 && (
          <div className="table-scroll">
            <table className="grid">
              <thead>
                <tr>
                  <th>시작 월</th>
                  <th>끝 월</th>
                  <th className="num">내 몫 (원/월)</th>
                  <th className="num">{otherName} 몫 (원/월)</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rentSplit.map((x, i) => (
                  <tr key={i}>
                    <td>
                      <input type="month" className="cell-input" value={x.from} onChange={(e) => setSplit(i, { from: e.target.value })} />
                    </td>
                    <td>
                      <input type="month" className="cell-input" value={x.to} onChange={(e) => setSplit(i, { to: e.target.value })} />
                    </td>
                    <td className="num">
                      <MoneyInput value={x.mine} onChange={(val) => setSplit(i, { mine: val })} />
                    </td>
                    <td className="num">
                      <MoneyInput value={x.other} onChange={(val) => setSplit(i, { other: val })} />
                    </td>
                    <td>
                      <button className="btn ghost sm" onClick={() => setTp({ rentSplit: rentSplit.filter((_, j) => j !== i) })}>
                        삭제
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <button
          className="btn ghost sm"
          style={{ marginTop: 8 }}
          onClick={() => setTp({ rentSplit: [...rentSplit, { from: `${year}-01`, to: `${year}-12`, mine: tp.rentMonthly, other: 0 }] })}
        >
          + 분담 구간 추가
        </button>
        {split.otherRatio > 0 && (
          <Line k={`올해 ${otherName} 부담 ${(split.otherRatio * 100).toFixed(1)}% → 돌려줄 금액`} v={won(split.other)} />
        )}
        {tp.rentMonthly > 0 && rentSplit.some((x) => Math.abs(x.mine + x.other - tp.rentMonthly) > 0.001) && (
          <p className="note" style={{ color: "var(--risk)" }}>
            내 몫 + {otherName} 몫이 계약 월세({won(tp.rentMonthly)})와 다른 구간이 있어.
          </p>
        )}

        <h3 className="sub-title">주택청약 소득공제</h3>
        <div className="field" style={{ maxWidth: 280 }}>
          <label>올해 납입한 금액 (원)</label>
          <MoneyInput value={v.subscriptionPaid} onChange={(val) => setYearly({ subscriptionPaid: val, ...edited("subscription") })} />
        </div>
        {r.subscription.eligible ? (
          <>
            <ProgressBar height={12} value={r.subscription.paid} max={p.subscription.limit} valueLabel="올해 납입" maxLabel="소득공제 납입 한도" remainingLabel="남은 한도" />
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
            <MoneyInput value={v.creditCardUsed} onChange={(val) => setYearly({ creditCardUsed: val, ...edited("card") })} />
          </div>
          <div className="field">
            <label>올해 체크카드·현금영수증 (원)</label>
            <MoneyInput value={v.debitCardUsed} onChange={(val) => setYearly({ debitCardUsed: val, ...edited("card") })} />
          </div>
        </div>
        {grossIncome > 0 && (
          <>
            <ProgressBar height={12} value={r.card.used} max={r.card.threshold} valueLabel="올해 카드 사용액" maxLabel={`공제 문턱 (총급여 ${p.card.thresholdPct}%)`} remainingLabel="문턱까지 남은 사용액" />
            <Line k={`문턱 (총급여의 ${p.card.thresholdPct}%)`} v={won(r.card.threshold)} />
            {r.card.toThreshold > 0 ? (
              <Line k="문턱까지 남은 사용액" v={won(r.card.toThreshold)} />
            ) : (
              <Line k={`소득공제${r.card.capped ? " (한도 도달)" : ""}`} v={won(r.card.deduction)} />
            )}
            <Line k="그만큼 줄어드는 세금 (추정)" v={won(r.card.taxSaved)} />
            <p className="note">
              {r.card.toThreshold > 0
                ? `문턱 전까지는 공제 없음 → 혜택 좋은 신용카드도 OK. 넘은 뒤엔 체크카드(${p.card.debitRatePct}%)가 신용카드(${p.card.creditRatePct}%)보다 유리.`
                : `문턱 넘음 → 남은 기간은 체크카드(${p.card.debitRatePct}%)가 신용카드(${p.card.creditRatePct}%)보다 유리. 한도 ${won(r.card.limit)}.`}
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
    </section>
  );
}
