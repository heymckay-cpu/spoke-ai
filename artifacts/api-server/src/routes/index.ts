import { Router, type IRouter } from "express";
import authRouter from "./auth";
import healthRouter from "./health";
import settingsRouter from "./settings";
import scanRouter from "./scan";
import scanExplainRouter from "./scan.explain";
import marketRouter from "./market";
import positionsRouter from "./positions";
import notificationsRouter from "./notifications";
import holdingsRouter from "./holdings";
import ivHistoryRouter from "./ivHistory";
import tierRouter from "./tier";
import qaRouter from "./qa";
import sectorsRouter from "./sectors";
import { requireAuth } from "../middlewares/authMiddleware";

const router: IRouter = Router();

router.use(authRouter);
router.use(healthRouter);
router.use(requireAuth);
router.use(settingsRouter);
router.use(scanRouter);
router.use(scanExplainRouter);
router.use(marketRouter);
router.use(positionsRouter);
router.use(notificationsRouter);
router.use(holdingsRouter);
router.use(ivHistoryRouter);
router.use(tierRouter);
router.use(qaRouter);
router.use(sectorsRouter);

export default router;
