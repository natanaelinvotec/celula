// painel.js — Painel Gerencial (admin): dashboard, solicitações, orçamentos, catálogo, usuários, exportar, configurações.
import { exigirLogin, brl, fmtData, fmtDia, toast, escapeHtml, iniciais, comprimirImagem, criarUsuario, resetSenha, norm, SETORES, SETOR_ORDEM } from './firebase.js';
import { montarShell, setTitulo } from './shell.js';
import { montarHistorico, STATUS } from './historico.js';
import * as D from './dados.js';

const { perfil } = await exigirLogin({ papel: 'admin' });
const root = montarShell({ perfil, ativo: 'dash', titulo: 'Dashboard', painel: true });
const $ = id => document.getElementById(id);
const cfg = await D.config();
const TITLES = { dash: ['Dashboard', 'produção da central de atendimento'], sol: ['Solicitações de exames', 'exames lidos nos pedidos que ainda não existem no AutoLAC'], orc: ['Orçamentos', 'histórico de todas as atendentes'], cat: ['Catálogo de exames', 'valores por convênio, prazos e visibilidade'], usr: ['Usuários', 'equipe, papéis e senhas'], exp: ['Exportar atendimentos', 'quem veio coletar, por período e atendente'], cfg: ['Configurações', 'regras do sistema e sua conta'] };

// fila de solicitações em tempo real (badge + tela)
let pendentes = [], solSel = null, renderSol = null;
D.ouvirSolicitacoes('pendente', list => { pendentes = list; const b = $('badgeSol'); if (b) { b.textContent = list.length; b.hidden = !list.length; } if (location.hash === '#sol' && renderSol) renderSol(); });

// ---------- roteamento por hash ----------
const views = { dash: viewDash, sol: viewSol, orc: viewOrc, cat: viewCat, usr: viewUsr, exp: viewExp, cfg: viewCfg };
async function rota() {
  const k = (location.hash || '#dash').slice(1); const fn = views[k] || viewDash;
  document.querySelectorAll('.nav[data-k]').forEach(a => a.classList.toggle('on', a.dataset.k === (k === 'orc' ? 'hist' : k)));
  const [t, s] = TITLES[k] || TITLES.dash; setTitulo(t, s); root.innerHTML = '<div class="note" style="padding:30px">Carregando…</div>';
  try { await fn(); } catch (e) { root.innerHTML = `<div class="card"><div class="card-b">Erro: ${escapeHtml(e.message)}</div></div>`; console.error(e); }
}
addEventListener('hashchange', rota); rota();

