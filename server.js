const express = require('express');
const path = require('path');
const { chartUrl, parseChartPayload } = require('./docs/quotes');

const app = express();
const PORT = process.env.PORT || 3000;

async function fetchChart(symbol) {
  const response = await fetch(chartUrl(symbol), {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; SpaceXStockPurchase/1.0)',
    },
  });

  if (!response.ok) {
    throw new Error(`Yahoo Finance returned ${response.status} for ${symbol}`);
  }

  const data = await response.json();
  return parseChartPayload(symbol, data);
}

const staticDir = path.join(__dirname, 'docs');

app.use(express.static(staticDir, { index: 'index.html' }));

app.get('/', (_req, res) => {
  res.sendFile(path.join(staticDir, 'index.html'));
});

// Chrome DevTools probes this path automatically; return empty JSON to avoid 404/CSP console noise.
app.get('/.well-known/appspecific/com.chrome.devtools.json', (_req, res) => {
  res.json({});
});

app.get('/api/quotes', async (_req, res) => {
  try {
    const [tesla, spacex] = await Promise.all([
      fetchChart('TSLA'),
      fetchChart('SPCX'),
    ]);

    res.json({ tesla, spacex });
  } catch (error) {
    console.error('Quote fetch failed:', error.message);
    res.status(502).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`SpaceX stock purchase analysis running at http://localhost:${PORT}`);
});