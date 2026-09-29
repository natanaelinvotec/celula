// wa.js — dados do Atendimento WhatsApp (coleção própria wa_conversas; não mexe em orçamentos existentes).
// Conversa: wa_conversas/{telefone E.164 sem +}  · mensagens: wa_conversas/{tel}/mensagens/{id}
// Em produção quem grava as mensagens de ENTRADA é o servidor (Cloudflare Worker, conta de serviço);
// aqui o "simulador" (só admin) grava no mesmo formato para testar sem a Meta.
import { db, auth } from './firebase.js';
import { collection, doc, getDoc, addDoc, updateDoc, setDoc, onSnapshot, query, where, orderBy, limit, runTransaction, increment, serverTimestamp, getDocs } from 'https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js';

export const JANELA_MS = 24 * 3600e3;
const conv = tel => doc(db, 'wa_conversas', tel);
const msgs = tel => collection(db, 'wa_conversas', tel, 'mensagens');
export const soDig = t => String(t || '').replace(/\D/g, '');
/** 5567998123456 → 67998123456 (formato do telefoneDigitos dos orçamentos) */
export const telLocal = t => { const d = soDig(t); return d.startsWith('55') && d.length >= 12 ? d.slice(2) : d; };
/** 67998123456 / (67) 9 9812-3456 → 5567998123456 */
export const telWa = t => { const d = soDig(t); return d.length <= 11 ? '55' + d : d; };
export const fmtTelWa = t => { const d = telLocal(t); return d.length === 11 ? `(${d.slice(0, 2)}) ${d[2]} ${d.slice(3, 7)}-${d.slice(7)}` : d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : d; };
export const ms = t => t?.toMillis ? t.toMillis() : t ? new Date(t).getTime() : 0;

/** Conversas por status (tempo real). status: 'fila' | 'aberta' | 'aguardando' | 'encerrada' */
export function ouvirConversas(cb, { encerradas = false } = {}) {
  const q = encerradas
    ? query(collection(db, 'wa_conversas'), where('status', '==', 'encerrada'), limit(200)) // ordena no navegador (evita índice composto)
    : query(collection(db, 'wa_conversas'), where('status', 'in', ['fila', 'aberta', 'aguardando']), limit(300));
  return onSnapshot(q, s => cb(s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => ms(b.ultimaEm) - ms(a.ultimaEm))), e => console.warn('wa conversas', e));
}
export const ouvirConversa = (tel, cb) => onSnapshot(conv(tel), d => cb(d.exists() ? { id: d.id, ...d.data() } : null));
export const ouvirMensagens = (tel, cb) => onSnapshot(query(msgs(tel), orderBy('em', 'asc'), limit(400)), s => cb(s.docs.map(d => ({ id: d.id, ...d.data() }))));

const eu = () => ({ uid: auth.currentUser.uid });

/** Atendente assume a conversa (sai da fila). */
export async function assumir(tel, perfil) {
  await runTransaction(db, async tx => {
    const r = await tx.get(conv(tel)); const c = r.data() || {};
    if (c.atendenteUid && c.atendenteUid !== eu().uid && c.status !== 'fila') throw new Error(`já está com ${c.atendenteNome}`);
    tx.update(conv(tel), { status: 'aberta', atendenteUid: eu().uid, atendenteNome: perfil.nome, atualizadoEm: serverTimestamp() });
  });
  await sistema(tel, `${perfil.nome} assumiu a conversa`);
}
export async function transferir(tel, para, perfil) {
  await updateDoc(conv(tel), { status: 'aberta', atendenteUid: para.id, atendenteNome: para.nome, atualizadoEm: serverTimestamp() });
  await sistema(tel, `${perfil.nome} transferiu para ${para.nome}`);
}
export async function devolverFila(tel, perfil) {
  await updateDoc(conv(tel), { status: 'fila', atendenteUid: null, atendenteNome: null, atualizadoEm: serverTimestamp() });
  await sistema(tel, `${perfil.nome} devolveu para a fila`);
}
export async function encerrar(tel, motivo, perfil) {
  await updateDoc(conv(tel), { status: 'encerrada', motivo, encerradaEm: serverTimestamp(), encerradaPor: perfil.nome, naoLidas: 0, atualizadoEm: serverTimestamp() });
  await sistema(tel, `Encerrada por ${perfil.nome} — ${motivo}`);
}
export const marcarLida = tel => updateDoc(conv(tel), { naoLidas: 0 }).catch(() => {});
export const vincularOrcamento = (tel, id, numero) => updateDoc(conv(tel), { orcamentoId: id, orcamentoNumero: numero || null, atualizadoEm: serverTimestamp() });

async function sistema(tel, texto) { await addDoc(msgs(tel), { direcao: 'sistema', texto, autorUid: eu().uid, em: serverTimestamp() }); }

