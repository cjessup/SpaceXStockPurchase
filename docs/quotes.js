// CNBC's public quote and chart feeds send Access-Control-Allow-Origin: *.
// Yahoo's chart feed does not, and the public CORS proxies in front of it
// are no longer reachable, so the page reads prices from CNBC instead.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.QuoteFeed = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const QUOTE_URL =
    'https://quote.cnbc.com/quote-html-webservice/restQuote/symbolType/symbol';
  const CHART_URL = 'https://ts-api.cnbc.com/harmony/app/charts/1D.json';

  function quoteUrl(symbols) {
    const params = new URLSearchParams({
      symbols: symbols.join('|'),
      requestMethod: 'quick',
      exthrs: '1',
      noform: '1',
      partnerId: '2',
      fund: '1',
      output: 'json',
    });
    return `${QUOTE_URL}?${params}`;
  }

  function chartUrl(symbol) {
    return `${CHART_URL}?symbol=${encodeURIComponent(symbol)}`;
  }

  function num(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value !== 'string' || !value.trim()) return null;
    const parsed = Number(value.replace(/[$,]/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }

  function positive(value) {
    const parsed = num(value);
    return parsed != null && parsed > 0 ? parsed : null;
  }

  function etDateKey(ms) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(ms);
  }

  function selectPrint(quote) {
    const regular = positive(quote.last);
    const extended = quote.ExtendedMktQuote;
    const extendedPrice = positive(extended?.last);
    const status = quote.curmktstatus;
    const extendedAt = Date.parse(extended?.last_time);
    const regularAt = Date.parse(quote.last_time);
    const extendedIsNewer =
      Boolean(extendedPrice) &&
      Number.isFinite(extendedAt) &&
      Number.isFinite(regularAt) &&
      extendedAt > regularAt;

    let marketState = 'closed';
    if (status === 'REG_MKT') marketState = 'regular';
    else if (status === 'PRE_MKT') marketState = 'pre';
    else if (status === 'POST_MKT') marketState = 'post';

    const useExtended =
      (marketState === 'pre' || marketState === 'post') && Boolean(extendedPrice)
        ? true
        : marketState !== 'regular' && extendedIsNewer;

    let priceSession = 'regular';
    if (useExtended) {
      if (marketState === 'pre' || marketState === 'post') priceSession = marketState;
      else if (extended?.type === 'PRE_MKT') priceSession = 'pre';
      else priceSession = 'post';
    }

    const pricedMs = useExtended ? extendedAt : regularAt;

    return {
      price: useExtended ? extendedPrice : regular || extendedPrice,
      marketState,
      priceSession,
      regularMarketPrice: regular || (useExtended ? extendedPrice : null),
      pricedAt: Number.isFinite(pricedMs) ? new Date(pricedMs).toISOString() : new Date().toISOString(),
    };
  }

  function previousClose(quote) {
    const direct = positive(quote.previous_day_closing);
    if (direct) return direct;

    const last = positive(quote.last);
    const change = num(quote.change);
    if (last && change != null) {
      const derived = last - change;
      if (derived > 0) return derived;
    }

    return null;
  }

  function sessionHistory(bars) {
    const points = (bars || [])
      .map((bar) => ({
        time: bar.tradeTimeinMills,
        price: positive(bar.close),
      }))
      .filter((point) => point.price && Number.isFinite(point.time))
      .sort((a, b) => a.time - b.time);

    if (!points.length) return [];

    const day = etDateKey(points[points.length - 1].time);
    return points.filter((point) => etDateKey(point.time) === day);
  }

  function parseQuote(quote, chart) {
    const symbol = quote?.symbol;
    if (!symbol) {
      throw new Error('Quote service returned an empty quote');
    }
    if (quote.code != null && Number(quote.code) !== 0) {
      throw new Error(`No quote returned for ${symbol}`);
    }

    const print = selectPrint(quote);
    const price = print.price;
    const priorClose = previousClose(quote);
    if (!price || !priorClose) {
      throw new Error(`No price returned for ${symbol}`);
    }

    const history = sessionHistory(chart?.barData?.priceBars);
    const rangePrices = history.map((point) => point.price);
    const high = positive(quote.high);
    const low = positive(quote.low);
    if (high) rangePrices.push(high);
    if (low) rangePrices.push(low);
    rangePrices.push(price);

    return {
      symbol,
      name: quote.name || quote.shortName || symbol,
      price,
      pricedAt: print.pricedAt,
      priceSession: print.priceSession,
      marketState: print.marketState,
      regularMarketPrice: print.regularMarketPrice || price,
      currency: quote.currencyCode || 'USD',
      previousClose: priorClose,
      dayHigh: Math.max(...rangePrices),
      dayLow: Math.min(...rangePrices),
      history,
      updatedAt: new Date().toISOString(),
    };
  }

  async function fetchJson(url, headers, label) {
    let response;
    try {
      response = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(12000),
      });
    } catch (error) {
      const reason = error?.name === 'TimeoutError' ? 'timed out' : 'failed';
      throw new Error(`${label} request ${reason}`);
    }

    if (!response.ok) {
      throw new Error(`${label} returned ${response.status}`);
    }

    return response.json();
  }

  async function loadQuotes(options = {}) {
    const headers = options.headers || { Accept: 'application/json' };
    const [payload, teslaChart, spacexChart] = await Promise.all([
      fetchJson(quoteUrl(['TSLA', 'SPCX']), headers, 'Quote'),
      fetchJson(chartUrl('TSLA'), headers, 'TSLA chart').catch(() => null),
      fetchJson(chartUrl('SPCX'), headers, 'SPCX chart').catch(() => null),
    ]);

    const quotes = payload?.FormattedQuoteResult?.FormattedQuote || [];
    const bySymbol = new Map(quotes.map((quote) => [quote.symbol, quote]));
    const tesla = bySymbol.get('TSLA');
    const spacex = bySymbol.get('SPCX');

    if (!tesla || !spacex) {
      throw new Error('Quote service did not return TSLA and SPCX');
    }

    return {
      tesla: parseQuote(tesla, teslaChart),
      spacex: parseQuote(spacex, spacexChart),
    };
  }

  return { loadQuotes, parseQuote, quoteUrl, chartUrl };
});
