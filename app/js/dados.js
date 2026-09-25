// dados.js — acesso ao Firestore: catálogo, convênios, apelidos (aprendizado), solicitações, orçamentos.
import { db, auth, norm, slug } from './firebase.js';
import { collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, query, where, orderBy, limit, startAfter, onSnapshot, increment, serverTimestamp, writeBatch, getCountFromServer } from 'https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js';

let _cat = null, _catAt = 0, _cfg = null, _convs = null, _convsAt = 0;

export async function config(force) { if (!_cfg || force) _cfg = (await getDoc(doc(db, 'config', 'app'))).data() || {}; return _cfg; }

/** Convênios visíveis para as atendentes (ativo != false). */
export async function convenios() { return (await conveniosTodos()).filter(c => c.ativo !== false); }
/** Todos os convênios (gestão), inclusive ocultos. */
export async function conveniosTodos(force) {
  if (_convs && !force && Date.now() - _convsAt < 600000) return _convs;
  const s = await getDocs(collection(db, 'convenios'));
  _convs = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.nome || '').localeCompare(b.nome || '')); _convsAt = Date.now();
  return _convs;
}
/** Gestão mostra/oculta um convênio para as atendentes ou ajusta o repasse ao paciente (com auditoria). */
export async function editarConvenio(id, mudancas) {
  const u = auth.currentUser; const b = writeBatch(db);
  b.update(doc(db, 'convenios', id), { ...mudancas, atualizadoEm: serverTimestamp(), atualizadoPor: u.uid });
  b.set(doc(db, 'auditoria', `${Date.now()}_conv_${id}`), { tipo: 'convenio', convenio: id, por: u.uid, em: serverTimestamp(), dados: mudancas });
  await b.commit(); _convs = null;
}
/**
 * Repasse ao paciente (%) de um convênio: 100 = paciente paga a tabela inteira; 30 = convênio cobre 70% e o paciente paga 30%.
 * A tabela de preços fica intacta — só o valor entregue ao paciente é reduzido.
 */
export async function repasseDe(convSlug) {
  if (!convSlug) return 100;
  const c = (await conveniosTodos()).find(x => (x.slug || x.id) === convSlug);
  const p = Number(c?.repassePct); return p > 0 && p < 100 ? p : 100;
}
export const aplicarRepasse = (valor, pct) => valor == null ? null : Math.round(valor * pct) / 100;

/** Catálogo inteiro em memória (≈1.4k docs, ~1 MB) com cache de 10 min. */
export async function catalogo(force) {
  if (_cat && !force && Date.now() - _catAt < 600000) return _cat;
  const s = await getDocs(collection(db, 'exames'));
  _cat = s.docs.map(d => ({ id: d.id, ...d.data() })); _catAt = Date.now();
  return _cat;
}
export const catalogoMap = async () => Object.fromEntries((await catalogo()).map(c => [c.mnemonico, c]));

/** Preço e prazo de um exame para um convênio, considerando preços manuais aprovados. */
export async function precoPrazo(ex, convSlug, manuais) {
  let valor = ex.precos?.[convSlug] ?? null, prazoDias = ex.prazoDias ?? null, origem = 'tabela';
  if (valor == null || prazoDias == null) {
    const man = manuais ? manuais[`${ex.mnemonico}__${convSlug}`] : (await getDoc(doc(db, 'precos_manuais', `${ex.mnemonico}__${convSlug}`))).data();
    if (man) { if (valor == null && man.valor != null) { valor = man.valor; origem = 'manual'; } if (prazoDias == null && man.prazoDias != null) prazoDias = man.prazoDias; }
  }
  // convênio com cobertura (ex.: IMPCG/UFMS cobrem 70%): o paciente paga só o repasse configurado na aba Convênios
  const repassePct = await repasseDe(convSlug), valorTabela = valor;
  if (valor != null && repassePct !== 100) valor = aplicarRepasse(valor, repassePct);
  return { valor, prazoDias, origem, valorTabela, repassePct };
}
export async function precosManuais(convSlug) {
  const s = await getDocs(query(collection(db, 'precos_manuais'), where('convenio', '==', convSlug)));
  return Object.fromEntries(s.docs.map(d => [d.id, d.data()]));
}

/**
 * Resolve um texto lido no pedido para candidatos do catálogo.
 * Ordem: apelido aprendido → mnemônico digitado → nome exato → busca por palavras.
 * `renal` filtra o pacote: true = só exames renal; false = esconde os renal.
 */
