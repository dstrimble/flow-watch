const express = require('express');
const cors = require('cors');
const { MongoClient } = require('mongodb');

const app = express();
app.use(cors({
  origin: process.env.CORS_URL || 'http://localhost:8080',
  credentials: true
}));

const port = process.env.PORT || 3000;

const contextPath = process.env.contextPath || "/schedule";

// Health, readiness, and startup probes
app.get('/healthz', (req, res) => res.send('ok'));
app.get('/readyz', (req, res) => res.send('ok'));
app.get('/startupz', (req, res) => res.send('ok'));

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
    await client.connect();
    const db = client.db(dbName);
    const collection = db.collection(damCodesCollection);
    const damCodes = await collection.find({}).toArray();
    damCodesData = damCodes;
    validDamCodes = damCodes.map(d => d.code);
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
    await client.connect();
    const db = client.db(dbName);
    const collection = db.collection(collectionName);
    // Convert to MM/DD/YYYY
    const dateStr = `${String(dateObj.getMonth() + 1).padStart(2, '0')}/${String(dateObj.getDate()).padStart(2, '0')}/${dateObj.getFullYear()}`;
    // Query for the specified date checking damCode
    let result;
    if (damCode === 'ALL') {
      result = await collection.find({ date: dateStr }).toArray();
    } else {
      result = await collection.find(
        { date: dateStr, [damCode]: { $exists: true } },
        { projection: { hour: 1, date: 1, [damCode]: 1, _id: 0 } }
      ).toArray();
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
    await client.connect();
    const db = client.db(dbName);
    const collection = db.collection(damCodesCollection);
    const damCodes = await collection.find({}).toArray();
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
    await client.connect();
    const db = client.db(dbName);
    const collection = db.collection(collectionName);
    // Get current hour in 24h format
    const now = new Date();
    const currentHour = now.getHours();
    const dateStr = `${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}/${now.getFullYear()}`;
    // Find the schedule row for the current hour and date
    const row = await collection.findOne({ date: dateStr, hour: currentHour });
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
