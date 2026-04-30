const axios = require('axios');

const API_URL = 'http://localhost:8080/api/signals';

const sendSignals = async (componentId, count, basePayload) => {
  console.log(`Sending ${count} signals for ${componentId}...`);
  const promises = [];
  
  for (let i = 0; i < count; i++) {
    const payload = {
      ...basePayload,
      error_code: Math.floor(Math.random() * 1000),
      timestamp: Date.now()
    };
    
    promises.push(
      axios.post(API_URL, {
        component_id: componentId,
        payload
      }).catch(err => console.error('Failed to send:', err.message))
    );
  }
  
  await Promise.all(promises);
  console.log(`Finished sending for ${componentId}`);
};

const simulateOutage = async () => {
  console.log('Simulating stack-wide failure event...');
  
  // RDBMS Outage (P0) - Burst of 200 signals
  await sendSignals('RDBMS_CLUSTER_US_EAST', 200, {
    message: 'Connection timeout',
    layer: 'Database',
    latency_ms: 5000
  });

  // Wait 2 seconds
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Followed by Cache Failure (P2) - Burst of 500 signals
  await sendSignals('CACHE_CLUSTER_01', 500, {
    message: 'Redis OOM Error',
    layer: 'Cache',
    memory_usage: '100%'
  });

  // Wait 2 seconds
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Followed by API Gateway Spikes (P1) - 100 signals
  await sendSignals('API_GATEWAY_MAIN', 100, {
    message: '502 Bad Gateway',
    layer: 'Network',
    upstream_status: 500
  });

  console.log('Outage simulation complete.');
};

simulateOutage();
