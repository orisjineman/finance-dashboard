import { useState } from "react";
import type { AssetRow, BudgetData, HomePolicy, HomeSimInput, LoanInput, RebalanceGroup, StrategyData } from "../types";
import { fmtWon, monthlyHouseSavings } from "../utils";
import { monthlyAfterTax } from "../home";
import { computeHome, computeHomeAssets, policyStale, totalInterest, yearExceeding, type Eligibility, type Judge } from "../home";
import MoneyInput from "./MoneyInput";
import SectionTitle from "./SectionTitle";

interface Props {
  rows: AssetRow[];
  groups: RebalanceGroup[];
  home: HomeSimInput;
  onChange: (home: HomeSimInput) => void;
  loan: LoanInput;
  onLoanChange: (loan: LoanInput) => void;
  strategy: StrategyData;
  onStrategyChange: (strategy: StrategyData) => void;
  budget: BudgetData;
  onBudgetChange: (budget: BudgetData) => void;
}

const JUDGE_LABEL: Record<Judge, { text: string; tag: string }> = {
  ok: { text: "적정", tag: "safe" },
  tight: { text: "빠듯", tag: "cash" },
  heavy: { text: "부담", tag: "risk" },
};

const pct = (r: number) => (Number.isFinite(r) ? `${(r * 100).toFixed(1)}%` : "-");
const eok = (manwon: number) => `${(manwon / 10000).toFixed(manwon % 1000 === 0 ? 1 : 2)}억`;

function Badge({ label, e }: { label: string; e: Eligibility }) {
  return (
    <span className={`tag ${e.ok ? "safe" : "risk"}`} title={e.reasons.join(", ")} style={{ whiteSpace: "nowrap" }}>
      {label} {e.ok ? "가능" : `불가(${e.reasons.join("·")})`}
    </span>
  );
}

