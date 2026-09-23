// orcamento.js — tela da atendente: foto → IA → conferência → orçamento (tempo real com o painel).
import { exigirLogin, brl, norm, slug, toast, comprimirImagem, escapeHtml, SETORES, SETOR_ORDEM, soDigitos } from './firebase.js';
import { montarShell } from './shell.js';
import * as D from './dados.js';
import { lerPedido } from './ia.js';

const { perfil } = await exigirLogin();
const root = montarShell({ perfil, ativo: 'novo', titulo: 'Novo orçamento por IA', subtitulo: 'fotografe o pedido, confira e grave' });
const $ = id => document.getElementById(id);
const CONF_MIN = 0.85;

// ---------- estado ----------
const st = { id: null, numero: null, itens: [], fotos: [], convenio: null, convSlug: null, renal: false, manuais: {}, leitura: null, offSol: null };
const cfg = await D.config(); const convs = await D.convenios();
const CONF_MIN_CFG = cfg.confiancaMinima ? cfg.confiancaMinima / 100 : CONF_MIN;

root.innerHTML = `
<div class="summary">
  <div class="tile"><span>Exames</span><b id="kN">0</b></div>
  <div class="tile"><span>Total</span><b id="kT">R$ 0,00</b></div>
  <div class="tile warn"><span>A confirmar</span><b id="kC">0</b></div>
  <div class="tile crit"><span>Em conferência</span><b id="kM">0</b></div>
</div>
<div class="orc">
  <aside class="left">
    <section class="card"><div class="card-h"><h2>1 · Convênio e paciente</h2></div><div class="card-b" style="display:flex;flex-direction:column;gap:10px">
      <label class="f">Convênio *<select class="in" id="conv">${convs.map(c => `<option value="${c.slug}" ${c.slug === 'particular' ? 'selected' : ''}>${escapeHtml(c.nome)}</option>`).join('')}</select></label>
      <label class="f">Paciente<input class="in" id="pac" placeholder="Nome do interessado" autocomplete="off"></label>
      <label class="f">Celular / WhatsApp<input class="in" id="tel" placeholder="(67) 9 9999-9999" inputmode="tel"></label>
      <label class="switch"><input type="checkbox" id="swRenal"><i></i>Orçamento renal (pacote HIPERRIM)</label>
      <span class="note">Ligado: a IA usa só os exames "-DB RENAL". Desligado: eles ficam ocultos.</span>
    </div></section>
    <section class="card"><div class="card-h"><h2>2 · Foto do pedido</h2></div><div class="card-b" style="display:flex;flex-direction:column;gap:10px">
      <div id="prevWrap" hidden><div class="preview" id="prev"></div></div>
      <div class="row" style="display:flex;gap:8px">
        <button class="btn blue" id="btnCam" style="flex:1;justify-content:center">📷 Tirar foto</button>
        <button class="btn ghost" id="btnUp" style="flex:1;justify-content:center">Enviar arquivo</button>
        <input type="file" id="fileCam" accept="image/*" capture="environment" hidden>
        <input type="file" id="fileUp" accept="image/*" multiple hidden>
      </div>
      <div class="drop" id="drop">Arraste a foto aqui<br><small>JPG, PNG, HEIC · até 3 páginas</small></div>
      <div class="progress" id="prog" hidden><div class="bar"><i></i></div><span id="progTxt">Preparando…</span></div>
      <button class="btn red" id="btnRun" style="justify-content:center" disabled>Analisar pedido com a IA</button>
    </div></section>
    <div class="note" style="grid-column:1/-1;text-align:center"><b id="memN">…</b> grafias aprendidas com a recepção · cada confirmação sua ensina a IA</div>
  </aside>
  <section>
    <div class="card" style="margin-bottom:14px"><div class="card-b" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
      <div class="search" style="flex:1;min-width:240px"><input class="in" id="q" placeholder="Adicionar exame manualmente: nome ou mnemônico" autocomplete="off"><div class="sug" id="sug" hidden></div></div>
      <span class="note" id="leituraInfo"></span>
    </div></div>
    <div id="groups"><div class="card"><div class="card-b" style="text-align:center;color:var(--muted);font-weight:700;padding:40px">Envie a foto do pedido e clique em “Analisar pedido com a IA” — ou adicione exames manualmente acima.</div></div></div>
    <div class="card foot" style="margin-top:14px"><div class="card-b" style="display:flex;gap:14px;align-items:center;flex-wrap:wrap">
      <div><span class="note">Orçamento</span><br><b id="numLbl">novo</b></div>
      <div><span class="note">Total</span><br><b style="font-size:1.4rem;color:var(--blue-d)" id="fT">R$ 0,00</b></div>
      <div class="sp" style="flex:1"></div>
      <button class="btn ghost" id="btnLimpar">Limpar</button>
      <button class="btn ghost" id="btnZap">Enviar por WhatsApp</button>
      <button class="btn blue" id="btnSalvar">Gravar orçamento</button>
    </div></div>
  </section>
</div>`;

