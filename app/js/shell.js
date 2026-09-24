// shell.js — barra lateral + topo comuns a todas as páginas logadas.
import { sair, temaInit, iniciais, escapeHtml } from './firebase.js';

const ICONS = {
  novo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  hist: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16v16H4z"/><path d="M8 9h8M8 13h8M8 17h5"/></svg>',
  dash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="8" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/><rect x="13" y="13" width="8" height="8" rx="2"/></svg>',
  sol: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="9"/></svg>',
  cat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h10"/></svg>',
  usr: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
  exp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 4v12m0 0l-4-4m4 4l4-4M4 20h16"/></svg>',
  cfg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2m10-10 2-2"/></svg>',
  out: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 4H5v16h5M14 8l4 4-4 4M18 12H9"/></svg>',
};
const SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5"/></svg>';
const MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';

/**
 * Monta o shell. `ativo` = chave da página atual; `paginas` opcional para páginas do painel (hash routing).
 */
export function montarShell({ perfil, ativo, titulo, subtitulo, painel = false }) {
  const admin = perfil.papel === 'admin';
  const links = painel
    ? [['dash', 'Dashboard', '#dash'], ['sol', 'Solicitações', '#sol', 'badgeSol'], ['hist', 'Orçamentos', '#orc'], ['cat', 'Catálogo de exames', '#cat'], ['usr', 'Usuários', '#usr'], ['exp', 'Exportar atendimentos', '#exp']]
    : [['novo', 'Novo orçamento (IA)', 'orcamento.html'], ['hist', 'Meus orçamentos', 'orcamentos.html', 'badgeSol']];
  const extra = painel ? [['novo', 'Novo orçamento (IA)', 'orcamento.html']] : (admin ? [['dash', 'Painel gerencial', 'painel.html']] : []);
  const nav = l => `<a class="nav ${l[0] === ativo ? 'on' : ''}" href="${l[2]}" data-k="${l[0]}">${ICONS[l[0]]}<span class="t">${l[1]}</span>${l[3] ? `<span class="badge" id="${l[3]}" hidden></span>` : ''}</a>`;
  const foto = perfil.fotoBase64 ? `<img src="${perfil.fotoBase64}" alt="">` : escapeHtml(iniciais(perfil.nome));
  document.body.insertAdjacentHTML('afterbegin', `<div class="app">
  <aside class="side">
    <div class="brand"><img src="img/logo-celula.png" alt="Célula Diagnósticos"><div><small>${painel ? 'Painel Gerencial' : 'Pedidos por IA'}</small></div></div>
    ${links.map(nav).join('')}
    ${extra.length ? '<div style="border-top:1px solid var(--line);margin:8px 6px"></div>' + extra.map(nav).join('') : ''}
    <div class="grow"></div>
    <div class="side-card" id="sideCard"><b>${escapeHtml(perfil.unidade || '')}</b>${escapeHtml(perfil.nome)} · ${admin ? 'administrador(a)' : 'atendente'}</div>
    <a class="nav ${ativo === 'cfg' ? 'on' : ''}" href="${painel ? '#cfg' : 'conta.html'}" data-k="cfg">${ICONS.cfg}<span class="t">${painel ? 'Configurações' : 'Minha conta'}</span></a>
    <button class="nav" id="btnSair">${ICONS.out}<span class="t">Sair</span></button>
  </aside>
  <main class="main">
    <div class="top">
      <h1 id="pgTitulo">${escapeHtml(titulo)}<small id="pgSub">${escapeHtml(subtitulo || '')}</small></h1>
      <div class="sp"></div>
      ${admin ? '' : `<select class="sel-st" id="selStatus" title="Seu status para a gestão"><option value="online">🟢 Online</option><option value="pausa">🟠 Pausa</option><option value="almoco">🍽️ Almoço</option><option value="finalizado">⚪ Finalizado</option></select>`}
      <div class="seg"><button data-tema="light" title="Tema claro">${SUN}</button><button data-tema="dark" title="Tema escuro">${MOON}</button></div>
      <div class="user"><span class="av">${foto}</span><span>${escapeHtml(perfil.nome.split(' ')[0])}<small style="display:block;font-size:.72rem;color:var(--muted)">${admin ? 'Administrador(a)' : 'Atendente'}</small></span></div>
    </div>
    <div id="conteudo"></div>
  </main></div>`);
  document.getElementById('btnSair').addEventListener('click', sair);
  const sel = document.getElementById('selStatus');
  if (sel) { sel.value = perfil.status || 'online'; sel.addEventListener('change', async () => { try { const D = await import('./dados.js'); await D.setStatusAtendente(sel.value); } catch (e) { console.warn(e); } }); if (!perfil.status) import('./dados.js').then(D => D.setStatusAtendente('online')).catch(() => {}); }
  temaInit();
  const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light');
  document.querySelectorAll('[data-tema]').forEach(b => b.classList.toggle('on', b.dataset.tema === cur));
  return document.getElementById('conteudo');
}
export function setTitulo(t, s) { document.getElementById('pgTitulo').firstChild.textContent = t; document.getElementById('pgSub').textContent = s || ''; }
