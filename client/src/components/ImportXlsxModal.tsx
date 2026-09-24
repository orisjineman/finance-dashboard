import { useRef, useState } from "react";
import type { AssetCategory, ImportPreview, ImportPreviewRow } from "../types";
import { importXlsx } from "../api";
import { fmtWon } from "../utils";

interface Props {
  onClose: () => void;
  onImport: (rows: ImportPreviewRow[]) => void;
}

const catLabel: Record<AssetCategory, string> = { risk: "위험", safe: "안전", cash: "현금성" };

export default function ImportXlsxModal({ onClose, onImport }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleFile(file: File) {
    setLoading(true);
    setError(null);
    try {
      const result = await importXlsx(file);
      setPreview(result);
      const sel: Record<string, boolean> = {};
      result.rows.forEach((r) => (sel[r.id] = true));
      setSelected(sel);
      if (result.rows.length === 0) {
        setError("항목/금액 열을 가진 표를 찾지 못했어. 헤더에 '항목'·'계좌'·'분류'·'잔액'·'금액' 같은 단어가 있는지 확인해줘.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "파일을 읽는 중 오류가 발생했어.");
    } finally {
      setLoading(false);
    }
  }

  function confirmImport() {
    if (!preview) return;
    const rows = preview.rows.filter((r) => selected[r.id]);
    onImport(rows);
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>xlsx에서 자산 항목 가져오기</h3>
        {!preview && (
          <>
            <p className="note">
              계좌/항목명 + 잔액(또는 평가금액) 열이 있는 표를 찾아서 읽어와. 열 이름이 정확히 안 맞으면 못 찾을 수 있으니, 가져온 후 스냅샷 탭에서 직접 다듬어줘.
            </p>
            <input
              ref={fileInput}
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
            {loading && <p className="note">읽는 중…</p>}
            {error && <p className="note" style={{ color: "var(--risk)" }}>{error}</p>}
          </>
        )}
        {preview && preview.rows.length > 0 && (
          <>
            <p className="note">
              {preview.sheetsExamined.join(", ")} 시트에서 {preview.rows.length}개 항목을 찾았어. 가져올 항목만 체크해줘.
            </p>
            <div className="table-scroll">
<table className="grid">
              <thead>
                <tr>
                  <th></th>
                  <th>계좌</th>
                  <th>항목</th>
                  <th>분류</th>
                  <th style={{ textAlign: "right" }}>금액 (원)</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={!!selected[r.id]}
                        onChange={(e) => setSelected((s) => ({ ...s, [r.id]: e.target.checked }))}
                      />
                    </td>
                    <td>{r.account}</td>
                    <td>{r.item}</td>
                    <td>
                      <span className={`tag ${r.category}`}>{catLabel[r.category]}</span>
                    </td>
                    <td className="num">{fmtWon(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
</div>
          </>
        )}
        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose}>
            닫기
          </button>
          {preview && preview.rows.length > 0 && (
            <button className="btn" onClick={confirmImport}>
              선택 항목 추가
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
