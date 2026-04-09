import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import { fileURLToPath } from "url";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

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
app.use(cors());

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