D.contar('apelidos').then(n => $('memN').textContent = n.toLocaleString('pt-BR')).catch(() => $('memN').textContent = '—');
st.convSlug = $('conv').value; st.convenio = convs.find(c => c.slug === st.convSlug)?.nome;
$('conv').addEventListener('change', async () => { st.convSlug = $('conv').value; st.convenio = convs.find(c => c.slug === st.convSlug)?.nome; await reprecificar(); render(); toast('Valores recalculados pela tabela ' + st.convenio); });
$('swRenal').addEventListener('change', async () => { st.renal = $('swRenal').checked; if ($('swRenal').checked && convs.some(c => c.slug === 'hiperrim')) { $('conv').value = 'hiperrim'; $('conv').dispatchEvent(new Event('change')); } await reresolver(); });

// ---------- fotos ----------
$('btnCam').onclick = () => $('fileCam').click(); $('btnUp').onclick = () => $('fileUp').click(); $('drop').onclick = () => $('fileUp').click();
$('fileCam').addEventListener('change', e => addFotos(e.target.files)); $('fileUp').addEventListener('change', e => addFotos(e.target.files));
['dragover', 'dragleave', 'drop'].forEach(ev => $('drop').addEventListener(ev, e => { e.preventDefault(); $('drop').classList.toggle('over', ev === 'dragover'); if (ev === 'drop') addFotos(e.dataTransfer.files); }));
async function addFotos(files) {
  for (const f of [...files].slice(0, 3 - st.fotos.length)) { if (!f.type.startsWith('image/')) { toast('Envie uma imagem (JPG/PNG/HEIC).'); continue; } st.fotos.push(await comprimirImagem(f, 1600, .85)); }
  $('prevWrap').hidden = !st.fotos.length; $('prev').innerHTML = st.fotos.map((u, i) => `<img src="${u}" alt="Pedido ${i + 1}">`).join('') + '<div class="scan" id="scan" hidden></div>';
  $('btnRun').disabled = !st.fotos.length; if (st.fotos.length) toast(`${st.fotos.length} foto(s) pronta(s). Clique em Analisar.`);
}

// ---------- IA ----------
$('btnRun').addEventListener('click', async () => {
  $('btnRun').disabled = true; $('prog').hidden = false; $('scan')?.removeAttribute('hidden');
  try {
    const r = await lerPedido(st.fotos, { onStatus: t => $('progTxt').textContent = t });
    st.leitura = r;
    if (r.paciente && !$('pac').value) $('pac').value = r.paciente;
    if (r.renal && !st.renal) { $('swRenal').checked = true; st.renal = true; if (convs.some(c => c.slug === 'hiperrim')) { $('conv').value = 'hiperrim'; st.convSlug = 'hiperrim'; st.convenio = 'HIPERRIM'; } toast('Pedido de nefrologia detectado: pacote renal ativado.'); }
    $('progTxt').textContent = 'Comparando com a base de exames…';
    st.manuais = await D.precosManuais(st.convSlug);
    for (const e of r.exames) await adicionarLido(e);
    $('leituraInfo').textContent = `IA: ${r.exames.length} exames lidos · ${r.modelo} · ${(r.ms / 1000).toFixed(1)} s`;
    render(); toast(`Leitura concluída: ${r.exames.length} exames identificados`, true);
  } catch (e) { toast(e.message); }
  finally { $('prog').hidden = true; $('scan')?.setAttribute('hidden', ''); $('btnRun').disabled = false; $('btnRun').textContent = 'Analisar novamente'; }
});

