// wa-worker — ponte entre o WhatsApp Cloud API (Meta) e o app (Firestore do projeto celulams).
// Cloudflare Worker, separado do site. Rotas:
//   GET/POST /webhook   ← Meta (handshake + mensagens/status, assinatura HMAC obrigatória)
//   POST     /enviar    ← app (atendente logada; token do Firebase) — envia uma mensagem já gravada no Firestore
//   GET      /midia/:k  ← app (atendente logada) — anexos grandes guardados no R2
// Segredos (wrangler secret put …): WA_VERIFY_TOKEN, WA_APP_SECRET, WA_TOKEN, FB_SA_JSON
// Variáveis (wrangler.toml): FB_PROJECT, WA_PHONE_ID, ORIGENS · binding R2 opcional: MIDIA

const GRAPH = 'https://graph.facebook.com/v21.0';
const JANELA_MS = 24 * 3600e3;
const INLINE_MAX = 700 * 1024; // anexos até ~700 KB vão direto no documento do Firestore (limite do doc = 1 MB)
const BOAS_VINDAS = 'Olá, seja bem-vindo(a) ao Laboratório Célula! 😊\nPara agilizar, me envie a *foto do pedido médico* e diga se é *particular* ou qual o *convênio*. Uma atendente já vai te responder.';
const ORIGENS_PADRAO = 'https://celulams.com.br,https://www.celulams.com.br,https://atendimento-celulams.natanael-invotec.workers.dev';

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    try {
      if (url.pathname === '/webhook') return await webhook(req, env, ctx, url);
      if (url.pathname === '/enviar' || url.pathname.startsWith('/midia/')) {
        const cors = corsHeaders(req, env);
        if (req.method === 'OPTIONS') return new Response(null, { status: cors ? 204 : 403, headers: cors || {} });
        if (!cors) return new Response('origem', { status: 403 });
        const r = url.pathname === '/enviar' ? await rotaEnviar(req, env) : await rotaMidia(req, env, url);
        for (const [k, v] of Object.entries(cors)) r.headers.set(k, v);
        return r;
      }
      return new Response('ok');
    } catch (e) {
      if (!e.status || e.status >= 500) console.error(url.pathname, e);
      return new Response(e.status ? e.message : 'erro interno', { status: e.status || 500 });
    }
  },
};

const falha = (status, message) => Object.assign(new Error(message), { status });
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });

function corsHeaders(req, env) {
  const o = req.headers.get('origin');
  const ok = (env.ORIGENS || ORIGENS_PADRAO).split(',').map(s => s.trim()).includes(o);
  return ok ? { 'access-control-allow-origin': o, 'access-control-allow-methods': 'POST, GET, OPTIONS', 'access-control-allow-headers': 'authorization, content-type', 'access-control-max-age': '86400', vary: 'origin' } : null;
}

// ======================= WEBHOOK (Meta → app) =======================
async function webhook(req, env, ctx, url) {
  if (req.method === 'GET') { // handshake ao cadastrar o webhook
    const ok = url.searchParams.get('hub.mode') === 'subscribe' && env.WA_VERIFY_TOKEN && url.searchParams.get('hub.verify_token') === env.WA_VERIFY_TOKEN;
    return ok ? new Response(url.searchParams.get('hub.challenge')) : new Response('forbidden', { status: 403 });
  }
  if (req.method !== 'POST') return new Response('method', { status: 405 });
  const corpo = await req.text();
  if (!(await assinaturaValida(corpo, req.headers.get('x-hub-signature-256'), env.WA_APP_SECRET))) return new Response('assinatura', { status: 401 });
  ctx.waitUntil(processar(JSON.parse(corpo), env).catch(e => console.error('processar', e))); // 200 rápido; a Meta reenvia se demorar
  return new Response('ok');
}

export async function assinaturaValida(corpo, header, segredo) {
  if (!header || !segredo || !header.startsWith('sha256=')) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(segredo), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(corpo)));
  const esperado = [...mac].map(b => b.toString(16).padStart(2, '0')).join('');
  const recebido = header.slice(7);
  if (recebido.length !== esperado.length) return false;
  let dif = 0; for (let i = 0; i < esperado.length; i++) dif |= esperado.charCodeAt(i) ^ recebido.charCodeAt(i); // tempo constante
  return dif === 0;
}