export async function resolver(textoLido, { renal = false, normalizadoIA } = {}) {
  const t = norm(textoLido); if (!t) return [];
  const cat = await catalogo();
  // "fora do AutoLAC" só bloqueia quando o exame não tem valor em nenhuma tabela (se tem preço, ele é orçável)
  const ok = c => c.ativo !== false && (!c.foraAutolac || (c.precos && Object.values(c.precos).some(v => v != null))) && (renal ? !!c.renal : !c.renal);
  const out = [];
  const ap = await getDocs(query(collection(db, 'apelidos'), where('textoNorm', '==', t), limit(5)));
  for (const a of ap.docs.map(d => d.data()).sort((a, b) => (b.confirmacoes || 0) - (a.confirmacoes || 0))) {
    const c = cat.find(x => x.mnemonico === a.mnemonico); if (c && ok(c)) out.push({ ex: c, confianca: Math.min(.99, .9 + (a.confirmacoes || 1) * .01), via: 'apelido' });
  }
  if (out.length) return out;
  const byM = cat.find(c => c.mnemonico === textoLido.trim().toUpperCase() && ok(c)); if (byM) return [{ ex: byM, confianca: .99, via: 'mnemonico' }];
  const alvo = [t, norm(normalizadoIA)].filter(Boolean);
  for (const a of alvo) { const ex = cat.find(c => ok(c) && c.nomeBusca === a); if (ex) return [{ ex, confianca: .93, via: 'nome' }]; }
  const toks = [...new Set(alvo.flatMap(a => a.split(' ')))].filter(w => w.length > 2 && !['DE', 'DA', 'DO', 'E', 'EM', 'PARA', 'COM'].includes(w));
  // Pontuação por palavra: igual (1) > começa igual (.85) > parecida, tolera erro de grafia ex. TIROGLOBULINA≈TIREOGLOBULINA (.75) > pedaço dentro de outra palavra (.3)
  const pontoTok = (w, palavras, nb) => {
    if (palavras.includes(w)) return 1;
    if (w.length >= 4 && palavras.some(p => p.startsWith(w) || w.startsWith(p) && p.length >= 4)) return .85;
    if (w.length >= 5) { let best = 0; for (const p of palavras) if (Math.abs(p.length - w.length) <= 3) best = Math.max(best, similar(w, p)); if (best >= .7) return .75; }
    return nb.includes(w) ? .3 : 0;
  };
  const score = c => { const palavras = c.nomeBusca.split(' '); return toks.reduce((a, w) => a + pontoTok(w, palavras, c.nomeBusca), 0); };
  const hits = cat.filter(ok).map(c => ({ c, s: score(c) / toks.length, n: c.nomeBusca.length })).filter(h => h.s >= .3)
    .sort((a, b) => b.s - a.s || ((b.c.precos?.particular != null) - (a.c.precos?.particular != null)) || a.n - b.n).slice(0, 6);
  return hits.map((h, i) => ({ ex: h.c, confianca: Math.max(.35, Math.min(.85, h.s * .85) - i * .05), via: 'busca' }));
}
/** Similaridade entre duas palavras (Dice sobre pares de letras): 1 = iguais, 0 = nada em comum. */
export function similar(a, b) {
  if (a === b) return 1; if (a.length < 2 || b.length < 2) return 0;
  const bg = s => { const m = new Map(); for (let i = 0; i < s.length - 1; i++) { const k = s.slice(i, i + 2); m.set(k, (m.get(k) || 0) + 1); } return m; };
  const A = bg(a), B = bg(b); let inter = 0; for (const [k, v] of A) inter += Math.min(v, B.get(k) || 0);
  return (2 * inter) / (a.length - 1 + b.length - 1);
}

/** Grafias mais confirmadas (apelidos) para orientar a leitura da IA: até 80, com o nome do exame. Cache de 10 min. */
let _dicas = null, _dicasAt = 0;
export async function dicasAprendidas() {
  if (_dicas && Date.now() - _dicasAt < 600000) return _dicas;
  const s = await getDocs(query(collection(db, 'apelidos'), where('confirmacoes', '>=', 2), orderBy('confirmacoes', 'desc'), limit(80)));
  const cat = await catalogoMap();
  _dicas = s.docs.map(d => d.data()).filter(a => a.texto && cat[a.mnemonico] && norm(a.texto) !== cat[a.mnemonico].nomeBusca).map(a => ({ texto: a.texto, nome: cat[a.mnemonico].nome }));
  _dicasAt = Date.now(); return _dicas;
}
/** Acurácia da IA: agrega o resultado de cada leitura gravada nos orçamentos (campo itens[].resultado) num período.
 *  Devolve totais, série por semana, ranking por atendente e as grafias mais corrigidas. */
