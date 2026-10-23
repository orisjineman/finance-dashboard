import { createApp } from "./app.js";

const PORT = process.env.API_PORT ? Number(process.env.API_PORT) : 4300;

// 같은 네트워크의 다른 기기에서는 접속할 수 없게 이 PC(루프백)에서만 받는다.
createApp().listen(PORT, "127.0.0.1", () => {
  console.log(`finance-dashboard server listening on http://localhost:${PORT}`);
});
