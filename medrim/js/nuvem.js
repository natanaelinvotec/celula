/* MedRim · versão online (Firebase do projeto celulams).
   - Login por e-mail e senha (Firebase Auth) e papéis em medrim_usuarios/{uid}:
       programador = tudo · enfermaria = edita pacientes/escala · faturamento = só visualiza (salões, resultados, TXT).
     Quem decide é o servidor (regras do Firestore); a tela só esconde o que o papel não pode fazer.
   - Dados no Firestore, gravando só o que mudou (por vaga, por paciente, por chave) e recebendo em tempo real
     o que os outros usuários alteram. Nada de paciente fica guardado no navegador.
   - Resultados (TXT Nephrosys) e o arquivo original ficam em documentos fatiados (limite de 1 MB por documento).
   - Integração: o sistema do laboratório grava o TXT em medrim_entrada; o MedRim processa quando o programador abre. */
import { initializeApp, getApps, getApp, deleteApp } from 'https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js';
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, sendPasswordResetEmail, createUserWithEmailAndPassword,
  setPersistence, browserLocalPersistence, browserSessionPersistence,
} from 'https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js';
import {
  initializeFirestore, getFirestore, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, query, where,
  writeBatch, onSnapshot, deleteField, FieldPath, arrayUnion, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js';

const M = window.MED, A = M.app;
const { esc, ic } = A;

export const firebaseConfig = {
  apiKey: 'AIzaSyCY9DYFdxuVc1N1OO5Qk4KoE5nC77sETrE',
  authDomain: 'celulams.firebaseapp.com',
  projectId: 'celulams',
  storageBucket: 'celulams.firebasestorage.app',
  messagingSenderId: '458712694272',
  appId: '1:458712694272:web:80b53b6753510dcf13e2e5',
};
const C = {
  usuarios: 'medrim_usuarios', pedidos: 'medrim_pedidos', vagas: 'medrim_vagas', pacientes: 'medrim_pacientes',
  meta: 'medrim_meta', eventos: 'medrim_eventos', lotes: 'medrim_lotes', txt: 'medrim_txt', entrada: 'medrim_entrada',
};
const PAPEIS = {
  programador: { rotulo: 'Programador', desc: 'Acesso total: importação mensal, etiquetas, resultados, usuários e integração.' },
  enfermaria: { rotulo: 'Enfermaria', desc: 'Edita pacientes e escala: transferência, internação, óbito, admissão, cadastro, travas.' },
  faturamento: { rotulo: 'Faturamento', desc: 'Visualiza salões, relatório e resultados; baixa o TXT para o Nephrosys. Não edita.' },
};
M.PAPEIS = PAPEIS;

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
let db;
try { db = initializeFirestore(app, { ignoreUndefinedProperties: true }); } catch (e) { db = getFirestore(app); }

const S = M.sessao = { user: null, perfil: null, papel: null, pedidos: 0, ultimo: null, iniciado: false, ouvintes: [], pendentes: 0 };

// =====================================================================
// utilitários
// =====================================================================
/** JSON com chaves em ordem: a mesma informação dá sempre o mesmo texto (o Firestore devolve as chaves em outra ordem). */
function estavel(v) {
  if (v === undefined) return 'undefined';
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(x => (x === undefined ? 'null' : estavel(x))).join(',') + ']';
  return '{' + Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + estavel(v[k])).join(',') + '}';
}
const copia = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const docVaga = v => `S${v.salao}-${v.turno}`;
const balde = id => { let h = 5381; for (let i = 0; i < id.length; i++) h = ((h * 33) ^ id.charCodeAt(i)) >>> 0; return 'b' + String(h % 16).padStart(2, '0'); };
const mesDe = iso => String(iso || new Date().toISOString()).slice(0, 7);
const chaveEv = ev => `${ev.ts}|${ev.tipo}|${ev.texto}`;
const quem = () => (S.perfil ? S.perfil.nome || S.perfil.email : null);
const ESPECIAIS = new Set(['vagas', 'pacientes', 'apelidos', 'travas', 'convenios', 'etiquetas', 'notas', 'eventos', 'outroLab']);
const MAPAS = [['apelidos', 'a'], ['travas', 't'], ['convenios', 'c'], ['notas', 'n']];
const camposEstado = E => Object.keys(E).filter(k => !ESPECIAIS.has(k));
function b64DeBytes(bytes) { let s = ''; for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192)); return btoa(s); }
function bytesDeB64(b64) { const s = atob(b64 || ''); const out = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i); return out; }
async function gunzip(bytes) { return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()); }
const msgErro = e => {
  const c = (e && e.code) || '';
  if (/invalid-credential|wrong-password|user-not-found|invalid-email/.test(c)) return 'E-mail ou senha incorretos.';
  if (/too-many-requests/.test(c)) return 'Muitas tentativas. Espere alguns minutos ou use “Esqueci a senha”.';
  if (/network-request-failed|unavailable/.test(c)) return 'Sem conexão com a internet.';
  if (/permission-denied/.test(c)) return 'Sem permissão para esta operação.';
  if (/email-already-in-use/.test(c)) return 'Este e-mail já tem conta.';
  if (/weak-password/.test(c)) return 'Senha fraca: use pelo menos 8 caracteres.';
  return (e && e.message) || String(e);
};

// =====================================================================
// tela de login / estados de acesso
// =====================================================================
const tela = document.getElementById('login');
const CABECA = `<div class="login-logos"><img src="img/logo-celula.png" alt="Célula Diagnósticos"><span>×</span><img src="img/hiperrim.png" alt="Hiperrim"></div>
  <h1 class="login-titulo">Med<b>Rim</b></h1><p class="login-sub">Baterias de exames da hemodiálise</p>`;
function mostrar(html) {
  document.body.classList.add('bloqueado');
  tela.hidden = false;
  tela.innerHTML = `<div class="login-card">${CABECA}${html}</div>`;
}
function esconder() { document.body.classList.remove('bloqueado'); tela.hidden = true; tela.innerHTML = ''; }
const carregando = txt => mostrar(`<div class="login-carregando"><span class="spin"></span>${esc(txt)}</div>`);

