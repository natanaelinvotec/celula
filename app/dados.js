// dados.js — acesso ao Firestore: catálogo, convênios, apelidos (aprendizado), solicitações, orçamentos.
import { db, auth, norm, slug } from './firebase.js';
import { collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, query, where, orderBy, limit, startAfter, onSnapshot, increment, serverTimestamp, writeBatch, getCountFromServer } from 'https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js';

let _cat = null, _catAt = 0, _cfg = null;

export async function config(force) { if (!_cfg || force) _cfg = (await getDoc(doc(db, 'config', 'app'))).data() || {}; return _cfg; }

export async function convenios() {
  const s = await getDocs(collection(db, 'convenios'));
  return s.docs.map(d => d.data()).filter(c => c.ativo !== false).sort((a, b) => a.nome.localeCompare(b.nome));
}

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
  return { valor, prazoDias, origem };
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
  const ok = c => c.ativo !== false && (renal ? !!c.renal : !c.renal);
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
  const score = c => toks.filter(w => c.nomeBusca.includes(w)).length;
  const hits = cat.filter(c => ok(c) && score(c) > 0).map(c => ({ c, s: score(c) / toks.length, n: c.nomeBusca.length }))
    .sort((a, b) => b.s - a.s || ((b.c.precos?.particular != null) - (a.c.precos?.particular != null)) || a.n - b.n).slice(0, 6);
  return hits.map((h, i) => ({ ex: h.c, confianca: Math.max(.35, Math.min(.85, h.s * .85) - i * .05), via: 'busca' }));
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
export async function solicitar({ orcamentoId, orcamentoNumero, textoLido, normalizadoIA, guiaDb, convenio, setorSugerido }) {
  const u = auth.currentUser;
  const ref = await addDoc(collection(db, 'solicitacoes'), {
    status: 'pendente', orcamentoId: orcamentoId || null, orcamentoNumero: orcamentoNumero || null, textoLido, normalizadoIA: normalizadoIA || null,
    guiaDb: guiaDb || null, convenio, setorSugerido: setorSugerido || 'Análises Clínicas',
    atendenteUid: u.uid, atendenteNome: u.displayName || u.email, criadoEm: serverTimestamp(),
  });
  return ref.id;
}
export const ouvirSolicitacoes = (status, cb) => onSnapshot(query(collection(db, 'solicitacoes'), where('status', '==', status)), s => cb(s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.criadoEm?.seconds || 0) - (a.criadoEm?.seconds || 0))));
export const ouvirSolicitacoesDoOrcamento = (orcamentoId, cb) => onSnapshot(query(collection(db, 'solicitacoes'), where('orcamentoId', '==', orcamentoId)), s => cb(s.docs.map(d => ({ id: d.id, ...d.data() }))));

/** Admin aprova: cria/atualiza o exame no catálogo, grava apelidos, marca a solicitação e devolve ao orçamento. */
export async function aprovarSolicitacao(sol, { mnemonico, nome, setor, prazoDias, codigoTuss, precos, apelidos }) {
  const u = auth.currentUser; const b = writeBatch(db);
  const exRef = doc(db, 'exames', mnemonico); const cur = (await getDoc(exRef)).data() || {};
  const cfg = await config(); const cor = cfg.setores?.[setor]?.cor || '#278d8c';
  b.set(exRef, { ...cur, mnemonico, nome, nomeBusca: norm(nome), setor, cor, laboratorio: setor === 'Próprio' ? 'CELULA' : 'DB', prazoDias, codigoTuss: codigoTuss || cur.codigoTuss || null,
    precos: { ...(cur.precos || {}), ...precos }, ativo: true, renal: !!cur.renal, origem: cur.origem || 'aprovacao', atualizadoEm: serverTimestamp(), atualizadoPor: u.uid }, { merge: true });
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
  if (id) { await updateDoc(doc(db, 'orcamentos', id), base); return id; }
  const numero = await proximoNumero();
  const ref = await addDoc(collection(db, 'orcamentos'), { ...base, numero, status: dados.status || 'gravado', criadoEm: serverTimestamp() });
  return ref.id;
}
export const ouvirOrcamento = (id, cb) => onSnapshot(doc(db, 'orcamentos', id), d => cb({ id: d.id, ...d.data() }));
export async function converterOrcamento(id) {
  const u = auth.currentUser;
  return updateDoc(doc(db, 'orcamentos', id), { status: 'convertido', convertidoEm: serverTimestamp(), convertidoPor: u.uid, convertidoPorNome: u.displayName || u.email });
}
export const mudarStatus = (id, status) => updateDoc(doc(db, 'orcamentos', id), { status, atualizadoEm: serverTimestamp() });
/** Lista recente (até 300) — filtros de texto aplicados no cliente para não exigir índices. */
export async function orcamentosRecentes({ dias = 30, unidade, atendenteUid, status } = {}) {
  const desde = new Date(Date.now() - dias * 86400000);
  let q = query(collection(db, 'orcamentos'), where('criadoEm', '>=', desde), orderBy('criadoEm', 'desc'), limit(400));
  const s = await getDocs(q); let rows = s.docs.map(d => ({ id: d.id, ...d.data() }));
  if (unidade) rows = rows.filter(r => r.unidade === unidade); if (atendenteUid) rows = rows.filter(r => r.atendenteUid === atendenteUid); if (status) rows = rows.filter(r => r.status === status);
  return rows;
}
export async function buscarOrcamentoPorNumero(n) { const s = await getDocs(query(collection(db, 'orcamentos'), where('numero', '==', Number(n)), limit(1))); return s.docs.map(d => ({ id: d.id, ...d.data() }))[0]; }
export async function buscarOrcamentosPorTelefone(tel) { const s = await getDocs(query(collection(db, 'orcamentos'), where('telefoneDigitos', '==', tel.replace(/\D/g, '')), limit(50))); return s.docs.map(d => ({ id: d.id, ...d.data() })); }

// ---------- usuários ----------
export async function usuarios() { const s = await getDocs(collection(db, 'usuarios')); return s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.nome || '').localeCompare(b.nome || '')); }
export const editarUsuario = (uid, m) => updateDoc(doc(db, 'usuarios', uid), { ...m, atualizadoEm: serverTimestamp() });
export const meuPerfil = async () => (await getDoc(doc(db, 'usuarios', auth.currentUser.uid))).data();
export const salvarConfig = m => updateDoc(doc(db, 'config', 'app'), { ...m, atualizadoEm: serverTimestamp() });
export const contar = async (col) => (await getCountFromServer(collection(db, col))).data().count;