async function adicionarLido(e) {
  const cands = await D.resolver(e.texto, { renal: st.renal, normalizadoIA: e.normalizado });
  const it = { uid: Math.random().toString(36).slice(2), lido: e.texto, normalizado: e.normalizado, confIA: e.confianca, cands, ex: null, status: 'miss', valor: null, prazoDias: null, origem: null };
  if (cands.length) {
    const best = cands[0]; it.ex = best.ex; it.conf = Math.min(e.confianca, best.confianca);
    it.status = (it.conf >= CONF_MIN_CFG && best.via !== 'busca') || best.via === 'apelido' ? 'ok' : 'flag';
    await precificar(it);
  } else it.conf = e.confianca;
  st.itens.push(it);
}
async function precificar(it) {
  if (!it.ex) return; const p = await D.precoPrazo(it.ex, st.convSlug, st.manuais);
  it.valor = p.valor; it.prazoDias = p.prazoDias; it.origem = p.origem;
  if (it.valor == null && it.status === 'ok') it.status = 'semvalor';
  if (it.valor != null && it.status === 'semvalor') it.status = 'ok';
}
async function reprecificar() { st.manuais = await D.precosManuais(st.convSlug); for (const it of st.itens) if (it.status !== 'conferencia') await precificar(it); }
async function reresolver() { const lidos = st.itens.filter(i => i.lido && i.status !== 'conferencia'); st.itens = st.itens.filter(i => !lidos.includes(i)); for (const l of lidos) await adicionarLido({ texto: l.lido, normalizado: l.normalizado, confianca: l.confIA ?? 1 }); render(); }