export async function acuraciaIA({ dias = 30 } = {}) {
  const rows = (await orcamentosRecentes({ dias, max: 1500 })).filter(r => r.leituraIA);
  const tot = { auto: 0, confirmado: 0, corrigido: 0, conferencia: 0, pendente: 0, descartado: 0 };
  const porAt = {}, erros = {}, modelos = {}, semanas = {}; let ms = 0, nMs = 0;
  const conta = (bucket, k) => { bucket[k] = (bucket[k] || 0) + 1; };
  for (const r of rows) {
    const at = porAt[r.atendenteUid] ??= { nome: r.atendenteNome, leituras: 0, auto: 0, confirmado: 0, corrigido: 0, conferencia: 0, orcamentos: 0 }; at.orcamentos++;
    if (r.leituraIA.modelo) conta(modelos, r.leituraIA.modelo); if (r.leituraIA.ms) { ms += r.leituraIA.ms; nMs++; }
    const d = r.criadoEm?.toDate?.(); const wk = d ? `${d.getDate()}/${d.getMonth() + 1}` : '?';
    const w0 = d ? new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay()) : null; const wkKey = w0 ? w0.toISOString().slice(0, 10) : '?';
    const sem = semanas[wkKey] ??= { rotulo: w0 ? `${w0.getDate()}/${w0.getMonth() + 1}` : wk, leituras: 0, certas: 0 };
    for (const i of r.itens || []) {
      if (!i.resultado) continue; const k = tot[i.resultado] != null ? i.resultado : 'pendente';
      tot[k]++; at.leituras++; if (at[k] != null) at[k]++; sem.leituras++; if (k === 'auto' || k === 'confirmado') sem.certas++;
      if (k === 'corrigido') { const key = `${(i.lido || '').trim()} → ${i.mnemonico || i.nome}`; erros[key] ??= { lido: i.lido, virou: i.mnemonico || i.nome, iaMn: i.iaMn || null, n: 0 }; erros[key].n++; }
    }
    for (const dsc of r.leituraIA.descartados || []) { tot.descartado++; const key = `${(dsc.lido || '').trim()} → (removido)`; erros[key] ??= { lido: dsc.lido, virou: 'removido pela atendente', iaMn: dsc.iaMn || null, n: 0 }; erros[key].n++; }
  }
  const leituras = tot.auto + tot.confirmado + tot.corrigido + tot.conferencia + tot.pendente;
  const certas = tot.auto + tot.confirmado;
  const atendentes = Object.values(porAt).filter(a => a.leituras).map(a => ({ ...a, acerto: Math.round((a.auto + a.confirmado) / a.leituras * 100) })).sort((a, b) => b.leituras - a.leituras);
  const memoria = await contar('apelidos').catch(() => null);
  return { dias, orcamentos: rows.length, leituras, certas, acerto: leituras ? Math.round(certas / leituras * 100) : null, tot, atendentes,
    erros: Object.values(erros).sort((a, b) => b.n - a.n).slice(0, 25), modelos, msMedio: nMs ? Math.round(ms / nMs) : null,
    semanas: Object.entries(semanas).sort((a, b) => a[0].localeCompare(b[0])).map(([, v]) => v), memoria };
}
/** Aprendizado: a recepção confirmou que "textoLido" é "mnemonico". */
export async function ensinar(textoLido, mnemonico, unidade) {
  const textoNorm = norm(textoLido); if (!textoNorm) return;
  const ref = doc(db, 'apelidos', slug(textoNorm).slice(0, 200));
  const cur = await getDoc(ref);
  if (cur.exists()) return updateDoc(ref, { confirmacoes: increment(1), mnemonico, unidade: unidade || null, atualizadoEm: serverTimestamp() });
  return setDoc(ref, { texto: textoLido, textoNorm, mnemonico, origem: 'recepcao', confirmacoes: 1, unidade: unidade || null, criadoEm: serverTimestamp() });
}

// ---------- solicitações (fila de conferência) ----------
export async function solicitar({ orcamentoId, orcamentoNumero, textoLido, normalizadoIA, guiaDb, convenio, setorSugerido, sugestao, fotos, motivo }) {
  const u = auth.currentUser;
  const ref = await addDoc(collection(db, 'solicitacoes'), {
    status: 'pendente', orcamentoId: orcamentoId || null, orcamentoNumero: orcamentoNumero || null, textoLido: String(textoLido || '').slice(0, 300), normalizadoIA: normalizadoIA || null,
    guiaDb: guiaDb || null, convenio, setorSugerido: setorSugerido || 'Análises Clínicas',
    // o que a atendente preencheu (nome, mnemônico, prazo, valor, obs) — a gestão recebe pré-preenchido
    sugestao: sugestao ? { nome: sugestao.nome || null, mnemonico: sugestao.mnemonico || null, prazoDias: sugestao.prazoDias ?? null, valor: sugestao.valor ?? null, obs: sugestao.obs || null } : null,
    // foto(s) do pedido (reduzidas) para a gestão conferir a caligrafia; motivo: 'nao_encontrado' | 'sem_valor' | 'fora_autolac' (possível nova negociação)
    fotos: (fotos || []).slice(0, 3), motivo: motivo || null,
    atendenteUid: u.uid, atendenteNome: u.displayName || u.email, criadoEm: serverTimestamp(),
  });
  return ref.id;
}
/** Atendente pede à gestão para liberar a impressão do orçamento com valores unitários. */
export async function solicitarLiberacaoUnitario({ orcamentoId, orcamentoNumero, paciente, motivo }) {
  const u = auth.currentUser;
  const ref = await addDoc(collection(db, 'solicitacoes'), { status: 'pendente', tipo: 'valor_unitario', orcamentoId, orcamentoNumero: orcamentoNumero || null, textoLido: `Liberar valores unitários — ${paciente || 'orçamento'} #${orcamentoNumero || ''}`.slice(0, 300), normalizadoIA: null, guiaDb: null, convenio: null, setorSugerido: 'Análises Clínicas', motivo: motivo || 'valor_unitario', obs: null, fotos: [], atendenteUid: u.uid, atendenteNome: u.displayName || u.email, criadoEm: serverTimestamp() });
  return ref.id;
}
/** Gestão libera (ou nega) a impressão com valores unitários daquele orçamento. */
export async function liberarUnitario(sol, liberar = true, motivo) {
  const u = auth.currentUser; const b = writeBatch(db);
  if (liberar) b.update(doc(db, 'orcamentos', sol.orcamentoId), { unitarioLiberado: true, unitarioPor: u.uid, unitarioEm: serverTimestamp(), atualizadoEm: serverTimestamp() });
  b.update(doc(db, 'solicitacoes', sol.id), { status: liberar ? 'aprovada' : 'recusada', motivo: motivo || null, aprovadoPor: u.uid, aprovadoEm: serverTimestamp() });
  b.set(doc(db, 'auditoria', `${Date.now()}_unit_${sol.orcamentoId}`), { tipo: 'valor_unitario', orcamentoId: sol.orcamentoId, liberado: liberar, por: u.uid, em: serverTimestamp() });
  await b.commit();
}
export const ouvirSolicitacoes = (status, cb) => onSnapshot(query(collection(db, 'solicitacoes'), where('status', '==', status)), s => cb(s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.criadoEm?.seconds || 0) - (a.criadoEm?.seconds || 0))));
export const ouvirSolicitacoesDoOrcamento = (orcamentoId, cb) => onSnapshot(query(collection(db, 'solicitacoes'), where('orcamentoId', '==', orcamentoId)), s => cb(s.docs.map(d => ({ id: d.id, ...d.data() }))));

