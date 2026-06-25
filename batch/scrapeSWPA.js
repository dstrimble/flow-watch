const axios = require('axios');
const cheerio = require('cheerio');
const { MongoClient } = require('mongodb');

async function scrapeSWPA(dayOverride) {
  // Determine the correct URL based on the current day of the week or override
  const dayMap = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  let dayStr;
  if (dayOverride) {
    // Accepts full or short day names, case-insensitive
    const lower = dayOverride.toLowerCase();
    const idx = dayMap.findIndex(d => d === lower || lower.startsWith(d));
    if (idx !== -1) {
      dayStr = dayMap[idx];
    } else {
      throw new Error('Invalid day override. Use sun, mon, tue, etc.');
    }
  } else {
    const today = new Date();
    dayStr = dayMap[today.getDay()];
  }
  const url = `https://www.energy.gov/swpa/${dayStr}.htm`;
  try {
    const { data: html } = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Node.js scraper)' }
    });

    // Try to find <pre> tags first (most likely for plaintext data)
    const $ = cheerio.load(html);
    let textContent = '';
    $('pre').each((i, elem) => {
      const text = $(elem).text();
      if (text.includes('SOUTHWESTERN POWER ADMINISTRATION  -  GENERATION SCHEDULE')) {
        textContent = text;
      }
    });

    // Fallback: search all text if <pre> not found
    if (!textContent) {
      const bodyText = $('body').text();
      if (bodyText.includes('SOUTHWESTERN POWER ADMINISTRATION  -  GENERATION SCHEDULE')) {
        textContent = bodyText;
      }
    }

    if (!textContent) {
      console.error('Could not find the SWPA Generation Schedule text block.');
      return;
    }

    // Extract only the block starting with the header
    const header = 'SOUTHWESTERN POWER ADMINISTRATION  -  GENERATION SCHEDULE';
    const startIdx = textContent.indexOf(header);
    let block = textContent.substring(startIdx).trim();

    // Split by lines and process all after header
    const lines = block.split('\n').map(line => line.trim()).filter(line => line.length > 0);

    // Normalize whitespace and non-breaking spaces
    const normalizedLines = lines.map(line => line.replace(/\s+/g, ' ').replace(/\u00A0/g, ' ').trim());

    // Accept lines like 'PROJECTED LOADING SCHEDULE FRIDAY AUGUST 22, 2025 ...'
    const dateLine = normalizedLines.find(line => /[A-Z]+ [A-Z]+ \d{1,2}, \d{4}/.test(line));
    if (!dateLine) {
      console.error('Could not find report date line. Lines scanned:', normalizedLines.slice(0, 10));
      return;
    }
    // Extract the actual date substring
    const dateMatch = dateLine.match(/([A-Z]+) ([A-Z]+) (\d{1,2}), (\d{4})/);
    if (!dateMatch) {
      console.error('Could not parse report date line:', dateLine);
      return;
    }
    // dateMatch: [full, weekday, month, day, year]
    const [__, weekday, monthName, dayStr, yearStr] = dateMatch;
    const monthNum = new Date(`${monthName} 1, 2000`).getMonth() + 1;
    const reportDate = `${yearStr}-${String(monthNum).padStart(2, '0')}-${String(dayStr).padStart(2, '0')}`;
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    if (reportDate !== todayStr) {
      console.error(`Report date (${reportDate}) does not match today's date (${todayStr}). Exiting.`);
      process.exit(1);
    }

    // Stop processing at the TOT row (inclusive)
    const totRowIdx = normalizedLines.findIndex(line => line.startsWith('TOT'));
    const dataLines = totRowIdx !== -1 ? normalizedLines.slice(0, totRowIdx) : normalizedLines;

    // Find the header row (column names)
    let headerRowIdx = dataLines.findIndex(
      line => line.match(/^HR\s+/) || line.startsWith('HR')
    );
    if (headerRowIdx === -1) {
      console.error('Could not find column headers.');
      return;
    }
    const headers = dataLines[headerRowIdx].split(/\s+/); // split columns by one or more spaces

    // Get the current date in mm/dd/yyyy format
    const now = new Date();
    const dateStr = `${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}/${now.getFullYear()}`;

    // Extract values for each hour row (rows where first col is 1-24)
    const hourlyData = [];
    for (let i = headerRowIdx + 1; i < dataLines.length; ++i) {
      const cols = dataLines[i].split(/\s+/); // split columns by one or more spaces
      if (/^\d{1,2}$/.test(cols[0])) { // hour rows
        const rowObj = { hour: parseInt(cols[0], 10), date: dateStr };
        headers.forEach((h, idx) => {
          rowObj[h] = cols[idx] || '';
        });
        hourlyData.push(rowObj);
      }
    }

    // MongoDB connection and insert
    console.log(`process.env.MONGO_HOST: ${process.env.MONGO_HOST}`);
    console.log(`process.env.MONGO_PORT: ${process.env.MONGO_PORT}`);
    const authSource = process.env.AUTH_SOURCE || 'flow-watch';
    const uri = process.env.MONGO_URI ||
      `mongodb://${process.env.MONGO_USERNAME || 'swpauser'}:${process.env.MONGO_PASSWORD || 'changeme'}@${process.env.MONGO_HOST || 'localhost'}:${process.env.MONGO_PORT || 27017}/?authSource=${authSource}`;
    const dbName = process.env.MONGO_DB || 'flow-watch';
    const collectionName = process.env.MONGO_COLLECTION || 'swpa_schedule';
    // Log MongoDB username and password length
    const mongoUser = process.env.MONGO_USERNAME || 'swpauser';
    const mongoPass = process.env.MONGO_PASSWORD || 'changeme';
    const client = new MongoClient(uri);
    try {
      await client.connect();
      const db = client.db(dbName);
      const collection = db.collection(collectionName);
      if (hourlyData.length > 0) {
        await collection.insertMany(hourlyData);
        console.log(`Inserted ${hourlyData.length} documents into ${collectionName}`);
      } else {
        console.log('No data to insert.');
      }
    } catch (err) {
      console.error('MongoDB error:', err.message);
    } finally {
      await client.close();
    }
  } catch (err) {
    console.error('Error fetching or parsing:', err.message);
  }
}

// Accept command line arg for day override
const argDay = process.argv[2];
scrapeSWPA(argDay);