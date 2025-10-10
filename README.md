# MTA Express API (built from your old MTA logic)

A tiny Express server that exposes NYC Subway GTFS-realtime data + static stops/routes from your original study files.

## Endpoints

- `GET /health` – quick check
- `GET /v1/routes` – list routes from `data/routes.txt`
- `GET /v1/routes/:routeId/stops` – stops serving a specific route (alphabetically sorted)
- `GET /v1/stops?query=Times%20Sq&route=N` – search stops by name/ID; optionally filter by a route letter
- `GET /v1/stops/:stopId` – single stop by ID (e.g., `R16N`)
- `GET /v1/feed` – list available feed *groups* (`ACE`, `BDFM`, `G`, `JZ`, `NQRW`, `L`, `SI`, `1234567`)
- `GET /v1/feed/:groupId` – parsed trip updates for a group (e.g., `NQRW`)

Example:
```
curl -H "x-api-key: $MTA_API_KEY" "http://localhost:3000/v1/feed/NQRW"
```

### `GET /v1/routes/:routeId/stops`

Returns the list of stops whose `routes` field contains the requested `routeId`. The results are sorted alphabetically by stop name (and by stop ID as a tiebreaker). A typical response looks like:

```json
[
  {
    "id": "R16N",
    "name": "Times Sq-42 St",
    "lat": 40.75529,
    "lon": -73.987495,
    "routes": "N Q R W",
    "parent": "R16"
  }
]
```

If no stops match the provided `routeId`, an empty array is returned. Requesting the endpoint without a `routeId` yields a `400` error response.

> NOTE: The static stop file bundled with this project does not enumerate per-stop route memberships. The server currently infers them for the Broadway/Queensbridge/Brighton trunks (covering the `N`, `Q`, `R`, and `W` services) by inspecting GTFS stop identifiers. Other routes will return an empty list until richer source data is provided.

> NOTE: If you set `MTA_API_KEY` in `.env`, you don't need to pass the header; the server will include it automatically.

## Setup

```bash
npm i
cp .env.example .env
# put your real MTA key into .env
npm run start
# or for hot reload (Node 22+)
npm run dev
```

Open: http://localhost:3000/health

## Config

- `MTA_API_KEY` – your MTA GTFS-Realtime key (https://api.mta.info/)
- `PORT` – default 3000
- `CACHE_TTL_MS` – default 15000ms; per-feed in-memory cache

## About the data

- `data/gtfs-realtime.proto` – schema used by protobufjs
- `data/routes.txt`, `data/stops.txt` – from your original repo; parsed via `csv-parse`
- The feed parser returns a simplified JSON for each `tripUpdate` with stop names resolved from your stop dictionary.

## Extending

- Add `GET /v1/trip/:tripId` by filtering the `fetchFeed()` result
- Add `GET /v1/arrivals/:stopId` by reversing the mapping (`stopId` -> next arrivals)
- Persist cache in Redis if you deploy to multiple instances
```

# mta-api
