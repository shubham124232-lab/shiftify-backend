import { env } from "./config/env";
import app from "./app";
import { startCronJobs } from "./lib/cron";

startCronJobs();

const server = app.listen(env.PORT, () => {
  console.log(`[shiftify-backend] Listening on http://localhost:${env.PORT}`);
  console.log(`[shiftify-backend] env=${env.NODE_ENV}`);
});

function shutdown(signal: string) {
  console.log(`[shiftify-backend] received ${signal}, closing...`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
