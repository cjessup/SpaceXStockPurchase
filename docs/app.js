const $ = (id) => document.getElementById(id);

const setDisabled = (id, disabled) => {
  const el = $(id);
  if (el) el.disabled = disabled;
};

const state = {
  tesla: null,
  spacex: null,
  intervalId: null,
  charts: { tesla: null, spacex: null },
  loading: false,
};

const formatCurrency = (value) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

const formatShares = (value) =>
  new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(value);

const formatTime = (iso) =>
  new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });

function setStatus(message, type = 'idle') {
  $('statusText').textContent = message;
  const dot = $('statusDot');
  dot.className = 'status-dot';
  if (type === 'live') dot.classList.add('live');
  if (type === 'error') dot.classList.add('error');
}

function buildChartConfig(color, fillColor, label) {
  return {
    type: 'line',
    data: {
      datasets: [
        {
          label,
          data: [],
          borderColor: color,
          backgroundColor: fillColor,
          fill: true,
          tension: 0.25,
          pointRadius: 0,
          pointHoverRadius: 4,
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `${label}: ${formatCurrency(ctx.parsed.y)}`,
          },
        },
      },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.06)' },
          ticks: { color: '#8b9bb8', maxTicksLimit: 8 },
        },
        y: {
          grid: { color: 'rgba(255,255,255,0.06)' },
          ticks: {
            color: '#8b9bb8',
            callback: (v) => '$' + v.toFixed(0),
          },
        },
      },
    },
  };
}

function initCharts() {
  if (typeof Chart === 'undefined') {
    throw new Error('Chart.js failed to load. Check your network connection and refresh.');
  }

  state.charts.tesla = new Chart(
    $('teslaChart'),
    buildChartConfig('#e31937', 'rgba(227, 25, 55, 0.12)', 'Tesla')
  );
  state.charts.spacex = new Chart(
    $('spacexChart'),
    buildChartConfig('#4da3ff', 'rgba(77, 163, 255, 0.12)', 'SpaceX')
  );
}

