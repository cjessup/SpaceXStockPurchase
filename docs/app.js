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

function updateQuoteCard(prefix, quote) {
  const change = quote.price - quote.previousClose;
  const changePct = (change / quote.previousClose) * 100;
  const sign = change >= 0 ? '+' : '';

  $(`${prefix}Price`).textContent = formatCurrency(quote.price);
  $(`${prefix}Meta`).innerHTML = `
    Day range: ${formatCurrency(quote.dayLow)} – ${formatCurrency(quote.dayHigh)} ·
    ${sign}${change.toFixed(2)} (${sign}${changePct.toFixed(2)}%) vs prior close ·
    Updated ${formatTime(quote.updatedAt)}
  `;
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

const YAHOO_CHART_URL = 'https://query1.finance.yahoo.com/v8/finance/chart';
const isLocalServer =
  location.protocol !== 'file:' &&
  (location.hostname === 'localhost' || location.hostname === '127.0.0.1');

function parseChartResponse(symbol, data) {
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

async function fetchChart(symbol) {
  const yahooUrl = `${YAHOO_CHART_URL}/${symbol}?interval=5m&range=1d`;
  const sources = [
    yahooUrl,
    `https://corsproxy.io/?${encodeURIComponent(yahooUrl)}`,
  ];

  let lastError = null;

  for (const url of sources) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Yahoo Finance returned ${response.status} for ${symbol}`);
      }

      const data = await response.json();
      if (data?.error) {
        throw new Error(data.error);
      }

      return parseChartResponse(symbol, data);
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
      `Live · last updated ${formatTime(data.tesla.updatedAt)} · auto-refresh every ${interval}s`,
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
  bindInput('teslaShares', updateHoldingsSummary);
  bindInput('spacexShares', updateHoldingsSummary);
  bindKeydown('spacexToBuy', handleCalculateBuy);
  bindKeydown('teslaToSellInput', handleCalculateSell);
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    initCharts();
    bindEvents();
    await fetchQuotes({ showLoading: true });
    restartAutoRefresh();
  } catch (error) {
    console.error(error);
    setStatus(`Error: ${error.message}`, 'error');
  }
});