// ===================== DASHBOARD =====================
async function viewDash() {
  const dias = 30; const rows = await D.orcamentosRecentes({ dias: 90 });
  const ini = new Date(); ini.setDate(1); ini.setHours(0, 0, 0, 0);
  const mes = rows.filter(r => (r.criadoEm?.toDate?.() || 0) >= ini);
  const conv = mes.filter(r => r.status === 'convertido');
  const totalOrc = mes.reduce((a, r) => a + (r.total || 0), 0), totalConv = conv.reduce((a, r) => a + (r.total || 0), 0);
  const taxa = mes.length ? Math.round(conv.length / mes.length * 100) : 0;
  // por atendente
  const porAt = {}; for (const r of mes) { const k = r.atendenteUid; porAt[k] ??= { nome: r.atendenteNome, un: r.unidade, orc: 0, conv: 0 }; porAt[k].orc++; if (r.status === 'convertido') porAt[k].conv++; }
  const rank = Object.values(porAt).sort((a, b) => b.orc - a.orc);
  // por semana (últimas 8)
  const sem = []; for (let i = 7; i >= 0; i--) { const d0 = new Date(); d0.setHours(0, 0, 0, 0); d0.setDate(d0.getDate() - d0.getDay() - 7 * i); const d1 = new Date(d0); d1.setDate(d1.getDate() + 7); const w = rows.filter(r => { const d = r.criadoEm?.toDate?.(); return d && d >= d0 && d < d1; }); sem.push([`${d0.getDate()}/${d0.getMonth() + 1}`, w.length, w.filter(r => r.status === 'convertido').length]); }
  // por convênio
  const pc = {}; for (const r of mes) { const k = r.convenioNome || r.convenio; pc[k] = (pc[k] || 0) + 1; } const convs = Object.entries(pc).sort((a, b) => b[1] - a[1]); const top = convs.slice(0, 4); const outros = convs.slice(4).reduce((a, c) => a + c[1], 0); if (outros) top.push(['Outros', outros]);
  const mesNome = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  root.innerHTML = `
  <div class="kpis">
    <div class="kpi k1"><div><b>${mes.length}</b><span>Orçamentos no mês</span><small>${mesNome}</small></div><i><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16v16H4z"/><path d="M8 9h8M8 13h8M8 17h5"/></svg></i></div>
    <div class="kpi k2"><div><b>${conv.length}</b><span>Convertidos em coleta</span><small>${taxa}% de conversão</small></div><i><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12l4 4L19 6"/></svg></i></div>
    <div class="kpi k3"><div><b>${brl(mes.length ? totalOrc / mes.length : 0)}</b><span>Ticket médio</span><small>${brl(totalOrc)} orçados · ${brl(totalConv)} convertidos</small></div><i><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v18M7 8h7a3 3 0 0 1 0 6H9a3 3 0 0 0 0 6h8"/></svg></i></div>
    <div class="kpi k4"><div><b>${pendentes.length}</b><span>Exames em conferência</span><small>aguardando aprovação</small></div><i><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg></i></div>
  </div>
  <div class="grid g-dash">
    <div class="card"><div class="card-h"><h2>Orçamentos × Convertidos</h2><span class="cnt">por semana · 8 semanas</span></div><div class="card-b" style="position:relative"><svg class="chart" id="chLine" viewBox="0 0 640 260"></svg><div class="tip" id="tipLine"></div><div class="legend" style="margin-top:8px"><span><i style="background:var(--c1)"></i>Orçamentos</span><span><i style="background:var(--c3)"></i>Convertidos</span></div></div></div>
    <div class="card"><div class="card-h"><h2>Por convênio</h2><span class="cnt">no mês</span></div><div class="card-b"><svg class="chart" id="chDonut" viewBox="0 0 240 200"></svg><div class="legend" id="lgDonut" style="margin-top:6px"></div></div></div>
    <div class="cal"><div class="h"><span>${mesNome}</span></div><div class="g" id="calGrid"></div><div class="note" style="color:#fff;opacity:.85;margin-top:10px">Número = orçamentos no dia · vermelho: hoje</div></div>
    <div class="card"><div class="card-h"><h2>Quem produz mais</h2><span class="cnt">orçamentos no mês</span></div><div class="card-b"><div class="rank" id="rank">${rank.map((a, i) => `<div class="row"><span class="av s">${escapeHtml(iniciais(a.nome))}</span><div><div class="nm"><span>${i + 1}º ${escapeHtml(a.nome)} <small style="color:var(--muted)">· ${escapeHtml(a.un || '')}</small></span><b>${a.orc}</b></div><div class="bar"><i style="width:${a.orc / (rank[0]?.orc || 1) * 100}%;${i === 0 ? 'background:var(--c3)' : ''}"></i></div></div><span class="pill ok">${a.orc ? Math.round(a.conv / a.orc * 100) : 0}%</span></div>`).join('') || '<span class="note">Sem orçamentos neste mês ainda.</span>'}</div></div></div>
    <div class="card"><div class="card-h"><h2>Conversão por atendente</h2><span class="cnt">coletas ÷ orçamentos</span></div><div class="card-b"><svg class="chart" id="chBars" viewBox="0 0 320 ${Math.max(60, 24 + rank.length * 30)}"></svg></div></div>
    <div class="card"><div class="card-h"><h2>Atividade recente</h2></div><div class="card-b"><div class="feed">${rows.slice(0, 8).map(r => `<div class="it"><span class="av s">${escapeHtml(iniciais(r.atendenteNome))}</span><div><b>${escapeHtml(r.atendenteNome)} ${r.status === 'convertido' ? 'converteu' : 'gravou'} o orçamento #${r.numero} ${r.paciente ? '· ' + escapeHtml(r.paciente) : ''}</b><small>${fmtData(r.criadoEm)} · ${escapeHtml(r.unidade || '')} · ${brl(r.total)}</small></div></div>`).join('') || '<span class="note">Nada ainda.</span>'}</div></div></div>
  </div>`;
  lineChart(sem); donut(top, mes.length); bars(rank); calendar(mes);
}
function lineChart(SEM) {
  const W = 640, H = 260, L = 44, R = 16, T = 16, B = 34, max = Math.max(5, ...SEM.map(s => s[1])) * 1.15;
  const x = i => L + i * (W - L - R) / Math.max(1, SEM.length - 1), y = v => T + (H - T - B) * (1 - v / max);
  let s = '<g class="grid">'; const step = Math.max(1, Math.ceil(max / 4));
  for (let v = 0; v <= max; v += step) s += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${Math.round(v)}</text>`; s += '</g>';
  const path = (k, col) => { const pts = SEM.map((r, i) => [x(i), y(r[k])]); let d = `M${pts[0]}`; for (let i = 1; i < pts.length; i++) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; const c = (x1 - x0) / 2; d += ` C${x0 + c},${y0} ${x1 - c},${y1} ${x1},${y1}`; }
    return `<path d="${d} L${pts.at(-1)[0]},${y(0)} L${pts[0][0]},${y(0)}Z" fill="${col}" opacity=".10"/><path d="${d}" fill="none" stroke="${col}" stroke-width="2.5"/>` + pts.map(([px, py], i) => `<circle cx="${px}" cy="${py}" r="5" fill="${col}" stroke="var(--surface)" stroke-width="2"/>${SEM[i][k] ? `<text x="${px}" y="${py - 11}" text-anchor="middle" style="fill:var(--text)">${SEM[i][k]}</text>` : ''}`).join(''); };
  s += path(1, 'var(--c1)') + path(2, 'var(--c3)') + SEM.map((r, i) => `<text x="${x(i)}" y="${H - 10}" text-anchor="middle">${r[0]}</text>`).join('') + SEM.map((r, i) => `<rect data-i="${i}" x="${x(i) - 40}" y="${T}" width="80" height="${H - T - B}" fill="transparent"/>`).join('');
  const svg = $('chLine'); svg.innerHTML = s; const tip = $('tipLine');
  svg.addEventListener('mousemove', e => { const r = e.target.closest('[data-i]'); if (!r) { tip.style.opacity = 0; return; } const i = +r.dataset.i; tip.textContent = `semana de ${SEM[i][0]}: ${SEM[i][1]} orçamentos · ${SEM[i][2]} coletas`; const b = svg.getBoundingClientRect(); tip.style.left = (x(i) / W * b.width) + 'px'; tip.style.top = (y(SEM[i][1]) / H * b.height) + 'px'; tip.style.opacity = 1; });
  svg.addEventListener('mouseleave', () => tip.style.opacity = 0);
}
function donut(CONV, total) {
  const cols = ['var(--c1)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--faint)']; const tot = CONV.reduce((a, c) => a + c[1], 0) || 1;
  let a0 = -Math.PI / 2, s = ''; const cx = 120, cy = 100, r = 72, w = 22;
  CONV.forEach((c, i) => { const a1 = a0 + c[1] / tot * Math.PI * 2 - 0.035; const p = (a, rr) => [cx + rr * Math.cos(a), cy + rr * Math.sin(a)]; const big = a1 - a0 > Math.PI ? 1 : 0; const [x0, y0] = p(a0, r), [x1, y1] = p(a1, r), [x2, y2] = p(a1, r - w), [x3, y3] = p(a0, r - w); s += `<path d="M${x0},${y0} A${r},${r} 0 ${big} 1 ${x1},${y1} L${x2},${y2} A${r - w},${r - w} 0 ${big} 0 ${x3},${y3}Z" fill="${cols[i]}"><title>${escapeHtml(c[0])}: ${c[1]}</title></path>`; a0 = a1 + 0.035; });
  s += `<text x="${cx}" y="${cy - 4}" text-anchor="middle" style="font-size:22px;fill:var(--text);font-weight:900">${total}</text><text x="${cx}" y="${cy + 16}" text-anchor="middle">orçamentos</text>`;
  $('chDonut').innerHTML = s; $('lgDonut').innerHTML = CONV.map((c, i) => `<span><i style="background:${cols[i]}"></i>${escapeHtml(c[0])} <b style="color:var(--text)">${Math.round(c[1] / tot * 100)}%</b></span>`).join('') || '<span class="note">Sem dados.</span>';
}
function bars(rank) {
  const W = 320, L = 84, bh = 20, gap = 10; const data = rank.map(a => [a.nome, a.orc ? Math.round(a.conv / a.orc * 100) : 0]).sort((a, b) => b[1] - a[1]);
  $('chBars').innerHTML = data.map((d, i) => { const y = 12 + i * (bh + gap), w = (W - L - 40) * d[1] / 100; return `<text x="${L - 8}" y="${y + 14}" text-anchor="end" style="fill:var(--text)">${escapeHtml(d[0].split(' ')[0])}</text><rect x="${L}" y="${y}" width="${w}" height="${bh}" rx="4" fill="${i === 0 ? 'var(--c3)' : 'var(--c1)'}"/><text x="${L + w + 6}" y="${y + 14}" style="fill:var(--text)">${d[1]}%</text>`; }).join('') || '<text x="10" y="30">Sem dados.</text>';
}
function calendar(mes) {
  const hoje = new Date(); const y = hoje.getFullYear(), m = hoje.getMonth(); const first = new Date(y, m, 1).getDay(); const nd = new Date(y, m + 1, 0).getDate();
  const porDia = {}; for (const r of mes) { const d = r.criadoEm?.toDate?.(); if (d) porDia[d.getDate()] = (porDia[d.getDate()] || 0) + 1; }
  let s = ['DO', 'SE', 'TE', 'QA', 'QI', 'SX', 'SA'].map(d => `<div class="wd">${d}</div>`).join(''); for (let i = 0; i < first; i++) s += '<div></div>';
  for (let d = 1; d <= nd; d++) s += `<div class="${d === hoje.getDate() ? 'tod' : ''} ${porDia[d] ? 'mk' : ''}" title="${porDia[d] || 0} orçamentos">${d}${porDia[d] ? `<small style="display:block;font-size:.6rem;opacity:.8">${porDia[d]}</small>` : ''}</div>`;
  $('calGrid').innerHTML = s;
}