function formatChartTime(ms) {
  return new Date(ms).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function updateChart(chart, history) {
  chart.data.labels = history.map((p) => formatChartTime(p.time));
  chart.data.datasets[0].data = history.map((p) => p.price);
  chart.update('none');
}

function sessionLabel(quote) {
  if (quote.marketState === 'pre') return 'Pre-market';
  if (quote.marketState === 'post') return 'After hours';
  if (quote.marketState === 'closed' && quote.priceSession === 'post') return 'Last after-hours';
  if (quote.marketState === 'closed' && quote.priceSession === 'pre') return 'Last pre-market';
  if (quote.marketState === 'closed') return 'Market closed';
  return '';
}

function statusSession(quote) {
  if (quote?.marketState === 'pre') return 'pre-market';
  if (quote?.marketState === 'post') return 'after hours';
  if (quote?.marketState === 'closed' && (quote.priceSession === 'post' || quote.priceSession === 'pre')) {
    return 'market closed · extended-hours price';
  }
  if (quote?.marketState === 'closed') return 'market closed';
  return 'market open';
}

function extendedSessionNote(quote) {
  const label = sessionLabel(quote);
  if (!label || label === 'Market closed') return '';

  const regular = quote.regularMarketPrice;
  const sameAsPrior =
    Number.isFinite(regular) &&
    Number.isFinite(quote.previousClose) &&
    Math.abs(regular - quote.previousClose) < 0.005;
  if (!Number.isFinite(regular) || regular <= 0 || !Number.isFinite(quote.price) || sameAsPrior) {
    return `${label} · `;
  }

  const delta = quote.price - regular;
  const pct = (delta / regular) * 100;
  const sign = delta >= 0 ? '+' : '';
  return `${label} ${sign}${delta.toFixed(2)} (${sign}${pct.toFixed(2)}%) vs regular close · `;
}

function updateQuoteCard(prefix, quote) {
  const change = quote.price - quote.previousClose;
  const changePct = (change / quote.previousClose) * 100;
  const sign = change >= 0 ? '+' : '';
  const label = sessionLabel(quote);
  const sessionEl = $(`${prefix}Session`);
  const stamp = quote.marketState && quote.marketState !== 'regular'
    ? `Price as of ${formatTime(quote.pricedAt || quote.updatedAt)}`
    : `Updated ${formatTime(quote.updatedAt)}`;

  $(`${prefix}Price`).textContent = formatCurrency(quote.price);
  if (sessionEl) {
    sessionEl.textContent = label;
    sessionEl.hidden = label === '';
  }
  $(`${prefix}Meta`).innerHTML = `
    ${extendedSessionNote(quote)}Range: ${formatCurrency(quote.dayLow)} – ${formatCurrency(quote.dayHigh)} ·
    ${sign}${change.toFixed(2)} (${sign}${changePct.toFixed(2)}%) vs prior close ·
    ${stamp}
  `;
}

const HOLDINGS_KEY = 'spacex-stock-holdings';

function shareCount(value) {
  const parsed = typeof value === 'number' ? value : parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

function restoreHoldings() {
  let stored = null;
  try {
    stored = JSON.parse(localStorage.getItem(HOLDINGS_KEY) || 'null');
  } catch {
    stored = null;
  }
  if (!stored || typeof stored !== 'object') return;

  const tesla = shareCount(stored.tesla);
  const spacex = shareCount(stored.spacex);
  if (tesla != null) $('teslaShares').value = String(tesla);
  if (spacex != null) $('spacexShares').value = String(spacex);
}

function saveHoldings() {
  const payload = {
    tesla: shareCount($('teslaShares').value) ?? 0,
    spacex: shareCount($('spacexShares').value) ?? 0,
  };
  try {
    localStorage.setItem(HOLDINGS_KEY, JSON.stringify(payload));
  } catch {
    // Storage can be blocked in private browsing. The page still works for this visit.
  }
}

function onHoldingsInput() {
  saveHoldings();
  updateHoldingsSummary();
}

function getOwnedShares() {
  return {
    tesla: parseFloat($('teslaShares').value) || 0,
    spacex: parseFloat($('spacexShares').value) || 0,
  };
}

function getPortfolioValues() {
  const owned = getOwnedShares();
  const teslaPrice = state.tesla?.price ?? 0;
  const spacexPrice = state.spacex?.price ?? 0;

  const teslaValue = owned.tesla * teslaPrice;
  const spacexValue = owned.spacex * spacexPrice;

  return {
    owned,
    teslaPrice,
    spacexPrice,
    teslaValue,
    spacexValue,
    totalValue: teslaValue + spacexValue,
  };
}

function updateHoldingsSummary() {
  if (!state.tesla || !state.spacex) {
    $('teslaHoldingsValue').textContent = 'Value: —';
    $('spacexHoldingsValue').textContent = 'Value: —';
    $('totalHoldingsValue').textContent = '—';
    return;
  }

  const portfolio = getPortfolioValues();

  $('teslaHoldingsValue').textContent =
    `Value: ${formatCurrency(portfolio.teslaValue)}`;
  $('spacexHoldingsValue').textContent =
    `Value: ${formatCurrency(portfolio.spacexValue)}`;
  $('totalHoldingsValue').textContent = formatCurrency(portfolio.totalValue);
}

function renderPortfolioImpact({
  teslaSharesAfter,
  spacexSharesAfter,
  scenarioLabel,
  warning = '',
}) {
  const portfolio = getPortfolioValues();
  const { teslaPrice, spacexPrice, owned, teslaValue, spacexValue, totalValue } =
    portfolio;

  const teslaValueAfter = teslaSharesAfter * teslaPrice;
  const spacexValueAfter = spacexSharesAfter * spacexPrice;
  const totalAfter = teslaValueAfter + spacexValueAfter;

  $('impactGrid').innerHTML = `
    <table class="impact-table">
      <thead>
        <tr>
          <th>Position</th>
          <th>Current shares</th>
          <th>After swap</th>
          <th>Current value</th>
          <th>After swap value</th>
        </tr>
      </thead>
      <tbody>
        <tr class="tesla-row">
          <td>Tesla</td>
          <td>${formatShares(owned.tesla)}</td>
          <td>${formatShares(teslaSharesAfter)}</td>
          <td>${formatCurrency(teslaValue)}</td>
          <td>${formatCurrency(teslaValueAfter)}</td>
        </tr>
        <tr class="spacex-row">
          <td>SpaceX</td>
          <td>${formatShares(owned.spacex)}</td>
          <td>${formatShares(spacexSharesAfter)}</td>
          <td>${formatCurrency(spacexValue)}</td>
          <td>${formatCurrency(spacexValueAfter)}</td>
        </tr>
        <tr class="total-row">
          <td>Total portfolio</td>
          <td>—</td>
          <td>—</td>
          <td>${formatCurrency(totalValue)}</td>
          <td>${formatCurrency(totalAfter)}</td>
        </tr>
      </tbody>
    </table>
    <p class="impact-note">
      ${scenarioLabel} · Prices as of ${formatTime(state.tesla.updatedAt)}.
      Total value ${Math.abs(totalAfter - totalValue) < 0.01 ? 'unchanged' : 'may differ slightly due to rounding'}.
      ${warning ? `<span class="impact-warning">${warning}</span>` : ''}
    </p>
  `;
  $('impactPanel').hidden = false;
}

function renderQuotes(data) {
  state.tesla = data.tesla;
  state.spacex = data.spacex;

  updateQuoteCard('tesla', data.tesla);
  updateQuoteCard('spacex', data.spacex);
  updateChart(state.charts.tesla, data.tesla.history);
  updateChart(state.charts.spacex, data.spacex.history);
  updateHoldingsSummary();
}

const isLocalServer =
  location.protocol !== 'file:' &&
  (location.hostname === 'localhost' || location.hostname === '127.0.0.1');

async function readQuotePayload(response) {
  const data = await response.json();
  if (data && typeof data.contents === 'string' && data.contents.trim()) {
    return JSON.parse(data.contents);
  }
  return data;
}

async function fetchChart(symbol) {
  if (typeof QuoteFeed === 'undefined') {
    throw new Error('Quote parser failed to load. Refresh the page.');
  }

  const yahooUrl = QuoteFeed.chartUrl(symbol);
  // GitHub Pages has no /api/quotes proxy. Yahoo blocks browser CORS, so try
  // direct first, then a public proxy that returns the chart JSON.
  const sources = [
    yahooUrl,
    `https://corsproxy.io/?${encodeURIComponent(yahooUrl)}`,
    `https://api.allorigins.win/get?url=${encodeURIComponent(yahooUrl)}`,
  ];

  let lastError = null;

  for (const url of sources) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
      if (!response.ok) {
        throw new Error(`Yahoo Finance returned ${response.status} for ${symbol}`);
      }

      const data = await readQuotePayload(response);
      if (data?.error) {
        throw new Error(data.error);
      }

      return QuoteFeed.parseChartPayload(symbol, data);
    } catch (error) {
      lastError = error;
    }
  }

  if (location.protocol === 'file:') {
    throw new Error(
      'Cannot load prices from a local file. Run "npm start" and open http://localhost:3000'
    );
  }

  throw lastError || new Error(`Failed to load prices for ${symbol}`);
}