function telaLogin(msg) {
  mostrar(`<form id="f-login" class="login-form" novalidate>
      <label class="f">E-mail<input type="email" name="email" autocomplete="username" required autofocus></label>
      <label class="f">Senha<input type="password" name="senha" autocomplete="current-password" required></label>
      <label class="login-chk"><input type="checkbox" name="manter" checked> Manter conectado neste computador</label>
      <button class="btn pri" type="submit">${ic('shield')} Entrar</button>
      <button class="login-link" type="button" data-l="esqueci">Esqueci a senha</button>
      <div class="login-msg" role="alert">${msg ? esc(msg) : ''}</div>
    </form>
    <small class="login-pe">Acesso restrito à Célula Diagnósticos e à Hiperrim · dados pessoais protegidos pela LGPD</small>`);
  const f = document.getElementById('f-login'), aviso = t => { f.querySelector('.login-msg').textContent = t; };
  f.onsubmit = async e => {
    e.preventDefault();
    const email = f.email.value.trim(), senha = f.senha.value;
    if (!email || !senha) return aviso('Preencha e-mail e senha.');
    const b = f.querySelector('button[type=submit]'); b.disabled = true; aviso('');
    try {
      await setPersistence(auth, f.manter.checked ? browserLocalPersistence : browserSessionPersistence);
      await signInWithEmailAndPassword(auth, email, senha);
    } catch (err) { b.disabled = false; aviso(msgErro(err)); }
  };
  f.querySelector('[data-l=esqueci]').onclick = async () => {
    const email = f.email.value.trim();
    if (!email) return aviso('Digite seu e-mail acima e clique de novo em “Esqueci a senha”.');
    try { await sendPasswordResetEmail(auth, email); } catch (err) { /* não revela se o e-mail existe */ }
    aviso('Se este e-mail tiver acesso, chega em instantes um link para criar uma nova senha.');
  };
}
function telaAviso(titulo, texto) {
  mostrar(`<div class="login-aviso"><b>${esc(titulo)}</b><p>${texto}</p>
    <button class="btn" type="button" id="btn-sair-aviso">${ic('x')} Sair</button></div>`);
  document.getElementById('btn-sair-aviso').onclick = sair;
}

async function sair() {
  S.ouvintes.forEach(off => { try { off(); } catch (e) { /* ok */ } });
  await signOut(auth).catch(() => {});
  location.hash = '';
  location.reload();
}

// =====================================================================
// sessão
// =====================================================================
async function ehAdminCelula(email) {
  try {
    const cfg = (await getDoc(doc(db, 'config', 'app'))).data() || {};
    return (cfg.admins || []).map(x => String(x).toLowerCase()).includes(String(email || '').toLowerCase());
  } catch (e) { return false; }
}

onAuthStateChanged(auth, async user => {
  if (!user) { if (S.user) return location.reload(); return telaLogin(); }
  if (S.user && S.user.uid === user.uid) return;
  S.user = user;
  carregando('Conferindo seu acesso…');
  try {
    const ref = doc(db, C.usuarios, user.uid);
    let snap = await getDoc(ref), perfil = snap.exists() ? snap.data() : null;
    if (!perfil && await ehAdminCelula(user.email)) {
      // primeiro acesso de quem administra o laboratório (config/app.admins): vira programador
      perfil = { uid: user.uid, email: user.email, nome: user.displayName || user.email.split('@')[0], papel: 'programador', ativo: true, criadoEm: serverTimestamp(), criadoPor: user.uid };
      await setDoc(ref, perfil);
    }
    if (!perfil) {
      await setDoc(doc(db, C.pedidos, user.uid), { uid: user.uid, email: user.email, nome: user.displayName || user.email.split('@')[0], em: serverTimestamp() }, { merge: true }).catch(() => {});
      return telaAviso('Acesso aguardando liberação', `Seu login (<b>${esc(user.email)}</b>) foi reconhecido, mas ainda não tem permissão no MedRim. O laboratório já recebeu o pedido — avise o responsável.`);
    }
    if (perfil.ativo === false || !PAPEIS[perfil.papel]) return telaAviso('Acesso desativado', 'Seu usuário está desativado no MedRim. Fale com o laboratório.');
    S.perfil = Object.assign({}, perfil, { uid: user.uid }); S.papel = perfil.papel;
    updateDoc(ref, { ultimoAcesso: serverTimestamp() }).catch(() => {});
    carregando('Carregando a escala e os pacientes…');
    await carregar();
    A.armazem = armazemNuvem;
    ouvir();
    esconder();
    if (!S.iniciado) { S.iniciado = true; A.iniciar(); }
    if (S.migrar && A.ehProgramador()) location.hash = '#/migrar';
    if (A.ehProgramador()) { contarPedidos(); processarEntrada().catch(e => console.warn('entrada', e)); }
  } catch (e) {
    console.error(e);
    telaAviso('Não foi possível abrir o MedRim', esc(msgErro(e)) + (e && e.code === 'permission-denied' ? '<br><small>As regras de segurança do Firestore para o MedRim estão publicadas?</small>' : ''));
  }
});

// =====================================================================
// leitura: Firestore → estado do app
// =====================================================================
async function carregar() {
  const [vs, ps, ms] = await Promise.all([getDocs(collection(db, C.vagas)), getDocs(collection(db, C.pacientes)), getDocs(collection(db, C.meta))]);
  const agora = new Date(), ant = new Date(agora.getFullYear(), agora.getMonth() - 1, 15);
  const evs = await Promise.all([mesDe(agora.toISOString()), mesDe(ant.toISOString())].map(m => getDoc(doc(db, C.eventos, m))));
  const meta = {}; ms.forEach(d => { meta[d.id] = d.data(); });
  S.migrar = null;
  if (!meta.estado) {
    A.E = null; S.ultimo = foto(null);
    try { const local = localStorage.getItem('medrim:v1'); if (local && JSON.parse(local).vagas) S.migrar = true; } catch (e) { /* ok */ }
    return;
  }
  const est = Object.assign({}, meta.estado), ordem = est._ordem || null;
  ['_ordem', 'atualizadoEm', 'atualizadoPor'].forEach(k => delete est[k]);
  const vagas = []; vs.forEach(d => Object.values(d.data().v || {}).forEach(v => vagas.push(v)));
  if (ordem) { const pos = new Map(ordem.map((id, i) => [id, i])); vagas.sort((a, b) => (pos.get(a.id) ?? 1e9) - (pos.get(b.id) ?? 1e9)); }
  else vagas.sort((a, b) => a.salao - b.salao || 'MTN'.indexOf(a.turno) - 'MTN'.indexOf(b.turno) || a.ordem - b.ordem || a.grupo.localeCompare(b.grupo));
  const pacientes = {}; ps.forEach(d => Object.assign(pacientes, d.data().p || {}));
  const eventos = []; const vistos = new Set();
  evs.forEach(d => (d.exists() ? d.data().lista || [] : []).forEach(ev => { const k = chaveEv(ev); if (!vistos.has(k)) { vistos.add(k); eventos.push(ev); } }));
  eventos.sort((a, b) => b.ts.localeCompare(a.ts));
  A.E = Object.assign(est, {
    vagas, pacientes, eventos: eventos.slice(0, 300), outroLab: {},
    apelidos: (meta.apelidos && meta.apelidos.a) || {}, travas: (meta.travas && meta.travas.t) || {},
    convenios: (meta.convenios && meta.convenios.c) || {}, notas: (meta.notas && meta.notas.n) || {},
    etiquetas: (meta.etiquetas && meta.etiquetas.e) || null,
  });
  if (!A.E.eventos) A.E.eventos = [];
  S.ultimo = foto(A.E);
}

