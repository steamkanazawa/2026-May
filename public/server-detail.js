'use strict';

const ui = {
  detailHero: document.getElementById('detailHero'),
  statusOrb: document.getElementById('statusOrb'),
  statusPill: document.getElementById('statusPill'),
  serverName: document.getElementById('serverName'),
  serverEndpoint: document.getElementById('serverEndpoint'),
  updatedAt: document.getElementById('updatedAt'),
  players: document.getElementById('players'),
  cpu: document.getElementById('cpu'),
  memory: document.getElementById('memory'),
  uptime: document.getElementById('uptime'),
  availabilityPercent: document.getElementById('availabilityPercent'),
  detailHistory: document.getElementById('detailHistory'),
  minecraftStatus: document.getElementById('minecraftStatus'),
  version: document.getElementById('version'),
  latency: document.getElementById('latency'),
  motd: document.getElementById('motd'),
  containerState: document.getElementById('containerState'),
  disk: document.getElementById('disk'),
  networkRx: document.getElementById('networkRx'),
  networkTx: document.getElementById('networkTx'),
  refreshButton: document.getElementById('refreshButton'),
  detailError: document.getElementById('detailError')
};

const STATUS_LABELS = {
  operational: '稼働中',
  degraded: '一部異常',
  outage: '停止中',
  unknown: '取得不可'
};

const serverId = decodeURIComponent(location.pathname.split('/').filter(Boolean).pop() || '');

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[char]));
}

function timeText(timestamp) {
  if (!timestamp) return '--:--:--';
  return new Intl.DateTimeFormat('ja-JP', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  }).format(new Date(timestamp));
}

function formatBytes(bytes) {
  if (bytes == null) return '--';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let number = Number(bytes);
  let unit = 0;
  while (number >= 1024 && unit < units.length - 1) { number /= 1024; unit += 1; }
  return `${number.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function formatUptime(ms) {
  if (!ms) return '--';
  const minutes = Math.floor(ms / 60000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const remainingMinutes = minutes % 60;
  if (days) return `${days}日 ${hours}時間`;
  if (hours) return `${hours}時間 ${remainingMinutes}分`;
  return `${remainingMinutes}分`;
}

function historyMarkup(history) {
  const entries = Array.isArray(history) ? history.slice(-48) : [];
  const values = [...Array(Math.max(48 - entries.length, 0)).fill({ status: 'unknown' }), ...entries];
  return values.map(entry => `<span class="history-block ${escapeHtml(entry.status || 'unknown')}"></span>`).join('');
}


function containerStateText(state) {
  const labels = {
    running: '稼働中',
    offline: '停止中',
    starting: '起動中',
    stopping: '停止処理中'
  };
  return labels[state] || state || '--';
}

function recentAvailability(history) {
  const recorded = Array.isArray(history) ? history.filter(item => item.status !== 'unknown') : [];
  if (!recorded.length) return '--';
  const available = recorded.filter(item => item.status === 'operational').length;
  return `${((available / recorded.length) * 100).toFixed(1)}%`;
}

function render(data) {
  const server = data.server;
  const status = server.status || 'unknown';
  const container = server.container || {};
  const mc = server.minecraft || {};
  const endpoint = mc.host ? `${mc.host}:${mc.port}` : 'Minecraft問い合わせ未設定';

  document.title = `${server.name} | HikamersCraft ステータス`;
  ui.detailHero.className = `detail-hero ${status}`;
  ui.statusOrb.className = `summary-orb ${status}`;
  ui.statusPill.className = `status-pill ${status}`;
  ui.statusPill.textContent = STATUS_LABELS[status] || '不明';
  ui.serverName.textContent = server.name;
  ui.serverEndpoint.textContent = endpoint;
  ui.updatedAt.textContent = timeText(data.checkedAt);
  ui.players.textContent = mc.online ? `${mc.playersOnline} / ${mc.playersMax}` : '-- / --';
  ui.cpu.textContent = container.cpuPercent != null ? `${container.cpuPercent.toFixed(1)}%` : '--';
  ui.memory.textContent = formatBytes(container.memoryBytes);
  ui.uptime.textContent = formatUptime(container.uptimeMs);
  ui.availabilityPercent.textContent = recentAvailability(server.history);
  ui.detailHistory.innerHTML = historyMarkup(server.history);
  ui.minecraftStatus.textContent = mc.online ? '応答あり' : (container.state === 'running' ? '応答なし' : '停止中');
  ui.version.textContent = mc.version || '--';
  ui.latency.textContent = mc.latencyMs != null ? `${Math.round(mc.latencyMs)} ms` : '--';
  ui.motd.textContent = mc.motd ? String(mc.motd).replace(/\n/g, ' / ') : '--';
  ui.containerState.textContent = containerStateText(container.state);
  ui.disk.textContent = formatBytes(container.diskBytes);
  ui.networkRx.textContent = formatBytes(container.networkRxBytes);
  ui.networkTx.textContent = formatBytes(container.networkTxBytes);
  ui.detailError.classList.add('is-hidden');
}

async function loadDetail(force = false) {
  ui.refreshButton.classList.add('is-loading');
  try {
    const route = force ? `/api/refresh/${encodeURIComponent(serverId)}` : `/api/status/${encodeURIComponent(serverId)}`;
    const response = await fetch(route, {
      method: force ? 'POST' : 'GET',
      headers: force ? { 'Content-Type': 'application/json' } : undefined,
      cache: 'no-store'
    });
    if (!response.ok) throw new Error(response.status === 404 ? 'このサーバーは表示対象に設定されていません。' : `HTTP ${response.status}`);
    render(await response.json());
  } catch (error) {
    ui.detailError.textContent = error.message || 'サーバーの詳細ステータスを取得できませんでした。';
    ui.detailError.classList.remove('is-hidden');
  } finally {
    ui.refreshButton.classList.remove('is-loading');
  }
}

ui.refreshButton.addEventListener('click', () => loadDetail(true));
loadDetail();
window.setInterval(() => loadDetail(false), 60000);
