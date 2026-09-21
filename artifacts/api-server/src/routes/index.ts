import { Router, type IRouter } from "express";
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
import quiverRouter from "./quiver";
import journalRouter from "./journal";
import digestsRouter from "./digests";
import { requireUser } from "../middlewares/auth";

const router: IRouter = Router();

router.use(healthRouter);
// Machine-to-machine digest trigger (shared-secret auth, not Clerk) — must
// stay above requireUser.
router.use(digestsRouter);

// All routes below require an authenticated Clerk user.
// Public webhook endpoints (none today) would be added before this line.
router.use(requireUser);

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
router.use(quiverRouter);
router.use(journalRouter);

export default router;
