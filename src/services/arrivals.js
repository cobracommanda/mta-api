// src/services/arrivals.js
import { fetchFeed, loadStops } from "./mta.js";

const BOARD_TTL_MS = Number(process.env.BOARD_TTL_MS || 20 * 60 * 1000); // 20 minutes
const cache = new Map(); // key -> { data, expiresAt }

function setCache(key, data, ttl = BOARD_TTL_MS) {
  cache.set(key, { data, expiresAt: Date.now() + ttl });
}
function getCache(key) {
  const v = cache.get(key);
  if (v && v.expiresAt > Date.now()) return v.data;
  if (v) cache.delete(key);
  return null;
}

function toLocalHHMM(iso, tz = "America/New_York") {
  try {
    return new Date(iso).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: tz,
    });
  } catch {
    return null;
  }
}
function humanEta(iso) {
  if (!iso) return "—";
  const sec = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  if (sec < -30) return `${Math.abs(Math.round(sec / 60))}m ago`;
  if (sec <= 30) return "now";
  const m = Math.floor(sec / 60);
  return m <= 1 ? "1m" : `${m}m`;
}

function buildArrivalMap(feedEntities) {
  const byStop = new Map(); // stopId -> array of arrivals
  const now = Date.now();
  const cutoff = now + 20 * 60 * 1000; // next 20 minutes

  for (const ent of feedEntities) {
    const { routeId, tripId, stopUpdates = [] } = ent;
    for (const su of stopUpdates) {
      const tISO = su.arrival?.time || su.departure?.time || null;
      if (!tISO) continue;
      const t = new Date(tISO).getTime();
      if (isNaN(t) || t > cutoff) continue; // ignore beyond 20m
      if (t < now - 60 * 1000) continue; // skip 1m past

      const item = {
        stopId: su.stopId,
        stopName: su.stopName || null,
        whenISO: tISO,
        whenLocal: toLocalHHMM(tISO),
        in: humanEta(tISO),
        routeId,
        tripId,
        scheduleRelationship: su.scheduleRelationship ?? null,
        meta: {
          arrivalDelay: su.arrival?.delay ?? null,
          departureDelay: su.departure?.delay ?? null,
        },
      };
      if (!byStop.has(su.stopId)) byStop.set(su.stopId, []);
      byStop.get(su.stopId).push(item);
    }
  }

  // sort each stop’s list by time and cap to a few arrivals
  for (const [stopId, list] of byStop.entries()) {
    list.sort((a, b) => new Date(a.whenISO) - new Date(b.whenISO));
    byStop.set(stopId, list.slice(0, 8));
  }
  return byStop;
}

/**
 * Returns a humanized board for a stop, cached for 20m.
 * groupId: ACE | BDFM | G | JZ | NQRW | L | SI | 1234567
 */
export async function getArrivalBoard(groupId, stopId) {
  const key = `board:${groupId}`;
  let board = getCache(key);

  if (!board) {
    // build fresh from feed and cache
    const feed = await fetchFeed(groupId, { useCache: true });
    const byStop = buildArrivalMap(feed);
    const { dict: stops } = await loadStops();

    // package: one big object { stopId: {stopId, stopName, arrivals[]} }
    board = {};
    for (const [sid, arrivals] of byStop.entries()) {
      board[sid] = {
        stopId: sid,
        stopName: arrivals[0]?.stopName || stops[sid]?.name || sid,
        updatedAt: new Date().toISOString(),
        arrivals,
      };
    }
    setCache(key, board);
  }

  // format the single stop response at request-time (updates “in 3m” labels)
  const row = board[stopId];
  if (!row) return { stopId, stopName: null, updatedAt: null, arrivals: [] };

  return {
    ...row,
    now: new Date().toISOString(),
    arrivals: row.arrivals.map((a) => ({
      ...a,
      in: humanEta(a.whenISO),
      whenLocal: toLocalHHMM(a.whenISO),
    })),
  };
}