// '내 집 마련' 탭의 시뮬레이터. 집값 후보별로 필요 대출, 월 상환액, 상환 비중, 대출 자격을 비교한다.
export default function HomeSimulator({ rows, groups, home, onChange, loan, onLoanChange, strategy, onStrategyChange, budget, onBudgetChange }: Props) {
  const now = new Date();
  const [newPrice, setNewPrice] = useState(0);
  const assets = computeHomeAssets(rows, groups, home);
  const raisePct = budget.annualRaisePct || 0;
  // 비교 목록에 목표 집값이 없으면(예전에 따로 입력한 값) 표에 함께 보여준다
  const targetInList = home.prices.includes(loan.price);
  const shownPrices = loan.price > 0 && !targetInList ? [...home.prices, loan.price] : home.prices;
  const r = computeHome({ ...home, prices: shownPrices }, assets.equity, loan.ratePct, strategy.housePurchaseDate, now, raisePct);
  const stale = policyStale(home.policy.updatedAt, now);
  const currentYear = now.getFullYear();

  const set = <K extends keyof HomeSimInput>(key: K, value: HomeSimInput[K]) => onChange({ ...home, [key]: value });
  const setPolicy = (patch: Partial<HomePolicy>) => onChange({ ...home, policy: { ...home.policy, ...patch } });

  // 월 저축 가능액(월급·예산 탭) × 매수까지 남은 개월 수
  const monthsLeft = (() => {
    const d = strategy.housePurchaseDate ? new Date(`${strategy.housePurchaseDate}T00:00:00`) : null;
    if (!d || Number.isNaN(d.getTime())) return 0;
    return Math.max(0, (d.getFullYear() - now.getFullYear()) * 12 + (d.getMonth() - now.getMonth()));
  })();
  const monthlySavings = monthlyHouseSavings(budget); // 개요의 집 마련 예상 경로와 같은 값 (연금 납입·환급 반영)
  const savingsUntilPurchase = Math.max(0, monthlySavings) * monthsLeft;

  const raiseCases = Array.from(new Set([2, 2.5, 3, raisePct])).sort((a, b) => a - b);
  const estNowMonthly = monthlyAfterTax(home.policy.afterTaxRatioTable, home.currentIncome);
  const purchaseYear = r.purchaseYear;

  return (
    <>
      <SectionTitle>내 집 마련 요약</SectionTitle>
      <div className="stat-grid">
        <div className="stat">
          <div className="label">집값에 넣을 돈 (실투입금)</div>
          <div className="value">
            {fmtWon(assets.equity)}
            <small> 원</small>
          </div>
        </div>
        <div className="stat">
          <div className="label">{purchaseYear}년 예상 총보수</div>
          <div className="value">
            {fmtWon(r.incomeAtPurchase)}
            <small> 원</small>
          </div>
        </div>
        <div className="stat">
          <div className="label">그때 세후 월급 (추정)</div>
          <div className="value">
            {fmtWon(r.afterTaxMonthly)}
            <small> 원</small>
          </div>
        </div>
        <div className="stat">
          <div className="label">최대 적정 집값 (상환 {home.targetRatioPct}%)</div>
          <div className="value" style={{ fontSize: 17 }}>
            30년 {eok(r.maxPrice30)} · 40년 {eok(r.maxPrice40)}
          </div>
        </div>
      </div>
      {home.currentIncome <= 0 && <p className="note">아래 입력에서 현재 총보수를 넣으면 세후 월급과 상환 비중이 계산돼.</p>}

      <SectionTitle>조건 입력</SectionTitle>
      <div className="card">
        <div className="field-row">
          <div className="field">
            <label>가용자산 기준</label>
            <select value={home.assetSource} onChange={(e) => set("assetSource", e.target.value as HomeSimInput["assetSource"])}>
              <option value="housing">자산 스냅샷에서 '집자금' 체크한 전체 (개요·시뮬레이션과 같음)</option>
              <option value="group">리밸런싱 '{assets.groupName ?? "집 자금"}' 묶음 계좌 합계</option>
            </select>
          </div>
          <div className="field">
            <label>기준 자산 (자동, 보증금 제외)</label>
            <MoneyInput value={assets.base} readOnly />
          </div>
        </div>
        <div className="field" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input id="home-deposit" type="checkbox" checked={home.includeDeposit} onChange={(e) => set("includeDeposit", e.target.checked)} style={{ width: 16, height: 16 }} />
          <label htmlFor="home-deposit" style={{ marginBottom: 0 }}>
            보증금 포함 ({assets.depositItems.length > 0 ? `${assets.depositItems.join(", ")} ${fmtWon(assets.deposit)}원` : "스냅샷에 '보증금'이 든 항목이 없어"})
          </label>
        </div>
        <div className="field-row">
          <div className="field">
            <label>추가 가용자산 (원, 매수 때까지 더 모을 돈)</label>
            <MoneyInput value={home.extraAssets} onChange={(v) => set("extraAssets", v)} />
            {savingsUntilPurchase > 0 && (
              <button className="btn ghost sm" style={{ marginTop: 6 }} onClick={() => set("extraAssets", Math.round(savingsUntilPurchase))}>
                집 마련 월 저축액 {fmtWon(monthlySavings)}원 × {monthsLeft}개월 = {fmtWon(savingsUntilPurchase)}원으로 채우기
              </button>
            )}
          </div>
          <div className="field">
            <label>부대비용 (원, 취득세·중개·법무·이사)</label>
            <MoneyInput value={home.closingCost} onChange={(v) => set("closingCost", v)} />
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label>현재 연 총보수 (원, 대출 심사 기준)</label>
            <MoneyInput value={home.currentIncome} onChange={(v) => set("currentIncome", v)} />
          </div>
          <div className="field">
            <label>연봉 상승률 (%, 월급·예산 탭과 같은 값)</label>
            <input type="number" step={0.5} value={raisePct} onChange={(e) => onBudgetChange({ ...budget, annualRaisePct: parseFloat(e.target.value) || 0 })} />
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label>집 매수 예정일</label>
            <input type="date" value={strategy.housePurchaseDate} onChange={(e) => onStrategyChange({ ...strategy, housePurchaseDate: e.target.value })} />
          </div>
          <div className="field">
            <label>대출 금리 (연 %)</label>
            <input type="number" step={0.1} value={loan.ratePct} onChange={(e) => onLoanChange({ ...loan, ratePct: parseFloat(e.target.value) || 0 })} />
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label>목표 상환 비중 (세후 월급 대비 %)</label>
            <input type="number" step={1} value={home.targetRatioPct} onChange={(e) => set("targetRatioPct", parseFloat(e.target.value) || 0)} />
          </div>
          <div className="field">
            <label>예상 전용면적 (㎡, 디딤돌 판정용)</label>
            <input type="number" value={home.areaM2 || ""} placeholder="예: 59" onChange={(e) => set("areaM2", parseFloat(e.target.value) || 0)} />
          </div>
        </div>
        {home.currentIncome > 0 && budget.monthlyNetIncome > 0 && (
          <p className="note" style={{ marginTop: 0 }}>
            참고: 총보수 {fmtWon(home.currentIncome)}원을 비율표로 환산한 지금 세후 월급은 약 {fmtWon(estNowMonthly)}원이고, 월급·예산 탭의 월 실수령액은 {fmtWon(budget.monthlyNetIncome)}원이야.
            총보수에는 상여·과세 복지가 들어가서 매달 받는 돈보다 클 수 있어. 차이가 크면 비율표나 총보수를 확인해줘.
          </p>
        )}
        <p className="note" style={{ marginTop: 0 }}>
          실투입금 = 기준 자산 {fmtWon(assets.base)}원{home.includeDeposit ? ` + 보증금 ${fmtWon(assets.deposit)}원` : ""} + 추가 {fmtWon(home.extraAssets)}원 − 부대비용 {fmtWon(home.closingCost)}원. 매수 예정일과 대출 금리는 리밸런싱·목표 집값 계산과 같은 값을 써.
        </p>
      </div>

      <SectionTitle>집값별 비교</SectionTitle>
      <div className="card">
        <div className="table-scroll">
          <table className="grid" style={{ minWidth: 1000 }}>
            <thead>
              <tr>
                <th className="num">집값</th>
                <th className="num">필요 대출</th>
                <th className="num">월 상환 30년</th>
                <th className="num">월 상환 40년</th>
                <th className="num">상환 비중 (30년 / 40년)</th>
                <th>판정 (30 / 40)</th>
                <th>대출 자격</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {r.rows.map((x) => (
                <tr key={x.price} className={x.price === loan.price ? "target-row" : undefined}>
                  <td className="num" style={{ fontWeight: 700, whiteSpace: "nowrap" }}>
                    {eok(x.price)}
                    {x.price === loan.price && (
                      <span className="tag safe" style={{ marginLeft: 6 }}>
                        목표
                      </span>
                    )}
                  </td>
                  <td className="num">{fmtWon(x.loan)}</td>
                  <td className="num">{fmtWon(x.monthly30)}</td>
                  <td className="num">{fmtWon(x.monthly40)}</td>
                  <td className="num">
                    {pct(x.ratio30)} / {pct(x.ratio40)}
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <span className={`tag ${JUDGE_LABEL[x.judge30].tag}`}>{JUDGE_LABEL[x.judge30].text}</span>{" "}
                    <span className={`tag ${JUDGE_LABEL[x.judge40].tag}`}>{JUDGE_LABEL[x.judge40].text}</span>
                  </td>
                  <td>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      <Badge label="보금자리론" e={x.bogeumjari} />
                      <Badge label="디딤돌" e={x.didimdol} />
                      {x.overLtv && <span className="tag cash">LTV {Math.round(home.policy.bogeumjari.ltv * 100)}% 초과</span>}
                    </div>
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {x.price === loan.price ? (
                      !targetInList && (
                        <button className="btn ghost sm" onClick={() => set("prices", [...home.prices, x.price])}>
                          비교 목록에 추가
                        </button>
                      )
                    ) : (
                      <>
                        <button className="btn ghost sm" title="개요·시뮬레이션·알림이 이 집값을 기준으로 바뀌어" onClick={() => onLoanChange({ ...loan, price: x.price })}>
                          목표로
                        </button>{" "}
                        <button className="btn ghost sm" onClick={() => set("prices", home.prices.filter((p) => p !== x.price))}>
                          삭제
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13 }}>집값 추가 (원)</span>
          <div style={{ width: 200 }}>
            <MoneyInput value={newPrice} onChange={setNewPrice} />
          </div>
          <button
            className="btn ghost sm"
            disabled={newPrice <= 0 || home.prices.includes(newPrice)}
            onClick={() => {
              set("prices", [...home.prices, newPrice]);
              setNewPrice(0);
            }}
          >
            추가
          </button>
        </div>
        <p className="note">
          판정 기준: 세후 월급 대비 월 상환액 {Math.round(home.policy.judge.okMax * 100)}% 이하 적정, {Math.round(home.policy.judge.tightMax * 100)}% 이하 빠듯, 그 이상 부담. 보금자리론은 매수 시점 예상 총보수로
          판정하고, 필요 대출이 집값의 {Math.round(home.policy.bogeumjari.ltv * 100)}%를 넘으면 LTV 초과로 표시해. '목표' 표시가 붙은 집값을 개요의 집 마련 진행·시뮬레이션·알림이 기준으로 써. 다른 집값의 '목표로'를 누르면 바뀌어.
        </p>
      </div>

      <SectionTitle>연봉 {fmtWon(home.incomeThreshold)}원 넘는 해</SectionTitle>
      <div className="card">
        <table className="grid">
          <thead>
            <tr>
              <th>인상률</th>
              <th>넘는 해</th>
              <th>{purchaseYear}년(매수) 총보수</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {raiseCases.map((rate) => {
              const y = yearExceeding(home.currentIncome, rate, currentYear, home.incomeThreshold);
              const before = y !== null && y <= purchaseYear;
              return (
                <tr key={rate}>
                  <td>
                    {rate}%{rate === raisePct ? " (월급·예산 탭 값)" : ""}
                  </td>
                  <td>{home.currentIncome <= 0 ? "-" : y === null ? "넘지 않음" : `${y}년`}</td>
                  <td>{fmtWon(home.currentIncome * Math.pow(1 + rate / 100, Math.max(0, purchaseYear - currentYear)))}원</td>
                  <td>{before && <span className="tag risk">매수 전에 넘음</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {raiseCases.some((rate) => {
          const y = yearExceeding(home.currentIncome, rate, currentYear, home.incomeThreshold);
          return home.currentIncome > 0 && y !== null && y <= purchaseYear;
        }) && (
          <p className="note" style={{ color: "var(--risk)" }}>
            매수 전에 보금자리론 소득 기준을 넘을 수 있어. 집을 먼저 사고 이직하는 순서를 고려해줘.
          </p>
        )}
        <div className="field" style={{ maxWidth: 260, marginTop: 10 }}>
          <label>기준 연봉 (원)</label>
          <MoneyInput value={home.incomeThreshold} onChange={(v) => set("incomeThreshold", v)} />
        </div>
      </div>

      <SectionTitle>메모</SectionTitle>
      <div className="card">
        <ul className="plain">
          <li>40년 만기는 월 상환은 줄지만 총이자가 늘어나. 이직 후 연봉이 오르면 오른 만큼 조기상환에 쓰는 걸 전제로 봐줘.</li>
          <li>
            같은 대출을 30년과 40년으로 갚을 때 총이자 차이는 대출 1억원당 약{" "}
            {fmtWon(totalInterest(10000, loan.ratePct, 40) - totalInterest(10000, loan.ratePct, 30))}원이야 (금리 {loan.ratePct}% 기준).
          </li>
          <li>세후 월급은 연봉 구간별 비율표로 추정한 값이라 실제와 다를 수 있어. 정확한 한도는 매수 1년 전 은행·주택금융공사 상담으로 확인해줘.</li>
        </ul>
      </div>

      <SectionTitle>정책 숫자 (설정)</SectionTitle>
      <div className="card">
        <p className="note" style={{ marginTop: 0, color: stale ? "var(--risk)" : undefined }}>
          마지막 확인일 {home.policy.updatedAt}
          {stale ? " · 1년이 넘었어. 정책 숫자를 다시 확인해줘." : " · 대출 상품 조건은 자주 바뀌니 매수 전에 꼭 다시 확인해줘."}
        </p>
        <div className="field-row">
          <div className="field">
            <label>보금자리론 집값 상한 (원)</label>
            <MoneyInput value={home.policy.bogeumjari.maxHousePrice} onChange={(v) => setPolicy({ bogeumjari: { ...home.policy.bogeumjari, maxHousePrice: v } })} />
          </div>
          <div className="field">
            <label>보금자리론 소득 상한 (원)</label>
            <MoneyInput value={home.policy.bogeumjari.maxIncome} onChange={(v) => setPolicy({ bogeumjari: { ...home.policy.bogeumjari, maxIncome: v } })} />
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label>보금자리론 대출 한도 (원, 생애최초)</label>
            <MoneyInput value={home.policy.bogeumjari.maxLoanFirstTime} onChange={(v) => setPolicy({ bogeumjari: { ...home.policy.bogeumjari, maxLoanFirstTime: v } })} />
          </div>
          <div className="field">
            <label>LTV (%, 목표 집값 계산에도 같이 쓰임)</label>
            <input
              type="number"
              value={Math.round(home.policy.bogeumjari.ltv * 1000) / 10}
              onChange={(e) => setPolicy({ bogeumjari: { ...home.policy.bogeumjari, ltv: (parseFloat(e.target.value) || 0) / 100 } })}
            />
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label>디딤돌(미혼 단독세대주) 집값 상한 (원)</label>
            <MoneyInput value={home.policy.didimdolSingle.maxHousePrice} onChange={(v) => setPolicy({ didimdolSingle: { ...home.policy.didimdolSingle, maxHousePrice: v } })} />
          </div>
          <div className="field">
            <label>디딤돌 대출 한도 (원, 생애최초)</label>
            <MoneyInput value={home.policy.didimdolSingle.maxLoanFirstTime} onChange={(v) => setPolicy({ didimdolSingle: { ...home.policy.didimdolSingle, maxLoanFirstTime: v } })} />
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label>디딤돌 전용면적 상한 (㎡)</label>
            <input type="number" value={home.policy.didimdolSingle.maxAreaM2} onChange={(e) => setPolicy({ didimdolSingle: { ...home.policy.didimdolSingle, maxAreaM2: parseFloat(e.target.value) || 0 } })} />
          </div>
          <div className="field">
            <label>판정: 적정 / 빠듯 상한 (%)</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="number"
                value={Math.round(home.policy.judge.okMax * 1000) / 10}
                onChange={(e) => setPolicy({ judge: { ...home.policy.judge, okMax: (parseFloat(e.target.value) || 0) / 100 } })}
              />
              <input
                type="number"
                value={Math.round(home.policy.judge.tightMax * 1000) / 10}
                onChange={(e) => setPolicy({ judge: { ...home.policy.judge, tightMax: (parseFloat(e.target.value) || 0) / 100 } })}
              />
            </div>
          </div>
        </div>
        <label style={{ fontSize: 13 }}>연봉 구간별 세후 비율</label>
        <table className="grid" style={{ maxWidth: 420 }}>
          <thead>
            <tr>
              <th className="num">연 총보수 (원)</th>
              <th className="num">세후 비율</th>
            </tr>
          </thead>
          <tbody>
            {home.policy.afterTaxRatioTable.map(([income, ratio], i) => (
              <tr key={i}>
                <td className="num">
                  <MoneyInput
                    value={income}
                    onChange={(v) => setPolicy({ afterTaxRatioTable: home.policy.afterTaxRatioTable.map((row, j) => (j === i ? [v, row[1]] : row)) })}
                  />
                </td>
                <td className="num">
                  <input
                    type="number"
                    step={0.001}
                    value={ratio}
                    onChange={(e) =>
                      setPolicy({ afterTaxRatioTable: home.policy.afterTaxRatioTable.map((row, j) => (j === i ? [row[0], parseFloat(e.target.value) || 0] : row)) })
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="btn ghost" style={{ marginTop: 12 }} onClick={() => setPolicy({ updatedAt: new Date().toISOString().slice(0, 10) })}>
          오늘 날짜로 확인 완료 표시
        </button>
      </div>
    </>
  );
}
