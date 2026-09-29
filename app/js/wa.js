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
  let de = null;
  await runTransaction(db, async tx => {
    const r = await tx.get(conv(tel)); const c = r.data() || {};
    if (c.atendenteUid && c.atendenteUid !== eu().uid && c.status !== 'fila') { if (perfil.papel !== 'admin') throw new Error(`já está com ${c.atendenteNome}`); de = c.atendenteNome; } // gestão pode puxar para si
    tx.update(conv(tel), { status: 'aberta', atendenteUid: eu().uid, atendenteNome: perfil.nome, atualizadoEm: serverTimestamp() });
  });
  await sistema(tel, `${perfil.nome} assumiu a conversa${de ? ` (estava com ${de})` : ''}`);
}
export async function transferir(tel, para, perfil) {
  await updateDoc(conv(tel), { status: 'aberta', atendenteUid: para.id, atendenteNome: para.nome, atualizadoEm: serverTimestamp() });
  await sistema(tel, `${perfil.nome} transferiu para ${para.nome}`);
}
export async function devolverFila(tel, perfil) {
  await updateDoc(conv(tel), { status: 'fila', atendenteUid: null, atendenteNome: null, atualizadoEm: serverTimestamp() });
  await sistema(tel, `${perfil.nome} devolveu para a fila`);
}
export const NPS_TEXTO = 'Sua opinião é muito importante para nós! 💙\nDe *0 a 10*, que nota você dá para o nosso atendimento de hoje? (responda só com o número)';
/** Encerra. Com { nps: true } a pesquisa já foi enviada: a próxima resposta numérica vira a nota (não reabre a conversa). */
export async function encerrar(tel, motivo, perfil, { nps = false } = {}) {
  await updateDoc(conv(tel), { status: 'encerrada', motivo, encerradaEm: serverTimestamp(), encerradaPor: perfil.nome, naoLidas: 0, npsPendente: !!nps, atualizadoEm: serverTimestamp() });
  await sistema(tel, `Encerrada por ${perfil.nome} — ${motivo}${nps ? ' · pesquisa de satisfação enviada' : ''}`);
}
/** Motivo de perda vindo do atendimento → orçamento vinculado fica "perdido" no CRM, com o porquê. */
export const marcarPerdido = (orcId, motivo) => updateDoc(doc(db, 'orcamentos', orcId), { status: 'perdido', motivoPerda: motivo, perdidoVia: 'whatsapp', atualizadoEm: serverTimestamp() });
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

/** Anexo grande guardado no R2 pelo servidor: baixa com o token da atendente (o link sozinho não abre). */
export async function baixarMidia(key, cfg) {
  if (!cfg?.wa?.endpoint) throw new Error('servidor do WhatsApp não configurado');
  const r = await fetch(cfg.wa.endpoint.replace(/\/$/, '') + '/midia/' + encodeURIComponent(key), { headers: { authorization: 'Bearer ' + await auth.currentUser.getIdToken() } });
  if (!r.ok) throw new Error(await r.text() || r.status);
  return r.blob();
}

