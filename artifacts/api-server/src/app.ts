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
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

app.use("/api", router);

// In production, serve the built frontend apps from the API server
if (process.env.NODE_ENV === "production") {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));

  // Serve landing page at /
  app.use('/', express.static(path.join(__dirname, '../../../artifacts/landing/dist')));
  // Serve main app at /panel/
  app.use('/panel', express.static(path.join(__dirname, '../../../artifacts/daytabs/dist')));

  // SPA fallback for panel
  app.get('/panel/*', (req, res) => {
    res.sendFile(path.join(__dirname, '../../../artifacts/daytabs/dist/index.html'));
  });
  // SPA fallback for landing
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../../../artifacts/landing/dist/index.html'));
  });
}

export default app;
