import { useEffect, useState } from "react";

// 화면을 그릴 때 쓰는 '오늘'. 렌더 중에 new Date()를 부르면 그릴 때마다 값이 달라지므로 처음 한 번 정해 두고,
// 대시보드를 켜 둔 채 날짜가 바뀌면(1분마다 확인) 새 날짜로 다시 그린다.
export function useToday(): Date {
  const [today, setToday] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => {
      const now = new Date();
      if (now.toDateString() !== today.toDateString()) setToday(now);
    }, 60_000);
    return () => clearInterval(id);
  }, [today]);
  return today;
}
