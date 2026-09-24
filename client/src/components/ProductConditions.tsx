import type { AssetRow } from "../types";
import type { QuoteResult } from "../api";
import MoneyInput from "./MoneyInput";
import QuoteBar from "./QuoteBar";
import SectionTitle from "./SectionTitle";

interface Props {
  rows: AssetRow[];
  tradableRows: AssetRow[]; // 리밸런싱 묶음에 든 계좌의 위험·안전 자산 행
  onRowsChange: (rows: AssetRow[]) => void;
}

// 상품별 종목코드 · 1주 가격 · 매매 규칙 (같은 상품이 여러 계좌에 있어도 한 줄로 묶어 한 번만 입력)
export default function ProductConditions({ rows, tradableRows, onRowsChange }: Props) {
  // 같은 상품이 여러 계좌에 있어도 한 줄로 묶어서 보여주고, 입력하면 그 상품이 있는 모든 계좌에 적용한다.
  const products = Array.from(
    tradableRows.reduce((map, r) => {
      const cur = map.get(r.item) ?? { item: r.item, accounts: [] as string[], amount: 0, rules: new Set<string>() };
      if (!cur.accounts.includes(r.account)) cur.accounts.push(r.account);
      cur.amount += r.amount;
      cur.rules.add(r.rebalanceRule ?? "");
      return map.set(r.item, cur);
    }, new Map<string, { item: string; accounts: string[]; amount: number; rules: Set<string> }>())
  ).map(([, v]) => {
    const priced = rows.find((r) => r.item === v.item && (r.unitPrice ?? 0) > 0);
    const withTicker = rows.find((r) => r.item === v.item && r.ticker);
    return { ...v, price: priced?.unitPrice, priceDate: priced?.priceDate, ticker: withTicker?.ticker ?? "" };
  });

  const tickers = Array.from(new Set(products.map((p) => p.ticker).filter(Boolean)));

  function applyQuotes(results: Record<string, QuoteResult>) {
    const toDate = (d?: string) => (d && d.length === 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : undefined);
    onRowsChange(
      rows.map((r) => {
        const q = r.ticker ? results[r.ticker] : undefined;
        return q?.ok && q.price ? { ...r, unitPrice: q.price / 10000, priceDate: toDate(q.basDt) } : r;
      })
    );
  }

  function updateProduct(item: string, patch: Partial<AssetRow>) {
    onRowsChange(rows.map((r) => (r.item === item ? { ...r, ...patch } : r)));
  }

  return (
    <>
      <SectionTitle>상품별 거래 조건 (선택)</SectionTitle>
      <div className="card">
        <p className="note" style={{ marginTop: 0 }}>
          <strong>1주 가격</strong>을 넣으면 정수 주수로 계산하고, 비워두면 금액 단위(소수점 거래, RP·예수금 등)로 계산해. 가격은 시세에 따라 바뀌니 거래 직전에 다시 확인해줘. 같은 상품이 여러 계좌에 있으면 한 번만 입력해도 모든 계좌에 적용돼.
          <br />
          <strong>매매 안 함</strong>은 만기까지 들고 갈 채권처럼 팔지도 더 사지도 않을 상품에, <strong>매수 우선</strong>은 새로 살 때 그 상품에만 몰아서 사고 싶을 때(예: S&P500만 살 때) 지정해.
        </p>
        <QuoteBar tickers={tickers} onResults={applyQuotes} />
        <div className="table-scroll">
        <table className="grid" style={{ marginTop: 8, minWidth: 780 }}>
          <thead>
            <tr>
              <th>상품</th>
              <th>보유 계좌</th>
              <th>종목코드</th>
              <th className="num">보유 수량</th>
              <th className="num">1주 가격(원)</th>
              <th>규칙</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => {
              const mixed = p.rules.size > 1;
              return (
                <tr key={p.item}>
                  <td>{p.item}</td>
                  <td style={{ fontSize: 12, color: "var(--ink-soft)" }}>{p.accounts.join(", ")}</td>
                  <td>
                    <input
                      type="text"
                      value={p.ticker}
                      placeholder="예: 360750"
                      onChange={(e) => updateProduct(p.item, { ticker: e.target.value.trim().toUpperCase() || undefined })}
                      style={{ textAlign: "left", width: 110 }}
                    />
                  </td>
                  <td className="num">{p.price && p.price > 0 ? `${(p.amount / p.price).toFixed(2)}주` : "-"}</td>
                  <td className="num">
                    <MoneyInput value={p.price ?? 0} onChange={(v) => updateProduct(p.item, { unitPrice: v > 0 ? v : undefined, priceDate: undefined })} />
                    {p.priceDate && <div style={{ fontSize: 11, color: "var(--ink-soft)", marginTop: 2 }}>{p.priceDate} 종가</div>}
                  </td>
                  <td>
                    <select
                      value={mixed ? "mixed" : Array.from(p.rules)[0]}
                      onChange={(e) => updateProduct(p.item, { rebalanceRule: (e.target.value || undefined) as AssetRow["rebalanceRule"] })}
                      style={{ textAlign: "left" }}
                    >
                      {mixed && (
                        <option value="mixed" disabled>
                          계좌마다 다름
                        </option>
                      )}
                      <option value="">기본</option>
                      <option value="hold">매매 안 함</option>
                      <option value="preferred">매수 우선</option>
                    </select>
                  </td>
                </tr>
              );
            })}
            {products.length === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: "center", color: "var(--ink-soft)" }}>
                  '집 자금'·'노후 자금' 탭에서 묶음에 계좌를 넣으면 여기에 상품이 나타나.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>
    </>
  );
}
