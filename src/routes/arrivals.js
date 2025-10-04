// src/routes/arrivals.js
import { Router } from "express";
import { getArrivalBoard } from "../services/arrivals.js";

const router = Router();

// Optional: quick sanity endpoint
router.get("/", (req, res) => {
  res.json({
    usage: "GET /v1/arrivals/:groupId/:stopId  e.g. /v1/arrivals/1234567/608S",
  });
});

router.get("/:groupId/:stopId", async (req, res, next) => {
  try {
    const { groupId, stopId } = req.params;
    const apiKey = req.header("x-api-key"); // optional per-request override
    const useCache =
      String(req.query.nocache || "false").toLowerCase() !== "true";
    const data = await getArrivalBoard(groupId, stopId, { apiKey, useCache });
    res.json(data);
  } catch (err) {
    next(err);
  }
});

export default router;