// ---------- render ----------
function render() {
  const g = $('groups');
  if (!st.itens.length) { g.innerHTML = '<div class="card"><div class="card-b" style="text-align:center;color:var(--muted);font-weight:700;padding:40px">Nenhum exame ainda.</div></div>'; stats(); return; }
  g.innerHTML = '';
  const semSetor = st.itens.filter(i => !i.ex);
  const grupos = SETOR_ORDEM.map(s => [s, st.itens.filter(i => i.ex && i.ex.setor === s)]).filter(x => x[1].length);
  if (semSetor.length) grupos.push(['Não identificado', semSetor]);
  for (const [s, list] of grupos) {
    const meta = SETORES[s] || { cor: 'var(--red)', label: 'Não encontrado no catálogo — precisa de conferência' };
    const sub = list.reduce((a, i) => a + (i.valor || 0), 0);
    const sec = document.createElement('section'); sec.className = 'sector'; sec.style.setProperty('--c', meta.cor);
    sec.innerHTML = `<div class="sec-h"><h3>${escapeHtml(meta.label)}</h3><span class="cnt">${list.length} exame${list.length > 1 ? 's' : ''}</span><span class="sub">${brl(sub)}</span></div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Mnemônico</th><th>Exame</th><th>Leitura</th><th>Prazo</th><th class="num">Valor</th><th></th></tr></thead><tbody></tbody></table></div>`;
    const tb = sec.querySelector('tbody');
    for (const it of list) {
      const c = it.conf >= .85 ? 'g' : it.conf >= .7 ? 'w' : 'c';
      const tr = document.createElement('tr'); tr.className = it.status === 'flag' ? 'flag' : ['miss', 'semvalor', 'conferencia'].includes(it.status) ? 'miss' : '';
      tr.innerHTML = `<td>${it.ex ? `<span class="mn sec" style="--c:${meta.cor}">${it.ex.mnemonico}</span>` : '<span class="pill crit">?</span>'}</td>
        <td class="nm"><b>${escapeHtml(it.ex ? it.ex.nome : it.normalizado || it.lido)}</b><small>${it.ex ? (it.ex.codigoTuss ? 'TUSS ' + it.ex.codigoTuss : 'sem TUSS') : 'não está no AutoLAC'}${it.origem === 'manual' ? ' · valor aprovado pela gestão' : ''}</small></td>
        <td>${it.lido ? `<span class="conf ${c}"><i><b style="width:${Math.round(it.conf * 100)}%"></b></i>${Math.round(it.conf * 100)}%</span><small class="note" style="display:block">leu “${escapeHtml(it.lido)}”</small>` : '<span class="note">digitado</span>'}</td>
        <td>${it.prazoDias != null ? `<span class="pz ${it.prazoDias > 5 ? 'long' : ''}">${it.prazoDias} ${it.prazoDias > 1 ? 'dias úteis' : 'dia útil'}</span>` : '<span class="pz long">—</span>'}</td>
        <td class="num">${it.valor != null ? brl(it.valor) : '<span style="color:var(--red)">sem valor</span>'}</td>
        <td><button class="rm" title="Remover" data-rm="${it.uid}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M9 7V4h6v3m-7 0v13h8V7"/></svg></button></td>`;
      tb.appendChild(tr);
      if (it.status !== 'ok') { const ar = document.createElement('tr'); const td = document.createElement('td'); td.colSpan = 6; td.style.padding = '0'; td.innerHTML = askBox(it); ar.appendChild(td); tb.appendChild(ar); }
    }
    g.appendChild(sec);
  }
  stats();
}
function askBox(it) {
  const warn = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px;flex:none"><path d="M12 9v4m0 4h.01M10.3 3.9 2.5 17.5A2 2 0 0 0 4.2 20.5h15.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>';
  if (it.status === 'conferencia') return `<div class="ask crit"><span class="wait"><i></i>Aguardando conferência da gestão (solicitação enviada${it.solId ? '' : '…'}). A linha será preenchida automaticamente ao aprovar.</span></div>`;
  // Barra de ações comum: digitar o nome correto (puxa do catálogo) · enviar para conferência (com campos abertos)
  const acoes = `
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
      <button class="btn ghost sm" data-digitar="${it.uid}">✏️ Clique aqui para digitar o nome correto</button>
      <button class="btn red sm" data-send="${it.uid}">Enviar para conferência</button>
    </div>
    <div class="search" data-fixwrap="${it.uid}" ${it.abrirBusca ? '' : 'hidden'}><input class="in" placeholder="Digite o nome correto do exame — o sistema puxa do catálogo (ex.: insulina, ferritina, anti tireoglobulina)" data-fix="${it.uid}" autocomplete="off" value="${escapeHtml(it.buscaTxt || '')}"><div class="sug" hidden></div></div>
    ${it.abrirConf ? formConf(it) : ''}`;
  if (it.status === 'flag') return `<div class="ask"><div style="display:flex;gap:10px;align-items:flex-start;color:var(--warn)">${warn}<div>A IA leu <span class="hand">${escapeHtml(it.lido)}</span> e entendeu <b>${escapeHtml(it.ex.nome)}</b> (${Math.round(it.conf * 100)}% de certeza). Está correto?</div></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><button class="btn blue sm" data-ok="${it.uid}">Sim, está correto</button>
    ${it.cands.length > 1 ? `<div class="cands">${it.cands.slice(1, 4).map(c => `<button data-pick="${it.uid}" data-m="${c.ex.mnemonico}"><span class="mn">${c.ex.mnemonico}</span> ${escapeHtml(c.ex.nome)}<small>${escapeHtml(c.ex.setor)}</small></button>`).join('')}</div>` : ''}</div>
    <div class="note">Não é nenhum desses? Digite o nome certo abaixo ou mande para a gestão conferir.</div>${acoes}</div>`;
  if (it.status === 'semvalor') return `<div class="ask crit"><div style="display:flex;gap:10px;align-items:flex-start;color:var(--red)">${warn}<div><b>${escapeHtml(it.ex.nome)}</b> não tem valor cadastrado para o convênio <b>${escapeHtml(st.convenio)}</b>. Envie para a gestão definir valor e prazo — o orçamento atualiza sozinho quando for aprovado.</div></div>${acoes}</div>`;
  return `<div class="ask crit"><div style="display:flex;gap:10px;align-items:flex-start;color:var(--red)">${warn}<div>A IA leu <span class="hand">${escapeHtml(it.lido)}</span> (${escapeHtml(it.normalizado || '')}) mas <b>não encontrou no catálogo</b>. Digite o nome correto ou envie para conferência preenchendo o que souber.</div></div>${acoes}</div>`;
}
/** Mini-formulário da conferência: a atendente preenche o que souber (nome, mnemônico, prazo, valor); a gestão só confirma. */
function formConf(it) {
  const s = it.sug || {};
  return `<div class="form conf" data-confwrap="${it.uid}" style="grid-template-columns:2fr 1fr 1fr 1fr;align-items:end;background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:10px">
    <label class="f full" style="font-weight:800;color:var(--red)">Preencha o que souber — os campos em branco a gestão completa</label>
    <label class="f">Nome correto do exame *<input class="in" data-sf="nome" value="${escapeHtml(s.nome ?? it.buscaTxt ?? it.normalizado ?? it.lido ?? it.ex?.nome ?? '')}"></label>
    <label class="f">Mnemônico AutoLAC<input class="in" data-sf="mnemonico" placeholder="ex.: FERRI-DB" style="text-transform:uppercase;font-family:ui-monospace,monospace" value="${escapeHtml(s.mnemonico ?? it.ex?.mnemonico ?? '')}"></label>
    <label class="f">Prazo (dias úteis)<input class="in" type="number" min="0" data-sf="prazoDias" placeholder="?" value="${s.prazoDias ?? it.ex?.prazoDias ?? ''}"></label>
    <label class="f">Valor ${escapeHtml(st.convenio || '')} (R$)<input class="in" type="number" step="0.01" min="0" data-sf="valor" placeholder="?" value="${s.valor ?? ''}"></label>
    <label class="f full">Observação para a gestão<input class="in" data-sf="obs" placeholder="opcional: onde está no pedido, médico, urgência…" value="${escapeHtml(s.obs ?? '')}"></label>
    <div class="full" style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn red sm" data-confirmar="${it.uid}">Enviar agora para conferência</button><button class="btn ghost sm" data-fecharconf="${it.uid}">Cancelar</button></div>
  </div>`;
}
function stats() {
  const n = st.itens.length, t = st.itens.reduce((a, i) => a + (i.valor || 0), 0);
  $('kN').textContent = n; $('kT').textContent = brl(t); $('fT').textContent = brl(t);
  $('kC').textContent = st.itens.filter(i => ['flag', 'miss', 'semvalor'].includes(i.status)).length;
  $('kM').textContent = st.itens.filter(i => i.status === 'conferencia').length;
}

