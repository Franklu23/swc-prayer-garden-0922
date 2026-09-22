// 同心守望之城．讀取共享資料的 Netlify Function
// 對應網址：/api/kv/get?key=xxx
// 自 2026-09-16 起，這個站台合併了多天的禱告園（/sep14、/sep15……），
// 前端每次呼叫都會把 key 加上「日期前綴」，例如 sep15:candles、
// sep15:station:w1，讓同一個 Blobs store 裡，不同日期的資料彼此獨立、
// 不會互相覆蓋，也不必為每一天各自新建一個 Netlify 網站（省 credits）。
import { getStore } from '@netlify/blobs';

// 只允許讀寫這幾個固定的鍵名，避免任意人透過 API 亂塞垃圾資料進 Blobs。
// 這些鍵名對應前端 Storage 呼叫時用到的 shared=true 的 key。
// 「station:」開頭的鍵是每個禱告站點自己的留言牆，數量不固定，故用前綴比對。
const ALLOWED_EXACT_KEYS = new Set([
  'candles', 'footsteps', 'wisdomFruit', 'unityTaps', 'unityGlow', 'greetings'
]);
// 日期前綴格式：sepNN:實際鍵名（例如 sep14:candles、sep15:station:w1）
const DAY_PREFIX_RE = /^(sep\d{2}):(.+)$/;

// 這個站台先前曾以「3dprayercity0915」單獨站台的身分運作過一段時間，
// 當時資料沒有日期前綴。合併進這個多日站台後，只為這一天保留一次性的
// 「新鍵讀不到時，去讀舊鍵」相容措施，讓弟兄姊妹先前留下的代禱、燭光、
// 問安不會因為改版而憑空消失，而是接續下去（新的寫入一律存進新鍵）。
const LEGACY_FALLBACK_DAY = 'sep15';

function parseKey(key) {
  if (typeof key !== 'string' || key.length === 0 || key.length > 200) return null;
  const m = key.match(DAY_PREFIX_RE);
  if (!m) return null; // 一律要求日期前綴，例如 sep15:candles，避免無前綴的舊式呼叫誤存錯地方
  const [, day, rest] = m;
  const isAllowedRest = ALLOWED_EXACT_KEYS.has(rest) || (rest.startsWith('station:') && rest.length <= 190);
  if (!isAllowedRest) return null;
  return { day, rest };
}

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
  if (req.method !== 'GET') {
    return jsonResponse({ error: '僅支援 GET' }, 405);
  }

  const url = new URL(req.url);
  const key = url.searchParams.get('key');
  const parsed = parseKey(key);
  if (!parsed) {
    return jsonResponse({ error: '不允許的 key' }, 400);
  }

  try {
    // strong consistency：確保剛寫入的資料，馬上讀就讀得到最新值
    const store = getStore({ name: 'swc-prayer-garden', consistency: 'strong' });
    let value = await store.get(key);
    if ((value === null || value === undefined) && parsed.day === LEGACY_FALLBACK_DAY) {
      // 相容讀取合併前（無日期前綴）留下的舊資料
      value = await store.get(parsed.rest);
    }
    if (value === null || value === undefined) {
      return jsonResponse(null, 404);
    }
    return jsonResponse({ key, value, shared: true });
  } catch (err) {
    return jsonResponse({ error: '讀取失敗：' + (err && err.message ? err.message : String(err)) }, 500);
  }
};

export const config = { path: '/api/kv/get' };
