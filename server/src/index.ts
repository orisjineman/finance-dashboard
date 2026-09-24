import { createApp } from "./app.js";

const PORT = process.env.API_PORT ? Number(process.env.API_PORT) : 4300;

createApp().listen(PORT, () => {
  console.log(`finance-dashboard server listening on http://localhost:${PORT}`);
});
