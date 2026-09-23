// pedidos-ia-db.js — acesso ao Firestore (CelulaMS) para a página Pedidos por IA.
// Uso: <script type="module"> import { PedidosDB } from './pedidos-ia-db.js'; ...
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getFirestore, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, collection, query, where,
  orderBy, limit, increment, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

export const firebaseConfig = {
  apiKey: 'AIzaSyCY9DYFdxuVc1N1OO5Qk4KoE5nC77sETrE',
  authDomain: 'celulams.firebaseapp.com',
  projectId: 'celulams',
  storageBucket: 'celulams.firebasestorage.app',
  messagingSenderId: '458712694272',
  appId: '1:458712694272:web:80b53b6753510dcf13e2e5',
};

export const norm = s => (s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
export const slug = s => (s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Cache em memória: o catálogo inteiro (1.364 docs) é pequeno e muda raramente.
let _catalogo = null;

export const PedidosDB = {
  async config() { return (await getDoc(doc(db, 'config', 'app'))).data(); },

  async convenios() {
    const snap = await getDocs(collection(db, 'convenios'));
    return snap.docs.map(d => d.data()).filter(c => c.ativo).sort((a, b) => a.nome.localeCompare(b.nome)); // ordena no cliente: evita índice composto
  },

  async catalogo() {
    if (_catalogo) return _catalogo;
    const snap = await getDocs(collection(db, 'exames'));
    _catalogo = snap.docs.map(d => d.data());
    return _catalogo;
  },

  async exame(mnemonico) { return (await getDoc(doc(db, 'exames', mnemonico))).data() || null; },

  /** Preço e prazo de um exame para um convênio (slug), considerando preços manuais gravados pela recepção. */
  async precoPrazo(mnemonico, convenioSlug) {
    const ex = await this.exame(mnemonico); if (!ex) return null;
    let valor = ex.precos?.[convenioSlug] ?? null, prazoDias = ex.prazoDias ?? null, origem = 'tabela';
    if (valor == null || prazoDias == null) {
      const man = (await getDoc(doc(db, 'precos_manuais', `${mnemonico}__${convenioSlug}`))).data();
      if (man) { valor = valor ?? man.valor; prazoDias = prazoDias ?? man.prazoDias; origem = 'manual'; }
    }
    return { mnemonico, nome: ex.nome, setor: ex.setor, cor: ex.cor, codigoTuss: ex.codigoTuss, valor, prazoDias, origem };
  },

  /** Resolve um texto lido no pedido (manuscrito/impresso) para candidatos do catálogo. */
  async resolver(textoLido) {
    const t = norm(textoLido); if (!t) return [];
    // 1) apelido exato (aprendizado da recepção tem prioridade pelo nº de confirmações)
    const ap = await getDocs(query(collection(db, 'apelidos'), where('textoNorm', '==', t), limit(5)));
    if (!ap.empty) return ap.docs.map(d => d.data()).sort((a, b) => b.confirmacoes - a.confirmacoes)
      .map(a => ({ mnemonico: a.mnemonico, confianca: 0.97, via: 'apelido' }));
    // 2) mnemônico digitado
    const cat = await this.catalogo();
    const byM = cat.find(c => c.mnemonico === textoLido.trim().toUpperCase());
    if (byM) return [{ mnemonico: byM.mnemonico, confianca: 0.99, via: 'mnemonico' }];
    // 3) busca por tokens no nome (todas as palavras contidas)
    const toks = t.split(' ').filter(w => w.length > 1);
    const hits = cat.filter(c => toks.every(w => c.nomeBusca.includes(w)))
      .sort((a, b) => ((b.precos?.particular != null) - (a.precos?.particular != null)) || a.nomeBusca.length - b.nomeBusca.length)
      .slice(0, 5);
    return hits.map((c, i) => ({ mnemonico: c.mnemonico, confianca: i === 0 ? 0.75 : 0.6, via: 'nome' }));
  },

  /** Aprendizado: a recepção confirmou que "textoLido" é o exame "mnemonico". */
  async ensinar(textoLido, mnemonico, unidade = null) {
    const textoNorm = norm(textoLido); const id = slug(textoNorm).slice(0, 200);
    const ref = doc(db, 'apelidos', id);
    const cur = await getDoc(ref);
    if (cur.exists()) return updateDoc(ref, { confirmacoes: increment(1), mnemonico, unidade, atualizadoEm: serverTimestamp() });
    return setDoc(ref, { texto: textoLido, textoNorm, mnemonico, origem: 'recepcao', confirmacoes: 1, unidade, criadoEm: serverTimestamp() });
  },

  /** Valor/prazo informados manualmente para um exame sem preço no convênio. */
  async precoManual(mnemonico, convenioSlug, valor, prazoDias, unidade = null) {
    return setDoc(doc(db, 'precos_manuais', `${mnemonico}__${convenioSlug}`),
      { mnemonico, convenio: convenioSlug, valor, prazoDias, unidade, atualizadoEm: serverTimestamp() }, { merge: true });
  },

  async gravarOrcamento(o) {
    const ref = await addDoc(collection(db, 'orcamentos'), { status: 'gravado', ...o, criadoEm: serverTimestamp() });
    return ref.id;
  },
};