/** Nota interna (o paciente não vê). */
export async function nota(tel, texto, perfil) { await addDoc(msgs(tel), { direcao: 'nota', texto, autorUid: eu().uid, autorNome: perfil.nome, em: serverTimestamp() }); }

/**
 * Resposta da atendente. Com o servidor configurado (config/app.wa.endpoint) o envio real vai pela API oficial;
 * sem ele (fase de testes) fica registrada como "simulado".
 */
export async function enviar(tel, texto, perfil, cfg, extra = null) {
  if (extra?.arquivo?.dataUrl && extra.arquivo.dataUrl.length > 950000) throw new Error('arquivo acima do limite (~700 KB)');
  const ref = await addDoc(msgs(tel), { direcao: 'saida', tipo: 'text', ...(extra || {}), texto, autorUid: eu().uid, autorNome: perfil.nome, status: cfg?.wa?.endpoint ? 'enviando' : 'simulado', em: serverTimestamp() });
  await runTransaction(db, async tx => {
    const r = await tx.get(conv(tel)); const c = r.data() || {};
    const m = { ultimaMsg: extra?.arquivo ? '📄 ' + extra.arquivo.nome : texto.slice(0, 120), ultimaEm: serverTimestamp(), ultimaDirecao: 'saida', status: 'aguardando', atualizadoEm: serverTimestamp() };
    if (!c.atendenteUid) Object.assign(m, { atendenteUid: eu().uid, atendenteNome: perfil.nome });
    if (!c.primeiraRespostaEm) m.primeiraRespostaEm = serverTimestamp();
    tx.update(conv(tel), m);
  });
  if (cfg?.wa?.endpoint) {
    try {
      const tk = await auth.currentUser.getIdToken();
      const r = await fetch(cfg.wa.endpoint.replace(/\/$/, '') + '/enviar', { method: 'POST', headers: { authorization: 'Bearer ' + tk, 'content-type': 'application/json' }, body: JSON.stringify({ tel, msgId: ref.id }) });
      if (!r.ok) throw new Error(await r.text());
    } catch (e) { await updateDoc(ref, { status: 'erro', erro: String(e.message || e).slice(0, 200) }).catch(() => {}); throw e; }
  }
  return ref.id;
}

/** SIMULADOR (admin): grava uma mensagem de entrada no mesmo formato que o servidor gravará. */
export async function simularEntrada({ tel, nome, texto, imagem }) {
  tel = telWa(tel); if (tel.length < 12) throw new Error('telefone inválido');
  let nova = false;
  await runTransaction(db, async tx => {
    const r = await tx.get(conv(tel)); const c = r.exists() ? r.data() : null;
    const base = { telefone: tel, ultimaMsg: texto || '📷 Foto', ultimaEm: serverTimestamp(), ultimaDirecao: 'entrada', janelaAte: new Date(Date.now() + JANELA_MS), atualizadoEm: serverTimestamp() };
    if (!c || c.status === 'encerrada') { nova = true; tx.set(conv(tel), { ...base, nome: nome || c?.nome || '', status: 'fila', atendenteUid: null, atendenteNome: null, naoLidas: 1, criadoEm: serverTimestamp(), primeiraEntradaEm: serverTimestamp(), primeiraRespostaEm: null, orcamentoId: c?.orcamentoId || null, orcamentoNumero: c?.orcamentoNumero || null, motivo: null, simulado: true }); }
    else tx.update(conv(tel), { ...base, ...(nome ? { nome } : {}), naoLidas: increment(1), status: c.status === 'aguardando' ? 'aberta' : c.status });
  });
  await addDoc(msgs(tel), { direcao: 'entrada', tipo: imagem ? 'image' : 'text', texto: texto || '', imagem: imagem || null, em: serverTimestamp(), simulado: true });
  if (nova) await addDoc(msgs(tel), { direcao: 'saida', autor: 'bot', tipo: 'text', texto: 'Olá, seja bem-vindo(a) ao Laboratório Célula! 😊\nPara agilizar, me envie a *foto do pedido médico* e diga se é *particular* ou qual o *convênio*. Uma atendente já vai te responder.', status: 'simulado', em: serverTimestamp() });
  return tel;
}

/** Orçamentos anteriores do mesmo telefone (para o histórico no painel da conversa). */
export async function orcamentosDoTelefone(tel) {
  const s = await getDocs(query(collection(db, 'orcamentos'), where('telefoneDigitos', '==', telLocal(tel)), limit(20)));
  return s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => ms(b.criadoEm) - ms(a.criadoEm));
}
export const ouvirOrcamento = (id, cb) => onSnapshot(doc(db, 'orcamentos', id), d => cb(d.exists() ? { id: d.id, ...d.data() } : null));