/** O WhatsApp às vezes entrega celulares BR sem o 9º dígito (55 67 9812-3456). A conversa usa sempre 13 dígitos,
 *  para bater com o telefone dos orçamentos; o waId original fica guardado para responder. */
export const normTel = w => /^55\d{10}$/.test(w) && /[6-9]/.test(w[4]) ? w.slice(0, 4) + '9' + w.slice(4) : w;

async function processar(payload, env) {
  for (const entry of payload.entry || []) for (const ch of entry.changes || []) {
    const v = ch.value || {};
    if (v.metadata?.phone_number_id && env.WA_PHONE_ID && v.metadata.phone_number_id !== env.WA_PHONE_ID) continue; // outro número da conta
    const nomes = Object.fromEntries((v.contacts || []).map(c => [c.wa_id, c.profile?.name || '']));
    for (const m of v.messages || []) await receber(env, m, nomes[m.from] || '');
    for (const s of v.statuses || []) await atualizarStatus(env, s);
  }
}

async function receber(env, m, nome) {
  const waId = m.from, tel = normTel(waId);
  const { texto, ...midia } = await conteudo(env, m, tel);
  const msg = { wamid: m.id, direcao: 'entrada', tipo: m.type, texto, ...midia, em: new Date(Number(m.timestamp) * 1000) };
  if (!(await fsCriar(env, `wa_conversas/${tel}/mensagens`, m.id, msg))) return; // já recebida (reentrega da Meta) → não duplica

  const c = await fsGet(env, `wa_conversas/${tel}`);
  const nota = c?.status === 'encerrada' && c.npsPendente && /^\s*(10|\d)\s*$/.exec(texto || '');
  if (nota) return registrarNps(env, tel, waId, c, Number(nota[1]));
  const resumo = texto || (midia.imagem ? '📷 Foto' : midia.arquivo ? '📎 ' + midia.arquivo.nome : `[${m.type}]`);
  const base = { telefone: tel, waId, ultimaMsg: resumo.slice(0, 120), ultimaDirecao: 'entrada', janelaAte: new Date(Date.now() + JANELA_MS) };
  const nova = !c || c.status === 'encerrada';
  if (nova) {
    const wa = (await fsGet(env, 'config/app').catch(() => null))?.wa || {};
    const aberto = dentroDoHorario(wa.horario);
    const at = aberto && wa.distribuicao ? await escolherAtendente(env).catch(e => { console.error('distribuição', e); return null; }) : null;
    const protocolo = gerarProtocolo(tel);
    await fsCommit(env, `wa_conversas/${tel}`, { ...base, nome: nome || c?.nome || '', status: at ? 'aberta' : 'fila', atendenteUid: at?.id || null, atendenteNome: at?.nome || null, naoLidas: 1, primeiraRespostaEm: null, motivo: null,
      orcamentoId: c?.orcamentoId || null, orcamentoNumero: c?.orcamentoNumero || null, protocolo, etiquetas: c?.etiquetas || [], foraHorario: !aberto },
      { agora: ['ultimaEm', 'atualizadoEm', 'criadoEm', 'primeiraEntradaEm'] }, !c ? 'criar' : 'substituir');
    await fsAdicionar(env, `wa_conversas/${tel}/mensagens`, { direcao: 'sistema', texto: `Novo atendimento · protocolo ${protocolo}${at ? ` · distribuído automaticamente para ${at.nome}` : !aberto ? ' · fora do horário' : ''}` }, ['em']);
    const voltouLogo = c?.status === 'encerrada' && Date.now() - ms(c.encerradaEm) < 6 * 3600e3; // sem boas-vindas repetida
    const auto = !aberto ? (wa.foraHorario || textoForaHorario(wa.horario)) : !voltouLogo && wa.boasVindas !== '' ? (wa.boasVindas || BOAS_VINDAS) : null;
    if (auto) await enviarDoServidor(env, tel, waId, auto).catch(e => console.error('automática', e));
  } else {
    await fsCommit(env, `wa_conversas/${tel}`, { ...base, ...(nome && !c.nome ? { nome } : {}), status: c.status === 'aguardando' ? 'aberta' : c.status },
      { agora: ['ultimaEm', 'atualizadoEm'], somar: { naoLidas: 1 } });
  }
}

