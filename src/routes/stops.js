import { Router } from 'express';
import { loadStops } from '../services/mta.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const { dict } = await loadStops();
    const query = (req.query.query || '').toString().toLowerCase().trim();
    const route = (req.query.route || '').toString().trim().toUpperCase();

    let items = Object.values(dict);
    if (query) {
      items = items.filter(s => s.name.toLowerCase().includes(query) || s.id.toLowerCase().includes(query));
    }
    if (route) {
      items = items.filter(s => (s.routes || '').toUpperCase().includes(route));
    }
    res.json(items.slice(0, 2000)); // cap to keep responses reasonable
  } catch (e) { next(e); }
});

router.get('/:stopId', async (req, res, next) => {
  try {
    const { dict } = await loadStops();
    const s = dict[req.params.stopId];
    if (!s) return res.status(404).json({ error: 'Stop not found' });
    res.json(s);
  } catch (e) { next(e); }
});

export default router;
