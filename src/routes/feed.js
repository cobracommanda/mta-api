import { Router } from 'express';
import { fetchFeed, listGroups } from '../services/mta.js';

const router = Router();

router.get('/', (req, res) => {
  res.json({ groups: listGroups() });
});

router.get('/:groupId', async (req, res, next) => {
  try {
    const includeRaw = String(req.query.raw || 'false').toLowerCase() === 'true';
    const data = await fetchFeed(req.params.groupId, { useCache: String(req.query.nocache||'false').toLowerCase() !== 'true' });
    res.json(data);
  } catch (e) { next(e); }
});

export default router;