// ---------- regras de atendimento (as mesmas do servidor wa-worker) ----------
export const HORARIO_PADRAO = { semana: ['06:15', '18:00'], sabado: ['06:15', '11:00'], domingo: null };
export const ETIQUETAS_PADRAO = ['Orçamento', 'Resultado', 'Agendamento', 'Coleta domiciliar', 'Convênio', 'Reclamação', 'Urgente'];
export const BOAS_VINDAS = 'Olá, seja bem-vindo(a) ao Laboratório Célula! 😊\nPara agilizar, me envie a *foto do pedido médico* e diga se é *particular* ou qual o *convênio*. Uma atendente já vai te responder.';
const partesMS = d => Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Campo_Grande', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(d).map(x => [x.type, x.value]));
const minutos = hhmm => { const [h, m] = String(hhmm).split(':'); return +h * 60 + +(m || 0); };
/** Está dentro do horário de atendimento (fuso de Campo Grande)? */
export function dentroDoHorario(h, quando = new Date()) {
  h = h || HORARIO_PADRAO; const p = partesMS(quando);
  const faixa = p.weekday === 'Sun' ? h.domingo : p.weekday === 'Sat' ? h.sabado : h.semana;
  if (!faixa || !faixa[0] || !faixa[1]) return false;
  const m = +p.hour * 60 + +p.minute; return m >= minutos(faixa[0]) && m < minutos(faixa[1]);
}
export const textoForaHorario = h => { h = h || HORARIO_PADRAO; if (!h.semana?.[0]) return 'Olá! 😊 Nosso atendimento pelo WhatsApp está fechado agora. Deixe sua mensagem e a *foto do pedido médico* que respondemos assim que abrirmos.'; return `Olá! 😊 Nosso atendimento pelo WhatsApp funciona de *segunda a sexta, das ${h.semana[0]} às ${h.semana[1]}*${h.sabado?.[0] ? ` e *sábado, das ${h.sabado[0]} às ${h.sabado[1]}*` : ''}.\nDeixe sua mensagem e a *foto do pedido médico* que respondemos assim que abrirmos.`; };
/** Protocolo do atendimento: data/hora de Campo Grande + 4 últimos dígitos do telefone (ex.: 202609291534-0023). */
export const gerarProtocolo = (tel, d = new Date()) => { const p = partesMS(d); return `${p.year}${p.month}${p.day}${p.hour}${p.minute}-${String(tel).slice(-4)}`; };
/** Distribuição automática: atendente Online (batimento < 3 min) com menos conversas abertas/aguardando. */
export function escolherAtendente(users, convs) {
  const on = users.filter(u => u.ativo !== false && !u.excluido && u.status === 'online' && Date.now() - ms(u.ultimoPing) < 3 * 60e3 && u.recebeWa !== false);
  if (!on.length) return null;
  const carga = uid => convs.filter(c => c.atendenteUid === uid && ['aberta', 'aguardando'].includes(c.status)).length;
  return on.map(u => ({ u, n: carga(u.id) })).sort((a, b) => a.n - b.n || (a.u.nome || '').localeCompare(b.u.nome || ''))[0].u;
}

// ---------- etiquetas e lembretes de acompanhamento ----------
export const etiquetar = (tel, etiquetas) => updateDoc(conv(tel), { etiquetas, atualizadoEm: serverTimestamp() });
export const definirLembrete = (tel, quando, texto, perfil) => updateDoc(conv(tel), { lembreteEm: quando, lembreteTexto: texto || null, lembreteUid: eu().uid, lembreteNome: perfil.nome, atualizadoEm: serverTimestamp() });
export const concluirLembrete = tel => updateDoc(conv(tel), { lembreteEm: null, lembreteTexto: null, lembreteUid: null, lembreteNome: null, atualizadoEm: serverTimestamp() });
/** Lembretes da atendente (qualquer status da conversa), do mais antigo para o mais novo. */
export const ouvirLembretes = (uid, cb) => onSnapshot(query(collection(db, 'wa_conversas'), where('lembreteUid', '==', uid), limit(100)),
  s => cb(s.docs.map(d => ({ id: d.id, ...d.data() })).filter(c => c.lembreteEm).sort((a, b) => ms(a.lembreteEm) - ms(b.lembreteEm))), e => console.warn('lembretes', e));

/** SIMULADOR (admin): grava uma mensagem de entrada no mesmo formato que o servidor gravará.
 *  opts.cfg = config/app (horário, boas-vindas, distribuição); opts.atendente = escolhida pela distribuição automática. */
