import { Router, type IRouter } from "express";
import healthRouter from "./health";
import analysisRouter from "./analysis/index";
import authRouter from "./auth/index";
import paddleRouter from "./paddle/index";
import scriptPlannerRouter from "./script-planner/index";
import dubbingRouter from "./dubbing/index";
import userRouter from "./user/index";
import uploadRouter from "./upload/index";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/analysis", analysisRouter);
router.use("/upload", uploadRouter);
router.use("/auth", authRouter);
router.use("/paddle", paddleRouter);
router.use("/script-planner", scriptPlannerRouter);
router.use("/dubbing", dubbingRouter);
router.use("/user", userRouter);

export default router;
