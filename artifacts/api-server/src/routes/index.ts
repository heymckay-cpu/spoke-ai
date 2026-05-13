import { Router, type IRouter } from "express";
import healthRouter from "./health";
import settingsRouter from "./settings";
import scanRouter from "./scan";
import marketRouter from "./market";
import positionsRouter from "./positions";
import notificationsRouter from "./notifications";
import holdingsRouter from "./holdings";
import ivHistoryRouter from "./ivHistory";
import tierRouter from "./tier";
import qaRouter from "./qa";

const router: IRouter = Router();

router.use(healthRouter);
router.use(settingsRouter);
router.use(scanRouter);
router.use(marketRouter);
router.use(positionsRouter);
router.use(notificationsRouter);
router.use(holdingsRouter);
router.use(ivHistoryRouter);
router.use(tierRouter);
router.use(qaRouter);

export default router;