// ---------- interações ----------
$('groups').addEventListener('click', async e => {
  const b = e.target.closest('button'); if (!b) return; const find = u => st.itens.find(i => i.uid === u);
  if (b.dataset.rm) { st.itens = st.itens.filter(i => i.uid !== b.dataset.rm); render(); return; }
  if (b.dataset.ok) { const it = find(b.dataset.ok); it.status = 'ok'; it.conf = 1; await precificar(it); render(); D.ensinar(it.lido, it.ex.mnemonico, perfil.unidade); toast(`A IA aprendeu: “${it.lido}” = ${it.ex.mnemonico}`, true); return; }
  if (b.dataset.pick) { const it = find(b.dataset.pick); await escolher(it, b.dataset.m); return; }
  if (b.dataset.add) { const it = find(b.dataset.add); await escolher(it, b.dataset.m); return; }
  if (b.dataset.digitar) { const it = find(b.dataset.digitar); it.abrirBusca = !it.abrirBusca; render(); if (it.abrirBusca) document.querySelector(`[data-fix="${it.uid}"]`)?.focus(); return; }
  if (b.dataset.send) { const it = find(b.dataset.send); it.abrirConf = true; it.sug = it.sug || {}; if (it.buscaTxt) it.sug.nome = it.buscaTxt; render(); document.querySelector(`[data-confwrap="${it.uid}"] [data-sf="nome"]`)?.focus(); return; }
  if (b.dataset.fecharconf) { const it = find(b.dataset.fecharconf); it.abrirConf = false; render(); return; }
  if (b.dataset.confirmar) { const it = find(b.dataset.confirmar); lerSugestao(it); if (!it.sug.nome) { toast('Informe o nome do exame.'); return; } it.abrirConf = false; await enviarConferencia(it); return; }
  if (b.dataset.naoachou) { const it = find(b.dataset.naoachou); it.buscaTxt = b.dataset.txt; it.abrirConf = true; it.sug = { ...(it.sug || {}), nome: b.dataset.txt }; render(); document.querySelector(`[data-confwrap="${it.uid}"] [data-sf="mnemonico"]`)?.focus(); return; }
});
function lerSugestao(it) {
  const w = document.querySelector(`[data-confwrap="${it.uid}"]`); if (!w) return;
  const v = k => w.querySelector(`[data-sf="${k}"]`)?.value.trim() || '';
  const num = x => x === '' ? null : Number(x);
  it.sug = { nome: v('nome').toUpperCase() || null, mnemonico: v('mnemonico').toUpperCase() || null, prazoDias: num(v('prazoDias')), valor: num(v('valor')), obs: v('obs') || null };
}
// guarda o que a atendente digita para sobreviver ao re-render
document.addEventListener('input', e => { const inp = e.target; if (inp.matches('[data-fix]')) { const it = st.itens.find(i => i.uid === inp.dataset.fix); if (it) it.buscaTxt = inp.value; } if (inp.matches('[data-sf]')) { const it = st.itens.find(i => i.uid === inp.closest('[data-confwrap]')?.dataset.confwrap); if (it) lerSugestao(it); } });
async function escolher(it, mnemonico) {
  const cat = await D.catalogoMap(); const ex = cat[mnemonico]; if (!ex) return;
  it.ex = ex; it.status = 'ok'; it.conf = 1; it.abrirBusca = false; it.abrirConf = false; it.buscaTxt = ''; await precificar(it); render();
  if (it.lido) { D.ensinar(it.lido, mnemonico, perfil.unidade); toast(`Corrigido e aprendido: “${it.lido}” = ${mnemonico}`, true); }
}
// busca em linha (corrigir) e busca global (adicionar)
document.addEventListener('input', async e => {
  const inp = e.target; if (!(inp.matches('[data-fix]') || inp.id === 'q')) return;
  const box = inp.nextElementSibling; const v = inp.value.trim().toLowerCase(); if (v.length < 2) { box.hidden = true; return; }
  const cat = await D.catalogo();
  // busca por palavras: "insulina basal" acha INSULINA; "anti tireo" acha ANTI-TIREOGLOBULINA (qualquer ordem, sem acento)
  const toks = norm(v).split(' ').filter(Boolean); const vm = v.toUpperCase();
  const pont = c => { const nb = c.nomeBusca; let s = 0; for (const t of toks) { if (nb.includes(t)) s += nb.split(' ').some(w => w.startsWith(t)) ? 2 : 1; } if (c.mnemonico.includes(vm)) s += 3; if (nb.startsWith(toks[0] || '')) s += 1; return s; };
  const hits = cat.filter(c => c.ativo !== false && (st.renal ? c.renal : !c.renal)).map(c => ({ c, s: pont(c) })).filter(x => x.s >= Math.max(1, toks.length)) // todas as palavras (ou o mnemônico)
    .sort((a, b) => b.s - a.s || a.c.nomeBusca.length - b.c.nomeBusca.length).slice(0, 12).map(x => x.c);
  const naoAchou = inp.id === 'q' ? '<div class="note" style="padding:10px 12px">Nenhum exame encontrado.</div>'
    : `<div class="note" style="padding:10px 12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">Nenhum exame com esse nome no catálogo.<button class="btn red sm" data-naoachou="${inp.dataset.fix}" data-txt="${escapeHtml(inp.value.trim())}">Enviar “${escapeHtml(inp.value.trim())}” para conferência</button></div>`;
  box.innerHTML = hits.map(c => `<button data-${inp.id === 'q' ? 'novo' : 'add'}="${inp.dataset.fix || 'q'}" data-m="${c.mnemonico}"><span class="m">${c.mnemonico}</span><span>${escapeHtml(c.nome)}</span><span class="m" style="margin-left:auto">${brl(c.precos?.[st.convSlug])}</span></button>`).join('') || naoAchou;
  box.hidden = false;
});
$('sug').addEventListener('click', async e => { const b = e.target.closest('[data-novo]'); if (!b) return; const cat = await D.catalogoMap(); const it = { uid: Math.random().toString(36).slice(2), lido: null, conf: 1, cands: [], ex: cat[b.dataset.m], status: 'ok' }; st.manuais = st.manuais || {}; await precificar(it); st.itens.push(it); $('q').value = ''; $('sug').hidden = true; render(); });
document.addEventListener('click', e => { if (!e.target.closest('.search')) document.querySelectorAll('.sug').forEach(s => s.hidden = true); });