/** Retrato do que está gravado na nuvem (texto estável por entidade) — base para gravar só a diferença. */
function foto(E) {
  const f = { vagas: new Map(), pac: new Map(), est: {}, mapas: {}, etq: estavel(null), ev: new Set(), docsVaga: new Set() };
  MAPAS.forEach(([nome]) => { f.mapas[nome] = new Map(); });
  if (!E) return f;
  E.vagas.forEach(v => { f.vagas.set(v.id, estavel(v)); f.docsVaga.add(docVaga(v)); });
  Object.entries(E.pacientes || {}).forEach(([id, p]) => f.pac.set(id, estavel(p)));
  camposEstado(E).forEach(k => { f.est[k] = estavel(E[k]); });
  MAPAS.forEach(([nome]) => Object.entries(E[nome] || {}).forEach(([k, v]) => f.mapas[nome].set(k, estavel(v))));
  f.etq = estavel(E.etiquetas || null);
  (E.eventos || []).forEach(ev => f.ev.add(chaveEv(ev)));
  return f;
}
/** Volta o estado local para o último retrato da nuvem (quem só visualiza não altera nada). */
function reverter() {
  const u = S.ultimo, E = A.E; if (!E || !u) return;
  E.vagas = [...u.vagas.values()].map(j => JSON.parse(j));
  E.pacientes = Object.fromEntries([...u.pac.entries()].map(([k, j]) => [k, JSON.parse(j)]));
  Object.entries(u.est).forEach(([k, j]) => { E[k] = j === 'undefined' ? undefined : JSON.parse(j); });
  MAPAS.forEach(([nome]) => { E[nome] = Object.fromEntries([...u.mapas[nome].entries()].map(([k, j]) => [k, JSON.parse(j)])); });
  E.etiquetas = JSON.parse(u.etq);
  E.eventos = (E.eventos || []).filter(ev => u.ev.has(chaveEv(ev)));
  A.render();
}

// =====================================================================
// gravação: só o que mudou
// =====================================================================
let agendado = false;
function salvar() {
  if (agendado) return;
  agendado = true;
  queueMicrotask(() => { agendado = false; gravar().catch(erroGravar); });
}
function mudouAlgo(E) { const f = foto(E), u = S.ultimo; return estavel([...f.vagas]) !== estavel([...u.vagas]) || estavel([...f.pac]) !== estavel([...u.pac]); }

async function gravar() {
  const E = A.E, u = S.ultimo;
  if (!E || !u || !S.papel || S.migrando) return;
  if (!A.podeEditar()) {
    if (mudouAlgo(E)) { reverter(); A.toast('Seu usuário só visualiza — nada foi alterado.', 'shield'); }
    return;
  }
  const prog = A.ehProgramador();
  const docs = new Map();
  const put = (col, id, campo, chave, valor) => {
    const k = col + '/' + id;
    let d = docs.get(k);
    if (!d) docs.set(k, d = { ref: doc(db, col, id), data: {}, campos: [] });
    if (chave == null) { d.data[campo] = valor; d.campos.push(campo); }
    else { (d.data[campo] = d.data[campo] || {})[chave] = valor; d.campos.push(new FieldPath(campo, chave)); }
  };
  const inteiros = [], apagar = [];

  // vagas: escala nova (ids diferentes) reescreve as páginas por salão/turno; senão, só as vagas alteradas
  const ids = new Set(E.vagas.map(v => v.id));
  const estrutura = ids.size !== u.vagas.size || [...ids].some(id => !u.vagas.has(id));
  if (estrutura) {
    if (!prog) { reverter(); return A.toast('Só o laboratório importa uma escala nova.', 'shield'); }
    const porDoc = {};
    E.vagas.forEach(v => { (porDoc[docVaga(v)] = porDoc[docVaga(v)] || {})[v.id] = copia(v); });
    Object.entries(porDoc).forEach(([id, mapa]) => inteiros.push({ ref: doc(db, C.vagas, id), data: { v: mapa } }));
    u.docsVaga.forEach(id => { if (!porDoc[id]) apagar.push(doc(db, C.vagas, id)); });
    put(C.meta, 'estado', '_ordem', null, E.vagas.map(v => v.id));
  } else {
    E.vagas.forEach(v => { if (estavel(v) !== u.vagas.get(v.id)) put(C.vagas, docVaga(v), 'v', v.id, copia(v)); });
  }
  // pacientes (16 páginas; cada paciente é um campo)
  Object.entries(E.pacientes || {}).forEach(([id, p]) => { if (estavel(p) !== u.pac.get(id)) put(C.pacientes, balde(id), 'p', id, copia(p)); });
  u.pac.forEach((_, id) => { if (!E.pacientes || !E.pacientes[id]) put(C.pacientes, balde(id), 'p', id, deleteField()); });
  // configuração do mês (referência, regras, arquivos…) — só programador
  if (prog) {
    camposEstado(E).forEach(k => { if (estavel(E[k]) !== u.est[k]) put(C.meta, 'estado', k, null, E[k] === undefined ? deleteField() : copia(E[k])); });
    Object.keys(u.est).forEach(k => { if (!(k in E)) put(C.meta, 'estado', k, null, deleteField()); });
    if (estavel(E.etiquetas || null) !== u.etq) put(C.meta, 'etiquetas', 'e', null, copia(E.etiquetas || null));
  }
  // apelidos, travas, convênios e observações: uma chave por vez
  MAPAS.forEach(([nome, campo]) => {
    const atual = E[nome] || {}, ant = u.mapas[nome];
    Object.entries(atual).forEach(([k, v]) => { if (estavel(v) !== ant.get(k)) put(C.meta, nome, campo, k, copia(v)); });
    ant.forEach((_, k) => { if (!(k in atual)) put(C.meta, nome, campo, k, deleteField()); });
  });
  // movimentações novas (somente inclusão, por mês)
  const novos = (E.eventos || []).filter(ev => !u.ev.has(chaveEv(ev)));
  if (!docs.size && !inteiros.length && !apagar.length && !novos.length) return;

  if (docs.has(C.meta + '/estado')) { const d = docs.get(C.meta + '/estado'); d.data.atualizadoEm = serverTimestamp(); d.data.atualizadoPor = quem(); d.campos.push('atualizadoEm', 'atualizadoPor'); }
  const lotes = []; let b = writeBatch(db), n = 0;
  const conta = () => { if (++n >= 400) { lotes.push(b); b = writeBatch(db); n = 0; } };
  inteiros.forEach(x => { b.set(x.ref, x.data); conta(); });
  apagar.forEach(r => { b.delete(r); conta(); });
  docs.forEach(d => { b.set(d.ref, d.data, { mergeFields: d.campos }); conta(); });
  const porMes = {};
  novos.forEach(ev => { (porMes[mesDe(ev.ts)] = porMes[mesDe(ev.ts)] || []).push(copia(ev)); });
  Object.entries(porMes).forEach(([mes, lista]) => { b.set(doc(db, C.eventos, mes), { lista: arrayUnion(...lista) }, { merge: true }); conta(); });
  lotes.push(b);

  S.ultimo = foto(E);                 // otimista: a próxima diferença já parte daqui
  status('salvando');
  S.pendentes++;
  try { for (const x of lotes) await x.commit(); }
  finally { S.pendentes--; }
  status(S.pendentes ? 'salvando' : 'salvo');
}

