'use strict';

require('dotenv').config();

const express = require('express');
const fs = require('node:fs/promises');
const path = require('node:path');
const minecraft = require('minecraft-server-util');

const app = express();
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const SERVERS_FILE = path.join(ROOT, 'config', 'servers.json');
const HISTORY_FILE = path.join(ROOT, 'data', 'history.json');

const PANEL_URL = String(process.env.PTERODACTYL_PANEL_URL || '').replace(/\/$/, '');
const API_KEY = String(process.env.PTERODACTYL_API_KEY || '');
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
const POLL_INTERVAL_MS = Math.max(Number(process.env.POLL_INTERVAL_MS || 60000), 15000);
const REQUEST_TIMEOUT_MS = Math.max(Number(process.env.REQUEST_TIMEOUT_MS || 5000), 1000);
const MAX_HISTORY = 48;

let snapshot = {
  checkedAt: null,
  status: 'loading',
  servers: [],
  error: null
};
let pollInProgress = false;

function requireConfiguration() {
  if (!PANEL_URL) throw new Error('PTERODACTYL_PANEL_URL が .env に設定されていません。');
  if (!API_KEY || API_KEY.includes('REPLACE_WITH')) {
    throw new Error('PTERODACTYL_API_KEY が .env に設定されていません。');
  }
}

async function readServerConfig() {
  const raw = await fs.readFile(SERVERS_FILE, 'utf8');
  const servers = JSON.parse(raw);
  if (!Array.isArray(servers) || servers.length === 0) {
    throw new Error('config/servers.json に1台以上のサーバーを設定してください。');
  }
  const ids = new Set();
  return servers.map((server, index) => {
    if (!server.id || !server.name || !server.pterodactylIdentifier) {
      throw new Error(`config/servers.json の${index + 1}番目のサーバー設定に必須項目がありません。`);
    }
    if (server.pterodactylIdentifier.includes('REPLACE_WITH')) {
      throw new Error(`${server.name} の pterodactylIdentifier を設定してください。`);
    }
    if (ids.has(server.id)) throw new Error(`サーバーIDが重複しています: ${server.id}`);
    ids.add(server.id);
    return server;
  });
}