// ---------- conferência (tempo real) ----------
async function garantirOrcamento(status) {
  const dados = montarDados(status || 'rascunho');
  st.id = await D.gravarOrcamento(dados, st.id);
  if (!st.numero) { const d = await new Promise(r => { const off = D.ouvirOrcamento(st.id, x => { off(); r(x); }); }); st.numero = d.numero; $('numLbl').textContent = '#' + st.numero; }
  if (!st.offSol) st.offSol = D.ouvirSolicitacoesDoOrcamento(st.id, onSolicitacoes);
  return st.id;
}
async function enviarConferencia(it) {
  try {
    await garantirOrcamento('aguardando_conferencia');
    it.status = 'conferencia'; render();
    const sug = it.sug && Object.values(it.sug).some(v => v != null && v !== '') ? it.sug : null;
    it.solId = await D.solicitar({ orcamentoId: st.id, orcamentoNumero: st.numero, textoLido: it.lido || sug?.nome || (it.ex?.nome) || '', normalizadoIA: sug?.nome || it.normalizado || it.ex?.nome || null, guiaDb: it.ex ? { mnemonico: it.ex.mnemonico, nome: it.ex.nome, setor: it.ex.setor, prazoDias: it.ex.prazoDias } : null, convenio: st.convSlug, setorSugerido: it.ex?.setor, sugestao: sug });
    render(); toast('Enviado para conferência — a gestão já vê na fila' + (sug ? ' com o que você preencheu' : '') + '.', true);
  } catch (e) { it.status = it.ex ? 'semvalor' : 'miss'; render(); toast('Não foi possível enviar: ' + e.message); }
}
async function onSolicitacoes(sols) {
  let mudou = false;
  for (const s of sols) {
    const it = st.itens.find(i => i.solId === s.id); if (!it) continue;
    if (s.status === 'aprovada' && it.status === 'conferencia') {
      const cat = await D.catalogo(true); it.ex = cat.find(c => c.mnemonico === s.mnemonico) || it.ex; it.status = 'ok'; it.conf = 1;
      it.valor = s.precos?.[st.convSlug] ?? it.ex?.precos?.[st.convSlug] ?? null; it.prazoDias = s.prazoDias ?? it.ex?.prazoDias ?? null; it.origem = 'aprovado';
      if (it.valor == null) it.status = 'semvalor'; mudou = true; toast(`${s.mnemonico} aprovado pela gestão — orçamento atualizado`, true);
    }
    if (s.status === 'recusada' && it.status === 'conferencia') { it.status = it.ex ? 'semvalor' : 'miss'; it.recusa = s.motivo; mudou = true; toast(`Solicitação recusada: ${s.motivo || 'sem motivo'}`); }
  }
  if (mudou) render();
}

