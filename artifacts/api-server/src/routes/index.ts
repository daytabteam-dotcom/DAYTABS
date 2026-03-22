import { Router, type IRouter } from "express";
import healthRouter from "./health";
import analysisRouter from "./analysis/index";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/analysis", analysisRouter);

export default router;
