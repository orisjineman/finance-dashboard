import { useEffect, useState } from "react";
import { createBackup, importJson, listBackups, restoreBackup, type BackupInfo } from "../api";
import SectionTitle from "./SectionTitle";

function fmtTime(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function kindOf(name: string): string {
  if (name.endsWith("-manual.json")) return "직접 백업";
  if (name.endsWith("-before-restore.json")) return "되돌리기 직전";
  if (name.endsWith("-before-import.json")) return "가져오기 직전";
  return "자동 백업";
}

// 백업·복원, 내보내기, 가져오기. 모든 데이터는 이 컴퓨터의 data/ 폴더에만 있다.
export default function DataPanel() {
  const [backups, setBackups] = useState<BackupInfo[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<{ name: string; data: unknown } | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    try {
      setBackups(await listBackups());
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "백업 목록을 불러오지 못했어.");
      setBackups([]);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function run(task: () => Promise<void>, done: string) {
    setBusy(true);
    setMessage(null);
    try {
      await task();
      setMessage(done);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "실패했어.");
    } finally {
      setBusy(false);
    }
  }

  async function onPickFile(file: File | undefined) {
    if (!file) return;
    try {
      setPendingImport({ name: file.name, data: JSON.parse(await file.text()) });
      setMessage(null);
    } catch {
      setPendingImport(null);
      setMessage("JSON 파일을 읽을 수 없어. 이 앱에서 내보낸 파일인지 확인해줘.");
    }
  }

  return (
    <section className="panel active" id="panel-data">
      <SectionTitle>백업과 되돌리기</SectionTitle>
      <div className="card">
        <p className="note" style={{ marginTop: 0 }}>
          10분마다 자동 백업(최근 30개). 되돌리기 직전 상태도 남아서 다시 되돌릴 수 있어.
        </p>
        <button className="btn" disabled={busy} onClick={() => run(async () => { await createBackup(); await refresh(); }, "백업했어.")}>
          지금 백업
        </button>
        {message && <p className="note" role="status">{message}</p>}
        <div className="table-scroll">
          <table className="grid" style={{ marginTop: 12, minWidth: 480 }}>
            <thead>
              <tr>
                <th>시각</th>
                <th>종류</th>
                <th className="num">크기</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {(backups ?? []).map((b) => (
                <tr key={b.name}>
                  <td>{fmtTime(b.createdAt)}</td>
                  <td>{kindOf(b.name)}</td>
                  <td className="num">{(b.size / 1024).toFixed(1)}KB</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {confirming === b.name ? (
                      <>
                        <button
                          className="btn sm"
                          disabled={busy}
                          onClick={() =>
                            run(async () => {
                              await restoreBackup(b.name);
                              window.location.reload();
                            }, "되돌렸어.")
                          }
                        >
                          이 시점으로 되돌리기
                        </button>{" "}
                        <button className="btn ghost sm" onClick={() => setConfirming(null)}>
                          취소
                        </button>
                      </>
                    ) : (
                      <button className="btn ghost sm" onClick={() => setConfirming(b.name)}>
                        복원
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {backups !== null && backups.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ textAlign: "center", color: "var(--ink-soft)" }}>
                    아직 백업이 없어. 데이터를 한 번 저장하면 자동으로 생겨.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <SectionTitle>내보내기</SectionTitle>
      <div className="card">
        <p className="note" style={{ marginTop: 0 }}>
          JSON은 전체 데이터(다시 가져오기 가능), 엑셀은 스냅샷·히스토리 표 보기용.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <a className="btn ghost" href="/api/export" download>
            JSON으로 내보내기
          </a>
          <a className="btn ghost" href="/api/export.xlsx" download>
            엑셀로 내보내기
          </a>
        </div>
      </div>

      <SectionTitle>가져오기</SectionTitle>
      <div className="card">
        <p className="note" style={{ marginTop: 0 }}>
          내보낸 JSON으로 전체 데이터를 바꿔. 직전 상태는 백업돼.
        </p>
        <input id="import-file" type="file" accept="application/json,.json" onChange={(e) => onPickFile(e.target.files?.[0])} />
        {pendingImport && (
          <div style={{ marginTop: 12 }}>
            <p className="note" style={{ color: "var(--risk)" }}>
              '{pendingImport.name}'로 전체를 바꿀까? ('가져오기 직전' 백업으로 되돌릴 수 있어)
            </p>
            <button
              className="btn"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await importJson(pendingImport.data);
                  window.location.reload();
                }, "가져왔어.")
              }
            >
              바꾸기
            </button>{" "}
            <button className="btn ghost" onClick={() => setPendingImport(null)}>
              취소
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
