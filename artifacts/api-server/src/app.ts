import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import { fileURLToPath } from "url";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.set("trust proxy", true);

const CANONICAL_APP_ORIGIN = (
  process.env.APP_URL ||
  process.env.BASE_URL ||
  process.env.NEXT_PUBLIC_URL ||
  "https://daytabs.com"
).replace(/\/$/, "");
const RENDER_HOST = "daytabs.onrender.com";

app.use((req, res, next) => {
  const host = (req.get("x-forwarded-host") || req.get("host") || "").split(",")[0].trim();
  const callbackPaths = new Set(["/api/auth/google/callback", "/api/youtube/callback"]);
  const shouldRedirect =
    host === RENDER_HOST &&
    (req.method === "GET" || req.method === "HEAD") &&
    !callbackPaths.has(req.path);

  if (shouldRedirect) {
    res.redirect(308, `${CANONICAL_APP_ORIGIN}${req.originalUrl}`);
    return;
  }

  next();
});

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

const configuredCorsOrigins = (process.env.CORS_ALLOWED_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const allowedCorsOrigins = new Set([
  CANONICAL_APP_ORIGIN,
  "https://www.daytabs.com",
  "https://daytabs.com",
  ...configuredCorsOrigins,
]);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || configuredCorsOrigins.length === 0 || allowedCorsOrigins.has(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  }),
);

// Body parsing middleware - applied to all routes except multipart uploads
app.use((req, res, next) => {
  // Skip body parsing for multipart/form-data requests (file uploads)
  if (req.headers['content-type']?.includes('multipart/form-data')) {
    return next();
  }

  express.json({ limit: "50mb" })(req, res, next);
});

app.use((req, res, next) => {
  // Skip body parsing for multipart/form-data requests (file uploads)
  if (req.headers['content-type']?.includes('multipart/form-data')) {
    return next();
  }

  express.urlencoded({ extended: true, limit: "50mb" })(req, res, next);
});

app.use("/api", router);


const projectRoot = path.resolve('/app');

app.use('/', express.static(path.join(projectRoot, 'artifacts/landing/dist/public')));
app.use('/panel', express.static(path.join(projectRoot, 'artifacts/daytabs/dist/public')));

app.get('/panel/{*path}', (_req, res) => {
  res.sendFile(path.join(projectRoot, 'artifacts/daytabs/dist/public/index.html'));
});

app.get('/{*path}', (_req, res) => {
  res.sendFile(path.join(projectRoot, 'artifacts/landing/dist/public/index.html'));
});

export default app;