// ===================== SOLICITAÇÕES =====================
async function viewSol() {
  const convs = await D.convenios();
  root.innerHTML = `<div class="sol"><div class="card"><div class="card-h"><h2>Fila de conferência</h2><span class="pill warn" id="solN"><i></i></span><div class="sp"></div><div class="tabs"><button class="pill on" data-tab="pendente">Pendentes</button><button class="pill" data-tab="aprovada">Aprovadas</button><button class="pill" data-tab="recusada">Recusadas</button></div></div><div class="card-b"><div class="solq" id="solq"></div></div></div>
  <div class="card"><div class="card-h"><h2>Aprovar exame</h2><div class="sp"></div><span class="note" id="solRef"></span></div><div class="card-b" id="solForm"><div class="note">Selecione um exame na fila.</div></div></div></div>`;
  let tab = 'pendente', lista = pendentes, offTab = null;
  renderSol = () => {
    if (tab === 'pendente') lista = pendentes;
    $('solN').innerHTML = `<i></i>${lista.length} ${tab === 'pendente' ? 'pendentes' : tab + 's'}`;
    $('solq').innerHTML = lista.map(s => { const cor = SETORES[s.setorSugerido]?.cor || 'var(--warn)'; return `<div class="sq ${s.id === solSel ? 'on' : ''}" data-id="${s.id}"><span class="st" style="background:${cor}"></span><div><b>${escapeHtml(s.guiaDb?.nome || s.normalizadoIA || s.textoLido)}</b><small>lido no pedido: <span class="hand">${escapeHtml(s.textoLido)}</span>${s.guiaDb ? ` · <span class="mn">${escapeHtml(s.guiaDb.mnemonico)}</span> sem valor em ${escapeHtml(s.convenio)}` : ' · não está no catálogo'}${s.status !== 'pendente' ? ` · <b>${s.status}</b> ${s.mnemonico || ''}` : ''}</small></div><div class="who"><span class="av s">${escapeHtml(iniciais(s.atendenteNome))}</span>${escapeHtml((s.atendenteNome || '').split(' ')[0])}<br>#${s.orcamentoNumero || '—'} · ${fmtData(s.criadoEm)}</div></div>`; }).join('') || '<div class="note" style="padding:20px;text-align:center">Nada aqui.</div>';
  };
  renderSol();
  root.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', async () => { root.querySelectorAll('[data-tab]').forEach(x => x.classList.toggle('on', x === b)); tab = b.dataset.tab; if (offTab) { offTab(); offTab = null; } if (tab !== 'pendente') offTab = D.ouvirSolicitacoes(tab, l => { lista = l.slice(0, 100); renderSol(); }); else renderSol(); }));
  $('solq').addEventListener('click', e => { const c = e.target.closest('[data-id]'); if (!c) return; solSel = c.dataset.id; renderSol(); form(lista.find(s => s.id === solSel)); });
  async function form(s) {
    if (!s) return; $('solRef').textContent = `orçamento #${s.orcamentoNumero || '—'} · ${s.atendenteNome}`;
    if (s.status !== 'pendente') { $('solForm').innerHTML = `<div class="note">Solicitação ${s.status}${s.mnemonico ? ' como <b>' + s.mnemonico + '</b>' : ''}${s.motivo ? ' — motivo: ' + escapeHtml(s.motivo) : ''}.</div>`; return; }
    const g = s.guiaDb; const sug = g?.mnemonico || (norm(s.normalizadoIA || s.textoLido).split(' ').map(w => w.slice(0, 3)).join('').slice(0, 8) + '-DB');
    const conv = s.convenio; const nomeConv = (convs.find(c => c.slug === conv) || {}).nome || conv;
    $('solForm').innerHTML = `<div class="form">
      <label class="f full">Nome do exame *<input class="in" id="apNome" value="${escapeHtml(g?.nome || s.normalizadoIA || s.textoLido)}"></label>
      <label class="f">Mnemônico AutoLAC *<input class="in" id="apM" value="${escapeHtml(sug)}" style="font-family:ui-monospace,monospace;text-transform:uppercase"></label>
      <label class="f">Setor<select class="in" id="apSet">${SETOR_ORDEM.map(x => `<option ${x === (g?.setor || s.setorSugerido) ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
      <label class="f">Prazo Célula (dias úteis) *<input class="in" type="number" min="0" id="apP" value="${g?.prazoDias ?? ''}"></label>
      <label class="f">Código TUSS<input class="in" id="apTuss" placeholder="opcional"></label>
      <label class="f">Valor PARTICULAR (R$) *<input class="in" type="number" step="0.01" min="0" id="apV1"></label>
      <label class="f">Valor ${escapeHtml(nomeConv)} (R$)${conv === 'particular' ? '' : ' *'}<input class="in" type="number" step="0.01" min="0" id="apV2" ${conv === 'particular' ? 'disabled placeholder="mesmo que o particular"' : ''}></label>
      <label class="f full">Outras grafias que a IA deve reconhecer (separe por vírgula)<input class="in" id="apAp" value="${escapeHtml(s.normalizadoIA && s.normalizadoIA !== s.textoLido ? s.normalizadoIA : '')}"></label>
      <div class="full" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><button class="btn ok" id="apOk">✓ Aprovar e devolver ao orçamento</button><button class="btn ghost" id="apNo">Recusar</button><input class="in" id="apMotivo" placeholder="motivo da recusa (opcional)" style="flex:1;min-width:160px"></div>
      <div class="full note">A atendente vê a atualização em tempo real; o exame entra no catálogo e as grafias viram apelidos.</div></div>`;
    $('apOk').onclick = async () => {
      const mnemonico = $('apM').value.trim().toUpperCase(), nome = $('apNome').value.trim().toUpperCase(), prazoDias = parseInt($('apP').value), v1 = parseFloat($('apV1').value), v2 = parseFloat($('apV2').value);
      if (!mnemonico || !nome || isNaN(prazoDias) || isNaN(v1) || (conv !== 'particular' && isNaN(v2))) { toast('Preencha mnemônico, nome, prazo e valores.'); return; }
      const precos = { particular: v1 }; if (conv !== 'particular') precos[conv] = v2;
      $('apOk').disabled = true;
      try { await D.aprovarSolicitacao(s, { mnemonico, nome, setor: $('apSet').value, prazoDias, codigoTuss: $('apTuss').value.trim() || null, precos, apelidos: $('apAp').value.split(',').map(x => x.trim()).filter(Boolean) }); toast(`${mnemonico} aprovado — orçamento #${s.orcamentoNumero} atualizado`, true); solSel = null; $('solForm').innerHTML = '<div class="note">Selecione um exame na fila.</div>'; }
      catch (e) { toast('Erro: ' + e.message); $('apOk').disabled = false; }
    };
    $('apNo').onclick = async () => { try { await D.recusarSolicitacao(s, $('apMotivo').value.trim()); toast('Solicitação recusada; a atendente foi avisada.'); solSel = null; $('solForm').innerHTML = '<div class="note">Selecione um exame na fila.</div>'; } catch (e) { toast('Erro: ' + e.message); } };
  }
}