/** Admin aprova: cria/atualiza o exame no catálogo, grava apelidos, marca a solicitação e devolve ao orçamento. */
export async function aprovarSolicitacao(sol, { mnemonico, nome, setor, prazoDias, codigoTuss, precos, apelidos }) {
  const u = auth.currentUser; const b = writeBatch(db);
  const exRef = doc(db, 'exames', mnemonico); const cur = (await getDoc(exRef)).data() || {};
  const cfg = await config(); const cor = cfg.setores?.[setor]?.cor || '#278d8c';
  b.set(exRef, { ...cur, mnemonico, nome, nomeBusca: norm(nome), setor, cor, laboratorio: setor === 'Próprio' ? 'CELULA' : 'DB', prazoDias, codigoTuss: codigoTuss || cur.codigoTuss || null,
    precos: { ...(cur.precos || {}), ...precos }, ativo: true, foraAutolac: false, renal: !!cur.renal, origem: cur.origem || 'aprovacao', atualizadoEm: serverTimestamp(), atualizadoPor: u.uid }, { merge: true });
  for (const a of [sol.textoLido, ...(apelidos || [])].filter(Boolean)) {
    const tn = norm(a); if (!tn) continue;
    b.set(doc(db, 'apelidos', slug(tn).slice(0, 200)), { texto: a, textoNorm: tn, mnemonico, origem: 'aprovacao', confirmacoes: 3, criadoEm: serverTimestamp() }, { merge: true });
  }
  b.update(doc(db, 'solicitacoes', sol.id), { status: 'aprovada', mnemonico, prazoDias, precos, aprovadoPor: u.uid, aprovadoEm: serverTimestamp() });
  b.set(doc(db, 'auditoria', `${Date.now()}_${mnemonico}`), { tipo: 'aprovacao', mnemonico, solicitacaoId: sol.id, por: u.uid, em: serverTimestamp(), dados: { nome, setor, prazoDias, precos } });
  await b.commit(); _cat = null;
}
export const recusarSolicitacao = (sol, motivo) => updateDoc(doc(db, 'solicitacoes', sol.id), { status: 'recusada', motivo: motivo || null, aprovadoPor: auth.currentUser.uid, aprovadoEm: serverTimestamp() });

/** Admin inclui um procedimento novo no catálogo (falha se o mnemônico já existir). */
export async function criarExame({ mnemonico, nome, setor, prazoDias, codigoTuss, precos, renal }) {
  const u = auth.currentUser; mnemonico = mnemonico.trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9\-\.]{1,19}$/.test(mnemonico)) throw new Error('Mnemônico inválido: use letras, números, "-" ou "." (2 a 20 caracteres).');
  if ((await getDoc(doc(db, 'exames', mnemonico))).exists()) throw new Error(`Já existe um exame com o mnemônico ${mnemonico}.`);
  const cfg = await config(); const cor = cfg.setores?.[setor]?.cor || '#278d8c';
  const b = writeBatch(db);
  b.set(doc(db, 'exames', mnemonico), { mnemonico, nome: nome.trim().toUpperCase(), nomeBusca: norm(nome), setor, cor, laboratorio: setor === 'Próprio' ? 'CELULA' : 'DB',
    prazoDias: prazoDias ?? null, codigoTuss: codigoTuss || null, precos: precos || {}, renal: !!renal, ativo: true, origem: 'manual', criadoEm: serverTimestamp(), criadoPor: u.uid });
  b.set(doc(db, 'auditoria', `${Date.now()}_${mnemonico}`), { tipo: 'inclusao', mnemonico, por: u.uid, em: serverTimestamp(), dados: { nome, setor, prazoDias, codigoTuss, precos, renal: !!renal } });
  await b.commit(); _cat = null;
}
/** Admin exclui um procedimento do catálogo (definitivo; fica registrado na auditoria). */
export async function excluirExame(mnemonico) {
  const u = auth.currentUser; const cur = (await getDoc(doc(db, 'exames', mnemonico))).data();
  const b = writeBatch(db);
  b.delete(doc(db, 'exames', mnemonico));
  b.set(doc(db, 'auditoria', `${Date.now()}_${mnemonico}`), { tipo: 'exclusao', mnemonico, por: u.uid, em: serverTimestamp(), dados: cur || null });
  await b.commit(); if (_cat) _cat = _cat.filter(c => c.mnemonico !== mnemonico);
}

