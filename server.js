const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const YAHOO_CHART_URL = 'https://query1.finance.yahoo.com/v8/finance/chart';

async function fetchChart(symbol) {
  const url = `${YAHOO_CHART_URL}/${symbol}?interval=5m&range=1d`;
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; SpaceXStockPurchase/1.0)',
    },
  });

  if (!response.ok) {
    throw new Error(`Yahoo Finance returned ${response.status} for ${symbol}`);
  }

  const data = await response.json();
  const result = data?.chart?.result?.[0];

  if (!result) {
    throw new Error(`No chart data returned for ${symbol}`);
  }

  const meta = result.meta;
  const timestamps = result.timestamp || [];
  const closes = result.indicators?.quote?.[0]?.close || [];

  const history = timestamps
    .map((ts, i) => ({
      time: ts * 1000,
      price: closes[i],
    }))
    .filter((point) => point.price != null);

  return {
    symbol,
    name: meta.longName || meta.shortName || symbol,
    price: meta.regularMarketPrice,
    currency: meta.currency || 'USD',
    previousClose: meta.chartPreviousClose ?? meta.previousClose,
    dayHigh: meta.regularMarketDayHigh,
    dayLow: meta.regularMarketDayLow,
    history,
    updatedAt: new Date().toISOString(),
  };
}

app.use(express.static(path.join(__dirname, 'docs')));

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