import { Router } from 'express';
import { loadRoutes, loadStops } from '../services/mta.js';
import { filterStopsByRoute } from '../utils/routeMatching.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const { list } = await loadRoutes();
    res.json(list);
  } catch (e) { next(e); }
});

async function respondWithRouteStops(routeIdRaw, res, next) {
  try {
    const trimmed = (routeIdRaw || '').toString().trim();
    if (!trimmed) {
      return res.status(400).json({ error: 'Route ID is required' });
    }

    const routeId = trimmed.toUpperCase();
    const { dict } = await loadStops();

    const stops = filterStopsByRoute(Object.values(dict), routeId);

    stops.sort((a, b) => {
      const nameCompare = (a.name || '').localeCompare(b.name || '', 'en', { sensitivity: 'base' });
      if (nameCompare !== 0) return nameCompare;
      return (a.id || '').localeCompare(b.id || '', 'en', { sensitivity: 'base' });
    });

    res.json(stops);
  } catch (e) { next(e); }
}

router.get('/:routeId/stops', async (req, res, next) => {
  await respondWithRouteStops(req.params.routeId, res, next);
});

router.get('/:placeholder/stops/:routeId', async (req, res, next) => {
  if (req.params.placeholder !== ':routeId') return next();
  await respondWithRouteStops(req.params.routeId, res, next);
});

export default router;