// ---------- gravar / whatsapp / limpar ----------
function montarDados(status) {
  const itens = st.itens.map(i => ({ mnemonico: i.ex?.mnemonico || null, nome: i.ex?.nome || i.normalizado || i.lido, setor: i.ex?.setor || null, valor: i.valor ?? null, prazoDias: i.prazoDias ?? null, lido: i.lido || null, status: i.status, solicitacaoId: i.solId || null }));
  const pend = st.itens.some(i => i.status !== 'ok');
  return { status: status || (pend ? 'aguardando_conferencia' : 'gravado'), unidade: perfil.unidade, atendenteNome: perfil.nome, convenio: st.convSlug, convenioNome: st.convenio, renal: st.renal,
    paciente: $('pac').value.trim() || null, pacienteBusca: norm($('pac').value), telefone: $('tel').value.trim() || null, telefoneDigitos: soDigitos($('tel').value),
    itens, total: st.itens.reduce((a, i) => a + (i.valor || 0), 0), qtd: itens.length, mnemonicos: itens.map(i => i.mnemonico).filter(Boolean),
    leituraIA: st.leitura ? { modelo: st.leitura.modelo, ms: st.leitura.ms, exames: st.leitura.exames.length, medico: st.leitura.medico || null, crm: st.leitura.crm || null } : null };
}
$('btnSalvar').addEventListener('click', async () => {
  if (!st.itens.length) { toast('Adicione ao menos um exame.'); return; }
  const pend = st.itens.filter(i => ['flag', 'miss', 'semvalor'].includes(i.status)).length; if (pend) { toast(`Ainda há ${pend} exame(s) a confirmar ou sem valor.`); return; }
  try { await garantirOrcamento(st.itens.some(i => i.status === 'conferencia') ? 'aguardando_conferencia' : 'gravado'); toast(`Orçamento #${st.numero} gravado`, true); } catch (e) { toast('Erro ao gravar: ' + e.message); }
});
$('btnZap').addEventListener('click', async () => {
  if (!st.itens.length) return; try { await garantirOrcamento(); } catch {}
  const linhas = st.itens.filter(i => i.ex).map(i => `• ${i.ex.nome}${i.prazoDias != null ? ` — ${i.prazoDias} d.u.` : ''}${i.valor != null ? ` — ${brl(i.valor)}` : ''}`);
  const txt = `*Célula Diagnósticos* — Orçamento ${st.numero ? '#' + st.numero : ''}\nPaciente: ${$('pac').value || '-'}\nConvênio: ${st.convenio}\n\n${linhas.join('\n')}\n\n*Total: ${brl(st.itens.reduce((a, i) => a + (i.valor || 0), 0))}*\nValidade: ${cfg.validadeDias || 7} dias · prazos em dias úteis após a coleta.`;
  const tel = soDigitos($('tel').value); window.open(`https://wa.me/${tel ? '55' + tel : ''}?text=${encodeURIComponent(txt)}`, '_blank');
  if (st.id) D.mudarStatus(st.id, 'enviado').catch(() => {});
});
$('btnLimpar').addEventListener('click', () => { if (st.offSol) st.offSol(); Object.assign(st, { id: null, numero: null, itens: [], fotos: [], leitura: null, offSol: null }); $('prevWrap').hidden = true; $('prev').innerHTML = ''; $('btnRun').disabled = true; $('btnRun').textContent = 'Analisar pedido com a IA'; $('numLbl').textContent = 'novo'; $('leituraInfo').textContent = ''; $('pac').value = ''; $('tel').value = ''; render(); });
render();