// ===================== ORÇAMENTOS =====================
async function viewOrc() { montarHistorico(root, { perfil, admin: true }); }

// ===================== CATÁLOGO =====================
async function viewCat() {
  const convs = await D.convenios(); const cat = await D.catalogo(true);
  root.innerHTML = `<div class="card" style="margin-bottom:14px"><div class="card-b"><div class="filters">
    <label class="f" style="grid-column:span 2">Buscar<input class="in" id="cq" placeholder="nome ou mnemônico"></label>
    <label class="f">Convênio (valor exibido)<select class="in" id="cconv">${convs.map(c => `<option value="${c.slug}" ${c.slug === 'particular' ? 'selected' : ''}>${escapeHtml(c.nome)}</option>`).join('')}</select></label>
    <label class="f">Setor<select class="in" id="cset"><option value="">Todos</option>${SETOR_ORDEM.map(s => `<option>${s}</option>`).join('')}</select></label>
    <label class="f">Situação<select class="in" id="csit"><option value="">Todos</option><option value="ativo">Visíveis</option><option value="oculto">Ocultos</option><option value="renal">Renal</option><option value="semvalor">Sem valor no convênio</option><option value="semprazo">Sem prazo</option></select></label>
  </div></div></div>
  <div class="card"><div class="card-h"><h2>Catálogo de exames</h2><span class="cnt" id="ccnt"></span><div class="sp"></div><span class="note">Edite valor/prazo na linha e clique em Salvar · tudo fica na auditoria</span><button class="btn blue sm" id="cnovo">+ Incluir procedimento</button></div>
  <div class="card-b" id="cform" hidden style="border-bottom:1px solid var(--line);background:var(--surface-2)"><div class="form">
    <label class="f">Mnemônico AutoLAC *<input class="in" id="nMn" placeholder="ex.: ZINC-DB" style="font-family:ui-monospace,monospace;text-transform:uppercase"></label>
    <label class="f">Nome do exame *<input class="in" id="nNome" placeholder="ex.: ZINCO SÉRICO"></label>
    <label class="f">Setor<select class="in" id="nSet">${SETOR_ORDEM.map(x => `<option>${x}</option>`).join('')}</select></label>
    <label class="f">Prazo Célula (dias úteis) *<input class="in" id="nPrazo" type="number" min="0"></label>
    <label class="f">Código TUSS<input class="in" id="nTuss" placeholder="opcional"></label>
    <label class="f">Valor PARTICULAR (R$) *<input class="in" id="nV1" type="number" step="0.01" min="0"></label>
    <label class="f">Valor no convênio selecionado acima (R$)<input class="in" id="nV2" type="number" step="0.01" min="0" placeholder="opcional"></label>
    <label class="f" style="justify-content:flex-end"><label class="switch"><input type="checkbox" id="nRenal"><i></i>Exame do pacote renal</label></label>
    <div class="full" style="display:flex;gap:8px"><button class="btn ok" id="nSalvar">Incluir no catálogo</button><button class="btn ghost" id="nCancel">Cancelar</button></div></div></div>
  <div class="card-b tbl-wrap"><table class="tbl"><thead><tr><th>Mnemônico</th><th>Exame</th><th>Setor</th><th>TUSS</th><th>Prazo (d.u.)</th><th class="num">Valor</th><th>Visível</th><th>Renal</th><th></th><th></th></tr></thead><tbody id="cbody"></tbody></table></div>
  <div class="card-b" style="display:flex;gap:8px;justify-content:center;border-top:1px solid var(--line)"><button class="btn ghost sm" id="cmais">Mostrar mais</button></div></div>`;
  let lim = 100;
  const render = () => {
    const q = $('cq').value.trim().toLowerCase(), conv = $('cconv').value, set = $('cset').value, sit = $('csit').value;
    const rows = cat.filter(r => (!q || r.mnemonico.toLowerCase().includes(q) || r.nomeBusca.toLowerCase().includes(norm(q).toLowerCase())) && (!set || r.setor === set) &&
      (!sit || (sit === 'ativo' && r.ativo !== false) || (sit === 'oculto' && r.ativo === false) || (sit === 'renal' && r.renal) || (sit === 'semvalor' && r.precos?.[conv] == null) || (sit === 'semprazo' && r.prazoDias == null)));
    $('ccnt').textContent = `${Math.min(lim, rows.length)} de ${rows.length} (catálogo: ${cat.length})`; $('cmais').hidden = rows.length <= lim;
    $('cbody').innerHTML = rows.slice(0, lim).map(r => `<tr data-m="${r.mnemonico}"><td><span class="mn sec" style="--c:${SETORES[r.setor]?.cor || 'var(--ac)'}">${r.mnemonico}</span></td><td><b>${escapeHtml(r.nome)}</b>${r.matchPrazo === 'nome' ? '<br><small class="note">prazo casado por nome — conferir</small>' : ''}</td><td><span class="dot" style="background:${SETORES[r.setor]?.cor || 'var(--ac)'}"></span>${escapeHtml(r.setor)}</td><td>${r.codigoTuss || '—'}</td>
      <td><input class="in" type="number" min="0" value="${r.prazoDias ?? ''}" data-f="prazoDias" style="width:70px"></td><td class="num"><input class="in" type="number" step="0.01" min="0" value="${r.precos?.[conv] ?? ''}" placeholder="sem valor" data-f="valor" style="width:105px;text-align:right"></td>
      <td><label class="switch"><input type="checkbox" data-f="ativo" ${r.ativo !== false ? 'checked' : ''}><i></i></label></td><td><label class="switch"><input type="checkbox" data-f="renal" ${r.renal ? 'checked' : ''}><i></i></label></td><td><button class="btn blue sm" data-save="${r.mnemonico}">Salvar</button></td><td><button class="btn ghost sm" data-del="${r.mnemonico}" title="Excluir do catálogo" style="color:var(--red);border-color:var(--red-50)">Excluir</button></td></tr>`).join('');
  };
  ['cq', 'cconv', 'cset', 'csit'].forEach(id => $(id).addEventListener('input', () => { lim = 100; render(); })); $('cmais').onclick = () => { lim += 100; render(); }; render();
  // incluir procedimento
  $('cnovo').onclick = () => { $('cform').hidden = !$('cform').hidden; if (!$('cform').hidden) $('nMn').focus(); };
  $('nCancel').onclick = () => { $('cform').hidden = true; };
  $('nSalvar').onclick = async () => {
    const mnemonico = $('nMn').value.trim().toUpperCase(), nome = $('nNome').value.trim(), prazo = parseInt($('nPrazo').value), v1 = parseFloat($('nV1').value), v2 = parseFloat($('nV2').value), conv = $('cconv').value;
    if (!mnemonico || !nome || isNaN(prazo) || isNaN(v1)) { toast('Preencha mnemônico, nome, prazo e valor PARTICULAR.'); return; }
    const precos = { particular: v1 }; if (!isNaN(v2) && conv !== 'particular') precos[conv] = v2;
    $('nSalvar').disabled = true;
    try { await D.criarExame({ mnemonico, nome, setor: $('nSet').value, prazoDias: prazo, codigoTuss: $('nTuss').value.trim() || null, precos, renal: $('nRenal').checked });
      const novo = (await D.catalogo(true)).find(c => c.mnemonico === mnemonico); if (novo) cat.unshift(novo);
      ['nMn', 'nNome', 'nPrazo', 'nTuss', 'nV1', 'nV2'].forEach(id => $(id).value = ''); $('nRenal').checked = false; $('cform').hidden = true; $('cq').value = mnemonico; render();
      toast(`${mnemonico} incluído no catálogo`, true); }
    catch (err) { toast(err.message); } $('nSalvar').disabled = false;
  };
  $('cbody').addEventListener('click', async e => {
    // excluir (dois cliques: o primeiro pede confirmação)
    const d = e.target.closest('[data-del]');
    if (d) { const m = d.dataset.del;
      if (d.dataset.arm !== '1') { d.dataset.arm = '1'; d.textContent = 'Confirmar exclusão?'; d.classList.replace('ghost', 'red'); setTimeout(() => { if (d.isConnected) { d.dataset.arm = ''; d.textContent = 'Excluir'; d.classList.replace('red', 'ghost'); } }, 4000); return; }
      d.disabled = true; try { await D.excluirExame(m); const i = cat.findIndex(x => x.mnemonico === m); if (i >= 0) cat.splice(i, 1); render(); toast(`${m} excluído do catálogo (registrado na auditoria)`, true); } catch (err) { toast('Erro: ' + err.message); d.disabled = false; } return; }
    const b = e.target.closest('[data-save]'); if (!b) return; const tr = b.closest('tr'); const m = b.dataset.save; const r = cat.find(x => x.mnemonico === m); const conv = $('cconv').value;
    const prazo = tr.querySelector('[data-f=prazoDias]').value, valor = tr.querySelector('[data-f=valor]').value;
    const mud = { ativo: tr.querySelector('[data-f=ativo]').checked, renal: tr.querySelector('[data-f=renal]').checked, prazoDias: prazo === '' ? null : parseInt(prazo), precos: { ...(r.precos || {}) } };
    if (valor === '') delete mud.precos[conv]; else mud.precos[conv] = parseFloat(valor);
    b.disabled = true; try { await D.editarExame(m, mud); Object.assign(r, mud); toast(`${m} salvo`, true); } catch (err) { toast('Erro: ' + err.message); } b.disabled = false;
  });
}