/** Admin edita valor/prazo/visibilidade de um exame do catálogo (com auditoria). */
export async function editarExame(mnemonico, mudancas) {
  const u = auth.currentUser; const b = writeBatch(db);
  b.update(doc(db, 'exames', mnemonico), { ...mudancas, atualizadoEm: serverTimestamp(), atualizadoPor: u.uid });
  b.set(doc(db, 'auditoria', `${Date.now()}_${mnemonico}`), { tipo: 'catalogo', mnemonico, por: u.uid, em: serverTimestamp(), dados: mudancas });
  await b.commit(); const c = _cat?.find(x => x.mnemonico === mnemonico); if (c) Object.assign(c, mudancas);
}

// ---------- orçamentos ----------
export async function proximoNumero() {
  // contador atômico em config/contadores (regras permitem só increment de 1)
  const ref = doc(db, 'config', 'contadores'); await setDoc(ref, { orcamento: increment(1) }, { merge: true });
  return (await getDoc(ref)).data().orcamento;
}
export async function gravarOrcamento(dados, id) {
  const u = auth.currentUser;
  const base = { ...dados, atendenteUid: u.uid, atendenteNome: dados.atendenteNome || u.displayName || u.email, atualizadoEm: serverTimestamp() };
  // ao editar, a dona do orçamento não muda (transferência é só por transferirOrcamento)
  if (id) { const { atendenteUid, atendenteNome, ...resto } = base; await updateDoc(doc(db, 'orcamentos', id), resto); return id; }
  const numero = await proximoNumero();
  const ref = await addDoc(collection(db, 'orcamentos'), { ...base, numero, status: dados.status || 'gravado', criadoEm: serverTimestamp(), preToken: novoToken() });
  return ref.id;
}
/** Token aleatório (16 chars) impresso no QR do PDF: é a "senha" que autoriza o paciente a mandar o pré-cadastro deste orçamento. */
export function novoToken() { const a = new Uint8Array(12); crypto.getRandomValues(a); return [...a].map(b => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('').slice(0, 16); }
/** Garante que um orçamento antigo (anterior ao pré-cadastro) tenha token. */
export async function garantirPreToken(id, orc) {
  if (orc?.preToken) return orc.preToken; const t = novoToken(); await updateDoc(doc(db, 'orcamentos', id), { preToken: t }); return t;
}
export const PRE_URL = 'https://celulams.com.br/app/pre.html';
export const linkPreCadastro = (id, token, numero) => `${PRE_URL}?o=${id}&t=${token}${numero ? '&n=' + numero : ''}`;

// ---------- pré-cadastro (enviado pelo paciente pela página pública) ----------
/** Escuta os pré-cadastros mais recentes (recepção). cb(map id→dados, lista). */
export function ouvirPreCadastros(cb, max = 300) {
  return onSnapshot(query(collection(db, 'precadastros'), orderBy('enviadoEm', 'desc'), limit(max)), s => { const lista = s.docs.map(d => ({ id: d.id, ...d.data() })); cb(Object.fromEntries(lista.map(p => [p.id, p])), lista); }, () => cb({}, []));
}
export async function preCadastro(orcId) { const d = await getDoc(doc(db, 'precadastros', orcId)); return d.exists() ? { id: d.id, ...d.data() } : null; }
export const marcarPreVisto = orcId => updateDoc(doc(db, 'precadastros', orcId), { visto: true, vistoPor: auth.currentUser.uid, vistoEm: serverTimestamp() });
export const ouvirOrcamento = (id, cb) => onSnapshot(doc(db, 'orcamentos', id), d => cb({ id: d.id, ...d.data() }));
export async function converterOrcamento(id) {
  const u = auth.currentUser;
  return updateDoc(doc(db, 'orcamentos', id), { status: 'convertido', convertidoEm: serverTimestamp(), convertidoPor: u.uid, convertidoPorNome: u.displayName || u.email });
}
/** Conversão detectada no relatório de atendimento do AutoLAC (nome + valor batendo). */
export async function converterViaRelatorio(id, info) {
  const u = auth.currentUser;
  return updateDoc(doc(db, 'orcamentos', id), { status: 'convertido', convertidoEm: serverTimestamp(), convertidoPor: u.uid, convertidoPorNome: 'Relatório AutoLAC', convertidoVia: 'relatorio', relatorio: info, atualizadoEm: serverTimestamp() });
}
/** Registro resumido de uma importação de relatório (o PDF em si nunca é guardado). */
export const registrarImportacao = dados => addDoc(collection(db, 'importacoes'), { ...dados, por: auth.currentUser.uid, em: serverTimestamp() });
export const mudarStatus = (id, status) => updateDoc(doc(db, 'orcamentos', id), { status, atualizadoEm: serverTimestamp() });
/** Lista recente (até 300) — filtros de texto aplicados no cliente para não exigir índices. */
export async function orcamentosRecentes({ dias = 30, unidade, atendenteUid, status, max = 400 } = {}) {
  const desde = new Date(Date.now() - dias * 86400000);
  let q = query(collection(db, 'orcamentos'), where('criadoEm', '>=', desde), orderBy('criadoEm', 'desc'), limit(max));
  const s = await getDocs(q); let rows = s.docs.map(d => ({ id: d.id, ...d.data() }));
  if (unidade) rows = rows.filter(r => r.unidade === unidade); if (atendenteUid) rows = rows.filter(r => r.atendenteUid === atendenteUid); if (status) rows = rows.filter(r => r.status === status);
  return rows;
}
export async function buscarOrcamentoPorNumero(n) { const s = await getDocs(query(collection(db, 'orcamentos'), where('numero', '==', Number(n)), limit(1))); return s.docs.map(d => ({ id: d.id, ...d.data() }))[0]; }
export async function buscarOrcamentosPorTelefone(tel) { const s = await getDocs(query(collection(db, 'orcamentos'), where('telefoneDigitos', '==', tel.replace(/\D/g, '')), limit(50))); return s.docs.map(d => ({ id: d.id, ...d.data() })); }

/** Gestão exclui um orçamento (definitivo; fica na auditoria). */
export async function excluirOrcamento(id) {
  const u = auth.currentUser; const cur = (await getDoc(doc(db, 'orcamentos', id))).data();
  const b = writeBatch(db);
  b.delete(doc(db, 'orcamentos', id));
  b.set(doc(db, 'auditoria', `${Date.now()}_orc${cur?.numero || id}`), { tipo: 'exclusao_orcamento', orcamentoId: id, numero: cur?.numero || null, por: u.uid, em: serverTimestamp(), dados: { paciente: cur?.paciente || null, total: cur?.total ?? null, itens: (cur?.itens || []).length } });
  await b.commit();
}
/** A atendente dona (ou a gestão) transfere o orçamento para outra atendente. */
export const transferirOrcamento = (id, { uid, nome }) => updateDoc(doc(db, 'orcamentos', id), { atendenteUid: uid, atendenteNome: nome, transferidoDe: auth.currentUser.uid, transferidoEm: serverTimestamp(), atualizadoEm: serverTimestamp() });
export const orcamento = async id => { const d = await getDoc(doc(db, 'orcamentos', id)); return d.exists() ? { id: d.id, ...d.data() } : null; };
/** Status de presença da atendente: online | pausa | almoco | finalizado. */
export const setStatusAtendente = status => updateDoc(doc(db, 'usuarios', auth.currentUser.uid), { status, statusEm: serverTimestamp(), ultimoPing: serverTimestamp() });
export const ping = () => updateDoc(doc(db, 'usuarios', auth.currentUser.uid), { ultimoPing: serverTimestamp() });
/** Status efetivo para a gestão: sem batimento há mais de 3 min = offline. */
export function statusEfetivo(u) {
  const st = u.status || 'offline'; const t = u.ultimoPing?.toDate?.() || u.statusEm?.toDate?.();
  if (st === 'offline' || !t || Date.now() - t.getTime() > 3 * 60000) return 'offline';
  return st;
}
export const STATUS_LABEL = { online: 'online', ocupado: 'ocupado(a)', pausa: 'pausa', almoco: 'almoço', finalizado: 'finalizado', offline: 'offline' };
export const ouvirUsuarios = cb => onSnapshot(collection(db, 'usuarios'), s => cb(s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.nome || '').localeCompare(b.nome || ''))));

