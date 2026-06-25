const axios = require('axios');
const { DateTime } = require('luxon');
const { MongoClient } = require('mongodb');

//const damCodes = require('../docker-entrypoint-initdb.d/damCodes.json');
const authSource = process.env.AUTH_SOURCE || 'flow-watch';
const uri = process.env.MONGO_URI ||
  `mongodb://${process.env.MONGO_USERNAME || 'swpauser'}:${process.env.MONGO_PASSWORD || 'changeme'}@${process.env.MONGO_HOST || 'localhost'}:${process.env.MONGO_PORT || 27017}/?authSource=${authSource}`;
const dbName = process.env.MONGO_DB || 'flow-watch';
const damCodesCollection = process.env.DAM_CODES_COLLECTION || 'dam_codes';

let damCodes = [];
// Load damCodes from MongoDB at startup
// Contains location_key(level_id) and district for each dam code
async function loadDamCodesFromDb() {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db(dbName);
    const collection = db.collection(damCodesCollection);
    const codes = await collection.find({}).toArray();
    damCodes = codes.filter(d => (d.level_id || d.tail_level_id) && d.district); // only include if level_id or tail_level_id and district exist
    console.log(`Loaded ${damCodes.length} dam codes from MongoDB`);
  } catch (err) {
    console.error('Failed to load dam codes from MongoDB:', err.message);
    process.exit(1);
  } finally {
    await client.close();
  }
}

function getTimeWindow() {
  const nowUtc = DateTime.utc();
  // USACE data latency varies based on location, so use a ?-hour window
  // to ensure we capture the most recent data point.
  const beginUtc = nowUtc.minus({ days: 2 });
  const begin = beginUtc.toISO({ suppressMilliseconds: false }).replace('+00:00', 'Z');
  const end = nowUtc.toISO({ suppressMilliseconds: false }).replace('+00:00', 'Z');

  return { begin , end };
}

async function getHeadwaterLevel(locationKey, district, begin, end) {
  const url = `https://water.usace.army.mil/cda/reporting/providers/${district}/timeseries`;
  const params = { name: locationKey, begin, end };

  try {
    const response = await axios.get(url, { params });
    const data = response.data;

    if (Array.isArray(data.values)) {
      const formatted = data.values.map(([timestamp, value]) => {
        const localTime = DateTime.fromISO(timestamp, { zone: 'utc' }).setZone('America/Chicago').toFormat('yyyy-MM-dd HH:mm');
        return { timestamp: localTime, value };
      });

      // filter for latest headwater_level
      const latest = formatted.at(-1);
      return {
        headwater_level: latest?.value ?? null,
        timestamp: latest?.timestamp ?? null,
        locationKey,
        district
      };
    } else {
      console.log(`No 'values' found for '${locationKey}' (${district})`);
      return null;
    }
  } catch (error) {
    console.error(`Error retrieving data for '${locationKey}' (${district}): ${error.message}`);
    return null;
  }
}

async function getTailwaterLevel(locationKey, district, begin, end) {
  const url = `https://water.usace.army.mil/cda/reporting/providers/${district}/timeseries`;
  const params = { name: locationKey, begin, end };

  try {
    const response = await axios.get(url, { params });
    const data = response.data;

    if (Array.isArray(data.values)) {
      const formatted = data.values.map(([timestamp, value]) => {
        const localTime = DateTime.fromISO(timestamp, { zone: 'utc' }).setZone('America/Chicago').toFormat('yyyy-MM-dd HH:mm');
        return { timestamp: localTime, value };
      });

      // filter for latest tailwater_level
      const latest = formatted.at(-1);
      return {
        tailwater_level: latest?.value ?? null,
        timestamp: latest?.timestamp ?? null,
        locationKey,
        district
      };
    } else {
      console.log(`No 'values' found for '${locationKey}' (${district})`);
      return null;
    }
  } catch (error) {
    console.error(`Error retrieving data for '${locationKey}' (${district}): ${error.message}`);
    return null;
  }
}

// Run for all dams in damCodes
(async () => {
  await loadDamCodesFromDb();
  const { begin, end } = getTimeWindow();

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);
  const collection = db.collection(damCodesCollection);

  const enrichedDams = [];

  for (const dam of damCodes) {
    const locationKey = dam.level_id;
    const tailLocationKey = dam.tail_level_id;
    const district = dam.district;

    if (!district || (!locationKey && !tailLocationKey)) continue; // skip if missing district or both location keys
    // Fetch headwater and tailwater levels in parallel
    const [headwaterData, tailwaterData] = await Promise.all([
      getHeadwaterLevel(locationKey, district, begin, end),
      tailLocationKey ? getTailwaterLevel(tailLocationKey, district, begin, end) : Promise.resolve(null)
    ]);

    const enriched = {
      ...dam,
      headwater_level: headwaterData?.headwater_level ?? null,
      headwater_level_timestamp: headwaterData?.timestamp ?? null,
      tailwater_level: tailwaterData?.tailwater_level ?? null,
      tailwater_level_timestamp: tailwaterData?.timestamp ?? null
    };

    enrichedDams.push(enriched);

    await collection.updateOne(
      { code: dam.code },
      {
        $set: {
          headwater_level: enriched.headwater_level,
          headwater_level_timestamp: enriched.headwater_level_timestamp,
          tailwater_level: enriched.tailwater_level,
          tailwater_level_timestamp: enriched.tailwater_level_timestamp
        }
      }
    );
  }

  await client.close();

  console.log(`Updated ${enrichedDams.length} dam records with headwater and tailwater levels.`);
})();



