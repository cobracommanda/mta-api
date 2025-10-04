import { Router } from 'express';
import { loadRoutes } from '../services/mta.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const { list } = await loadRoutes();
    res.json(list);
  } catch (e) { next(e); }
});

export default router;