/**
 * Importa o cadastro do AutoLAC (data/autolac.json): prazos, bancada, material, método, preparo, meios de coleta, sinonímia.
 * Exames do catálogo que não estão no AutoLAC ficam marcados foraAutolac:true (vão para o fim da lista, "sem valor", e a IA não os usa).
 */
export async function importarAutolac(json, onProgress = () => {}) {
  const u = auth.currentUser; const cfg = await config(); const cat = await catalogoMap();
  const ops = [];
  for (const e of json.exames) {
    const cur = cat[e.m]; const cor = cfg.setores?.[e.setor]?.cor || cur?.cor || '#278d8c';
    const dados = { bancada: e.bancada || null, material: e.material || null, metodo: e.metodo || null, prazoDias: e.prazoDias || null, jejum: e.jejum || null, preparo: e.preparo || null,
      meios: e.meios || null, meiosOrigem: e.meiosOrigem || null, sinonimia: e.sinonimia || null, nomeAutolac: e.nomeAutolac || null, foraAutolac: false, autolacEm: serverTimestamp() };
    if (cur) ops.push(['update', doc(db, 'exames', e.m), { ...dados, setor: e.setor || cur.setor, cor, laboratorio: e.setor === 'Próprio' ? 'CELULA' : (cur.laboratorio || 'DB') }]);
    else ops.push(['set', doc(db, 'exames', e.m), { mnemonico: e.m, nome: e.nome.toUpperCase(), nomeBusca: norm(e.nome), setor: e.setor, cor, laboratorio: e.setor === 'Próprio' ? 'CELULA' : 'DB', codigoTuss: null, precos: {}, renal: false, ativo: true, origem: 'autolac', criadoEm: serverTimestamp(), criadoPor: u.uid, ...dados }]);
  }
  for (const m of json.foraAutolac) if (cat[m]) ops.push(['update', doc(db, 'exames', m), { foraAutolac: true, autolacEm: serverTimestamp() }]);
  let feitos = 0;
  for (let i = 0; i < ops.length; i += 450) {
    const b = writeBatch(db);
    for (const [tipo, ref, d] of ops.slice(i, i + 450)) tipo === 'set' ? b.set(ref, d) : b.update(ref, d);
    await b.commit(); feitos += Math.min(450, ops.length - i); onProgress(feitos, ops.length);
  }
  await setDoc(doc(db, 'auditoria', `${Date.now()}_autolac`), { tipo: 'importacao_autolac', por: u.uid, em: serverTimestamp(), dados: { exames: json.exames.length, fora: json.foraAutolac.length, fonte: json.fonte || null } });
  await salvarConfig({ autolacAtualizadoEm: serverTimestamp(), autolacExames: json.exames.length, autolacFora: json.foraAutolac.length });
  _cat = null; return ops.length;
}

