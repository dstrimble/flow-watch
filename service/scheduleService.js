const express = require('express');
const cors = require('cors');
const { MongoClient } = require('mongodb');
const client = require('prom-client');

const app = express();
app.use(cors({
  origin: process.env.CORS_URL || 'http://localhost:8080',
  credentials: true
}));

const port = process.env.PORT || 3000;

const contextPath = process.env.contextPath || "/schedule";

const register = new client.Registry();
client.collectDefaultMetrics({ register });

const httpRequestsTotal = new client.Counter({
  name: 'flow_watch_http_requests_total',
  help: 'Total number of HTTP requests handled by schedule-service',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register]
});

const httpInFlightRequests = new client.Gauge({
  name: 'flow_watch_http_in_flight_requests',
  help: 'Current number of in-flight HTTP requests for schedule-service',
  registers: [register]
});

const httpRequestDurationMs = new client.Histogram({
  name: 'flow_watch_http_request_duration_ms',
  help: 'HTTP request duration in milliseconds for schedule-service',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
  registers: [register]
});

const mongoOperationsTotal = new client.Counter({
  name: 'flow_watch_mongo_operations_total',
  help: 'Total number of MongoDB operations performed by schedule-service',
  labelNames: ['operation', 'collection', 'status'],
  registers: [register]
});

const mongoOperationDurationMs = new client.Histogram({
  name: 'flow_watch_mongo_operation_duration_ms',
  help: 'MongoDB operation duration in milliseconds for schedule-service',
  labelNames: ['operation', 'collection', 'status'],
  buckets: [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500],
  registers: [register]
});

const damCodesLoadedGauge = new client.Gauge({
  name: 'flow_watch_dam_codes_loaded',
  help: 'Number of dam codes loaded into the in-memory cache',
  registers: [register]
});

const damCodesLastLoadedTimestampSeconds = new client.Gauge({
  name: 'flow_watch_dam_codes_last_loaded_timestamp_seconds',
  help: 'Unix timestamp of the last successful dam code cache refresh',
  registers: [register]
});

async function observeMongoOperation(operation, collection, work) {
  const startedAt = process.hrtime.bigint();
  let status = 'success';

  try {
    return await work();
  } catch (error) {
    status = 'error';
    throw error;
  } finally {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    const labels = { operation, collection, status };
    mongoOperationsTotal.inc(labels);
    mongoOperationDurationMs.observe(labels, durationMs);
  }
}

app.use((req, res, next) => {
  const startTime = process.hrtime.bigint();

  httpInFlightRequests.inc();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startTime) / 1e6;
    const route = req.route?.path || req.path;
    const labels = {
      method: req.method,
      route,
      status_code: String(res.statusCode)
    };

    httpInFlightRequests.dec();
    httpRequestsTotal.inc(labels);
    httpRequestDurationMs.observe(labels, durationMs);
  });

  next();
});

// Health, readiness, and startup probes
app.get('/healthz', (req, res) => res.send('ok'));
app.get('/readyz', (req, res) => res.send('ok'));
app.get('/startupz', (req, res) => res.send('ok'));
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

const authSource = process.env.AUTH_SOURCE || 'flow-watch';
const uri = process.env.MONGO_URI ||
  `mongodb://${process.env.MONGO_USERNAME || 'swpauser'}:${process.env.MONGO_PASSWORD || 'changeme'}@${process.env.MONGO_HOST || 'localhost'}:${process.env.MONGO_PORT || 27017}/?authSource=${authSource}`;
const dbName = process.env.MONGO_DB || 'flow-watch';
const collectionName = process.env.MONGO_COLLECTION || 'swpa_schedule';
const damCodesCollection = process.env.DAM_CODES_COLLECTION || 'dam_codes';

let damCodesData = [];
let validDamCodes = [];