function erroGravar(e) {
  console.error('gravar', e);
  status('erro');
  if (e && e.code === 'permission-denied') {
    A.toast('O servidor recusou a gravação (sem permissão). Recarregando os dados…', 'alert');
    recarregar();
  } else A.toast('Não consegui gravar na nuvem: ' + msgErro(e), 'alert');
}
async function recarregar() {
  try { await carregar(); A.render(); } catch (e) { console.error(e); }
}

const elStatus = () => document.getElementById('nuvem-status');
let tStatus = null;
function status(s) {
  const el = elStatus(); if (!el) return;
  clearTimeout(tStatus);
  el.hidden = false;
  el.dataset.s = !navigator.onLine && s === 'salvando' ? 'offline' : s;
  el.textContent = ({ salvando: 'Salvando…', salvo: 'Salvo na nuvem', erro: 'Erro ao salvar', offline: 'Sem internet — envia ao reconectar' })[el.dataset.s];
  if (s === 'salvo') tStatus = setTimeout(() => { el.hidden = true; }, 2500);
}
window.addEventListener('beforeunload', e => { if (S.pendentes) { e.preventDefault(); e.returnValue = ''; } });
window.addEventListener('online', () => { if (S.pendentes) status('salvando'); });

// =====================================================================
// tempo real: o que os outros mudam chega aqui
// =====================================================================
let tRender = null;
function agendarRender() {
  clearTimeout(tRender);
  tRender = setTimeout(() => {
    const ativo = document.activeElement;
    if (ativo && ativo.closest && ativo.closest('#conteudo') && /INPUT|TEXTAREA|SELECT/.test(ativo.tagName)) {
      ativo.addEventListener('blur', () => agendarRender(), { once: true });   // não apaga o que a pessoa está digitando
      return;
    }
    A.render();
  }, 250);
}
/** Mescla por entidade: se a pessoa não mexeu localmente naquela vaga/paciente/chave, vale o que veio da nuvem. */
function mesclarMapa(local, remoto, base, setLocal, delLocal) {
  let mudou = false;
  Object.entries(remoto).forEach(([k, rv]) => {
    const jr = estavel(rv), jl = local[k] === undefined ? undefined : estavel(local[k]);
    if (jl === jr) { base.set(k, jr); return; }
    // aplica se aqui ninguém mexeu: entidade nova (não existia aqui nem na base) ou igual à base
    if (jl === undefined ? !base.has(k) : jl === base.get(k)) { setLocal(k, rv); mudou = true; }
    base.set(k, jr);
  });
  return mudou;
}
function ouvir() {
  S.ouvintes.forEach(off => off()); S.ouvintes = [];
  const viver = (col, fn) => S.ouvintes.push(onSnapshot(collection(db, col), snap => {
    if (!A.E || S.migrando) return;   // a visão local já inclui nossas gravações pendentes: dá para mesclar sempre
    let mudou = false;
    snap.docChanges().forEach(ch => { if (fn(ch)) mudou = true; });
    if (mudou) agendarRender();
  }, e => console.warn('tempo real', col, e)));

  viver(C.vagas, ch => {
    const E = A.E, u = S.ultimo, remoto = ch.type === 'removed' ? {} : ch.doc.data().v || {};
    if (Object.keys(remoto).some(id => !u.vagas.has(id))) { recarregar(); A.toast('A escala foi atualizada pelo laboratório.', 'sync'); return false; }
    const idx = new Map(E.vagas.map((v, i) => [v.id, i]));
    const local = {}; Object.keys(remoto).forEach(id => { if (idx.has(id)) local[id] = E.vagas[idx.get(id)]; });
    return mesclarMapa(local, remoto, u.vagas, (id, v) => { E.vagas[idx.get(id)] = copia(v); }, null);
  });
  viver(C.pacientes, ch => {
    const E = A.E, u = S.ultimo, remoto = ch.type === 'removed' ? {} : ch.doc.data().p || {};
    let mudou = mesclarMapa(E.pacientes, remoto, u.pac, (id, p) => { E.pacientes[id] = copia(p); });
    // removidos lá (e intocados aqui)
    [...u.pac.keys()].filter(id => balde(id) === ch.doc.id && !(id in remoto)).forEach(id => {
      if (E.pacientes[id] && estavel(E.pacientes[id]) === u.pac.get(id)) { delete E.pacientes[id]; mudou = true; }
      u.pac.delete(id);
    });
    return mudou;
  });
  viver(C.meta, ch => {
    const E = A.E, u = S.ultimo, d = ch.type === 'removed' ? {} : ch.doc.data();
    const id = ch.doc.id;
    if (id === 'estado') {
      let mudou = false;
      Object.entries(d).forEach(([k, v]) => {
        if (['_ordem', 'atualizadoEm', 'atualizadoPor'].includes(k)) return;
        const jr = estavel(v);
        if (estavel(E[k]) !== jr && estavel(E[k]) === u.est[k]) { E[k] = copia(v); mudou = true; }
        u.est[k] = jr;
      });
      return mudou;
    }
    if (id === 'etiquetas') {
      const jr = estavel(d.e || null);
      if (estavel(E.etiquetas || null) !== jr && estavel(E.etiquetas || null) === u.etq) { E.etiquetas = copia(d.e || null); u.etq = jr; return true; }
      u.etq = jr; return false;
    }
    const mapa = MAPAS.find(([nome]) => nome === id); if (!mapa) return false;
    const [nome, campo] = mapa, remoto = d[campo] || {}, base = u.mapas[nome];
    E[nome] = E[nome] || {};
    let mudou = mesclarMapa(E[nome], remoto, base, (k, v) => { E[nome][k] = copia(v); });
    [...base.keys()].filter(k => !(k in remoto)).forEach(k => {
      if (k in E[nome] && estavel(E[nome][k]) === base.get(k)) { delete E[nome][k]; mudou = true; }
      base.delete(k);
    });
    return mudou;
  });
  S.ouvintes.push(onSnapshot(doc(db, C.eventos, mesDe()), snap => {
    if (!A.E || S.migrando || !snap.exists()) return;
    const E = A.E, u = S.ultimo;
    const novos = (snap.data().lista || []).filter(ev => !u.ev.has(chaveEv(ev)));
    if (!novos.length) return;
    novos.forEach(ev => u.ev.add(chaveEv(ev)));
    E.eventos = [...novos, ...E.eventos].sort((a, b) => b.ts.localeCompare(a.ts)).slice(0, 300);
    agendarRender();
  }, e => console.warn('tempo real eventos', e)));
}

