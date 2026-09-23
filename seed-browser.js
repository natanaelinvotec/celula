// Carga inicial do Firestore (CelulaMS) executada no navegador.
// Lê base_exames.json e db_guia.json do repositório GitHub e grava as coleções:
//   config/app, convenios/{slug}, exames/{mnemonico}, apelidos/{id}
const RAW = 'https://raw.githubusercontent.com/natanaelinvotec/celula/main/';
const firebaseConfig = {
  apiKey: "AIzaSyCY9DYFdxuVc1N1OO5Qk4KoE5nC77sETrE",
  authDomain: "celulams.firebaseapp.com",
  projectId: "celulams",
  storageBucket: "celulams.firebasestorage.app",
  messagingSenderId: "458712694272",
  appId: "1:458712694272:web:80b53b6753510dcf13e2e5",
};
const SETORES = {
  'Análises Clínicas': { cor: '#278d8c', lab: 'DB' },
  'Toxicológico':      { cor: '#935b0c', lab: 'DB' },
  'Genômica':          { cor: '#563085', lab: 'DB' },
  'Patologia':         { cor: '#8b2e3f', lab: 'DB' },
  'Molecular':         { cor: '#252d46', lab: 'DB' },
  'Próprio':           { cor: '#2563eb', lab: 'CELULA' },
};
const norm = s => (s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
const slug = s => (s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js');
const fs = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js');
const app = initializeApp(firebaseConfig);
const db = fs.getFirestore(app);

const [base, guia] = await Promise.all([
  fetch(RAW + 'base_exames.json').then(r => r.json()),
  fetch(RAW + 'db_guia.json').then(r => r.json()),
]);

const now = fs.serverTimestamp();
const docs = []; // [collection, id, data]

docs.push(['config', 'app', {
  versaoBase: '2026-09-23', origem: 'tabelas.pdf (AutoLAC) + guias DB Diagnósticos',
  prazoExtraDiasUteis: 2, setores: SETORES, atualizadoEm: now,
}]);

for (const nome of base.convenios) {
  docs.push(['convenios', slug(nome), { nome, slug: slug(nome), ativo: !/teste/i.test(nome), planos: ['Único'], atualizadoEm: now }]);
}

const apelidos = new Map(); // textoNorm -> mnemonico (evita duplicata)
for (const c of base.catalogo) {
  const precos = {}; for (const [k, v] of Object.entries(c.precos)) precos[slug(k)] = v;
  const setor = c.setor in SETORES ? c.setor : 'Análises Clínicas';
  docs.push(['exames', c.m, {
    mnemonico: c.m, nome: c.n, nomeBusca: norm(c.n), codigoTuss: c.c || null,
    setor, cor: SETORES[setor].cor, laboratorio: SETORES[setor].lab,
    prazoDias: c.prazo ?? null, prazoDb: c.prazo_db ?? null, mnemonicoDb: c.db_m || null,
    material: c.material || null, metodo: c.metodo || null, matchPrazo: c.match || (c.db_m ? 'mnemonico' : null),
    precos, ativo: true, atualizadoEm: now,
  }]);
  const t = norm(c.n); if (t && !apelidos.has(t)) apelidos.set(t, { texto: c.n, mnemonico: c.m, origem: 'catalogo' });
  const t2 = norm(c.n.replace(/\bRENAL\b/i, '')); if (t2 && !apelidos.has(t2)) apelidos.set(t2, { texto: c.n.replace(/\s*RENAL\b/i, ''), mnemonico: c.m, origem: 'catalogo' });
}
const byDb = {}; for (const c of base.catalogo) if (c.db_m) byDb[c.db_m] ??= c.m;
for (const g of guia) {
  const m = byDb[g.m] || (base.catalogo.find(c => c.m === g.m + '-DB') || {}).m; if (!m) continue;
  const t = norm(g.n); if (t && !apelidos.has(t)) apelidos.set(t, { texto: g.n, mnemonico: m, origem: 'guia_db' });
  const t2 = norm(g.m); if (t2 && !apelidos.has(t2)) apelidos.set(t2, { texto: g.m, mnemonico: m, origem: 'guia_db' });
}
for (const [textoNorm, a] of apelidos) {
  docs.push(['apelidos', slug(textoNorm).slice(0, 200) || 'x', { ...a, textoNorm, confirmacoes: 1, unidade: null, criadoEm: now }]);
}

const resumo = {}; for (const [c] of docs) resumo[c] = (resumo[c] || 0) + 1;
window.__seedDocs = docs;
let result;
if (window.__DRY_RUN) { result = { resumo, exemplo: docs.find(d => d[1] === 'VITD25-DB')[2] }; }
else {
  let n = 0;
  for (let i = 0; i < docs.length; i += 400) {
    const b = fs.writeBatch(db);
    for (const [col, id, data] of docs.slice(i, i + 400)) b.set(fs.doc(db, col, id), data);
    await b.commit(); n += Math.min(400, docs.length - i);
    console.log('[seed] gravados', n, '/', docs.length);
  }
  result = { gravados: n, resumo };
}
result;