// ===================== USUÁRIOS =====================
async function viewUsr() {
  const us = await D.usuarios(); const rows = await D.orcamentosRecentes({ dias: 30 });
  const prod = {}; for (const r of rows) { prod[r.atendenteUid] ??= { o: 0, c: 0 }; prod[r.atendenteUid].o++; if (r.status === 'convertido') prod[r.atendenteUid].c++; }
  root.innerHTML = `<div class="g-usr"><div class="card"><div class="card-h"><h2>Equipe</h2><span class="cnt">${us.length} usuários · ${us.filter(u => u.ativo !== false).length} ativos</span></div><div class="card-b"><div class="users" id="users">${us.map(u => { const p = prod[u.id] || { o: 0, c: 0 }; return `<div class="uc"><div class="hd"><span class="av">${u.fotoBase64 ? `<img src="${u.fotoBase64}">` : escapeHtml(iniciais(u.nome))}</span><div><b>${escapeHtml(u.nome)}</b><small>${u.papel === 'admin' ? 'Administrador(a)' : 'Atendente'} · ${escapeHtml(u.unidade || '')}</small></div><div style="flex:1"></div><span class="pill ${u.ativo !== false ? 'ok' : ''}"><i></i>${u.ativo !== false ? 'ativo' : 'inativo'}</span></div>
    <div class="stats"><span><b>${p.o}</b>orçamentos/30d</span><span><b>${p.o ? Math.round(p.c / p.o * 100) : 0}%</b>conversão</span></div>
    <div class="acts"><select class="in" data-papel="${u.id}" style="padding:5px 8px;font-size:.8rem"><option value="atendente" ${u.papel !== 'admin' ? 'selected' : ''}>Atendente</option><option value="admin" ${u.papel === 'admin' ? 'selected' : ''}>Admin</option></select><input class="in" data-un="${u.id}" value="${escapeHtml(u.unidade || '')}" placeholder="unidade" style="padding:5px 8px;font-size:.8rem;width:120px"><button class="btn blue sm" data-salvar="${u.id}">Salvar</button><button class="btn ghost sm" data-pw="${escapeHtml(u.email)}">Redefinir senha</button><button class="btn ghost sm" data-ativo="${u.id}" data-v="${u.ativo !== false ? 0 : 1}">${u.ativo !== false ? 'Desativar' : 'Reativar'}</button></div></div>`; }).join('')}</div></div></div>
  <div class="card"><div class="card-h"><h2>Novo usuário</h2></div><div class="card-b" style="display:flex;flex-direction:column;gap:10px">
    <div class="upl" id="uplAv" style="border:2px dashed var(--blue-100);border-radius:14px;padding:12px;text-align:center;font-weight:700;color:var(--muted);cursor:pointer;background:var(--blue-50)">Foto de perfil (opcional)<input type="file" accept="image/*" hidden id="avFile"></div>
    <div style="display:flex;justify-content:center"><span class="av l" id="avPrev">?</span></div>
    <label class="f">Nome *<input class="in" id="nuNome"></label><label class="f">E-mail *<input class="in" id="nuEmail" type="email"></label>
    <label class="f">Papel<select class="in" id="nuPapel"><option value="atendente">Atendente</option><option value="admin">Administrador(a)</option></select></label>
    <label class="f">Unidade<input class="in" id="nuUn" value="${escapeHtml(cfg.unidadePadrao || 'Coophavila')}" list="uns"><datalist id="uns">${(cfg.unidades || ['Coophavila', 'Matriz', 'Nova Lima', 'Guaicurus', 'Central de atendimento']).map(u => `<option value="${escapeHtml(u)}">`).join('')}</datalist></label>
    <label class="f">Senha inicial * (mín. 6)<input class="in" id="nuSenha" type="text" autocomplete="off"></label>
    <button class="btn blue" id="btnNU" style="justify-content:center">Criar usuário</button><span class="note">A pessoa pode trocar a senha em "Minha conta"; você pode enviar o link de redefinição a qualquer momento.</span></div></div></div>`;
  let foto = null; $('uplAv').onclick = () => $('avFile').click();
  $('avFile').addEventListener('change', async e => { if (!e.target.files[0]) return; foto = await comprimirImagem(e.target.files[0], 200, .8); $('avPrev').innerHTML = `<img src="${foto}">`; });
  $('nuNome').addEventListener('input', e => { if (!foto) $('avPrev').textContent = iniciais(e.target.value) || '?'; });
  $('btnNU').onclick = async () => { const nome = $('nuNome').value.trim(), email = $('nuEmail').value.trim(), senha = $('nuSenha').value; if (!nome || !email || senha.length < 6) { toast('Preencha nome, e-mail e senha (6+).'); return; } $('btnNU').disabled = true;
    try { await criarUsuario({ email, senha, nome, papel: $('nuPapel').value, unidade: $('nuUn').value.trim(), fotoBase64: foto }); toast(`Usuário ${nome} criado`, true); viewUsr(); } catch (e) { toast(e.code === 'auth/email-already-in-use' ? 'Este e-mail já tem conta.' : 'Erro: ' + e.message); $('btnNU').disabled = false; } };
  $('users').addEventListener('click', async e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.pw) { try { await resetSenha(b.dataset.pw); toast(`E-mail de redefinição enviado para ${b.dataset.pw}`, true); } catch (err) { toast(err.message); } }
    if (b.dataset.salvar) { const id = b.dataset.salvar; try { await D.editarUsuario(id, { papel: root.querySelector(`[data-papel="${id}"]`).value, unidade: root.querySelector(`[data-un="${id}"]`).value.trim() }); toast('Salvo', true); } catch (err) { toast(err.message); } }
    if (b.dataset.ativo) { try { await D.editarUsuario(b.dataset.ativo, { ativo: b.dataset.v === '1' }); viewUsr(); } catch (err) { toast(err.message); } }
  });
}

