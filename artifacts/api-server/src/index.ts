import app from "./app";
import { logger } from "./lib/logger";
import { isR2Configured, ensureR2Cors } from "./lib/r2";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, async (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  if (isR2Configured()) {
    logger.info("R2 storage configured — direct upload active");
    ensureR2Cors().catch(() => {
      logger.warn("R2 CORS setup skipped (token lacks PutBucketCors permission — configure CORS in the Cloudflare dashboard for browser-direct uploads)");
    });
  }
});
