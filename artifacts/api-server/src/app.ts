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

const projectRoot = path.resolve('/app');

app.use('/', express.static(path.join(projectRoot, 'artifacts/landing/dist')));
app.use('/panel', express.static(path.join(projectRoot, 'artifacts/daytabs/dist')));

app.get('/panel/{*path}', (_req, res) => {
  res.sendFile(path.join(projectRoot, 'artifacts/daytabs/dist/index.html'));
});

app.get('/{*path}', (_req, res) => {
  res.sendFile(path.join(projectRoot, 'artifacts/landing/dist/index.html'));
});

export default app;
