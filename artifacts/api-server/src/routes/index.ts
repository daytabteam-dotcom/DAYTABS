import { Router, type IRouter } from "express";
import healthRouter from "./health";
import analysisRouter from "./analysis/index";
import authRouter from "./auth/index";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/analysis", analysisRouter);
router.use("/auth", authRouter);

export default router;
