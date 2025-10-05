import fs from 'fs/promises';
import path from 'path';
import { parse as csvParse } from 'csv-parse/sync';
import axios from 'axios';
import protobuf from 'protobufjs';

const DATA_DIR = path.join(process.cwd(), 'data');
const PROTO_PATH = path.join(DATA_DIR, 'gtfs-realtime.proto');
const ROUTES_CSV = path.join(DATA_DIR, 'routes.txt');
const STOPS_CSV = path.join(DATA_DIR, 'stops.txt');

// In-memory caches
const cache = new Map(); // key -> { data, expiresAt }
const defaultTtl = Number(process.env.CACHE_TTL_MS || 15000);

function setCache(key, data, ttl = defaultTtl) {
  cache.set(key, { data, expiresAt: Date.now() + ttl });
}
function getCache(key) {
  const v = cache.get(key);
  if (v && v.expiresAt > Date.now()) return v.data;
  if (v) cache.delete(key);
  return null;
}

export async function loadRoutes() {
  const text = await fs.readFile(ROUTES_CSV, 'utf8');
  const rows = csvParse(text, { columns: true, skip_empty_lines: true, trim: true });
  const list = rows.map(r => ({
    route_id: r.route_id,
    short_name: r.route_short_name,
    long_name: r.route_long_name,
    desc: r.route_desc || null,
    type: r.route_type,
    color: r.route_color || null,
    text_color: r.route_text_color || null,
  }));
  const dict = Object.fromEntries(list.map(r => [r.route_id, r]));
  return { list, dict };
}

export async function loadStops() {
  const text = await fs.readFile(STOPS_CSV, 'utf8');
  const rows = csvParse(text, { columns: true, skip_empty_lines: true, trim: true });
  const dict = {};
  const parentNames = {};
  const parentOf = {};

  for (const r of rows) {
    dict[r.stop_id] = {
      id: r.stop_id,
      name: r.stop_name,
      lat: Number(r.stop_lat),
      lon: Number(r.stop_lon),
      routes: r.routes || null,
      parent: r.parent_station || null,
    };
    if (r.parent_station && !parentNames[r.parent_station]) {
      parentNames[r.parent_station] = r.stop_name;
    }
    if (r.parent_station) parentOf[r.stop_id] = r.parent_station;
  }
  return { dict, parentNames, parentOf };
}

const GROUPS = [
  { id: 'ACE', url: 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-ace' },
  { id: 'BDFM', url: 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-bdfm' },
  { id: 'G', url: 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-g' },
  { id: 'JZ', url: 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-jz' },
  { id: 'NQRW', url: 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-nqrw' },
  { id: 'L', url: 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-l' },
  { id: 'SI', url: 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-si' },
  { id: '1234567', url: 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs' },
];

export function listGroups() {
  return GROUPS.map(g => g.id);
}

function getGroupUrl(id) {
  const g = GROUPS.find(x => x.id.toLowerCase() === id.toLowerCase());
  return g?.url || null;
}

/**
 * Convert a Unix timestamp (seconds) to an ISO 8601 string.
 * @param {number} ts - Unix timestamp in seconds.
 * @returns {string|null} The ISO 8601 representation of the timestamp, or `null` if `ts` is falsy or cannot be converted.
 */
function formatTimestamp(ts) {
  if (!ts) return null;
  try { return new Date(ts * 1000).toISOString(); } catch { return null; }
}

/**
 * Fetches and decodes the GTFS-Realtime feed for the specified group and returns a simplified list of trip updates.
 *
 * @param {string} groupId - The feed group identifier (e.g., "ACE", "BDFM", "G").
 * @param {Object} [options] - Optional settings.
 * @param {boolean} [options.useCache=true] - If true, attempt to read from and write to the in-memory cache.
 * @param {string|null} [options.apiKey=null] - Optional API key to use for the request; if omitted the MTA_API_KEY environment value is used.
 * @returns {Array<Object>} An array of trip-update objects. Each object contains:
 *   - id: feed entity id or `null`.
 *   - routeId: route identifier or `null`.
 *   - tripId: trip identifier or `null`.
 *   - startDate: trip start date (YYYYMMDD) or `null`.
 *   - vehicleId: vehicle identifier or `null`.
 *   - stopUpdates: array of stop-update objects, each with:
 *       - stopId: stop identifier or `null`.
 *       - stopName: stop name if available, otherwise `null`.
 *       - arrival: { time: ISO string or `null`, delay: number or `null` }.
 *       - departure: { time: ISO string or `null`, delay: number or `null` }.
 *       - scheduleRelationship: relationship value or `null`.
 *   - timestamp: feed header timestamp as ISO string or `null`.
 * @throws {Error} If the provided groupId does not correspond to a known feed group.
 */
export async function fetchFeed(groupId, { useCache = true, apiKey: overrideApiKey = null } = {}) {
  const url = getGroupUrl(groupId);
  if (!url) throw new Error(`Unknown feed group: ${groupId}`);

  const cacheKey = `feed:${groupId}`;
  if (useCache) {
    const c = getCache(cacheKey);
    if (c) return c;
  }

  const apiKey = overrideApiKey || process.env.MTA_API_KEY;
  const resp = await axios.get(url, {
    responseType: 'arraybuffer',
    headers: apiKey ? { 'x-api-key': apiKey } : undefined,
    timeout: 15000,
  });

  const root = await protobuf.load(PROTO_PATH);
  const FeedMessage = root.lookupType('transit_realtime.FeedMessage');
  const message = FeedMessage.decode(new Uint8Array(resp.data));

  // Simplify entities
  const { dict: stopDict } = await loadStops();

  const result = [];
  for (const ent of message.entity || []) {
    if (!ent.tripUpdate) continue;
    const tu = ent.tripUpdate;
    const routeId = tu.trip?.routeId || null;
    const tripId = tu.trip?.tripId || null;
    const startDate = tu.trip?.startDate || null;
    const vehicleId = ent.vehicle?.vehicle?.id || null;
    const stopUpdates = [];

    for (const stu of tu.stopTimeUpdate || []) {
      const sId = stu.stopId || null;
      stopUpdates.push({
        stopId: sId,
        stopName: sId && stopDict[sId]?.name || null,
        arrival: {
          time: formatTimestamp(stu.arrival?.time),
          delay: stu.arrival?.delay ?? null,
        },
        departure: {
          time: formatTimestamp(stu.departure?.time),
          delay: stu.departure?.delay ?? null,
        },
        scheduleRelationship: stu.scheduleRelationship || null,
      });
    }

    result.push({
      id: ent.id || null,
      routeId,
      tripId,
      startDate,
      vehicleId,
      stopUpdates,
      timestamp: message.header?.timestamp ? formatTimestamp(message.header.timestamp) : null,
    });
  }

  if (useCache) setCache(cacheKey, result);
  return result;
}