// ---------- usuários: senha e exclusão via Cloud Functions (Admin SDK) ----------
// A função foi publicada como serviço Cloud Run (console), então tem endereço próprio *.run.app em vez de cloudfunctions.net.
const FUNCOES_URL = 'https://adminusuarios-458712694272.southamerica-east1.run.app';
let _fns;
async function fn(nome) {
  if (!_fns) { const m = await import('https://www.gstatic.com/firebasejs/12.3.0/firebase-functions.js'); const { app } = await import('./firebase.js'); _fns = { m, f: m.getFunctions(app, FUNCOES_URL) }; }
  return _fns.m.httpsCallable(_fns.f, nome);
}
/** Gestão define a senha de outra usuária (precisa das Cloud Functions publicadas). */
export async function definirSenha(uid, senha) { try { return (await (await fn('adminUsuarios'))({ acao: 'senha', uid, senha })).data; } catch (e) { throw traduzFn(e); } }
/** Gestão exclui a conta de login + perfil (Cloud Function). Sem a função publicada, cai para desativar + marcar excluído. */
export async function excluirUsuario(uid) {
  try { return (await (await fn('adminUsuarios'))({ acao: 'excluir', uid })).data; }
  catch (e) { const err = traduzFn(e); if (err.semFuncao) { await editarUsuario(uid, { ativo: false, excluido: true, excluidoEm: serverTimestamp(), excluidoPor: auth.currentUser.uid }); return { ok: true, soft: true }; } throw err; }
}
function traduzFn(e) {
  const c = String(e.code || ''); const err = new Error(c.includes('not-found') || c.includes('internal') && /not found|404/i.test(e.message) ? 'As Cloud Functions ainda não foram publicadas (veja celula-functions.zip).' : e.message === 'internal' ? 'Não foi possível falar com o servidor de funções (rede ou endereço). Tente de novo em instantes.' : (e.message || 'Erro'));
  err.semFuncao = c.includes('not-found') || /not found|404|Failed to fetch/i.test(e.message || ''); return err;
}

// ---------- usuários ----------
export async function usuarios() { const s = await getDocs(collection(db, 'usuarios')); return s.docs.map(d => ({ id: d.id, ...d.data() })).filter(u => !u.excluido).sort((a, b) => (a.nome || '').localeCompare(b.nome || '')); }
export const editarUsuario = (uid, m) => updateDoc(doc(db, 'usuarios', uid), { ...m, atualizadoEm: serverTimestamp() });
export const meuPerfil = async () => (await getDoc(doc(db, 'usuarios', auth.currentUser.uid))).data();
export const salvarConfig = m => updateDoc(doc(db, 'config', 'app'), { ...m, atualizadoEm: serverTimestamp() });
export const contadores = async () => (await getDoc(doc(db, 'config', 'contadores'))).data() || {};
/** Gestão reinicia a numeração: o próximo orçamento sai como #00001 (fica na auditoria). */
export async function zerarNumeracao() {
  const u = auth.currentUser; const cur = await contadores(); const b = writeBatch(db);
  b.set(doc(db, 'config', 'contadores'), { orcamento: 0, zeradoEm: serverTimestamp(), zeradoPor: u.uid, anterior: cur.orcamento || 0 }, { merge: true });
  b.set(doc(db, 'auditoria', `${Date.now()}_numeracao`), { tipo: 'numeracao', por: u.uid, em: serverTimestamp(), dados: { anterior: cur.orcamento || 0, novo: 0 } });
  await b.commit();
}
export const contar = async (col) => (await getCountFromServer(collection(db, col))).data().count;

