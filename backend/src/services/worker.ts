import { redis } from '../db/redis';
import { SignalModel } from '../db/mongo';
import { pool } from '../db/postgres';

const BATCH_SIZE = 500;

export const startWorker = () => {
  console.log('Worker started');
  processQueue();
};

const processQueue = async () => {
  try {
    // Pop a batch of signals from Redis
    const multi = redis.multi();
    for (let i = 0; i < BATCH_SIZE; i++) {
      multi.lPop('signal_queue');
    }
    const results = await multi.exec();
    
    const signals = results
      .filter((res) => res !== null)
      .map(res => JSON.parse(res as any as string));

    if (signals.length > 0) {
      await processSignals(signals);
    }
  } catch (err) {
    console.error('Worker error', err);
  } finally {
    // Continue processing
    setTimeout(processQueue, 100);
  }
};

const processSignals = async (signals: any[]) => {
  const newWorkItemsToCreate = new Map<string, any>(); // component_id -> signal
  
  // 1. Determine which signals need new work items
  for (const signal of signals) {
    const compId = signal.component_id;
    // Check debouncing in redis
    const existingWorkItemId = await redis.get(`debounce:${compId}`);
    
    if (existingWorkItemId) {
      signal.work_item_id = parseInt(existingWorkItemId);
    } else {
      if (!newWorkItemsToCreate.has(compId)) {
        newWorkItemsToCreate.set(compId, signal);
      } else {
        // Will link to the one we are about to create
        signal.pending_link = true;
      }
    }
  }

  // 2. Create new work items in Postgres
  for (const [compId, signal] of newWorkItemsToCreate.entries()) {
    const severity = compId.includes('RDBMS') ? 'P0' : compId.includes('CACHE') ? 'P2' : 'P1';
    
    const result = await pool.query(
      `INSERT INTO work_items (component_id, severity) VALUES ($1, $2) RETURNING id`,
      [compId, severity]
    );
    const newId = result.rows[0].id;
    signal.work_item_id = newId;
    
    // Set debounce for 10 seconds
    await redis.setEx(`debounce:${compId}`, 10, newId.toString());
    
    // Publish update for UI
    await redis.publish('work_items_updates', JSON.stringify({
      id: newId, component_id: compId, state: 'OPEN', severity
    }));
  }

  // 3. Link pending signals to newly created work items
  for (const signal of signals) {
    if (signal.pending_link) {
      const compId = signal.component_id;
      // Get it from the map we just updated
      const createdSignal = newWorkItemsToCreate.get(compId);
      if (createdSignal && createdSignal.work_item_id) {
        signal.work_item_id = createdSignal.work_item_id;
      }
      delete signal.pending_link;
    }
  }

  // 4. Sink to Data Lake (Mongo)
  if (signals.length > 0) {
    await SignalModel.insertMany(signals);
  }
};