// ---------- horário, protocolo e distribuição (mesmas regras do app/js/wa.js) ----------
const HORARIO_PADRAO = { semana: ['06:15', '18:00'], sabado: ['06:15', '11:00'], domingo: null };
const partesMS = d => Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Campo_Grande', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).map(x => [x.type, x.value]));
const minutos = hhmm => { const [h, m] = String(hhmm).split(':'); return +h * 60 + +(m || 0); };
export function dentroDoHorario(h, quando = new Date()) {
  h = h || HORARIO_PADRAO; const p = partesMS(quando);
  const faixa = p.weekday === 'Sun' ? h.domingo : p.weekday === 'Sat' ? h.sabado : h.semana;
  if (!faixa || !faixa[0] || !faixa[1]) return false;
  const m = +p.hour * 60 + +p.minute; return m >= minutos(faixa[0]) && m < minutos(faixa[1]);
}
const textoForaHorario = h => { h = h || HORARIO_PADRAO; if (!h.semana?.[0]) return 'Olá! 😊 Nosso atendimento pelo WhatsApp está fechado agora. Deixe sua mensagem e a *foto do pedido médico* que respondemos assim que abrirmos.'; return `Olá! 😊 Nosso atendimento pelo WhatsApp funciona de *segunda a sexta, das ${h.semana[0]} às ${h.semana[1]}*${h.sabado?.[0] ? ` e *sábado, das ${h.sabado[0]} às ${h.sabado[1]}*` : ''}.\nDeixe sua mensagem e a *foto do pedido médico* que respondemos assim que abrirmos.`; };
export const gerarProtocolo = (tel, d = new Date()) => { const p = partesMS(d); return `${p.year}${p.month}${p.day}${p.hour}${p.minute}-${String(tel).slice(-4)}`; };
/** Atendente 🟢 Online (batimento < 3 min, marcada para receber) com menos conversas abertas/aguardando. */
async function escolherAtendente(env) {
  const on = (await fsQuery(env, 'usuarios', [['status', 'EQUAL', 'online']])).filter(u => u.ativo !== false && !u.excluido && u.recebeWa !== false && Date.now() - ms(u.ultimoPing) < 3 * 60e3);
  if (!on.length) return null;
  const abertas = await fsQuery(env, 'wa_conversas', [['status', 'IN', ['aberta', 'aguardando']]], 500);
  const carga = uid => abertas.filter(c => c.atendenteUid === uid).length;
  return on.map(u => ({ u, n: carga(u.id) })).sort((a, b) => a.n - b.n || (a.u.nome || '').localeCompare(b.u.nome || ''))[0].u;
}

/** Resposta da pesquisa de satisfação (enviada ao encerrar). Nota até 6 volta para a fila para alguém retornar. */
async function registrarNps(env, tel, waId, c, n) {
  const baixa = n <= 6;
  await fsCommit(env, `wa_conversas/${tel}`, { nps: n, npsPendente: false, npsAtendenteUid: c.atendenteUid || null, npsAtendenteNome: c.atendenteNome || c.encerradaPor || null,
    ultimaMsg: `⭐ Nota ${n} na pesquisa`, ultimaDirecao: 'entrada', janelaAte: new Date(Date.now() + JANELA_MS),
    ...(baixa ? { status: 'fila', atendenteUid: null, atendenteNome: null, naoLidas: 1, motivo: null } : {}) }, { agora: ['ultimaEm', 'atualizadoEm', 'npsEm'] });
  if (baixa) await fsAdicionar(env, `wa_conversas/${tel}/mensagens`, { direcao: 'sistema', texto: `⚠ Nota ${n} na pesquisa de satisfação (atendimento de ${c.atendenteNome || c.encerradaPor || '—'}). Retorne ao paciente.` }, ['em']);
  await enviarDoServidor(env, tel, waId, n >= 9 ? 'Muito obrigado pela avaliação! 💙 Estamos sempre à disposição.' : 'Obrigado pela avaliação! Vamos usar sua opinião para melhorar. 💙').catch(e => console.error('nps', e));
}

