const $ = (id) => document.getElementById(id);

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
          type: 'time',
          time: {
            unit: 'hour',
            displayFormats: { hour: 'h:mm a' },
          },
          grid: { color: 'rgba(255,255,255,0.06)' },
          ticks: { color: '#8b9bb8', maxTicksLimit: 6 },
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
  state.charts.tesla = new Chart(
    $('teslaChart'),
    buildChartConfig('#e31937', 'rgba(227, 25, 55, 0.12)', 'Tesla')
  );
  state.charts.spacex = new Chart(
    $('spacexChart'),
    buildChartConfig('#4da3ff', 'rgba(77, 163, 255, 0.12)', 'SpaceX')
  );
}

function updateChart(chart, history) {
  chart.data.datasets[0].data = history.map((p) => ({
    x: p.time,
    y: p.price,
  }));
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

function renderQuotes(data) {
  state.tesla = data.tesla;
  state.spacex = data.spacex;

  updateQuoteCard('tesla', data.tesla);
  updateQuoteCard('spacex', data.spacex);
  updateChart(state.charts.tesla, data.tesla.history);
  updateChart(state.charts.spacex, data.spacex.history);
}

const YAHOO_CHART_URL = 'https://query1.finance.yahoo.com/v8/finance/chart';
const useLocalApi =
  location.hostname === 'localhost' || location.hostname === '127.0.0.1';

async function fetchChart(symbol) {
  const url = `${YAHOO_CHART_URL}/${symbol}?interval=5m&range=1d`;
  const response = await fetch(url);

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

async function loadQuotes() {
  if (useLocalApi) {
    const response = await fetch('/api/quotes');
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `Request failed (${response.status})`);
    }
    return response.json();
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

  $('refreshBtn').disabled = true;
  $('calculateBtn').disabled = true;

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
    $('refreshBtn').disabled = false;
    $('calculateBtn').disabled = false;
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

function calculateSwap() {
  const spacexToBuy = parseFloat($('spacexToBuy').value);

  if (!Number.isFinite(spacexToBuy) || spacexToBuy <= 0) {
    $('results').hidden = true;
    alert('Enter a positive number of SpaceX shares to purchase.');
    return;
  }

  if (!state.tesla || !state.spacex) {
    alert('Stock prices are not loaded yet. Please wait or click Refresh.');
    return;
  }

  const teslaPrice = state.tesla.price;
  const spacexPrice = state.spacex.price;
  const totalCost = spacexToBuy * spacexPrice;
  const teslaSharesToSell = totalCost / teslaPrice;

  const teslaOwned = parseFloat($('teslaShares').value) || 0;
  const spacexOwned = parseFloat($('spacexShares').value) || 0;
  const remainingTesla = teslaOwned - teslaSharesToSell;
  const newSpacexTotal = spacexOwned + spacexToBuy;

  $('teslaToSell').textContent = formatShares(teslaSharesToSell);
  $('resultDetails').innerHTML = `
    <strong>At current prices</strong> (${formatTime(state.tesla.updatedAt)}):<br>
    ${formatShares(spacexToBuy)} SpaceX shares × ${formatCurrency(spacexPrice)} =
    <strong>${formatCurrency(totalCost)}</strong> total purchase cost.<br>
    ${formatCurrency(totalCost)} ÷ ${formatCurrency(teslaPrice)} per Tesla share =
    <strong>${formatShares(teslaSharesToSell)} Tesla shares to sell</strong>.<br><br>
    After swap: ${formatShares(newSpacexTotal)} SpaceX shares owned,
    ${formatShares(remainingTesla)} Tesla shares remaining
    ${remainingTesla < 0 ? '<span style="color:#f87171"> (insufficient Tesla holdings)</span>' : ''}.
  `;
  $('results').hidden = false;
}

async function handleCalculate() {
  const data = await fetchQuotes({ showLoading: true });
  if (data) {
    calculateSwap();
  }
}

function bindEvents() {
  $('refreshBtn').addEventListener('click', () => fetchQuotes({ showLoading: true }));

  $('interval').addEventListener('change', () => {
    const seconds = getIntervalSeconds();
    $('interval').value = String(seconds);
    restartAutoRefresh();
    setStatus(`Auto-refresh interval set to ${seconds}s`, 'live');
  });

  $('calculateBtn').addEventListener('click', handleCalculate);

  $('spacexToBuy').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleCalculate();
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  initCharts();
  bindEvents();
  await fetchQuotes({ showLoading: true });
  restartAutoRefresh();
});