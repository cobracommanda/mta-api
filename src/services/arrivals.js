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
 * Get a humanized arrival board for a specific stop.
 *
 * Fetches and formats arrivals for the stop; results may be served from an in-memory cache
 * unless `useCache` is set to `false`.
 *
 * @param {string} groupId - Feed group identifier (e.g. "ACE", "BDFM", "G", "JZ", "NQRW", "L", "SI", or numerical id).
 * @param {string} stopId - Stop identifier to return the board row for.
 * @param {{ apiKey?: string|null, useCache?: boolean }} [options] - Optional behavior flags.
 * @param {string|null} [options.apiKey=null] - Optional API key forwarded to the feed fetch.
 * @param {boolean} [options.useCache=true] - When `true`, allow cache reads/writes; when `false`, always fetch fresh data.
 * @returns {{ stopId: string, stopName: string|null, updatedAt: string|null, now?: string, arrivals: Array<Object> }}
 *   An object representing the stop's board row.
 *   - `stopId`: the requested stop identifier.
 *   - `stopName`: human-friendly stop name or `null` if unknown.
 *   - `updatedAt`: ISO timestamp when the board was last built, or `null` if no data exists for the stop.
 *   - `now`: current ISO timestamp (present when the stop row exists).
 *   - `arrivals`: array of arrival items; each item contains at least:
 *       - `whenISO` (string): original ISO timestamp of the arrival/departure.
 *       - `whenLocal` (string|null): localized "HH:MM" representation of `whenISO`.
 *       - `in` (string): human-friendly ETA like "now", "1m", or "3m ago".
 *       - `routeId` (string), `tripId` (string), `scheduleRelationship` (string), and `meta` (object) when available.
 *
 *   If the stop has no data, `arrivals` will be an empty array and `stopName`/`updatedAt` will be `null`.
 */
export async function getArrivalBoard(groupId, stopId, { apiKey = null, useCache = true } = {}) {
  const key = `board:${groupId}`;
  let board = useCache ? getCache(key) : null;

  if (!board) {
    // build fresh from feed and cache
    const feed = await fetchFeed(groupId, { useCache, apiKey });
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
    if (useCache) setCache(key, board);
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