/** Texto + anexo de uma mensagem recebida. Anexos pequenos vão inline (a tela e a IA já leem dataURL);
 *  grandes vão para o R2 (binding MIDIA) e a tela baixa com o token da atendente. */
async function conteudo(env, m, tel) {
  const t = m.type, o = m[t] || {};
  const texto = m.text?.body || o.caption || m.button?.text || m.interactive?.button_reply?.title || m.interactive?.list_reply?.title
    || (t === 'location' ? `📍 Localização: ${o.name || ''} ${o.address || ''} https://maps.google.com/?q=${o.latitude},${o.longitude}`.replace(/\s+/g, ' ').trim()
    : t === 'contacts' ? '👤 Contato: ' + (o[0]?.name?.formatted_name || m.contacts?.[0]?.name?.formatted_name || '')
    : t === 'reaction' ? `reagiu ${m.reaction?.emoji || ''}` : t === 'unsupported' ? '[mensagem não suportada pelo WhatsApp Business]' : '');
  if (!o.id || !['image', 'document', 'audio', 'video', 'sticker'].includes(t)) return { texto };
  try {
    const { bytes, mime } = await baixarMidiaMeta(env, o.id);
    const nome = o.filename || ({ image: 'foto', audio: 'audio', video: 'video', sticker: 'figurinha' }[t] || 'arquivo') + '.' + (mime.split('/')[1]?.split(';')[0] || 'bin');
    if (bytes.byteLength <= INLINE_MAX) {
      const dataUrl = `data:${mime};base64,${b64(bytes)}`;
      return t === 'image' || t === 'sticker' ? { texto, imagem: dataUrl } : { texto, arquivo: { nome, mime, dataUrl } };
    }
    if (!env.MIDIA) return { texto: (texto ? texto + '\n' : '') + `[anexo de ${Math.round(bytes.byteLength / 1024)} KB não armazenado — peça ao paciente para reenviar menor]` };
    const key = `${tel}/${m.id}`;
    await env.MIDIA.put(key, bytes, { httpMetadata: { contentType: mime } });
    return { texto, midiaKey: key, arquivo: { nome, mime, tamanho: bytes.byteLength } };
  } catch (e) {
    console.error('midia', e);
    return { texto: (texto ? texto + '\n' : '') + '[não foi possível baixar o anexo]' };
  }
}

async function baixarMidiaMeta(env, id) {
  const h = { authorization: 'Bearer ' + env.WA_TOKEN };
  const info = await (await fetch(`${GRAPH}/${id}`, { headers: h })).json();
  if (!info.url) throw new Error('midia sem url: ' + JSON.stringify(info).slice(0, 200));
  const r = await fetch(info.url, { headers: h }); // a URL expira em minutos e exige o mesmo token
  if (!r.ok) throw new Error('download midia ' + r.status);
  return { bytes: new Uint8Array(await r.arrayBuffer()), mime: info.mime_type || r.headers.get('content-type') || 'application/octet-stream' };
}

const ORDEM = { enviando: 0, aceita: 1, sent: 2, delivered: 3, read: 4 };
async function atualizarStatus(env, s) {
  const ref = await fsGet(env, `wa_wamid/${s.id}`);
  if (!ref) return; // mensagem enviada por fora do app (celular / Business)
  const caminho = `wa_conversas/${ref.tel}/mensagens/${ref.msgId}`;
  if (s.status === 'failed') return fsCommit(env, caminho, { status: 'erro', erro: (s.errors?.[0]?.title || s.errors?.[0]?.message || 'falha na entrega').slice(0, 200) });
  const m = await fsGet(env, caminho);
  if (m && (ORDEM[s.status] ?? -1) > (ORDEM[m.status] ?? -1)) await fsCommit(env, caminho, { status: s.status }); // status chegam fora de ordem
}

