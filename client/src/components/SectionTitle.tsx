import type { ReactNode } from "react";

// 모든 탭에서 같은 모양의 섹션 제목 (번호 없이 이름만 쓴다)
export default function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="section-title">{children}</h2>;
}