// ===================== EXPORTAR =====================
async function viewExp() {
  const hoje = new Date(); const ini = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  root.innerHTML = `<div class="card" style="margin-bottom:14px"><div class="card-b"><div class="filters">
    <label class="f">De<input class="in" type="date" id="eDe" value="${ini.toISOString().slice(0, 10)}"></label><label class="f">Até<input class="in" type="date" id="eAte" value="${hoje.toISOString().slice(0, 10)}"></label>
    <label class="f">Unidade<input class="in" id="eUn" placeholder="todas"></label><label class="f">Atendente<select class="in" id="eAt"><option value="">Todas</option></select></label>
    <label class="f">Status<select class="in" id="eSt"><option value="convertido">Convertidos</option><option value="">Todos</option><option value="gravado">Gravados</option><option value="enviado">Enviados</option><option value="perdido">Perdidos</option><option value="aguardando_conferencia">Aguardando conferência</option></select></label>
    <label class="f">&nbsp;<button class="btn blue" id="eGo" style="justify-content:center">Gerar relatório</button></label></div></div></div>
  <div class="card"><div class="card-h"><h2>Atendimentos</h2><span class="cnt" id="eCnt"></span><div class="sp"></div><button class="btn ghost sm" id="eCsv">Baixar CSV</button><button class="btn ghost sm" id="eXls">Baixar Excel</button><button class="btn ghost sm" id="ePdf">Imprimir / PDF</button></div>
  <div class="card-b tbl-wrap"><table class="tbl" id="eTbl"><thead><tr><th>Nº</th><th>Criado</th><th>Convertido</th><th>Paciente</th><th>Telefone</th><th>Convênio</th><th>Atendente</th><th>Unidade</th><th>Exames</th><th class="num">Valor</th><th>Status</th></tr></thead><tbody id="eBody"><tr><td colspan="11" class="note">Clique em Gerar relatório.</td></tr></tbody></table></div></div>`;
  let rows = [];
  const gerar = async () => {
    const de = new Date($('eDe').value + 'T00:00:00'), ate = new Date($('eAte').value + 'T23:59:59'); const dias = Math.ceil((Date.now() - de) / 86400000) + 1;
    const all = await D.orcamentosRecentes({ dias }); const st = $('eSt').value, un = $('eUn').value.trim().toLowerCase(), at = $('eAt').value;
    const ids = new Map(all.map(r => [r.atendenteUid, r.atendenteNome])); const cur = $('eAt').value; $('eAt').innerHTML = '<option value="">Todas</option>' + [...ids].map(([u, n]) => `<option value="${u}">${escapeHtml(n)}</option>`).join(''); $('eAt').value = cur;
    rows = all.filter(r => { const d = r.criadoEm?.toDate?.(); return d && d >= de && d <= ate && (!st || r.status === st) && (!un || (r.unidade || '').toLowerCase().includes(un)) && (!at || r.atendenteUid === at); });
    $('eCnt').textContent = `${rows.length} registros · ${brl(rows.reduce((a, r) => a + (r.total || 0), 0))}`;
    $('eBody').innerHTML = rows.map(r => `<tr><td><b>#${r.numero}</b></td><td>${fmtData(r.criadoEm)}</td><td>${r.convertidoEm ? fmtData(r.convertidoEm) : '—'}</td><td>${escapeHtml(r.paciente || '')}</td><td>${escapeHtml(r.telefone || '')}</td><td>${escapeHtml(r.convenioNome || r.convenio)}</td><td>${escapeHtml(r.atendenteNome)}</td><td>${escapeHtml(r.unidade || '')}</td><td>${(r.mnemonicos || []).join(', ')}</td><td class="num">${brl(r.total)}</td><td>${(STATUS[r.status] || [r.status])[0]}</td></tr>`).join('') || '<tr><td colspan="11" class="note">Nenhum registro.</td></tr>';
  };
  $('eGo').onclick = gerar;
  const linhas = () => [['Nº', 'Criado', 'Convertido', 'Paciente', 'Telefone', 'Convênio', 'Atendente', 'Unidade', 'Exames', 'Valor', 'Status'], ...rows.map(r => [r.numero, fmtData(r.criadoEm), r.convertidoEm ? fmtData(r.convertidoEm) : '', r.paciente || '', r.telefone || '', r.convenioNome || r.convenio, r.atendenteNome, r.unidade || '', (r.mnemonicos || []).join(' '), (r.total || 0).toFixed(2).replace('.', ','), (STATUS[r.status] || [r.status])[0]])];
  const baixar = (conteudo, nome, tipo) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([conteudo], { type: tipo })); a.download = nome; a.click(); };
  $('eCsv').onclick = () => { if (!rows.length) return toast('Gere o relatório primeiro.'); baixar('﻿' + linhas().map(l => l.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\r\n'), `atendimentos_${$('eDe').value}_${$('eAte').value}.csv`, 'text/csv;charset=utf-8'); };
  $('eXls').onclick = () => { if (!rows.length) return toast('Gere o relatório primeiro.'); const html = `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body><table>${linhas().map(l => '<tr>' + l.map(v => `<td>${escapeHtml(v)}</td>`).join('') + '</tr>').join('')}</table></body></html>`; baixar(html, `atendimentos_${$('eDe').value}_${$('eAte').value}.xls`, 'application/vnd.ms-excel'); };
  $('ePdf').onclick = () => { if (!rows.length) return toast('Gere o relatório primeiro.'); const w = window.open('', '_blank'); w.document.write(`<html><head><meta charset="utf-8"><title>Atendimentos</title><style>body{font-family:Nunito,Arial,sans-serif;padding:24px;color:#1b2540}h1{color:#1e40af;margin:0}h1 small{display:block;color:#64748b;font-size:.8rem;font-weight:600}table{width:100%;border-collapse:collapse;font-size:11px;margin-top:16px}th{background:#eaf1ff;color:#1e40af;text-align:left}th,td{padding:5px 6px;border-bottom:1px solid #e6e9f0}.r{text-align:right}img{height:40px}</style></head><body><img src="${location.origin}${location.pathname.replace(/[^/]*$/, '')}img/logo-celula.png"><h1>Relatório de atendimentos<small>${$('eDe').value.split('-').reverse().join('/')} a ${$('eAte').value.split('-').reverse().join('/')} · ${$('eCnt').textContent} · gerado por ${escapeHtml(perfil.nome)}</small></h1><table><tr>${linhas()[0].map(h => `<th>${h}</th>`).join('')}</tr>${linhas().slice(1).map(l => '<tr>' + l.map((v, i) => `<td class="${i === 9 ? 'r' : ''}">${escapeHtml(v)}</td>`).join('') + '</tr>').join('')}</table><script>setTimeout(()=>print(),400)<\/script></body></html>`); w.document.close(); };
  gerar();
}

// ===================== CONFIGURAÇÕES =====================
async function viewCfg() {
  const c = await D.config(true);
  root.innerHTML = `<div class="g2"><div class="card"><div class="card-h"><h2>Regras do sistema</h2></div><div class="card-b form">
    <label class="f">Dias úteis somados ao prazo DB<input class="in" id="cPrazo" type="number" value="${c.prazoExtraDiasUteis ?? 2}"></label>
    <label class="f">Confiança mínima da IA (%)<input class="in" id="cConf" type="number" value="${c.confiancaMinima ?? 85}"></label>
    <label class="f">Validade do orçamento (dias)<input class="in" id="cVal" type="number" value="${c.validadeDias ?? 7}"></label>
    <label class="f">Unidade padrão<input class="in" id="cUn" value="${escapeHtml(c.unidadePadrao || 'Coophavila')}"></label>
    <label class="f full">Unidades (separe por vírgula)<input class="in" id="cUns" value="${escapeHtml((c.unidades || ['Coophavila', 'Matriz', 'Nova Lima', 'Guaicurus', 'Central de atendimento']).join(', '))}"></label>
    <label class="f full">E-mails que entram como administrador no primeiro acesso<input class="in" id="cAdm" value="${escapeHtml((c.admins || []).join(', '))}"></label>
    <div class="full"><button class="btn blue" id="cSalvar">Salvar</button></div></div></div>
  <div class="card"><div class="card-h"><h2>Base de exames</h2></div><div class="card-b"><p class="note">Versão da base: <b>${escapeHtml(c.versaoBase || '')}</b> · origem: ${escapeHtml(c.origem || '')}</p><p class="note">Pacote renal (HIPERRIM): <b>${(c.pacoteRenal || []).length}</b> mnemônicos.</p><a class="btn ghost sm" href="conta.html">Minha conta (foto e senha)</a></div></div></div>`;
  $('cSalvar').onclick = async () => { try { await D.salvarConfig({ prazoExtraDiasUteis: +$('cPrazo').value, confiancaMinima: +$('cConf').value, validadeDias: +$('cVal').value, unidadePadrao: $('cUn').value.trim(), unidades: $('cUns').value.split(',').map(x => x.trim()).filter(Boolean), admins: $('cAdm').value.split(',').map(x => x.trim().toLowerCase()).filter(Boolean) }); toast('Configurações salvas', true); } catch (e) { toast('Erro: ' + e.message); } };
}