// =====================================================================
// resultados e TXT na nuvem (documentos fatiados)
// =====================================================================
const PARTE = 400000;   // caracteres por fatia (≤ ~800 KB mesmo com acentos)
async function gravarGrande(col, id, meta, texto) {
  const ant = await getDoc(doc(db, col, id));
  const nAnt = ant.exists() ? ant.data().partes || 0 : 0, n = Math.max(1, Math.ceil(texto.length / PARTE));
  const b = writeBatch(db);
  b.set(doc(db, col, id), Object.assign({}, meta, { partes: n, atualizadoEm: serverTimestamp(), por: quem() }));
  for (let i = 0; i < n; i++) b.set(doc(db, col, `${id}~${i}`), { pai: id, i, d: texto.slice(i * PARTE, (i + 1) * PARTE) });
  for (let i = n; i < nAnt; i++) b.delete(doc(db, col, `${id}~${i}`));
  await b.commit();
}
async function lerGrande(col, id, n) {
  const partes = await Promise.all(Array.from({ length: n }, (_, i) => getDoc(doc(db, col, `${id}~${i}`))));
  return partes.map(p => (p.exists() ? p.data().d : '')).join('');
}
async function apagarGrande(col, id) {
  const m = await getDoc(doc(db, col, id)); if (!m.exists()) return;
  const b = writeBatch(db);
  for (let i = 0; i < (m.data().partes || 0); i++) b.delete(doc(db, col, `${id}~${i}`));
  b.delete(doc(db, col, id));
  await b.commit();
}
const armazemNuvem = {
  async carregar() {
    const s = await getDocs(collection(db, C.lotes));
    const metas = [], partes = {};
    s.forEach(d => { const x = d.data(); if (x.pai) (partes[x.pai] = partes[x.pai] || [])[x.i] = x.d; else metas.push(x); });
    return metas.map(m => { try { return JSON.parse((partes[m.id] || []).join('')); } catch (e) { console.warn('lote corrompido', m.id); return null; } }).filter(Boolean);
  },
  async salvar(lote, arq) {
    const bytes = arq.bytes instanceof Uint8Array ? arq.bytes : new Uint8Array(arq.bytes);
    await gravarGrande(C.txt, lote.id, { id: lote.id, nome: arq.nome, tipo: arq.tipo || 'text/plain', tamanho: bytes.length }, b64DeBytes(bytes));
    const l = Object.assign({}, lote); delete l._bytes;
    await gravarGrande(C.lotes, lote.id, { id: lote.id, competencia: lote.competencia, arquivo: lote.arquivo, importadoEm: lote.importadoEm }, JSON.stringify(l));
  },
  async arquivo(id) {
    const m = await getDoc(doc(db, C.txt, id)); if (!m.exists()) return null;
    const x = m.data();
    return { id, nome: x.nome, tipo: x.tipo, bytes: bytesDeB64(await lerGrande(C.txt, id, x.partes || 0)) };
  },
  async excluir(id) { await apagarGrande(C.lotes, id); await apagarGrande(C.txt, id); },
  async limpar() { throw new Error('Na versão online, exclua os resultados mês a mês.'); },
};

// =====================================================================
// integração: o sistema do laboratório grava o TXT em medrim_entrada
// =====================================================================
async function processarEntrada() {
  const s = await getDocs(query(collection(db, C.entrada), where('processado', '==', false)));
  if (s.empty) return 0;
  let ok = 0;
  for (const d of s.docs) {
    const x = d.data();
    try {
      let bytes = bytesDeB64(x.base64 || '');
      if (x.codificacao === 'gzip-base64') bytes = await gunzip(bytes);
      const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      const r = M.lerTxtResultados(buf);
      if (!Object.keys(r.pacientes).length) throw new Error('TXT sem registros 01 (paciente).');
      const comp = /^\d{4}-\d{2}$/.test(x.competencia || '') ? x.competencia : A.adivinharCompetencia(x.nome || '', r.datas);
      await A.salvarLoteResultados({ name: x.nome || `integracao-${comp}.txt`, type: 'text/plain' }, buf, r, comp, true);
      await updateDoc(d.ref, { processado: true, processadoEm: serverTimestamp(), processadoPor: quem(), resultado: { competencia: comp, pacientes: Object.keys(r.pacientes).length, resultados: r.nResultados } });
      ok++;
    } catch (e) {
      await updateDoc(d.ref, { processado: true, processadoEm: serverTimestamp(), erro: String((e && e.message) || e) }).catch(() => {});
    }
  }
  if (ok) { A.render(); A.toast(`${ok} arquivo(s) de resultados recebidos pela integração`, 'download'); }
  return ok;
}

// =====================================================================
// migração: dados que estavam só neste navegador → nuvem
// =====================================================================
function lerLocal() {
  let E = null, fixos = {};
  try { E = JSON.parse(localStorage.getItem('medrim:v1')); } catch (e) { /* ok */ }
  try { fixos = JSON.parse(localStorage.getItem('medrim:fixos')) || {}; } catch (e) { /* ok */ }
  if (E && !E.travas && fixos.travas) E.travas = fixos.travas;
  if (E && !E.convenios && fixos.convenios) E.convenios = fixos.convenios;
  return E;
}
async function escreverTudo(E) {
  const lotes = []; let b = writeBatch(db), n = 0;
  const add = (ref, data) => { b.set(ref, data); if (++n >= 400) { lotes.push(b); b = writeBatch(db); n = 0; } };
  const porDoc = {};
  E.vagas.forEach(v => { (porDoc[docVaga(v)] = porDoc[docVaga(v)] || {})[v.id] = copia(v); });
  Object.entries(porDoc).forEach(([id, mapa]) => add(doc(db, C.vagas, id), { v: mapa }));
  const baldes = {}; for (let i = 0; i < 16; i++) baldes['b' + String(i).padStart(2, '0')] = {};
  Object.entries(E.pacientes || {}).forEach(([id, p]) => { baldes[balde(id)][id] = copia(p); });
  Object.entries(baldes).forEach(([id, mapa]) => add(doc(db, C.pacientes, id), { p: mapa }));
  const est = {}; camposEstado(E).forEach(k => { if (E[k] !== undefined) est[k] = copia(E[k]); });
  est._ordem = E.vagas.map(v => v.id); est.atualizadoEm = serverTimestamp(); est.atualizadoPor = quem();
  add(doc(db, C.meta, 'estado'), est);
  MAPAS.forEach(([nome, campo]) => add(doc(db, C.meta, nome), { [campo]: copia(E[nome] || {}) }));
  add(doc(db, C.meta, 'etiquetas'), { e: copia(E.etiquetas || null) });
  const porMes = {};
  (E.eventos || []).forEach(ev => { (porMes[mesDe(ev.ts)] = porMes[mesDe(ev.ts)] || []).push(copia(ev)); });
  Object.entries(porMes).forEach(([mes, lista]) => add(doc(db, C.eventos, mes), { lista }));
  lotes.push(b);
  for (const x of lotes) await x.commit();
}

