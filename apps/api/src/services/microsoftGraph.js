import { ConfidentialClientApplication } from '@azure/msal-node';
import env from '../config/env.js';
import { logger } from '../lib/logger.js';
import { upstream } from '../lib/errors.js';

const GRAPH = 'https://graph.microsoft.com/v1.0';

let _cca = null;
function cca() {
  if (!env.MS_CLIENT_ID || !env.MS_CLIENT_SECRET) {
    throw upstream('Microsoft 365 no configurado (MS_CLIENT_ID / MS_CLIENT_SECRET)');
  }
  if (!_cca) {
    _cca = new ConfidentialClientApplication({
      auth: {
        clientId: env.MS_CLIENT_ID,
        clientSecret: env.MS_CLIENT_SECRET,
        authority: `https://login.microsoftonline.com/${env.MS_TENANT_ID}`,
      },
    });
  }
  return _cca;
}

async function graphToken() {
  const res = await cca().acquireTokenByClientCredential({
    scopes: ['https://graph.microsoft.com/.default'],
  });
  return res.accessToken;
}

async function graphFetch(path) {
  const token = await graphToken();
  const res = await fetch(`${GRAPH}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    logger.error({ status: res.status, body }, 'Graph API error');
    throw upstream(`Graph API ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

export async function listChannels() {
  if (env.TEAMS_CHANNEL_ID) return [{ id: env.TEAMS_CHANNEL_ID }];
  if (!env.TEAMS_TEAM_ID) throw upstream('TEAMS_TEAM_ID no configurado');
  const data = await graphFetch(`/teams/${env.TEAMS_TEAM_ID}/channels?$select=id,displayName`);
  return data.value || [];
}

// Busca adjuntos de Excel en los mensajes del canal (reporte de entregas de tareas)
export async function findExcelAttachments({ top = 50, since } = {}) {
  if (!env.TEAMS_TEAM_ID) throw upstream('TEAMS_TEAM_ID no configurado');
  const channels = await listChannels();
  const results = [];

  for (const ch of channels) {
    let url = `/teams/${env.TEAMS_TEAM_ID}/channels/${ch.id}/messages?$top=${top}&$expand=attachments`;
    const data = await graphFetch(url);
    for (const msg of data.value || []) {
      if (since && new Date(msg.createdDateTime) < new Date(since)) continue;
      for (const att of msg.attachments || []) {
        const name = att.name || '';
        const ct = att.contentType || '';
        const isExcel = /\.(xlsx|xls|csv)$/i.test(name) || /excel|spreadsheet/i.test(ct);
        if (isExcel && att.contentUrl) {
          results.push({
            channelId: ch.id,
            messageId: msg.id,
            fileName: name,
            contentUrl: att.contentUrl,
            contentType: ct,
            createdDateTime: msg.createdDateTime,
          });
        }
      }
    }
  }
  return results;
}

// Descarga el binario del adjunto (el contentUrl ya es una URL prefirmada de SharePoint/OneDrive)
export async function downloadAttachment(contentUrl) {
  const res = await fetch(contentUrl);
  if (!res.ok) throw upstream(`No se pudo descargar el adjunto (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

export async function getTeamInfo() {
  if (!env.TEAMS_TEAM_ID) return null;
  return graphFetch(`/teams/${env.TEAMS_TEAM_ID}?$select=id,displayName,description`);
}