export async function simularEntrada({ tel, nome, texto, imagem }, { cfg = {}, atendente = null } = {}) {
  tel = telWa(tel); if (tel.length < 12) throw new Error('telefone inválido');
  const wa = cfg.wa || {}, aberto = dentroDoHorario(wa.horario); if (!aberto || !wa.distribuicao) atendente = null;
  let nova = false, npsNota = null, bv = false, prot = null;
  await runTransaction(db, async tx => {
    const r = await tx.get(conv(tel)); const c = r.exists() ? r.data() : null;
    const n = !imagem && c?.status === 'encerrada' && c.npsPendente && /^\s*(10|\d)\s*$/.exec(texto || '');
    if (n) { npsNota = Number(n[1]); tx.update(conv(tel), { nps: npsNota, npsPendente: false, npsEm: serverTimestamp(), npsAtendenteUid: c.atendenteUid || null, npsAtendenteNome: c.atendenteNome || c.encerradaPor || null, ultimaMsg: `⭐ Nota ${npsNota} na pesquisa`, ultimaEm: serverTimestamp(), ultimaDirecao: 'entrada', janelaAte: new Date(Date.now() + JANELA_MS), atualizadoEm: serverTimestamp(), ...(npsNota <= 6 ? { status: 'fila', atendenteUid: null, atendenteNome: null, naoLidas: 1, motivo: null } : {}) }); return; }
    bv = !c || !(c.status === 'encerrada' && Date.now() - ms(c.encerradaEm) < 6 * 3600e3);
    const base = { telefone: tel, ultimaMsg: texto || '📷 Foto', ultimaEm: serverTimestamp(), ultimaDirecao: 'entrada', janelaAte: new Date(Date.now() + JANELA_MS), atualizadoEm: serverTimestamp() };
    if (!c || c.status === 'encerrada') { nova = true; prot = gerarProtocolo(tel); tx.set(conv(tel), { ...base, nome: nome || c?.nome || '', status: atendente ? 'aberta' : 'fila', atendenteUid: atendente?.id || null, atendenteNome: atendente?.nome || null, naoLidas: 1, criadoEm: serverTimestamp(), primeiraEntradaEm: serverTimestamp(), primeiraRespostaEm: null, orcamentoId: c?.orcamentoId || null, orcamentoNumero: c?.orcamentoNumero || null, motivo: null, protocolo: prot, etiquetas: c?.etiquetas || [], foraHorario: !aberto, simulado: true }); }
    else tx.update(conv(tel), { ...base, ...(nome ? { nome } : {}), naoLidas: increment(1), status: c.status === 'aguardando' ? 'aberta' : c.status });
  });
  await addDoc(msgs(tel), { direcao: 'entrada', tipo: imagem ? 'image' : 'text', texto: texto || '', imagem: imagem || null, em: serverTimestamp(), simulado: true });
  if (npsNota !== null) {
    if (npsNota <= 6) await sistema(tel, `⚠ Nota ${npsNota} na pesquisa de satisfação. Retorne ao paciente.`);
    await addDoc(msgs(tel), { direcao: 'saida', autor: 'bot', tipo: 'text', texto: npsNota >= 9 ? 'Muito obrigado pela avaliação! 💙 Estamos sempre à disposição.' : 'Obrigado pela avaliação! Vamos usar sua opinião para melhorar. 💙', status: 'simulado', em: serverTimestamp() });
    return tel;
  }
  if (nova) await sistema(tel, `Novo atendimento · protocolo ${prot}${atendente ? ` · distribuído automaticamente para ${atendente.nome}` : !aberto ? ' · fora do horário' : ''}`);
  const auto = !nova ? null : !aberto ? (wa.foraHorario || textoForaHorario(wa.horario)) : bv && wa.boasVindas !== '' ? (wa.boasVindas || BOAS_VINDAS) : null;
  if (auto) await addDoc(msgs(tel), { direcao: 'saida', autor: 'bot', tipo: 'text', texto: auto, status: 'simulado', em: serverTimestamp() });
  return tel;
}

/** Orçamentos anteriores do mesmo telefone (para o histórico no painel da conversa). */
export async function orcamentosDoTelefone(tel) {
  const s = await getDocs(query(collection(db, 'orcamentos'), where('telefoneDigitos', '==', telLocal(tel)), limit(20)));
  return s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => ms(b.criadoEm) - ms(a.criadoEm));
}
export const ouvirOrcamento = (id, cb) => onSnapshot(doc(db, 'orcamentos', id), d => cb(d.exists() ? { id: d.id, ...d.data() } : null));
