import { Router, type IRouter } from "express";
import healthRouter from "./health";
import analysisRouter from "./analysis/index";
import authRouter from "./auth/index";
import paddleRouter from "./paddle/index";
import scriptPlannerRouter from "./script-planner/index";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/analysis", analysisRouter);
router.use("/auth", authRouter);
router.use("/paddle", paddleRouter);
router.use("/script-planner", scriptPlannerRouter);

export default router;