// ---------- lembretes do CRM: orçamentos abertos há X dias sem retorno do paciente ----------
const ABERTOS = ['gravado', 'enviado', 'aguardando_conferencia', 'rascunho'];
/** Orçamentos abertos criados entre `dias` e `janela` dias atrás, com telefone, que ainda não receberam lembrete (ou receberam há mais de `dias`). */
export async function orcamentosParaLembrete({ dias = 3, janela = 30 } = {}) {
  const rows = await orcamentosRecentes({ dias: janela, max: 1500 }); const limite = Date.now() - dias * 86400000;
  return rows.filter(r => ABERTOS.includes(r.status) && r.telefoneDigitos && r.telefoneDigitos.length >= 10 && r.paciente
    && (r.criadoEm?.toDate?.()?.getTime() || Infinity) <= limite
    && (!r.lembreteEm || (r.lembreteEm.toDate?.()?.getTime() || 0) <= limite))
    .sort((a, b) => (a.criadoEm?.toDate?.() || 0) - (b.criadoEm?.toDate?.() || 0));
}
export async function marcarLembrete(id) {
  const u = auth.currentUser;
  return updateDoc(doc(db, 'orcamentos', id), { lembreteEm: serverTimestamp(), lembretePor: u.uid, lembretePorNome: u.displayName || u.email, lembretes: increment(1) });
}
/** Texto do lembrete pelo WhatsApp (o envio é manual: abre a conversa já com a mensagem). */
export function mensagemLembrete(o, { atendente, validadeDias = 7 } = {}) {
  const criado = o.criadoEm?.toDate?.() || new Date(); const val = new Date(criado.getTime() + validadeDias * 86400000);
  const primeiro = (o.paciente || '').split(' ')[0]; const tot = Number(o.total || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  return `Olá, ${primeiro}! Aqui é ${(atendente || 'a equipe').split(' ')[0]}, da Célula Diagnósticos. 😊\nSeu orçamento nº ${String(o.numero).padStart(5, '0')} (${o.qtd || o.itens?.length || 0} exames · ${tot}) continua válido até ${val.toLocaleDateString('pt-BR')}.\nPosso te ajudar a agendar a coleta? Atendemos por ordem de chegada em 8 unidades em Campo Grande — é só responder por aqui.`;
}
export const linkWhatsApp = (tel, texto) => `https://wa.me/55${String(tel).replace(/\D/g, '').replace(/^55/, '')}?text=${encodeURIComponent(texto)}`;

// ---------- grupos de pedido: um termo do pedido ("Ferrograma") abre vários exames do catálogo ----------
export const GRUPOS_PADRAO = [
  { id: 'ferrograma', nome: 'Ferrograma', termos: ['FERROGRAMA', 'PERFIL DE FERRO', 'PERFIL DO FERRO', 'CINETICA DO FERRO', 'CINETICA DE FERRO', 'METABOLISMO DO FERRO'], mnemonicos: ['FE', 'FERRI-DB', 'CAPATINT'] },
  { id: 'lipidograma', nome: 'Lipidograma', termos: ['LIPIDOGRAMA', 'PERFIL LIPIDICO', 'LIPIDIOS', 'LIPIDES'], mnemonicos: ['COL', 'HDL', 'LDL', 'VLDL', 'TRIG'] },
  { id: 'colesterol_fracoes', nome: 'Colesterol total e frações', termos: ['COLESTEROL TOTAL E FRACOES', 'COLESTEROL E FRACOES', 'COLESTEROL FRACIONADO', 'COLESTEROL TOTAL E FRACAO', 'COLESTEROL COM FRACOES'], mnemonicos: ['COL', 'HDL', 'LDL', 'VLDL'] },
  { id: 'hepatograma', nome: 'Hepatograma', termos: ['HEPATOGRAMA', 'FUNCAO HEPATICA', 'PROVAS HEPATICAS', 'PROVAS DE FUNCAO HEPATICA', 'ENZIMAS HEPATICAS', 'PERFIL HEPATICO'], mnemonicos: ['TGO', 'TGP', 'GGT', 'FAL', 'BTF'] },
  { id: 'ionograma', nome: 'Ionograma', termos: ['IONOGRAMA', 'ELETROLITOS', 'IONS'], mnemonicos: ['NA', 'K', 'CL'] },
  { id: 'proteinograma', nome: 'Proteinograma', termos: ['PROTEINOGRAMA', 'ELETROFORESE DE PROTEINAS COM PROTEINAS TOTAIS'], mnemonicos: ['PRT', 'ALB', 'EFP-HP'] },
];
let _grupos, _gruposAt = 0;
export async function grupos(force = false) {
  if (_grupos && !force && Date.now() - _gruposAt < 300000) return _grupos;
  const s = await getDocs(collection(db, 'grupos')); _grupos = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.nome || '').localeCompare(b.nome || '')); _gruposAt = Date.now(); return _grupos;
}
export async function salvarGrupo(id, dados) {
  const u = auth.currentUser; const ref = id ? doc(db, 'grupos', id) : doc(collection(db, 'grupos'));
  const termos = [...new Set((dados.termos || []).map(t => norm(t)).filter(Boolean))];
  await setDoc(ref, { nome: String(dados.nome || '').trim(), termos, mnemonicos: (dados.mnemonicos || []).filter(Boolean), ativo: dados.ativo !== false, atualizadoEm: serverTimestamp(), atualizadoPor: u.uid, ...(id ? {} : { criadoEm: serverTimestamp(), criadoPor: u.uid }) }, { merge: true });
  _grupos = null; return ref.id;
}
export async function excluirGrupo(id) { await deleteDoc(doc(db, 'grupos', id)); _grupos = null; }
export async function criarGruposPadrao() { for (const g of GRUPOS_PADRAO) { const ex = (await getDoc(doc(db, 'grupos', g.id))).exists(); if (!ex) await salvarGrupo(g.id, g); } _grupos = null; return grupos(true); }
/** Acha o grupo que corresponde ao texto lido (ou ao nome normalizado pela IA). Casamento exato do termo, ou termo de uma palavra contido no texto ("FERROGRAMA COMPLETO"). */
export async function grupoPara(texto, normalizadoIA) {
  const lista = (await grupos()).filter(g => g.ativo !== false && g.termos?.length && g.mnemonicos?.length);
  const alvos = [norm(texto), norm(normalizadoIA)].filter(Boolean);
  for (const g of lista) for (const t of g.termos) for (const a of alvos) {
    if (a === t) return g;
    if (!t.includes(' ') && t.length >= 6 && a.split(' ').includes(t)) return g;          // "FERROGRAMA COMPLETO", "SOLICITO HEPATOGRAMA"
    if (t.includes(' ') && a.startsWith(t)) return g;                                    // "PERFIL LIPIDICO COMPLETO"
  }
  return null;
}
