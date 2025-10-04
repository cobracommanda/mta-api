import { Router } from "express";
import routesRouter from "./routes.js";
import stopsRouter from "./stops.js";
import feedRouter from "./feed.js";
import arrivalsRouter from "./arrivals.js"; // ← MUST be this exact path/name

const router = Router();

router.use("/routes", routesRouter);
router.use("/stops", stopsRouter);
router.use("/feed", feedRouter);
router.use("/arrivals", arrivalsRouter); // ← This creates /v1/arrivals/...

export default router;