function vMigrar() {
  if (!A.ehProgramador()) return '<div class="card vazio">Só o programador envia dados para a nuvem.</div>';
  if (A.E && A.E.vagas && A.E.vagas.length && !S.migrar) return `<div class="card"><h2>Os dados já estão na nuvem</h2><p class="desc">Para substituir tudo por um backup, use Importar arquivos → Restaurar backup.</p>
    ${temLocal() ? `<button class="btn perigo" data-mg="apagar-local">${ic('x')} Apagar a cópia antiga deste navegador</button>` : ''}</div>`;
  const E = lerLocal();
  if (!E || !E.vagas) return '<div class="card vazio">Este navegador não tem dados do MedRim para enviar. Abra o MedRim no computador onde a escala foi organizada.</div>';
  const n = (o) => Object.keys(o || {}).length;
  const etq = E.etiquetas && E.etiquetas.itens ? n(E.etiquetas.itens) : 0;
  return `<div class="card migrar">
    <div class="eyebrow" style="color:var(--muted)">Primeiro acesso à versão online</div>
    <h2 style="margin:6px 0">Enviar os dados deste navegador para a nuvem</h2>
    <p class="desc">Encontrei aqui o MedRim que você organizou. Enviando, ele passa a valer para todos os usuários com senha — e deixa de depender deste computador.</p>
    <div class="etq-kpis" style="margin:14px 0">
      <div><b class="mono">${E.vagas.length}</b><small>vagas na escala</small></div>
      <div><b class="mono">${n(E.pacientes)}</b><small>pacientes</small></div>
      <div><b class="mono">${n(E.travas)}</b><small>travas (outro lab.)</small></div>
      <div><b class="mono">${n(E.convenios)}</b><small>convênios</small></div>
      <div><b class="mono">${etq}</b><small>etiquetas</small></div>
      <div><b class="mono" id="mg-lotes">…</b><small>meses de resultados</small></div>
    </div>
    <div class="alerta-box info">${ic('shield')}<div>Vai para o Firestore do projeto <b>celulams</b>, protegido por login e pelas permissões de cada papel. Nada vai para o GitHub.</div></div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px"><button class="btn pri" data-mg="enviar">${ic('upload')} Enviar para a nuvem</button></div>
    <div class="login-msg" id="mg-msg" style="margin-top:10px"></div></div>`;
}
const temLocal = () => { try { return Object.keys(localStorage).some(k => k.startsWith('medrim:v1')) || !!localStorage.getItem('medrim:fixos'); } catch (e) { return false; } };
function ligarMigrar() {
  const el = document.getElementById('mg-lotes');
  if (el) A.armazemLocal.carregar().then(l => { el.textContent = l.length; }).catch(() => { el.textContent = '0'; });
  document.getElementById('conteudo').onclick = async e => {
    const b = e.target.closest('[data-mg]'); if (!b) return;
    const msg = t => { const m = document.getElementById('mg-msg'); if (m) m.textContent = t; };
    if (b.dataset.mg === 'apagar-local') {
      return A.abrirModal({ titulo: 'Apagar a cópia antiga', ic: 'x', cor: 'var(--crit)', corpo: '<p style="margin:0">Remove deste navegador a cópia do MedRim de antes da versão online (escala, pacientes, resultados). A nuvem não é alterada.</p>',
        botoes: [{ rot: 'Cancelar' }, { rot: 'Apagar', cls: 'rim', ic: 'x', acao: async () => {
          Object.keys(localStorage).filter(k => k.startsWith('medrim:v1') || k === 'medrim:fixos').forEach(k => localStorage.removeItem(k));
          try { await A.armazemLocal.limpar(); } catch (err) { /* ok */ }
          A.fechar(); A.render(); A.toast('Cópia antiga apagada deste navegador', 'check');
        } }] });
    }
    if (b.dataset.mg !== 'enviar') return;
    b.disabled = true;
    S.migrando = true;
    try {
      const E = lerLocal();
      msg('Enviando escala e pacientes…');
      A.E = E; A.normalizar();
      await escreverTudo(A.E);
      const lotes = await A.armazemLocal.carregar().catch(() => []);
      for (let i = 0; i < lotes.length; i++) {
        msg(`Enviando resultados (${i + 1}/${lotes.length})…`);
        const arq = await A.armazemLocal.arquivo(lotes[i].id).catch(() => null);
        if (arq) await armazemNuvem.salvar(lotes[i], arq);
      }
      S.migrar = null; S.migrando = false;
      await carregar(); await A.carregarResultados(); ouvir();
      A.evento('importacao', null, `Dados enviados para a nuvem: ${A.E.vagas.length} vagas, ${Object.keys(A.E.pacientes).length} pacientes${lotes.length ? `, ${lotes.length} mês(es) de resultados` : ''}`);
      A.salvar();
      location.hash = '#/painel'; A.render();
      A.toast('Pronto: o MedRim agora está na nuvem. A cópia antiga continua neste navegador até você apagar (Enviar dados → Apagar).', 'check');
    } catch (err) { console.error(err); S.migrando = false; b.disabled = false; msg('Falhou: ' + msgErro(err)); }
  };
}

