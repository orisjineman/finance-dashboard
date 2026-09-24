import { useEffect, useState } from "react";
import { fetchQuotes, getQuoteStatus, saveQuoteKey, type QuoteResult } from "../api";

interface Props {
  tickers: string[]; // 종목코드가 입력된 상품들의 코드 (중복 없이)
  onResults: (results: Record<string, QuoteResult>) => void;
}

export default function QuoteBar({ tickers, onResults }: Props) {
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [editingKey, setEditingKey] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [failures, setFailures] = useState<string[]>([]);

  useEffect(() => {
    getQuoteStatus()
      .then((s) => setHasKey(s.hasKey))
      .catch(() => setHasKey(false));
  }, []);

  async function saveKey() {
    setBusy(true);
    setMessage(null);
    try {
      await saveQuoteKey(keyInput.trim());
      setHasKey(true);
      setEditingKey(false);
      setKeyInput("");
      setMessage({ text: "서비스 키를 저장했어. 이제 가격을 불러올 수 있어.", error: false });
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : "키 저장에 실패했어.", error: true });
    } finally {
      setBusy(false);
    }
  }

  async function load() {
    setBusy(true);
    setMessage(null);
    setFailures([]);
    try {
      const results = await fetchQuotes(tickers);
      onResults(results);
      const okCount = Object.values(results).filter((r) => r.ok).length;
      const bad = Object.entries(results).filter(([, r]) => !r.ok);
      setFailures(bad.map(([code, r]) => `${code}: ${r.error ?? "알 수 없는 오류"}`));
      setMessage({ text: `${okCount}개 상품의 가격을 불러왔어${bad.length > 0 ? ` (${bad.length}개 실패)` : ""}.`, error: okCount === 0 });
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : "가격을 불러오지 못했어.", error: true });
    } finally {
      setBusy(false);
    }
  }

  const showKeyForm = hasKey === false || editingKey;

  return (
    <div style={{ border: "1px dashed var(--line)", borderRadius: 12, padding: 12, marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <button className="btn" disabled={busy || hasKey !== true || tickers.length === 0} onClick={load}>
          {busy ? "불러오는 중…" : "가격 불러오기"}
        </button>
        <span style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>
          {hasKey === true && tickers.length === 0 && "아래 표에서 종목코드를 먼저 입력해줘."}
          {hasKey === true && tickers.length > 0 && `종목코드가 입력된 ${tickers.length}개 상품의 최근 종가를 가져와.`}
          {hasKey === false && "먼저 공공데이터포털 서비스 키를 등록해줘."}
        </span>
        {hasKey === true && !editingKey && (
          <button className="btn ghost" style={{ padding: "6px 10px", fontSize: 12 }} onClick={() => setEditingKey(true)}>
            키 변경
          </button>
        )}
      </div>

      {showKeyForm && (
        <div style={{ marginTop: 12 }}>
          <div className="field" style={{ marginBottom: 8 }}>
            <label>공공데이터포털 서비스 키</label>
            <input type="password" autoComplete="off" value={keyInput} onChange={(e) => setKeyInput(e.target.value)} placeholder="일반 인증키(Encoding 또는 Decoding 어느 쪽이든 OK)" />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn" disabled={busy || keyInput.trim().length < 10} onClick={saveKey}>
              키 저장
            </button>
            {editingKey && (
              <button className="btn ghost" onClick={() => { setEditingKey(false); setKeyInput(""); }}>
                취소
              </button>
            )}
          </div>
          <p className="note">
            data.go.kr에서 <strong>금융위원회_증권상품시세정보</strong>(ETF)와 <strong>금융위원회_주식시세정보</strong>(삼성전자 같은 개별 주식)를 각각 활용신청하면 같은 키로 둘 다 쓸 수 있어.
            키는 이 컴퓨터의 data 폴더에만 저장되고 GitHub에는 올라가지 않아.
          </p>
        </div>
      )}

      {message && (
        <p className="note" style={{ color: message.error ? "var(--risk)" : "var(--safe)", fontWeight: 600 }}>
          {message.text}
        </p>
      )}
      {failures.map((f, i) => (
        <p className="note" key={i} style={{ color: "var(--risk)", margin: "2px 0" }}>
          {f}
        </p>
      ))}
    </div>
  );
}
