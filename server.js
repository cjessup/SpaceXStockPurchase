const express = require('express');
const path = require('path');
const { loadQuotes } = require('./docs/quotes');

const app = express();
const PORT = process.env.PORT || 3000;

const QUOTE_HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'Mozilla/5.0 (compatible; SpaceXStockPurchase/1.0)',
};

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
    res.json(await loadQuotes({ headers: QUOTE_HEADERS }));
  } catch (error) {
    console.error('Quote fetch failed:', error.message);
    res.status(502).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`SpaceX stock purchase analysis running at http://localhost:${PORT}`);
});