async function readHistory() {
  try {
    return JSON.parse(await fs.readFile(HISTORY_FILE, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}

async function writeHistory(history) {
  await fs.mkdir(path.dirname(HISTORY_FILE), { recursive: true });
  await fs.writeFile(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf8');
}

function formatBytes(bytes) {
  const number = Number(bytes || 0);
  if (!number) return 0;
  return number;
}

async function fetchPterodactylResources(identifier) {
  const response = await fetch(`${PANEL_URL}/api/client/servers/${encodeURIComponent(identifier)}/resources`, {
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Pterodactyl API ${response.status}: ${text.slice(0, 120)}`);
  }

  const body = await response.json();
  const attributes = body.attributes || {};
  const resources = attributes.resources || {};
  return {
    state: attributes.current_state || 'unknown',
    suspended: Boolean(attributes.is_suspended),
    cpuPercent: Number(resources.cpu_absolute || 0),
    memoryBytes: formatBytes(resources.memory_bytes),
    diskBytes: formatBytes(resources.disk_bytes),
    networkRxBytes: formatBytes(resources.network_rx_bytes),
    networkTxBytes: formatBytes(resources.network_tx_bytes),
    uptimeMs: Number(resources.uptime || 0)
  };
}

async function fetchMinecraftStatus(server) {
  const mc = server.minecraft;
  if (!mc || mc.enabled === false) return null;

  const host = String(mc.host || '127.0.0.1');
  const edition = mc.edition === 'bedrock' ? 'bedrock' : 'java';
  const port = Number(mc.port || (edition === 'bedrock' ? 19132 : 25565));
  const options = { timeout: REQUEST_TIMEOUT_MS, enableSRV: true };

  try {
    const result = edition === 'bedrock'
      ? await minecraft.statusBedrock(host, port, options)
      : await minecraft.status(host, port, options);

    return {
      online: true,
      edition,
      host,
      port,
      playersOnline: Number(result.players?.online || 0),
      playersMax: Number(result.players?.max || 0),
      version: result.version?.name || result.version || null,
      motd: result.motd?.clean || result.motd || null,
      latencyMs: Number(result.roundTripLatency || 0) || null
    };
  } catch (error) {
    return {
      online: false,
      edition,
      host,
      port,
      playersOnline: null,
      playersMax: null,
      version: null,
      motd: null,
      latencyMs: null
    };
  }
}

function publicStatusFromResults(container, game) {
  if (container.state !== 'running') return 'outage';
  if (game && !game.online) return 'degraded';
  return 'operational';
}

async function collectOneServer(server) {
  try {
    const container = await fetchPterodactylResources(server.pterodactylIdentifier);
    const game = container.state === 'running' ? await fetchMinecraftStatus(server) : null;
    return {
      id: server.id,
      name: server.name,
      status: publicStatusFromResults(container, game),
      container,
      minecraft: game,
      error: null
    };
  } catch (error) {
    console.error(`[${server.name}] status error:`, error.message);
    return {
      id: server.id,
      name: server.name,
      status: 'unknown',
      container: null,
      minecraft: null,
      error: 'ステータスを取得できませんでした'
    };
  }
}

async function pollStatuses() {
  if (pollInProgress) return;
  pollInProgress = true;
  try {
    requireConfiguration();
    const configuredServers = await readServerConfig();
    const statuses = await Promise.all(configuredServers.map(collectOneServer));
    const history = await readHistory();
    const checkedAt = Date.now();

    for (const server of statuses) {
      const existing = Array.isArray(history[server.id]) ? history[server.id] : [];
      history[server.id] = [...existing, { at: checkedAt, status: server.status }].slice(-MAX_HISTORY);
    }
    await writeHistory(history);

    const hasOutage = statuses.some(server => server.status === 'outage');
    const hasIssue = statuses.some(server => ['degraded', 'unknown'].includes(server.status));
    snapshot = {
      checkedAt,
      status: hasOutage ? 'outage' : hasIssue ? 'degraded' : 'operational',
      servers: statuses.map(server => ({ ...server, history: history[server.id] || [] })),
      error: null
    };
  } catch (error) {
    console.error('Polling error:', error.message);
    snapshot = {
      checkedAt: Date.now(),
      status: 'unknown',
      servers: [],
      error: error.message
    };
  } finally {
    pollInProgress = false;
  }
}

app.disable('x-powered-by');
app.use(express.static(PUBLIC_DIR, { extensions: ['html'] }));

app.get('/api/status', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(snapshot);
});

app.get('/api/status/:id', (req, res) => {
  res.set('Cache-Control', 'no-store');
  const server = snapshot.servers.find(item => item.id === req.params.id);
  if (!server) return res.status(404).json({ error: 'サーバーが見つかりません。' });
  return res.json({ checkedAt: snapshot.checkedAt, status: server.status, server });
});

app.post('/api/refresh', express.json(), async (req, res) => {
  await pollStatuses();
  res.set('Cache-Control', 'no-store');
  res.json(snapshot);
});

app.post('/api/refresh/:id', express.json(), async (req, res) => {
  await pollStatuses();
  res.set('Cache-Control', 'no-store');
  const server = snapshot.servers.find(item => item.id === req.params.id);
  if (!server) return res.status(404).json({ error: 'サーバーが見つかりません。' });
  return res.json({ checkedAt: snapshot.checkedAt, status: server.status, server });
});

app.get('/servers/:id', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'server.html'));
});

app.get('/healthz', (req, res) => {
  res.json({ ok: true, lastCheckAt: snapshot.checkedAt });
});

app.listen(PORT, HOST, async () => {
  console.log(`Status page listening on http://${HOST}:${PORT}`);
  await pollStatuses();
  setInterval(pollStatuses, POLL_INTERVAL_MS).unref();
});