// ======================= ENVIO (app → Meta) =======================
async function rotaEnviar(req, env) {
  if (req.method !== 'POST') throw falha(405, 'method');
  const uid = await autenticar(req, env);
  const { tel, msgId } = await req.json().catch(() => ({}));
  if (!/^\d{12,13}$/.test(tel || '') || !/^[A-Za-z0-9]{10,40}$/.test(msgId || '')) throw falha(400, 'parâmetros');
  const caminho = `wa_conversas/${tel}/mensagens/${msgId}`;
  const m = await fsGet(env, caminho);
  if (!m || m.direcao !== 'saida' || m.autorUid !== uid) throw falha(403, 'mensagem não pertence a você');
  if (m.status !== 'enviando') throw falha(409, 'mensagem já processada'); // idempotência: um clique = um envio
  const c = await fsGet(env, `wa_conversas/${tel}`);
  try {
    if (!c || ms(c.janelaAte) < Date.now()) throw falha(422, 'janela de 24h fechada — o paciente precisa escrever antes (ou use um modelo aprovado)');
    const wamid = await enviarMeta(env, c.waId || tel, m);
    await registrarEnvio(env, tel, msgId, wamid);
    return json({ ok: true, wamid });
  } catch (e) {
    await fsCommit(env, caminho, { status: 'erro', erro: String(e.message || e).slice(0, 200) }).catch(() => {});
    throw e.status ? e : falha(502, 'Meta: ' + String(e.message || e).slice(0, 200));
  }
}

/** Mensagem do próprio servidor (boas-vindas, lembretes): grava no histórico e envia. */
async function enviarDoServidor(env, tel, waId, texto) {
  const m = { direcao: 'saida', autor: 'bot', tipo: 'text', texto, status: 'enviando' };
  const msgId = await fsAdicionar(env, `wa_conversas/${tel}/mensagens`, m, ['em']);
  try { await registrarEnvio(env, tel, msgId, await enviarMeta(env, waId, m)); }
  catch (e) { await fsCommit(env, `wa_conversas/${tel}/mensagens/${msgId}`, { status: 'erro', erro: String(e.message || e).slice(0, 200) }); throw e; }
}

async function registrarEnvio(env, tel, msgId, wamid) {
  await fsCommit(env, `wa_conversas/${tel}/mensagens/${msgId}`, { status: 'aceita', wamid });
  await fsCommit(env, `wa_wamid/${wamid}`, { tel, msgId }, {}, 'substituir');
}

async function enviarMeta(env, para, m) {
  let corpo;
  if (m.arquivo?.dataUrl) {
    const [cab, b] = m.arquivo.dataUrl.split(',');
    const mime = m.arquivo.mime || cab.slice(5).split(';')[0];
    const id = await subirMidiaMeta(env, Uint8Array.from(atob(b), ch => ch.charCodeAt(0)), mime, m.arquivo.nome || 'arquivo');
    corpo = mime.startsWith('image/') ? { type: 'image', image: { id, caption: (m.texto || '').slice(0, 1024) } }
      : { type: 'document', document: { id, filename: m.arquivo.nome || 'arquivo.pdf', caption: (m.texto || '').slice(0, 1024) } };
  } else corpo = { type: 'text', text: { body: String(m.texto || '').slice(0, 4096), preview_url: true } };
  const r = await fetch(`${GRAPH}/${env.WA_PHONE_ID}/messages`, { method: 'POST', headers: { authorization: 'Bearer ' + env.WA_TOKEN, 'content-type': 'application/json' }, body: JSON.stringify({ messaging_product: 'whatsapp', to: para, ...corpo }) });
  const j = await r.json();
  if (!r.ok || !j.messages?.[0]?.id) throw new Error(j.error?.message || 'envio recusado');
  return j.messages[0].id;
}

async function subirMidiaMeta(env, bytes, mime, nome) {
  const fd = new FormData();
  fd.append('messaging_product', 'whatsapp'); fd.append('type', mime);
  fd.append('file', new Blob([bytes], { type: mime }), nome);
  const r = await fetch(`${GRAPH}/${env.WA_PHONE_ID}/media`, { method: 'POST', headers: { authorization: 'Bearer ' + env.WA_TOKEN }, body: fd });
  const j = await r.json(); if (!j.id) throw new Error('upload: ' + (j.error?.message || r.status));
  return j.id;
}

