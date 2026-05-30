'use strict';

const ui = {
  overallCard: document.getElementById('overallCard'),
  summaryIcon: document.getElementById('summaryIcon'),
  summaryTitle: document.getElementById('summaryTitle'),
  summaryText: document.getElementById('summaryText'),
  updatedAt: document.getElementById('updatedAt'),
  onlineCount: document.getElementById('onlineCount'),
  onlineCaption: document.getElementById('onlineCaption'),
  playerCount: document.getElementById('playerCount'),
  serverList: document.getElementById('serverList'),
  refreshButton: document.getElementById('refreshButton')
};

const STATUS_LABELS = {
  operational: '稼働中',
  degraded: '一部異常',
  outage: '停止中',
  unknown: '取得不可'
};

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
  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}日 ${hours}時間`;
  if (hours > 0) return `${hours}時間 ${minutes}分`;
  return `${minutes}分`;
}

function renderSummary(data) {
  const servers = Array.isArray(data.servers) ? data.servers : [];
  const status = data.status || 'unknown';
  const online = servers.filter(server => server.status === 'operational').length;
  const reachablePlayers = servers.reduce((total, server) => {
    const game = server.minecraft || {};
    return total + (game.online ? Number(game.playersOnline || 0) : 0);
  }, 0);

  ui.overallCard.className = `overall-card ${status}`;
  ui.summaryIcon.className = `summary-orb ${status}`;
  ui.onlineCount.textContent = `${online} / ${servers.length}`;
  ui.onlineCaption.textContent = '設定済みサーバー';
  ui.playerCount.textContent = String(reachablePlayers);
  ui.updatedAt.textContent = timeText(data.checkedAt);

  if (status === 'operational') {
    ui.summaryTitle.textContent = 'すべてのサーバーが正常に稼働しています';
    ui.summaryText.textContent = '監視対象のゲームサーバーは正常に応答しています。';
  } else if (status === 'degraded') {
    ui.summaryTitle.textContent = '一部のサーバーに異常があります';
    ui.summaryText.textContent = `${servers.length}台中${online}台が正常に応答しています。`;
  } else if (status === 'outage') {
    ui.summaryTitle.textContent = '停止中のサーバーがあります';
    ui.summaryText.textContent = `${servers.length}台中${online}台が現在稼働中です。`;
  } else {
    ui.summaryTitle.textContent = 'ステータスを取得できません';
    ui.summaryText.textContent = data.error || 'ステータス情報を取得できませんでした。';
  }
}

function historyHtml(history) {
  const values = Array.isArray(history) ? history.slice(-48) : [];
  const empty = Array(Math.max(48 - values.length, 0)).fill({ status: 'unknown' });
  return [...empty, ...values]
    .map(entry => `<span class="history-block ${escapeHtml(entry.status || 'unknown')}"></span>`)
    .join('');
}

function serverCard(server) {
  const container = server.container || {};
  const mc = server.minecraft || {};
  const players = mc.online ? `${mc.playersOnline} / ${mc.playersMax}` : '-- / --';
  const endpoint = mc.host ? `${mc.host}:${mc.port}` : (container.state || '不明');
  const motd = mc.motd ? String(mc.motd).replace(/\n/g, ' / ') : '応答なし';
  const latency = mc.latencyMs != null ? `${Math.round(mc.latencyMs)} ms` : '--';
  const cpu = container.cpuPercent != null ? `${container.cpuPercent.toFixed(1)}%` : '--';

  return `
    <a class="server-card-link" href="/servers/${encodeURIComponent(server.id)}" aria-label="${escapeHtml(server.name)} の詳細を表示">
    <article class="server-card ${escapeHtml(server.status || 'unknown')}">
      <header class="server-card-head">
        <div class="server-identity">
          <span class="state-indicator ${escapeHtml(server.status || 'unknown')}"></span>
          <div class="server-titles">
            <h3>${escapeHtml(server.name)}</h3>
            <p>${escapeHtml(endpoint)}</p>
          </div>
        </div>
        <span class="status-pill ${escapeHtml(server.status || 'unknown')}">${escapeHtml(STATUS_LABELS[server.status] || '不明')}</span>
      </header>

      <div class="primary-stats">
        <div class="primary-stat">
          <span>プレイヤー</span>
          <strong>${escapeHtml(players)}</strong>
        </div>
        <div class="primary-stat">
          <span>CPU</span>
          <strong>${escapeHtml(cpu)}</strong>
        </div>
        <div class="primary-stat">
          <span>メモリ</span>
          <strong>${escapeHtml(formatBytes(container.memoryBytes))}</strong>
        </div>
        <div class="primary-stat">
          <span>稼働時間</span>
          <strong>${escapeHtml(formatUptime(container.uptimeMs))}</strong>
        </div>
      </div>

      <div class="availability">
        <div class="availability-header"><span>稼働履歴</span><span>最新</span></div>
        <div class="history" aria-label="${escapeHtml(server.name)} の稼働履歴">${historyHtml(server.history)}</div>
      </div>

      <div class="secondary-stats">
        <p><span>バージョン</span><strong>${escapeHtml(mc.version || '--')}</strong></p>
        <p><span>レイテンシ</span><strong>${escapeHtml(latency)}</strong></p>
        <p class="motd"><span>MOTD</span><strong title="${escapeHtml(motd)}">${escapeHtml(motd)}</strong></p>
      </div>
      <div class="open-details">サーバー詳細を表示 <span aria-hidden="true">→</span></div>
    </article>
    </a>`;
}

async function loadStatus(force = false) {
  ui.refreshButton.classList.add('is-loading');
  try {
    const response = await fetch(force ? '/api/refresh' : '/api/status', {
      method: force ? 'POST' : 'GET',
      headers: force ? { 'Content-Type': 'application/json' } : undefined,
      cache: 'no-store'
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    renderSummary(data);
    ui.serverList.innerHTML = data.error
      ? `<div class="error-card">${escapeHtml(data.error)}</div>`
      : data.servers.map(serverCard).join('');
  } catch (error) {
    renderSummary({ status: 'unknown', servers: [], error: 'ステータスAPIへ接続できませんでした。' });
    ui.serverList.innerHTML = '<div class="error-card">ステータスAPIへ接続できませんでした。</div>';
  } finally {
    ui.refreshButton.classList.remove('is-loading');
  }
}

ui.refreshButton.addEventListener('click', () => loadStatus(true));
loadStatus();
setInterval(() => loadStatus(false), 60000);
