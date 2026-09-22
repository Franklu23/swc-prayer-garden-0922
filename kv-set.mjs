// 同心守望之城．寫入共享資料的 Netlify Function
// 對應網址：/api/kv/set（POST，body 是 { key, value }）
// 自 2026-09-16 起，這個站台合併了多天的禱告園（/sep14、/sep15……），
// 前端每次呼叫都會把 key 加上「日期前綴」，例如 sep15:candles、
// sep15:station:w1，讓同一個 Blobs store 裡，不同日期的資料彼此獨立。
import { getStore } from '@netlify/blobs';

const ALLOWED_EXACT_KEYS = new Set([
  'candles', 'footsteps', 'wisdomFruit', 'unityTaps', 'unityGlow', 'greetings'
]);
const DAY_PREFIX_RE = /^(sep\d{2}):(.+)$/;

function isAllowedKey(key) {
  if (typeof key !== 'string' || key.length === 0 || key.length > 200) return false;
  const m = key.match(DAY_PREFIX_RE);
  if (!m) return false; // 一律要求日期前綴，避免無前綴的舊式呼叫誤存錯地方
  const rest = m[2];
  if (ALLOWED_EXACT_KEYS.has(rest)) return true;
  if (rest.startsWith('station:') && rest.length <= 190) return true;
  return false;
}

const MAX_VALUE_BYTES = 5 * 1024 * 1024; // 5MB，比照一般鍵值儲存的合理上限

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}
function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders() }
  });
}

export default async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: '僅支援 POST' }, 405);
  }

  let body;
  try {
    body = await req.json();
  } catch (e) {
    return jsonResponse({ error: '請求內容不是合法的 JSON' }, 400);
  }

  const { key, value } = body || {};
  if (!isAllowedKey(key)) {
    return jsonResponse({ error: '不允許的 key' }, 400);
  }
  if (typeof value !== 'string') {
    return jsonResponse({ error: 'value 必須是字串（前端請先 JSON.stringify）' }, 400);
  }
  if (new TextEncoder().encode(value).length > MAX_VALUE_BYTES) {
    return jsonResponse({ error: 'value 超過 5MB 上限' }, 413);
  }

  try {
    const store = getStore({ name: 'swc-prayer-garden', consistency: 'strong' });
    await store.set(key, value);
    return jsonResponse({ key, value, shared: true });
  } catch (err) {
    return jsonResponse({ error: '寫入失敗：' + (err && err.message ? err.message : String(err)) }, 500);
  }
};

export const config = { path: '/api/kv/set' };