async function loadQuotes() {
  if (isLocalServer) {
    try {
      const response = await fetch('/api/quotes');
      if (response.ok) {
        return response.json();
      }
    } catch {
      // Fall back to direct/proxy fetch below.
    }
  }

  const [tesla, spacex] = await Promise.all([
    fetchChart('TSLA'),
    fetchChart('SPCX'),
  ]);
  return { tesla, spacex };
}

async function fetchQuotes({ showLoading = true } = {}) {
  if (state.loading) return null;

  state.loading = true;
  if (showLoading) setStatus('Fetching latest prices…', 'idle');

  setDisabled('refreshBtn', true);
  setDisabled('calculateBtn', true);
  setDisabled('calculateSellBtn', true);

  try {
    const data = await loadQuotes();
    renderQuotes(data);

    const interval = parseInt($('interval').value, 10) || 30;
    setStatus(
      `Live · ${statusSession(data.tesla)} · last updated ${formatTime(data.tesla.updatedAt)} · auto-refresh every ${interval}s`,
      'live'
    );

    return data;
  } catch (error) {
    setStatus(`Error: ${error.message}`, 'error');
    return null;
  } finally {
    state.loading = false;
    setDisabled('refreshBtn', false);
    setDisabled('calculateBtn', false);
    setDisabled('calculateSellBtn', false);
  }
}

function getIntervalSeconds() {
  const value = parseInt($('interval').value, 10);
  return Number.isFinite(value) && value >= 5 ? value : 30;
}

function restartAutoRefresh() {
  if (state.intervalId) {
    clearInterval(state.intervalId);
    state.intervalId = null;
  }

  const seconds = getIntervalSeconds();
  state.intervalId = setInterval(() => {
    fetchQuotes({ showLoading: false });
  }, seconds * 1000);
}

