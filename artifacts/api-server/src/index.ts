import app from "./app";
import { logger } from "./lib/logger";

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

const server = app.listen(port, () => {
  logger.info({ port }, "Server listening");
});

// Extend timeouts to support large video uploads (up to 2 GB for Studio plan).
// Default Node.js socket timeout is 5 s which is far too short for big files.
server.setTimeout(60 * 60 * 1000);       // 1 hour socket timeout
server.headersTimeout = 61 * 60 * 1000;  // slightly above socket timeout
server.requestTimeout = 61 * 60 * 1000;  // same
