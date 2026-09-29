// wa-worker — recebe o webhook do WhatsApp Cloud API (Meta) e grava no Firestore do app (projeto celulams).
// Cloudflare Worker. Segredos (wrangler secret put …): WA_VERIFY_TOKEN, WA_APP_SECRET, WA_TOKEN, FB_SA_JSON.
// Variáveis: WA_PHONE_ID (número ativo — trocar aqui para migrar do número de teste para o da empresa).

const GRAPH = 'https://graph.facebook.com/v21.0';

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (url.pathname !== '/webhook') return new Response('ok', { status: 200 });

    // 1) Handshake de verificação (Meta chama GET uma vez ao cadastrar o webhook)
    if (req.method === 'GET') {
      const ok = url.searchParams.get('hub.mode') === 'subscribe' && url.searchParams.get('hub.verify_token') === env.WA_VERIFY_TOKEN;
      return ok ? new Response(url.searchParams.get('hub.challenge'), { status: 200 }) : new Response('forbidden', { status: 403 });
    }
    if (req.method !== 'POST') return new Response('method', { status: 405 });

    // 2) Autenticidade: assinatura HMAC-SHA256 do corpo com o App Secret (X-Hub-Signature-256)
    const corpo = await req.text();
    if (!(await assinaturaValida(corpo, req.headers.get('x-hub-signature-256'), env.WA_APP_SECRET))) return new Response('assinatura', { status: 401 });

    // 3) Responde 200 rápido e processa em segundo plano (a Meta reenvia se demorar)
    ctx.waitUntil(processar(JSON.parse(corpo), env).catch(e => console.error('processar', e)));
    return new Response('ok', { status: 200 });
  },
};

async function assinaturaValida(corpo, header, segredo) {
  if (!header || !segredo || !header.startsWith('sha256=')) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(segredo), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(corpo)));
  const esperado = [...mac].map(b => b.toString(16).padStart(2, '0')).join('');
  const recebido = header.slice(7);
  if (recebido.length !== esperado.length) return false;
  let dif = 0; for (let i = 0; i < esperado.length; i++) dif |= esperado.charCodeAt(i) ^ recebido.charCodeAt(i); // comparação em tempo constante
  return dif === 0;
}

// Grava cada mensagem recebida em wa_conversas/{telefone}/mensagens/{wamid} e atualiza o resumo da conversa.
async function processar(payload, env) {
  for (const entry of payload.entry || []) for (const ch of entry.changes || []) {
    const v = ch.value || {};
    if (v.metadata?.phone_number_id && env.WA_PHONE_ID && v.metadata.phone_number_id !== env.WA_PHONE_ID) continue; // outro número da conta
    const nomes = Object.fromEntries((v.contacts || []).map(c => [c.wa_id, c.profile?.name || '']));
    for (const m of v.messages || []) {
      const tel = m.from; const quando = new Date(Number(m.timestamp) * 1000).toISOString();
      const msg = { wamid: m.id, de: tel, direcao: 'entrada', tipo: m.type, texto: m.text?.body || m.button?.text || m.interactive?.button_reply?.title || m.interactive?.list_reply?.title || m.image?.caption || m.document?.caption || '', midiaId: m.image?.id || m.document?.id || m.audio?.id || null, mime: m.image?.mime_type || m.document?.mime_type || m.audio?.mime_type || null, em: quando };
      await fsSet(env, `wa_conversas/${tel}/mensagens/${m.id}`, msg);
      await fsSet(env, `wa_conversas/${tel}`, { telefone: tel, nome: nomes[tel] || '', ultimaMsg: msg.texto || `[${m.type}]`, ultimaEm: quando, janelaAte: new Date(Date.now() + 24 * 3600e3).toISOString(), naoLidas: 1, status: 'aberta' }, true);
    }
    for (const s of v.statuses || []) await fsSet(env, `wa_status/${s.id}_${s.status}`, { wamid: s.id, status: s.status, para: s.recipient_id, em: new Date(Number(s.timestamp) * 1000).toISOString(), erro: s.errors?.[0]?.title || null });
  }
}

// ---------- Firestore REST com conta de serviço (JWT RS256 → access token, com cache) ----------
let _tok = null, _tokAte = 0;
async function tokenGoogle(env) {
  if (_tok && Date.now() < _tokAte) return _tok;
  const sa = JSON.parse(env.FB_SA_JSON); const agora = Math.floor(Date.now() / 1000);
  const b64 = o => btoa(typeof o === 'string' ? o : JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  const cab = b64({ alg: 'RS256', typ: 'JWT' }), dados = b64({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/datastore', aud: 'https://oauth2.googleapis.com/token', iat: agora, exp: agora + 3600 });
  const der = Uint8Array.from(atob(sa.private_key.replace(/-----[^-]+-----|\s/g, '')), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${cab}.${dados}`)));
  const jwt = `${cab}.${dados}.${b64(String.fromCharCode(...sig))}`;
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}` });
  const j = await r.json(); if (!j.access_token) throw new Error('token google: ' + JSON.stringify(j));
  _tok = j.access_token; _tokAte = Date.now() + 50 * 60e3; return _tok;
}
const valorFs = v => v === null || v === undefined ? { nullValue: null } : typeof v === 'boolean' ? { booleanValue: v } : typeof v === 'number' ? (Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v }) : /^\d{4}-\d{2}-\d{2}T/.test(v) ? { timestampValue: v } : { stringValue: String(v) };
async function fsSet(env, caminho, obj, merge = false) {
  const base = `https://firestore.googleapis.com/v1/projects/${env.FB_PROJECT}/databases/(default)/documents/${caminho}`;
  const campos = Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, valorFs(v)]));
  const mask = merge ? '?' + Object.keys(obj).map(k => 'updateMask.fieldPaths=' + encodeURIComponent(k)).join('&') : '';
  const r = await fetch(base + mask, { method: 'PATCH', headers: { authorization: 'Bearer ' + (await tokenGoogle(env)), 'content-type': 'application/json' }, body: JSON.stringify({ fields: campos }) });
  if (!r.ok) throw new Error(`firestore ${caminho}: ${r.status} ${await r.text()}`);
}

// Envio (usado pelas próximas fases: resposta da atendente, orçamento, lembretes)
export async function enviarTexto(env, para, texto) {
  const r = await fetch(`${GRAPH}/${env.WA_PHONE_ID}/messages`, { method: 'POST', headers: { authorization: 'Bearer ' + env.WA_TOKEN, 'content-type': 'application/json' }, body: JSON.stringify({ messaging_product: 'whatsapp', to: para, type: 'text', text: { body: texto } }) });
  return r.json();
}
