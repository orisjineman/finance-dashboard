import type { ReactNode } from "react";

// '내 정보' 탭에서만 고치는 값을 다른 탭에서 보여줄 때 쓰는 읽기 전용 칸 (+ 수정하러 가기 버튼)
export function InfoValue({ label, children, onEdit }: { label: string; children: ReactNode; onEdit?: () => void }) {
  return (
    <div className="field">
      <label>{label}</label>
      <div className="info-value">
        <span>{children}</span>
        {onEdit && (
          <button type="button" className="btn ghost sm" onClick={onEdit}>
            내 정보에서 수정
          </button>
        )}
      </div>
    </div>
  );
}

// 입력칸 아래에 "쓰이는 곳"을 작게 보여준다
export function Uses({ where }: { where: string[] }) {
  return <p className="uses">쓰이는 곳: {where.join(" · ")}</p>;
}
