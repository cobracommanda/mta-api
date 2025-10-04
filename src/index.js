import 'dotenv/config';
import express from 'express';
import morgan from 'morgan';
import routes from './routes/index.js';

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'mta-express-api', time: new Date().toISOString() });
});

app.use('/v1', routes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal Server Error' });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`MTA API server listening on http://localhost:${port}`);
});
