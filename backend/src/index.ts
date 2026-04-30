import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { initDb, pool } from './db/postgres';
import { initRedis, redis } from './db/redis';
import { initMongo, SignalModel } from './db/mongo';
import { startWorker } from './services/worker';

const app = express();
app.use(cors());
app.use(express.json());

// Metrics
let signalsIngested = 0;
setInterval(() => {
  console.log(`[Metrics] Throughput: ${signalsIngested / 5} signals/sec`);
  signalsIngested = 0;
}, 5000);

// Observability
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK' });
});

// Rate limiting on ingestion API to prevent cascading failures
const ingestionLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 600000, // 10k per second max
  message: 'Too many signals created from this IP, please try again after a minute'
});

// Ingestion API
app.post('/api/signals', ingestionLimiter, async (req, res) => {
  const { component_id, payload } = req.body;
  if (!component_id) {
    return res.status(400).json({ error: 'component_id is required' });
  }

  // Push to queue
  const signal = {
    component_id,
    payload: payload || {},
    timestamp: new Date()
  };
  
  await redis.rPush('signal_queue', JSON.stringify(signal));
  signalsIngested++;
  
  res.status(202).json({ status: 'Accepted' });
});

// API for UI
app.get('/api/incidents', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM work_items ORDER BY start_time DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/incidents/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM work_items WHERE id = $1', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    
    // Get raw signals from Mongo
    const signals = await SignalModel.find({ work_item_id: Number(id) }).sort({ timestamp: -1 }).limit(100);
    
    // Get RCA if exists
    const rcaResult = await pool.query('SELECT * FROM rca_records WHERE work_item_id = $1', [id]);
    
    res.json({
      incident: result.rows[0],
      signals,
      rca: rcaResult.rows[0] || null
    });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.put('/api/incidents/:id/rca', async (req, res) => {
  const { id } = req.params;
  const { root_cause_category, fix_applied, prevention_steps, state } = req.body;
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Ensure state transition is valid, especially to CLOSED
    if (state === 'CLOSED') {
      if (!root_cause_category || !fix_applied || !prevention_steps) {
        throw new Error('Mandatory RCA: Missing fields for RCA');
      }
    }
    
    if (root_cause_category && fix_applied && prevention_steps) {
      await client.query(`
        INSERT INTO rca_records (work_item_id, root_cause_category, fix_applied, prevention_steps)
        VALUES ($1, $2, $3, $4)
      `, [id, root_cause_category, fix_applied, prevention_steps]);
    }
    
    if (state) {
      // Calculate MTTR if closing
      if (state === 'CLOSED') {
        await client.query(`
          UPDATE work_items 
          SET state = $1, 
              end_time = CURRENT_TIMESTAMP,
              mttr_seconds = EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - start_time))
          WHERE id = $2
        `, [state, id]);
      } else {
        await client.query('UPDATE work_items SET state = $1 WHERE id = $2', [state, id]);
      }
    }
    
    await client.query('COMMIT');
    res.json({ status: 'Success' });
    
    // Broadcast state update
    redis.publish('work_items_updates', JSON.stringify({
      id: Number(id), state
    }));
  } catch (err: any) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Real-time Feed SSE
app.get('/api/feed', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const subscriber = redis.duplicate();
  subscriber.connect().then(() => {
    subscriber.subscribe('work_items_updates', (message) => {
      res.write(`data: ${message}\n\n`);
    });
  });

  req.on('close', () => {
    subscriber.unsubscribe();
    subscriber.quit();
  });
});

const PORT = process.env.PORT || 8080;
const start = async () => {
  try {
    await initDb();
    await initRedis();
    await initMongo();
    startWorker();
    
    app.listen(PORT, () => {
      console.log(`Backend server running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server', err);
    process.exit(1);
  }
};

start();
