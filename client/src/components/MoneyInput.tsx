import { useState, type CSSProperties } from "react";
import { fmtWon, parseWonToManwon } from "../utils";

interface Props {
  value: number; // 만원 단위로 저장된 값
  onChange?: (manwon: number) => void;
  readOnly?: boolean;
  style?: CSSProperties;
}

// 앱 전체에서 금액 입력/표시 정책을 통일: 저장은 만원 단위, 화면은 원 단위 + 1원까지 정확한 콤마 표기.
export default function MoneyInput({ value, onChange, readOnly, style }: Props) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");

  return (
    <input
      type="text"
      inputMode="numeric"
      readOnly={readOnly}
      value={editing ? text : fmtWon(value)}
      onFocus={(e) => {
        if (readOnly) return;
        setEditing(true);
        setText(String(Math.round(value * 10000) || 0));
        e.target.select();
      }}
      onChange={(e) => {
        if (readOnly || !onChange) return;
        const raw = e.target.value.replace(/[^0-9-]/g, "");
        setText(raw);
        onChange(parseWonToManwon(raw));
      }}
      onBlur={() => setEditing(false)}
      style={style}
    />
  );
}
