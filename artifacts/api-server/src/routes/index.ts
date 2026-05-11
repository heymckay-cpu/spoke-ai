import { Router, type IRouter } from "express";
import healthRouter from "./health";
import settingsRouter from "./settings";
import scanRouter from "./scan";
import marketRouter from "./market";
import positionsRouter from "./positions";
import notificationsRouter from "./notifications";

const router: IRouter = Router();

router.use(healthRouter);
router.use(settingsRouter);
router.use(scanRouter);
router.use(marketRouter);
router.use(positionsRouter);
router.use(notificationsRouter);

export default router;
