import { Router } from 'express';
import { loadRoutes, loadStops } from '../services/mta.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const { list } = await loadRoutes();
    res.json(list);
  } catch (e) { next(e); }
});

router.get('/:routeId/stops', async (req, res, next) => {
  try {
    const routeIdRaw = (req.params.routeId || '').toString().trim();
    if (!routeIdRaw) {
      return res.status(400).json({ error: 'Route ID is required' });
    }

    const routeId = routeIdRaw.toUpperCase();
    const { dict } = await loadStops();

    const stops = Object.values(dict).filter(stop => {
      const routes = (stop.routes || '').toString().toUpperCase();
      if (!routes) return false;
      const tokens = routes.split(/[^A-Z0-9]+/).filter(Boolean);
      return tokens.includes(routeId) || routes.includes(routeId);
    });

    stops.sort((a, b) => {
      const nameCompare = (a.name || '').localeCompare(b.name || '', 'en', { sensitivity: 'base' });
      if (nameCompare !== 0) return nameCompare;
      return (a.id || '').localeCompare(b.id || '', 'en', { sensitivity: 'base' });
    });

    res.json(stops);
  } catch (e) { next(e); }
});

export default router;