// =====================================================================
// usuários e pedidos de acesso (programador)
// =====================================================================
async function contarPedidos() {
  try { S.pedidos = (await getDocs(collection(db, C.pedidos))).size; A.render(); } catch (e) { /* ok */ }
}
function vUsuarios() {
  return `<div class="grid g2" style="align-items:start">
    <section class="card"><h3>${ic('userplus')} Novo usuário</h3>
      <p class="desc">A pessoa entra com este e-mail e a senha inicial (pode trocar em “Esqueci a senha”).</p>
      <form id="f-novo" class="form-usuario" novalidate autocomplete="off">
        <label class="f">Nome<input name="nome" required maxlength="80" placeholder="Ex.: Enfermagem Salão 1"></label>
        <label class="f">E-mail<input name="email" type="email" required autocomplete="off"></label>
        <label class="f">Senha inicial (mín. 8)<input name="senha" type="password" minlength="8" required autocomplete="new-password"></label>
        <label class="f">Papel<select name="papel">${Object.entries(PAPEIS).map(([k, p]) => `<option value="${k}" ${k === 'enfermaria' ? 'selected' : ''}>${esc(p.rotulo)}</option>`).join('')}</select></label>
        <button class="btn pri" type="submit">${ic('check')} Criar acesso</button>
        <div class="login-msg" id="nv-msg"></div>
      </form></section>
    <section class="card"><h3>${ic('shield')} Papéis</h3>
      ${Object.entries(PAPEIS).map(([k, p]) => `<div class="papel-linha"><span class="chip b papel-${k}">${esc(p.rotulo)}</span><small>${esc(p.desc)}</small></div>`).join('')}
      <div class="alerta-box info" style="margin-top:10px">${ic('info')}<div>Pode ser uma conta por pessoa (melhor: o histórico mostra quem fez cada mudança) ou uma por setor. As permissões valem no servidor.</div></div></section>
  </div>
  <section class="card" style="margin-top:14px" id="sec-pedidos" hidden><h3>${ic('bell')} Pedidos de acesso</h3><p class="desc">Entraram com login do Célula, mas ainda não têm papel no MedRim.</p><div id="lista-pedidos"></div></section>
  <section class="card" style="margin-top:14px"><h3>${ic('userplus')} Usuários do MedRim</h3><div id="lista-usuarios"><div class="faint">Carregando…</div></div></section>`;
}
async function ligarUsuarios() {
  const c = document.getElementById('conteudo');
  const pintar = async () => {
    const [us, ps] = await Promise.all([getDocs(collection(db, C.usuarios)), getDocs(collection(db, C.pedidos))]);
    const lista = []; us.forEach(d => lista.push(Object.assign({ uid: d.id }, d.data())));
    lista.sort((a, b) => (a.ativo === false) - (b.ativo === false) || String(a.nome).localeCompare(String(b.nome)));
    const quando = t => (t && t.toDate ? t.toDate().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
    document.getElementById('lista-usuarios').innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Nome</th><th>E-mail</th><th>Papel</th><th>Último acesso</th><th></th></tr></thead><tbody>
      ${lista.map(u => `<tr class="${u.ativo === false ? 'nao-coleta' : ''}"><td><b>${esc(u.nome || '—')}</b>${u.uid === S.user.uid ? ' <span class="chip">você</span>' : ''}</td><td>${esc(u.email || '')}</td>
        <td><select class="sel-cand" data-u="papel" data-uid="${u.uid}" ${u.uid === S.user.uid ? 'disabled' : ''}>${Object.entries(PAPEIS).map(([k, p]) => `<option value="${k}" ${u.papel === k ? 'selected' : ''}>${esc(p.rotulo)}</option>`).join('')}</select></td>
        <td class="mono">${quando(u.ultimoAcesso)}</td>
        <td style="white-space:nowrap">${u.uid === S.user.uid ? '' : `<button class="btn sm ghost" data-u="ativo" data-uid="${u.uid}">${u.ativo === false ? ic('check') + ' Reativar' : ic('x') + ' Desativar'}</button>`}
          <button class="btn sm ghost" data-u="senha" data-email="${esc(u.email || '')}">${ic('shield')} Link de nova senha</button></td></tr>`).join('')}
      </tbody></table></div>`;
    const sec = document.getElementById('sec-pedidos'), lp = document.getElementById('lista-pedidos');
    sec.hidden = ps.empty;
    lp.innerHTML = ps.docs.map(d => { const p = d.data(); return `<div class="pedido"><div><b>${esc(p.nome || '')}</b><br><small>${esc(p.email || '')} · ${quando(p.em)}</small></div>
      <select class="sel-cand" id="pd-${d.id}">${Object.entries(PAPEIS).map(([k, x]) => `<option value="${k}" ${k === 'enfermaria' ? 'selected' : ''}>${esc(x.rotulo)}</option>`).join('')}</select>
      <button class="btn sm pri" data-u="liberar" data-uid="${d.id}">${ic('check')} Liberar</button><button class="btn sm ghost" data-u="recusar" data-uid="${d.id}">${ic('x')} Recusar</button></div>`; }).join('');
    S.pedidos = ps.size;
  };
  await pintar().catch(e => { document.getElementById('lista-usuarios').innerHTML = `<div class="alerta-box">${ic('alert')}<div>${esc(msgErro(e))}</div></div>`; });

  const f = document.getElementById('f-novo');
  f.onsubmit = async e => {
    e.preventDefault();
    const m = (t, bom) => { const el = document.getElementById('nv-msg'); el.textContent = t; el.classList.toggle('ok', !!bom); };
    const nome = f.nome.value.trim(), email = f.email.value.trim().toLowerCase(), senha = f.senha.value, papel = f.papel.value;
    if (nome.length < 2 || !/^\S+@\S+\.\S+$/.test(email)) return m('Preencha nome e e-mail.');
    if (senha.length < 8) return m('A senha inicial precisa ter pelo menos 8 caracteres.');
    const b = f.querySelector('button[type=submit]'); b.disabled = true; m('Criando…');
    const sec = initializeApp(firebaseConfig, 'medrim-novo-' + Date.now());
    try {
      const cred = await createUserWithEmailAndPassword(getAuth(sec), email, senha);
      await setDoc(doc(db, C.usuarios, cred.user.uid), { uid: cred.user.uid, email, nome, papel, ativo: true, criadoEm: serverTimestamp(), criadoPor: S.user.uid });
      await signOut(getAuth(sec)).catch(() => {});
      f.reset(); m(`Acesso criado: ${email} (${PAPEIS[papel].rotulo}). Envie a senha inicial por um canal seguro.`, true);
      await pintar();
    } catch (err) {
      m(err && err.code === 'auth/email-already-in-use'
        ? 'Este e-mail já tem conta no Firebase do Célula. Peça para a pessoa entrar uma vez no MedRim com a senha dela: o pedido aparece aqui embaixo para você liberar.'
        : msgErro(err));
    } finally { b.disabled = false; deleteApp(sec).catch(() => {}); }
  };

  c.onchange = async e => {
    const s = e.target; if (s.dataset.u !== 'papel') return;
    try { await updateDoc(doc(db, C.usuarios, s.dataset.uid), { papel: s.value, alteradoEm: serverTimestamp(), alteradoPor: S.user.uid }); A.toast('Papel alterado', 'shield'); }
    catch (err) { A.toast(msgErro(err), 'alert'); }
    pintar();
  };
  c.onclick = async e => {
    const b = e.target.closest('[data-u]'); if (!b || b.tagName === 'SELECT') return;
    const uid = b.dataset.uid;
    try {
      if (b.dataset.u === 'ativo') {
        const atual = (await getDoc(doc(db, C.usuarios, uid))).data();
        await updateDoc(doc(db, C.usuarios, uid), { ativo: atual.ativo === false, alteradoEm: serverTimestamp(), alteradoPor: S.user.uid });
        A.toast(atual.ativo === false ? 'Usuário reativado' : 'Usuário desativado (perde o acesso na hora)', 'shield');
      }
      if (b.dataset.u === 'senha') { await sendPasswordResetEmail(auth, b.dataset.email); A.toast('Link de nova senha enviado para ' + b.dataset.email, 'shield'); }
      if (b.dataset.u === 'liberar') {
        const p = (await getDoc(doc(db, C.pedidos, uid))).data();
        const papel = document.getElementById('pd-' + uid).value;
        await setDoc(doc(db, C.usuarios, uid), { uid, email: p.email, nome: p.nome, papel, ativo: true, criadoEm: serverTimestamp(), criadoPor: S.user.uid });
        await deleteDoc(doc(db, C.pedidos, uid));
        A.toast(`${p.email} liberado como ${PAPEIS[papel].rotulo}`, 'check');
      }
      if (b.dataset.u === 'recusar') { await deleteDoc(doc(db, C.pedidos, uid)); A.toast('Pedido recusado', 'x'); }
      await pintar(); A.render();
    } catch (err) { A.toast(msgErro(err), 'alert'); }
  };
}

// =====================================================================
// integração (documentação para o sistema do laboratório)
// =====================================================================
function vIntegracao() {
  const base = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents`;
  const pre = t => `<pre class="codigo">${esc(t)}</pre>`;
  return `<section class="card"><h2 style="margin-top:0">Integração com o sistema do laboratório</h2>
    <p class="desc">O seu sistema conversa com o MedRim pela API REST do Firestore, entrando com uma conta de papel <b>programador</b>
    (recomendado: uma conta só para a integração, ex.: <i>integracao@…</i>, criada em Usuários). As mesmas regras de segurança valem aqui.</p>
    <h3>1 · Entrar (token válido por 1 hora)</h3>
    ${pre(`POST https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${firebaseConfig.apiKey}
{ "email": "integracao@seudominio", "password": "…", "returnSecureToken": true }
→ idToken (use em: Authorization: Bearer <idToken>) · refreshToken (renova em securetoken.googleapis.com)`)}
    <h3>2 · Enviar o TXT de resultados (padrão Nephrosys)</h3>
    <p class="desc">Crie um documento em <code>medrim_entrada</code>. Quando o programador abrir o MedRim (ou clicar em “Processar agora”), o TXT vira o lote do mês,
    com histórico por paciente e o arquivo original disponível para a Hiperrim baixar.</p>
    ${pre(`POST ${base}/medrim_entrada
Authorization: Bearer <idToken>
{ "fields": {
    "nome":        { "stringValue": "Bateria_Nov_2026.txt" },
    "competencia": { "stringValue": "2026-11" },            ← opcional (AAAA-MM)
    "codificacao": { "stringValue": "base64" },              ← ou "gzip-base64" para arquivos grandes
    "base64":      { "stringValue": "<conteúdo do TXT em base64>" },
    "processado":  { "booleanValue": false },
    "criadoEm":    { "timestampValue": "2026-11-03T10:00:00Z" } } }
Limite: 1 MB por documento (com gzip-base64 cabe a anual com folga).`)}
    <h3>3 · Ler a lista de cadastro (pacientes e máquinas)</h3>
    ${pre(`GET ${base}/medrim_pacientes        → 16 páginas, campo "p" = { id: paciente }
GET ${base}/medrim_vagas            → 1 página por salão/turno (S1-M, S1-T…), campo "v" = { vagaId: vaga }
GET ${base}/medrim_meta/travas      → outro laboratório (não cadastrar)`)}
    <p class="desc">Paciente: nome, cpf, nasc, codigo (Hiperrim), controles {glic, cr, hbgl}, status, vagaId, bateriaManual (cadastro sem pedido).
    Vaga: salao, turno (M/T/N), grupo (SQS/TQS), maq, pacienteId.</p>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin:10px 0"><button class="btn pri" data-in="processar">${ic('sync')} Processar agora</button></div>
    <h3>Últimos recebidos</h3><div id="lista-entrada"><div class="faint">Carregando…</div></div></section>`;
}
async function ligarIntegracao() {
  const pintar = async () => {
    const s = await getDocs(collection(db, C.entrada));
    const l = []; s.forEach(d => { const x = d.data(); l.push({ id: d.id, nome: x.nome, comp: x.competencia, ok: x.processado, erro: x.erro, res: x.resultado, em: x.criadoEm, pr: x.processadoEm }); });
    l.sort((a, b) => String(b.id).localeCompare(String(a.id)));
    const q = t => (t && t.toDate ? t.toDate().toLocaleString('pt-BR') : typeof t === 'string' ? t : '—');
    document.getElementById('lista-entrada').innerHTML = l.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Arquivo</th><th>Competência</th><th>Situação</th><th>Recebido</th></tr></thead><tbody>
      ${l.slice(0, 30).map(x => `<tr><td><b>${esc(x.nome || x.id)}</b></td><td class="mono">${esc((x.res && x.res.competencia) || x.comp || '—')}</td>
        <td>${!x.ok ? '<span class="chip b" style="--cor:var(--warn)">na fila</span>' : x.erro ? `<span class="chip b" style="--cor:var(--crit)">erro</span> <small>${esc(x.erro)}</small>` : `<span class="chip b" style="--cor:var(--ok)">processado</span> <small>${x.res ? x.res.pacientes + ' pacientes · ' + x.res.resultados + ' resultados' : ''}</small>`}</td>
        <td><small>${q(x.em)}</small></td></tr>`).join('')}</tbody></table></div>` : '<div class="faint">Nada recebido ainda.</div>';
  };
  pintar().catch(e => { document.getElementById('lista-entrada').textContent = msgErro(e); });
  document.getElementById('conteudo').onclick = async e => {
    const b = e.target.closest('[data-in]'); if (!b) return;
    b.disabled = true;
    try { const n = await processarEntrada(); if (!n) A.toast('Nada novo na fila', 'info'); await pintar(); }
    catch (err) { A.toast(msgErro(err), 'alert'); } finally { b.disabled = false; }
  };
}

// =====================================================================
// ligação com o app
// =====================================================================
Object.assign(A.views, { vUsuarios, vIntegracao, vMigrar });
Object.assign(A.ligar, { usuarios: ligarUsuarios, integracao: ligarIntegracao, migrar: ligarMigrar });
M.nuvemApi = { salvar, sair, recarregar, processarEntrada, estavel, foto, balde, docVaga };