async function rotaMidia(req, env, url) {
  if (req.method !== 'GET') throw falha(405, 'method');
  await autenticar(req, env);
  const key = decodeURIComponent(url.pathname.slice(7));
  if (!env.MIDIA || !/^\d{12,13}\/[\w.=-]+$/.test(key)) throw falha(404, 'não encontrado');
  const o = await env.MIDIA.get(key); if (!o) throw falha(404, 'não encontrado');
  return new Response(o.body, { headers: { 'content-type': o.httpMetadata?.contentType || 'application/octet-stream', 'cache-control': 'private, no-store' } });
}

// ======================= AUTENTICAÇÃO (token do Firebase da atendente) =======================
let _jwks = null, _jwksAte = 0;
async function chavesGoogle() {
  if (_jwks && Date.now() < _jwksAte) return _jwks;
  const r = await fetch('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com');
  _jwks = (await r.json()).keys || [];
  const idade = /max-age=(\d+)/.exec(r.headers.get('cache-control') || '');
  _jwksAte = Date.now() + (idade ? Number(idade[1]) : 3600) * 1000;
  return _jwks;
}
const deB64url = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

/** Verifica o ID token (assinatura RS256, aud/iss do projeto, validade) e se o usuário está ativo. Devolve o uid. */
export async function autenticar(req, env) {
  const tk = (req.headers.get('authorization') || '').replace(/^Bearer /, '');
  const partes = tk.split('.'); if (partes.length !== 3) throw falha(401, 'sem token');
  let cab, p;
  try { cab = JSON.parse(new TextDecoder().decode(deB64url(partes[0]))); p = JSON.parse(new TextDecoder().decode(deB64url(partes[1]))); } catch { throw falha(401, 'token inválido'); }
  const jwk = cab.alg === 'RS256' && (await chavesGoogle()).find(k => k.kid === cab.kid);
  if (!jwk) throw falha(401, 'token inválido');
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, deB64url(partes[2]), new TextEncoder().encode(partes[0] + '.' + partes[1]));
  const agora = Date.now() / 1000;
  if (!ok || p.aud !== env.FB_PROJECT || p.iss !== `https://securetoken.google.com/${env.FB_PROJECT}` || !p.sub || p.exp < agora || p.iat > agora + 300) throw falha(401, 'token inválido');
  const u = await fsGet(env, `usuarios/${p.sub}`);
  if (!u || u.ativo === false) throw falha(403, 'usuário inativo');
  return p.sub;
}