function calculateBuySwap() {
  const spacexToBuy = parseFloat($('spacexToBuy').value);

  if (!Number.isFinite(spacexToBuy) || spacexToBuy <= 0) {
    $('buyResults').hidden = true;
    alert('Enter a positive number of SpaceX shares to purchase.');
    return;
  }

  if (!state.tesla || !state.spacex) {
    alert('Stock prices are not loaded yet. Please wait or click Refresh.');
    return;
  }

  const { owned } = getPortfolioValues();
  const teslaPrice = state.tesla.price;
  const spacexPrice = state.spacex.price;
  const totalCost = spacexToBuy * spacexPrice;
  const teslaSharesToSell = totalCost / teslaPrice;

  const teslaSharesAfter = owned.tesla - teslaSharesToSell;
  const spacexSharesAfter = owned.spacex + spacexToBuy;
  const insufficient = teslaSharesAfter < 0;

  $('teslaToSell').textContent = formatShares(teslaSharesToSell);
  $('buyResultDetails').innerHTML = `
    <strong>At current prices</strong> (${formatTime(state.tesla.updatedAt)}):<br>
    ${formatShares(spacexToBuy)} SpaceX shares × ${formatCurrency(spacexPrice)} =
    <strong>${formatCurrency(totalCost)}</strong> total purchase cost.<br>
    ${formatCurrency(totalCost)} ÷ ${formatCurrency(teslaPrice)} per Tesla share =
    <strong>${formatShares(teslaSharesToSell)} Tesla shares to sell</strong>.
  `;
  $('buyResults').hidden = false;
  $('sellResults').hidden = true;

  renderPortfolioImpact({
    teslaSharesAfter,
    spacexSharesAfter,
    scenarioLabel: `Buying ${formatShares(spacexToBuy)} additional SpaceX shares`,
    warning: insufficient ? 'Insufficient Tesla holdings for this purchase.' : '',
  });
}

function calculateSellSwap() {
  const teslaSharesToSell = parseFloat($('teslaToSellInput').value);

  if (!Number.isFinite(teslaSharesToSell) || teslaSharesToSell <= 0) {
    $('sellResults').hidden = true;
    alert('Enter a positive number of Tesla shares to sell.');
    return;
  }

  if (!state.tesla || !state.spacex) {
    alert('Stock prices are not loaded yet. Please wait or click Refresh.');
    return;
  }

  const { owned } = getPortfolioValues();
  const teslaPrice = state.tesla.price;
  const spacexPrice = state.spacex.price;
  const proceeds = teslaSharesToSell * teslaPrice;
  const spacexToBuy = proceeds / spacexPrice;

  const teslaSharesAfter = owned.tesla - teslaSharesToSell;
  const spacexSharesAfter = owned.spacex + spacexToBuy;
  const insufficient = teslaSharesAfter < 0;

  $('spacexToBuyResult').textContent = formatShares(spacexToBuy);
  $('sellResultDetails').innerHTML = `
    <strong>At current prices</strong> (${formatTime(state.tesla.updatedAt)}):<br>
    ${formatShares(teslaSharesToSell)} Tesla shares × ${formatCurrency(teslaPrice)} =
    <strong>${formatCurrency(proceeds)}</strong> sale proceeds.<br>
    ${formatCurrency(proceeds)} ÷ ${formatCurrency(spacexPrice)} per SpaceX share =
    <strong>${formatShares(spacexToBuy)} SpaceX shares to buy</strong>.
  `;
  $('sellResults').hidden = false;
  $('buyResults').hidden = true;

  renderPortfolioImpact({
    teslaSharesAfter,
    spacexSharesAfter,
    scenarioLabel: `Selling ${formatShares(teslaSharesToSell)} Tesla shares`,
    warning: insufficient ? 'You do not own enough Tesla shares to sell this amount.' : '',
  });
}

async function handleCalculateBuy() {
  const data = await fetchQuotes({ showLoading: true });
  if (data) {
    calculateBuySwap();
  }
}

async function handleCalculateSell() {
  const data = await fetchQuotes({ showLoading: true });
  if (data) {
    calculateSellSwap();
  }
}

function bindClick(id, handler) {
  const el = $(id);
  if (el) el.addEventListener('click', handler);
}

function bindInput(id, handler) {
  const el = $(id);
  if (el) el.addEventListener('input', handler);
}

function bindKeydown(id, handler) {
  const el = $(id);
  if (el) {
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handler();
    });
  }
}

function bindEvents() {
  bindClick('refreshBtn', () => fetchQuotes({ showLoading: true }));

  const intervalEl = $('interval');
  if (intervalEl) {
    intervalEl.addEventListener('change', () => {
      const seconds = getIntervalSeconds();
      intervalEl.value = String(seconds);
      restartAutoRefresh();
      setStatus(`Auto-refresh interval set to ${seconds}s`, 'live');
    });
  }

  bindClick('calculateBtn', handleCalculateBuy);
  bindClick('calculateSellBtn', handleCalculateSell);
  bindInput('teslaShares', onHoldingsInput);
  bindInput('spacexShares', onHoldingsInput);
  bindKeydown('spacexToBuy', handleCalculateBuy);
  bindKeydown('teslaToSellInput', handleCalculateSell);
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    initCharts();
    restoreHoldings();
    bindEvents();
    updateHoldingsSummary();
    await fetchQuotes({ showLoading: true });
    restartAutoRefresh();
  } catch (error) {
    console.error(error);
    setStatus(`Error: ${error.message}`, 'error');
  }
});