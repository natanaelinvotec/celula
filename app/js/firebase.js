// firebase.js — núcleo compartilhado: app, auth, firestore, IA, sessão e utilitários.
// Todas as páginas importam daqui. Versão do SDK centralizada em V.
export const V = '12.3.0';
export const CDN = `https://www.gstatic.com/firebasejs/${V}/`;

import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, sendPasswordResetEmail, updatePassword, createUserWithEmailAndPassword, setPersistence, browserLocalPersistence } from 'https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js';

export const firebaseConfig = {
  apiKey: 'AIzaSyCY9DYFdxuVc1N1OO5Qk4KoE5nC77sETrE',
  authDomain: 'celulams.firebaseapp.com',
  projectId: 'celulams',
  storageBucket: 'celulams.firebasestorage.app',
  messagingSenderId: '458712694272',
  appId: '1:458712694272:web:80b53b6753510dcf13e2e5',
};

export const app = getApps()[0] || initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
setPersistence(auth, browserLocalPersistence).catch(() => {});

// ---------- utilitários de texto ----------
export const norm = s => (s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
export const slug = s => (s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
export const brl = v => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
export const fmtData = ts => { const d = ts?.toDate ? ts.toDate() : ts ? new Date(ts) : null; return d ? d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'; };
export const fmtDia = ts => { const d = ts?.toDate ? ts.toDate() : ts ? new Date(ts) : null; return d ? d.toLocaleDateString('pt-BR') : '—'; };
export const soDigitos = s => (s || '').replace(/\D/g, '');
export const iniciais = n => (n || '?').trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase();
export const SETORES = {
  'Próprio': { cor: 'var(--pro)', label: 'Realizado na Célula' }, 'Análises Clínicas': { cor: 'var(--ac)', label: 'DB · Análises Clínicas' },
  'Molecular': { cor: 'var(--mol)', label: 'DB · Molecular' }, 'Toxicológico': { cor: 'var(--tox)', label: 'DB · Toxicológico' },
  'Genômica': { cor: 'var(--gen)', label: 'DB · Genômica' }, 'Patologia': { cor: 'var(--pat)', label: 'DB · Patologia' },
};
export const SETOR_ORDEM = Object.keys(SETORES);

// ---------- sessão / papéis ----------
/** Espera o login; devolve { user, perfil }. Redireciona para login.html se não houver sessão. */
export function exigirLogin({ papel } = {}) {
  return new Promise(resolve => {
    const off = onAuthStateChanged(auth, async user => {
      off();
      if (!user) { location.replace('login.html?next=' + encodeURIComponent(location.pathname.split('/').pop())); return; }
      let perfil = (await getDoc(doc(db, 'usuarios', user.uid))).data();
      if (!perfil) {
        // primeiro acesso: cria o perfil; admin se o e-mail estiver na lista config/app.admins
        const cfg = (await getDoc(doc(db, 'config', 'app'))).data() || {};
        const isAdmin = (cfg.admins || []).map(e => e.toLowerCase()).includes((user.email || '').toLowerCase());
        perfil = { uid: user.uid, nome: user.displayName || user.email.split('@')[0], email: user.email, papel: isAdmin ? 'admin' : 'atendente', unidade: cfg.unidadePadrao || 'Coophavila', ativo: true, criadoEm: serverTimestamp() };
        await setDoc(doc(db, 'usuarios', user.uid), perfil);
      }
      if (perfil.ativo === false) { await signOut(auth); location.replace('login.html?inativo=1'); return; }
      if (papel === 'admin' && perfil.papel !== 'admin') { location.replace('orcamento.html'); return; }
      updateDoc(doc(db, 'usuarios', user.uid), { ultimoAcesso: serverTimestamp() }).catch(() => {});
      resolve({ user, perfil: { ...perfil, uid: user.uid } });
    });
  });
}
export const login = (email, senha) => signInWithEmailAndPassword(auth, email, senha);
export const sair = () => signOut(auth).then(() => location.replace('login.html'));
export const resetSenha = email => sendPasswordResetEmail(auth, email);
export const trocarSenha = nova => updatePassword(auth.currentUser, nova);

/** Admin cria usuário sem perder a própria sessão: usa uma instância secundária do app. */
export async function criarUsuario({ email, senha, nome, papel, unidade, fotoBase64 }) {
  const sec = initializeApp(firebaseConfig, 'secundario-' + Date.now());
  const secAuth = getAuth(sec);
  try {
    const cred = await createUserWithEmailAndPassword(secAuth, email, senha);
    await setDoc(doc(db, 'usuarios', cred.user.uid), { uid: cred.user.uid, nome, email, papel, unidade, fotoBase64: fotoBase64 || null, ativo: true, criadoEm: serverTimestamp(), criadoPor: auth.currentUser.uid });
    await signOut(secAuth);
    return cred.user.uid;
  } finally { await sec.delete().catch(() => {}); }
}

// ---------- tema ----------
export function temaInit() {
  try { const t = localStorage.getItem('tema'); if (t) document.documentElement.dataset.theme = t; } catch {}
  document.querySelectorAll('[data-tema]').forEach(b => b.addEventListener('click', () => {
    document.documentElement.dataset.theme = b.dataset.tema; try { localStorage.setItem('tema', b.dataset.tema); } catch {}
    document.querySelectorAll('[data-tema]').forEach(x => x.classList.toggle('on', x === b));
  }));
}
export function toast(msg, ok) {
  let t = document.getElementById('toast'); if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.textContent = msg; t.className = 'toast on' + (ok ? ' ok' : ''); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('on'), 3400);
}
/** Comprime uma imagem (File) para JPEG base64 — usado para foto de perfil (200px) e para a IA (1600px). */
export function comprimirImagem(file, max = 1600, q = .85) {
  return new Promise((res, rej) => { const img = new Image(); img.onload = () => { const s = Math.min(1, max / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); res(c.toDataURL('image/jpeg', q)); URL.revokeObjectURL(img.src); }; img.onerror = rej; img.src = URL.createObjectURL(file); });
}
export const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