// ======================= FIRESTORE REST (conta de serviço) =======================
let _tok = null, _tokAte = 0;
async function tokenGoogle(env) {
  if (_tok && Date.now() < _tokAte) return _tok;
  const sa = JSON.parse(env.FB_SA_JSON); const agora = Math.floor(Date.now() / 1000);
  const enc = o => btoa(unescape(encodeURIComponent(typeof o === 'string' ? o : JSON.stringify(o)))).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  const cab = enc({ alg: 'RS256', typ: 'JWT' }), dados = enc({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/datastore', aud: 'https://oauth2.googleapis.com/token', iat: agora, exp: agora + 3600 });
  const der = Uint8Array.from(atob(sa.private_key.replace(/-----[^-]+-----|\s/g, '')), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${cab}.${dados}`)));
  const jwt = `${cab}.${dados}.${b64(sig).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')}`;
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}` });
  const j = await r.json(); if (!j.access_token) throw new Error('token google: ' + JSON.stringify(j));
  _tok = j.access_token; _tokAte = Date.now() + 50 * 60e3; return _tok;
}
export function b64(bytes) { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); }
const ms = v => v instanceof Date ? v.getTime() : v ? new Date(v).getTime() : 0;

export const paraFs = v => v === null || v === undefined ? { nullValue: null }
  : v instanceof Date ? { timestampValue: v.toISOString() }
  : typeof v === 'boolean' ? { booleanValue: v }
  : typeof v === 'number' ? (Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v })
  : Array.isArray(v) ? { arrayValue: { values: v.map(paraFs) } }
  : typeof v === 'object' ? { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, paraFs(x)])) } }
  : { stringValue: String(v) };
export const deFs = v => 'nullValue' in v ? null : 'booleanValue' in v ? v.booleanValue : 'integerValue' in v ? Number(v.integerValue) : 'doubleValue' in v ? v.doubleValue
  : 'timestampValue' in v ? new Date(v.timestampValue) : 'stringValue' in v ? v.stringValue
  : 'arrayValue' in v ? (v.arrayValue.values || []).map(deFs) : 'mapValue' in v ? deFsDoc(v.mapValue.fields || {}) : null;
const deFsDoc = f => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, deFs(v)]));

const raiz = env => `projects/${env.FB_PROJECT}/databases/(default)/documents`;
const api = 'https://firestore.googleapis.com/v1/';
async function fsReq(env, metodo, caminho, corpo) {
  const r = await fetch(api + caminho, { method: metodo, headers: { authorization: 'Bearer ' + (await tokenGoogle(env)), 'content-type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined });
  return r;
}
export async function fsGet(env, caminho) {
  const r = await fsReq(env, 'GET', `${raiz(env)}/${caminho}`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`firestore get ${caminho}: ${r.status} ${await r.text()}`);
  return deFsDoc((await r.json()).fields || {});
}
/** Consulta simples (filtros AND). filtros: [[campo, 'EQUAL'|'IN'|..., valor]]. Devolve [{id, ...campos}]. */
export async function fsQuery(env, colecao, filtros = [], limite = 200) {
  const f = filtros.map(([fieldPath, op, v]) => ({ fieldFilter: { field: { fieldPath }, op, value: paraFs(v) } }));
  const where = !f.length ? undefined : f.length === 1 ? f[0] : { compositeFilter: { op: 'AND', filters: f } };
  const r = await fsReq(env, 'POST', `${raiz(env)}:runQuery`, { structuredQuery: { from: [{ collectionId: colecao }], ...(where ? { where } : {}), limit: limite } });
  if (!r.ok) throw new Error(`firestore query ${colecao}: ${r.status} ${await r.text()}`);
  return (await r.json()).filter(x => x.document).map(x => ({ id: x.document.name.split('/').pop(), ...deFsDoc(x.document.fields || {}) }));
}
/** Cria com id fixo; devolve false se já existir (idempotência de webhook). */
async function fsCriar(env, colecao, id, obj) {
  const r = await fsReq(env, 'POST', `${raiz(env)}/${colecao}?documentId=${encodeURIComponent(id)}`, { fields: paraFs(obj).mapValue.fields });
  if (r.status === 409) return false;
  if (!r.ok) throw new Error(`firestore criar ${colecao}/${id}: ${r.status} ${await r.text()}`);
  return true;
}
/** Adiciona com id automático e hora do servidor nos campos `agora`; devolve o id. */
async function fsAdicionar(env, colecao, obj, agora = []) {
  const id = [...crypto.getRandomValues(new Uint8Array(15))].map(b => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[b % 62]).join('').slice(0, 20);
  await fsCommit(env, `${colecao}/${id}`, obj, { agora }, 'criar');
  return id;
}
/**
 * Escrita atômica: atualiza só os campos de `obj` (modo 'mesclar'), ou grava o documento inteiro ('substituir'/'criar'),
 * com hora do servidor (`agora`) e incrementos (`somar`) — equivalentes a serverTimestamp()/increment() do SDK.
 */
export async function fsCommit(env, caminho, obj, { agora = [], somar = {} } = {}, modo = 'mesclar') {
  const w = { update: { name: `${raiz(env)}/${caminho}`, fields: paraFs(obj).mapValue.fields },
    updateTransforms: [...agora.map(f => ({ fieldPath: f, setToServerValue: 'REQUEST_TIME' })), ...Object.entries(somar).map(([f, n]) => ({ fieldPath: f, increment: paraFs(n) }))] };
  if (modo === 'mesclar') { w.updateMask = { fieldPaths: Object.keys(obj) }; w.currentDocument = { exists: true }; }
  if (modo === 'criar') w.currentDocument = { exists: false };
  const r = await fsReq(env, 'POST', `${raiz(env)}:commit`, { writes: [w] });
  if (!r.ok) throw new Error(`firestore commit ${caminho}: ${r.status} ${await r.text()}`);
}
