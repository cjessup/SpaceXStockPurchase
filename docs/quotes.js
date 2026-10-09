// Public Yahoo chart feed. The v7 quote endpoint now returns 401 without a crumb.
// includePrePost adds pre-market and after-hours bars. The headline price is the
// newest of the regular, pre-market, and after-hours prints.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.QuoteFeed = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const YAHOO_CHART_URL = 'https://query1.finance.yahoo.com/v8/finance/chart';

  function chartUrl(symbol) {
    const params = new URLSearchParams({
      interval: '5m',
      range: '1d',
      includePrePost: 'true',
    });
    return `${YAHOO_CHART_URL}/${encodeURIComponent(symbol)}?${params}`;
  }

  function finitePrice(value) {
    return typeof value === 'number' && Number.isFinite(value) && value > 0;
  }

  function sessionContaining(meta, unixSeconds) {
    const periods = meta.currentTradingPeriod || {};
    for (const name of ['pre', 'regular', 'post']) {
      const period = periods[name];
      if (
        period &&
        Number.isFinite(period.start) &&
        Number.isFinite(period.end) &&
        unixSeconds >= period.start &&
        unixSeconds < period.end
      ) {
        return name;
      }
    }
    return null;
  }

  function marketStateAt(meta, nowSeconds) {
    return sessionContaining(meta, nowSeconds) || 'closed';
  }

  function labelBar(meta, unixSeconds) {
    const located = sessionContaining(meta, unixSeconds);
    if (located) return located;
    if (Number.isFinite(meta.regularMarketTime) && unixSeconds > meta.regularMarketTime) {
      return 'post';
    }
    return 'regular';
  }

  function selectLivePrint(meta, history) {
    const candidates = [];
    const add = (session, price, time) => {
      if (!finitePrice(price) || !Number.isFinite(time)) return;
      candidates.push({ session, price, time });
    };

    add('post', meta.postMarketPrice, meta.postMarketTime);
    add('pre', meta.preMarketPrice, meta.preMarketTime);
    add('regular', meta.regularMarketPrice, meta.regularMarketTime);

    if (history.length) {
      const last = history[history.length - 1];
      const time = Math.floor(last.time / 1000);
      add(labelBar(meta, time), last.price, time);
    }

    candidates.sort((a, b) => b.time - a.time);
    return candidates[0] || null;
  }

  function dayRange(history, livePrice, regularHigh, regularLow) {
    const prices = [];
    for (const point of history) {
      if (finitePrice(point.price)) prices.push(point.price);
    }
    if (finitePrice(livePrice)) prices.push(livePrice);
    if (finitePrice(regularHigh)) prices.push(regularHigh);
    if (finitePrice(regularLow)) prices.push(regularLow);
    if (!prices.length) return { dayHigh: null, dayLow: null };
    return { dayHigh: Math.max(...prices), dayLow: Math.min(...prices) };
  }

  function parseChartPayload(symbol, data, nowSeconds = Date.now() / 1000) {
    const result = data?.chart?.result?.[0];
    if (!result) {
      const description = data?.chart?.error?.description;
      throw new Error(description || `No chart data returned for ${symbol}`);
    }

    const meta = result.meta || {};
    const timestamps = result.timestamp || [];
    const closes = result.indicators?.quote?.[0]?.close || [];
    const history = timestamps
      .map((ts, i) => ({
        time: ts * 1000,
        price: closes[i],
      }))
      .filter((point) => finitePrice(point.price));

    const live = selectLivePrint(meta, history);
    if (!live) {
      throw new Error(`No price returned for ${symbol}`);
    }

    const range = dayRange(
      history,
      live.price,
      meta.regularMarketDayHigh,
      meta.regularMarketDayLow
    );

    return {
      symbol,
      name: meta.longName || meta.shortName || symbol,
      price: live.price,
      pricedAt: new Date(live.time * 1000).toISOString(),
      priceSession: live.session,
      marketState: marketStateAt(meta, nowSeconds),
      regularMarketPrice: finitePrice(meta.regularMarketPrice) ? meta.regularMarketPrice : live.price,
      currency: meta.currency || 'USD',
      previousClose: meta.previousClose ?? meta.chartPreviousClose,
      dayHigh: range.dayHigh,
      dayLow: range.dayLow,
      history,
      updatedAt: new Date().toISOString(),
    };
  }

  return { chartUrl, parseChartPayload, selectLivePrint, marketStateAt };
});