// Instead, load validDamCodes from MongoDB at startup
async function loadValidDamCodesFromDb() {
  const client = new MongoClient(uri);
  try {
    await observeMongoOperation('connect', damCodesCollection, () => client.connect());
    const db = client.db(dbName);
    const collection = db.collection(damCodesCollection);
    const damCodes = await observeMongoOperation('find_dam_codes_cache', damCodesCollection, () =>
      collection.find({}).toArray()
    );
    damCodesData = damCodes;
    validDamCodes = damCodes.map(d => d.code);
    damCodesLoadedGauge.set(validDamCodes.length);
    damCodesLastLoadedTimestampSeconds.set(Math.floor(Date.now() / 1000));
  } catch (err) {
    console.error('Failed to load dam codes from MongoDB:', err.message);
    process.exit(1);
  } finally {
    await client.close();
  }
}

// Get schedule for a specific date
app.get(`${contextPath}/:damcode/:date`, async (req, res) => {
  const damCode = req.params.damcode.toUpperCase();
  if (!validDamCodes.includes(damCode)) {
    return res.status(400).json({ error: `Invalid dam code: ${damCode}` });
  }
  const rawDate = req.params.date; // expects YYYY-MM-DD from URL
  if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
    return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD.' });
  }
  // Robust calendar date validity check
  const [year, month, day] = rawDate.split('-').map(Number);
  // Use new Date(year, monthIndex, day) to avoid UTC issues
  const dateObj = new Date(year, month - 1, day);
  if (
    isNaN(year) || isNaN(month) || isNaN(day) ||
    dateObj.getFullYear() !== year ||
    dateObj.getMonth() + 1 !== month ||
    dateObj.getDate() !== day
  ) {
    return res.status(400).json({ error: 'Invalid calendar date.' });
  }
  const client = new MongoClient(uri);
  try {
    await observeMongoOperation('connect', collectionName, () => client.connect());
    const db = client.db(dbName);
    const collection = db.collection(collectionName);
    // Convert to MM/DD/YYYY
    const dateStr = `${String(dateObj.getMonth() + 1).padStart(2, '0')}/${String(dateObj.getDate()).padStart(2, '0')}/${dateObj.getFullYear()}`;
    // Query for the specified date checking damCode
    let result;
    if (damCode === 'ALL') {
      result = await observeMongoOperation('find_schedule_all', collectionName, () =>
        collection.find({ date: dateStr }).toArray()
      );
    } else {
      result = await observeMongoOperation('find_schedule_by_dam', collectionName, () =>
        collection.find(
          { date: dateStr, [damCode]: { $exists: true } },
          { projection: { hour: 1, date: 1, [damCode]: 1, _id: 0 } }
        ).toArray()
      );
    }
    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    await client.close();
  }
});

// New endpoint to serve dam codes from MongoDB
app.get(`${contextPath}/damcodes`, async (req, res) => {
  const client = new MongoClient(uri);
  try {
    await observeMongoOperation('connect', damCodesCollection, () => client.connect());
    const db = client.db(dbName);
    const collection = db.collection(damCodesCollection);
    const damCodes = await observeMongoOperation('find_dam_codes_api', damCodesCollection, () =>
      collection.find({}).toArray()
    );
    res.json(damCodes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    await client.close();
  }
});

// New endpoint to get current flow rates for all dams
app.get(`${contextPath}/currentflow`, async (req, res) => {
  const client = new MongoClient(uri);
  try {
    await observeMongoOperation('connect', collectionName, () => client.connect());
    const db = client.db(dbName);
    const collection = db.collection(collectionName);
    // Get current hour in 24h format
    const now = new Date();
    const currentHour = now.getHours();
    const dateStr = `${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}/${now.getFullYear()}`;
    // Find the schedule row for the current hour and date
    const row = await observeMongoOperation('find_current_flow', collectionName, () =>
      collection.findOne({ date: dateStr, hour: currentHour })
    );
    if (!row) return res.json({});
    // Remove non-dam fields
    const flowRates = {};
    Object.keys(row).forEach(key => {
      if (key !== 'hour' && key !== 'date' && key !== '_id') {
        flowRates[key] = row[key];
      }
    });
    res.json(flowRates);
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    await client.close();
  }
});

async function main() {
  try {
    await loadValidDamCodesFromDb();
    app.listen(port, () => {
      console.log(`Schedule service listening on port ${port}`);
    });
  } catch (err) {
    console.error('Failed to initialize server:', err.message);
    process.exit(1);
  }
}

main();
