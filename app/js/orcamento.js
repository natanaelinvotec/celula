// orcamento.js — tela da atendente: foto → IA → conferência → orçamento (tempo real com o painel).
import { exigirLogin, brl, norm, slug, toast, comprimirImagem, escapeHtml, SETORES, SETOR_ORDEM, soDigitos } from './firebase.js';
import { montarShell } from './shell.js';
import * as D from './dados.js';
import { lerPedido } from './ia.js';
import { mnemonicoHtml, copiar, fichaExame, fotoZoom, aviso, gerarPdf, numOrc, ICO, modal, fecharModal } from './ui.js';

const { perfil } = await exigirLogin();
const root = montarShell({ perfil, ativo: 'novo', titulo: 'Novo orçamento por IA', subtitulo: 'fotografe o pedido, confira e grave' });
const $ = id => document.getElementById(id);
const CONF_MIN = 0.85;

// ---------- estado ----------
const st = { id: null, numero: null, itens: [], fotos: [], convenio: null, convSlug: null, renal: false, manuais: {}, leitura: null, offSol: null, descartados: [] };
const cfg = await D.config(); const convs = ordenarConvenios(perfil.papel === 'admin' ? await D.conveniosTodos() : await D.convenios()); // atendentes só veem convênios visíveis
// Ordem do seletor: PARTICULAR (preferencial) → TABELA SOCIAL → PAX → PERFIS (A–Z) → demais (A–Z)
function ordenarConvenios(list) {
  const peso = c => { const n = norm(c.nome); if (n === 'PARTICULAR') return 0; if (n === 'TABELA SOCIAL') return 1; if (n === 'PAX') return 2; if (n.startsWith('PERFIL')) return 3; return 4; };
  return [...list].sort((a, b) => peso(a) - peso(b) || a.nome.localeCompare(b.nome, 'pt-BR'));
}
const ehPerfil = c => c && norm(c.nome).startsWith('PERFIL');
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
      <label class="f">Convênio *<select class="in" id="conv">${convs.map(c => `<option value="${c.slug}" ${c.slug === 'particular' ? 'selected' : ''}>${escapeHtml(c.nome)}${norm(c.nome) === 'PARTICULAR' ? ' — preferencial' : ''}${ehPerfil(c) ? ' ★' : ''}</option>`).join('')}</select></label>
      <label class="f">Paciente *<input class="in" id="pac" placeholder="Nome do interessado (obrigatório)" autocomplete="off" required></label>
      <label class="f">Celular / WhatsApp *<input class="in" id="tel" placeholder="(67) 9 9999-9999 (obrigatório)" inputmode="tel" required></label>
    </div></section>
    <section class="card"><div class="card-h"><h2>2 · Foto do pedido</h2></div><div class="card-b" style="display:flex;flex-direction:column;gap:10px">
      <div id="prevWrap" hidden><div class="preview" id="prev"></div></div>
      <div class="row" style="display:flex;gap:8px">
        <button class="btn blue" id="btnCam" style="flex:1;justify-content:center">📷 Tirar foto</button>
        <button class="btn ghost" id="btnUp" style="flex:1;justify-content:center">Enviar arquivo</button>
        <input type="file" id="fileCam" accept="image/*" capture="environment" hidden>
        <input type="file" id="fileUp" accept="image/*,.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" multiple hidden>
      </div>
      <div class="drop" id="drop">Arraste aqui a foto ou o arquivo do pedido<br><small>JPG, PNG, HEIC, PDF ou Word (.docx) · até 3 páginas</small></div>
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
      <button class="btn ghost" id="btnTransf" title="Passar este orçamento para outra atendente">Transferir</button>
      <button class="btn ghost" id="btnPdf" title="Baixar em PDF (só o total)">${ICO.pdf} PDF</button>
      <button class="btn ghost" id="btnUnit" title="Pedir à gestão a liberação do PDF com valor exame por exame">Valores unitários</button>
      <button class="btn ghost" id="btnZap">Enviar por WhatsApp</button>
      <button class="btn blue" id="btnSalvar">Gravar orçamento</button>
    </div></div>
  </section>
</div>`;

D.contar('apelidos').then(n => $('memN').textContent = n.toLocaleString('pt-BR')).catch(() => $('memN').textContent = '—');
st.convSlug = $('conv').value; st.convenio = convs.find(c => c.slug === st.convSlug)?.nome;
$('conv').addEventListener('change', async () => {
  st.convSlug = $('conv').value; const c = convs.find(x => x.slug === st.convSlug); st.convenio = c?.nome;
  if (ehPerfil(c)) { await carregarPerfil(c); return; }
  await reprecificar(); render(); toast('Valores recalculados pela tabela ' + st.convenio);
});
/** Perfil (pacote): carrega todos os exames que têm valor nessa tabela e fecha o total. */
async function carregarPerfil(c) {
  const cat = await D.catalogo(); const exs = cat.filter(e => e.ativo !== false && e.precos?.[c.slug] != null).sort((a, b) => a.nome.localeCompare(b.nome));
  if (!exs.length) { toast(`A tabela ${c.nome} não tem exames com valor cadastrado.`); await reprecificar(); render(); return; }
  const aplicar = async (substituir) => {
    st.manuais = await D.precosManuais(st.convSlug);
    if (substituir) st.itens = st.itens.filter(i => i.status === 'conferencia'); // mantém só o que está na gestão
    for (const ex of exs) { if (st.itens.some(i => i.ex?.mnemonico === ex.mnemonico)) continue; const it = { uid: Math.random().toString(36).slice(2), lido: null, conf: 1, cands: [], ex, status: 'ok', valor: null, prazoDias: null, origem: null }; await precificar(it); st.itens.push(it); }
    await reprecificar(); render(); toast(`${c.nome}: ${exs.length} exames carregados · total ${brl(st.itens.reduce((a, i) => a + (i.valor || 0), 0))}`, true);
  };
  const temItens = st.itens.some(i => i.status !== 'conferencia');
  if (!temItens) { await aplicar(true); return; }
  const m = modal(`<h2 style="margin:0 0 6px;color:var(--blue-d)">${escapeHtml(c.nome)}</h2><p class="note">Este perfil tem <b>${exs.length}</b> exames com valor na tabela. O orçamento já tem ${st.itens.length} exame(s): o que você quer fazer?</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;margin-top:14px"><button class="btn ghost" id="pfAdd">Adicionar aos exames atuais</button><button class="btn blue" id="pfSub">Substituir pelo perfil</button></div>`, { largura: 480 });
  m.querySelector('#pfAdd').onclick = async () => { fecharModal(); await aplicar(false); };
  m.querySelector('#pfSub').onclick = async () => { fecharModal(); await aplicar(true); };
}
/** Nome e celular são obrigatórios para gravar, gerar PDF ou enviar. */
function validarPaciente() {
  const nome = $('pac').value.trim(), tel = soDigitos($('tel').value); let ok = true;
  $('pac').style.borderColor = nome ? '' : 'var(--red)'; $('tel').style.borderColor = tel.length >= 10 ? '' : 'var(--red)';
  if (!nome) { toast('Informe o nome do paciente.'); $('pac').focus(); ok = false; }
  else if (tel.length < 10) { toast('Informe o celular com DDD (ex.: 67 99999-9999).'); $('tel').focus(); ok = false; }
  return ok;
}
// (pacote renal desativado a pedido da gestão — exames "-DB RENAL" ficam ocultos)

// ---------- fotos ----------
$('btnCam').onclick = () => $('fileCam').click(); $('btnUp').onclick = () => $('fileUp').click(); $('drop').onclick = () => $('fileUp').click();
$('fileCam').addEventListener('change', e => addFotos(e.target.files)); $('fileUp').addEventListener('change', e => addFotos(e.target.files));
['dragover', 'dragleave', 'drop'].forEach(ev => $('drop').addEventListener(ev, e => { e.preventDefault(); $('drop').classList.toggle('over', ev === 'dragover'); if (ev === 'drop') addFotos(e.dataTransfer.files); }));
async function addFotos(files) {
  for (const f of [...files]) {
    if (st.fotos.length >= 3) { toast('Máximo de 3 páginas por pedido.'); break; }
    const nome = (f.name || '').toLowerCase();
    try {
      if (f.type.startsWith('image/')) st.fotos.push(await comprimirImagem(f, 1600, .85));
      else if (f.type === 'application/pdf' || nome.endsWith('.pdf')) { toast('Convertendo as páginas do PDF…'); for (const u of await pdfParaImagens(f, 3 - st.fotos.length)) st.fotos.push(u); }
      else if (nome.endsWith('.docx') || f.type.includes('wordprocessingml')) { toast('Lendo o texto do Word…'); const t = await docxParaTexto(f); if (!t.trim()) { toast('O Word veio sem texto legível.'); continue; } st.fotos.push({ texto: t, nome: f.name }); }
      else if (nome.endsWith('.doc')) toast('Arquivo .doc antigo: salve como .docx ou PDF no Word e envie de novo.');
      else toast('Envie foto (JPG/PNG/HEIC), PDF ou Word (.docx).');
    } catch (e) { toast('Não consegui ler ' + f.name + ': ' + e.message); }
  }
  $('prevWrap').hidden = !st.fotos.length;
  $('prev').innerHTML = st.fotos.map((u, i) => typeof u === 'string' ? `<img src="${u}" alt="Pedido ${i + 1}">` : `<div class="docprev"><b>📄 ${escapeHtml(u.nome)}</b><pre>${escapeHtml(u.texto.slice(0, 900))}${u.texto.length > 900 ? '…' : ''}</pre></div>`).join('') + '<div class="scan" id="scan" hidden></div>'; fotoZoom($('prev'));
  $('btnRun').disabled = !st.fotos.length; if (st.fotos.length) toast(`${st.fotos.length} página(s) pronta(s). Clique em Analisar.`, true);
}
/** PDF → imagens JPEG das primeiras páginas (pdf.js, no navegador). */
async function pdfParaImagens(file, max = 3) {
  const { pdfjs } = await import('./relatorio.js'); const lib = await pdfjs();
  const pdf = await lib.getDocument({ data: await file.arrayBuffer() }).promise; const out = [];
  for (let p = 1; p <= Math.min(pdf.numPages, max); p++) { const page = await pdf.getPage(p); const vp = page.getViewport({ scale: 1.6 }); const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height; await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise; out.push(c.toDataURL('image/jpeg', .85)); }
  return out;
}
/** Word (.docx) → texto: o .docx é um zip; lê word/document.xml e tira as tags. */
async function docxParaTexto(file) {
  if (!window.JSZip) await new Promise((ok, err) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'; s.onload = ok; s.onerror = err; document.head.appendChild(s); });
  const zip = await window.JSZip.loadAsync(await file.arrayBuffer()); const xml = await zip.file('word/document.xml')?.async('string');
  if (!xml) return '';
  return xml.replace(/<\/w:p>/g, '\n').replace(/<w:tab\/>/g, '\t').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/\n{3,}/g, '\n\n').trim();
}

// ---------- IA ----------
$('btnRun').addEventListener('click', async () => {
  $('btnRun').disabled = true; $('prog').hidden = false; $('scan')?.removeAttribute('hidden');
  try {
    const dicas = await D.dicasAprendidas().catch(() => []);
    const r = await lerPedido(st.fotos, { onStatus: t => $('progTxt').textContent = t, dicas });
    st.leitura = r;
    if (r.paciente && !$('pac').value) $('pac').value = r.paciente;
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
    it.iaMn = best.ex.mnemonico; it.iaVia = best.via || null; it.iaStatus = it.status; // o que a IA sugeriu (acurácia)
    await precificar(it);
  } else {
    it.iaMn = null; it.iaStatus = 'miss';
    it.conf = e.confianca;
    // existe no catálogo antigo mas está fora do AutoLAC → conferência como possível nova negociação
    const cat = await D.catalogo(); const alvo = [norm(e.normalizado), norm(e.texto)].filter(Boolean);
    const fora = cat.find(c => c.foraAutolac && alvo.includes(c.nomeBusca)); if (fora) { it.fora = fora; it.motivo = 'fora_autolac'; }
  }
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
      tr.innerHTML = `<td>${mnemonicoHtml(it.ex, { cor: meta.cor })}</td>
        <td class="nm"><b>${escapeHtml(it.ex ? it.ex.nome : it.normalizado || it.lido)}</b><small>${it.ex ? (it.ex.codigoTuss ? 'TUSS ' + it.ex.codigoTuss : 'sem TUSS') : 'não está no AutoLAC'}${it.origem === 'manual' ? ' · valor aprovado pela gestão' : ''}</small></td>
        <td>${it.lido ? `<span class="conf ${c}"><i><b style="width:${Math.round(it.conf * 100)}%"></b></i>${Math.round(it.conf * 100)}%</span><small class="note" style="display:block">leu “${escapeHtml(it.lido)}”</small>` : '<span class="note">digitado</span>'}</td>
        <td>${it.prazoDias != null ? `<span class="pz ${it.prazoDias > 5 ? 'long' : ''}">${it.prazoDias} ${it.prazoDias > 1 ? 'dias úteis' : 'dia útil'}</span>` : '<span class="pz long">—</span>'}</td>
        <td class="num">${it.valor != null ? brl(it.valor) : '<span style="color:var(--red)">sem valor</span>'}</td>
        <td style="white-space:nowrap">${it.status === 'ok' ? `<button class="ib" title="Editar / trocar exame" data-edit="${it.uid}">${ICO.lapis}</button>` : ''}<button class="ib red" title="Remover" data-rm="${it.uid}">${ICO.lixo}</button></td>`;
      tb.appendChild(tr);
      if (it.status !== 'ok' || it.editar) { const ar = document.createElement('tr'); const td = document.createElement('td'); td.colSpan = 6; td.style.padding = '0'; td.innerHTML = askBox(it); ar.appendChild(td); tb.appendChild(ar); }
    }
    g.appendChild(sec);
  }
  stats();
}
function askBox(it) {
  const warn = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px;flex:none"><path d="M12 9v4m0 4h.01M10.3 3.9 2.5 17.5A2 2 0 0 0 4.2 20.5h15.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>';
  if (it.status === 'conferencia') return `<div class="ask crit"><span class="wait"><i></i>Aguardando conferência da gestão (solicitação enviada${it.solId ? '' : '…'}). A linha será preenchida automaticamente ao aprovar.</span></div>`;
  if (it.editar) return `<div class="ask"><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><b>Editar:</b> digite outro exame para substituir <b>${escapeHtml(it.ex.nome)}</b>, ou envie para conferência. <button class="btn ghost sm" data-manter="${it.uid}">Manter como está</button></div>
    <div class="search" data-fixwrap="${it.uid}"><input class="in" placeholder="Digite o nome ou mnemônico do exame correto" data-fix="${it.uid}" autocomplete="off" value="${escapeHtml(it.buscaTxt || '')}"><div class="sug" hidden></div></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn red sm" data-send="${it.uid}">Enviar para conferência</button></div>${it.abrirConf ? formConf(it) : ''}</div>`;
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
  if (it.fora) return `<div class="ask crit"><div style="display:flex;gap:10px;align-items:flex-start;color:var(--red)">${warn}<div>A IA leu <span class="hand">${escapeHtml(it.lido)}</span> = <b>${escapeHtml(it.fora.nome)}</b> (${escapeHtml(it.fora.mnemonico)}), mas este exame <b>está fora do AutoLAC</b> (sem valor). Envie para conferência como <b>possível nova negociação</b>, ou digite outro exame.</div></div>${acoes}</div>`;
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
  if (b.dataset.copy) { copiar(b.dataset.copy); return; }
  if (b.dataset.ficha) { const cat = await D.catalogoMap(); if (cat[b.dataset.ficha]) fichaExame(cat[b.dataset.ficha]); return; }
  if (b.dataset.edit) { const it = find(b.dataset.edit); it.editar = true; it.abrirBusca = true; render(); document.querySelector(`[data-fix="${it.uid}"]`)?.focus(); return; }
  if (b.dataset.manter) { const it = find(b.dataset.manter); it.editar = false; it.abrirConf = false; render(); return; }
  if (b.dataset.rm) { const it = find(b.dataset.rm); if (it?.lido) st.descartados.push({ lido: it.lido, iaMn: it.iaMn || null }); st.itens = st.itens.filter(i => i.uid !== b.dataset.rm); render(); return; }
  if (b.dataset.ok) { const it = find(b.dataset.ok); it.status = 'ok'; it.conf = 1; it.confirmado = true; await precificar(it); render(); D.ensinar(it.lido, it.ex.mnemonico, perfil.unidade); toast(`A IA aprendeu: “${it.lido}” = ${it.ex.mnemonico}`, true); return; }
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
  if (it.lido && it.iaMn !== mnemonico) it.corrigido = true; // a atendente trocou o que a IA sugeriu (ou a IA não achou)
  it.ex = ex; it.status = 'ok'; it.conf = 1; it.abrirBusca = false; it.abrirConf = false; it.editar = false; it.fora = null; it.buscaTxt = ''; await precificar(it); render();

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
  if (!st.numero) { const d = await new Promise(r => { const off = D.ouvirOrcamento(st.id, x => { off(); r(x); }); }); st.numero = d.numero; st.preToken = d.preToken || null; $('numLbl').textContent = '#' + numOrc(st.numero); }
  if (!st.offSol) st.offSol = D.ouvirSolicitacoesDoOrcamento(st.id, onSolicitacoes);
  return st.id;
}
async function enviarConferencia(it) {
  try {
    await garantirOrcamento('aguardando_conferencia');
    it.status = 'conferencia'; it.editar = false; render();
    const sug = it.sug && Object.values(it.sug).some(v => v != null && v !== '') ? it.sug : null;
    const fotos = await fotosReduzidas(); const guia = it.ex || it.fora;
    it.solId = await D.solicitar({ orcamentoId: st.id, orcamentoNumero: st.numero, textoLido: it.lido || sug?.nome || (guia?.nome) || '', normalizadoIA: sug?.nome || it.normalizado || guia?.nome || null, guiaDb: guia ? { mnemonico: guia.mnemonico, nome: guia.nome, setor: guia.setor, prazoDias: guia.prazoDias } : null, convenio: st.convSlug, setorSugerido: guia?.setor, sugestao: sug, fotos,
      motivo: it.fora ? 'fora_autolac' : it.ex ? 'sem_valor' : 'nao_encontrado' });
    render(); toast('Enviado para conferência — a gestão já vê na fila' + (sug ? ' com o que você preencheu' : '') + '.', true);
  } catch (e) { it.status = it.ex ? 'semvalor' : 'miss'; render(); toast('Não foi possível enviar: ' + e.message); }
}
/** Foto(s) do pedido reduzidas (~900 px, JPEG 0.7) para acompanhar a solicitação — a gestão confere a caligrafia. */
async function fotosReduzidas() {
  if (st._fotosSol) return st._fotosSol; const out = [];
  for (const u of st.fotos.slice(0, 3)) out.push(await new Promise(r => { const im = new Image(); im.onload = () => { const k = Math.min(1, 900 / Math.max(im.width, im.height)); const c = document.createElement('canvas'); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); r(c.toDataURL('image/jpeg', .7)); }; im.onerror = () => r(null); im.src = u; }));
  st._fotosSol = out.filter(Boolean); return st._fotosSol;
}
async function onSolicitacoes(sols) {
  let mudou = false;
  for (const s of sols) {
    if (s.tipo === 'valor_unitario') { if (s.status === 'aprovada' && !st.unitario) { marcarUnitarioLiberado(); aviso('Valores unitários liberados', `A gestão liberou o PDF exame por exame do orçamento #${numOrc(st.numero)} — clique em PDF.`); } if (s.status === 'recusada' && st.unitPedido) { st.unitPedido = false; $('btnUnit').textContent = 'Valores unitários'; aviso('Liberação negada', s.motivo || 'A gestão não liberou os valores unitários.'); } continue; }
    const it = st.itens.find(i => i.solId === s.id); if (!it) continue;
    if (s.status === 'aprovada' && it.status === 'conferencia') {
      const cat = await D.catalogo(true); it.ex = cat.find(c => c.mnemonico === s.mnemonico) || it.ex; it.status = 'ok'; it.conf = 1;
      it.valor = s.precos?.[st.convSlug] ?? it.ex?.precos?.[st.convSlug] ?? null; it.prazoDias = s.prazoDias ?? it.ex?.prazoDias ?? null; it.origem = 'aprovado';
      if (it.valor == null) it.status = 'semvalor'; mudou = true; aviso('Conferência aprovada', `${s.mnemonico} · ${it.ex?.nome || ''} voltou para o orçamento${it.valor != null ? ' com ' + brl(it.valor) : ''}${it.prazoDias != null ? ' · ' + it.prazoDias + ' d.u.' : ''}`);
    }
    if (s.status === 'recusada' && it.status === 'conferencia') { it.status = it.ex ? 'semvalor' : 'miss'; it.recusa = s.motivo; mudou = true; aviso('Conferência recusada', `${it.lido || it.ex?.nome || ''}: ${s.motivo || 'sem motivo informado'}`); }
  }
  if (mudou) render();
}

// ---------- gravar / whatsapp / limpar ----------
function montarDados(status) {
  const itens = st.itens.map(i => ({ mnemonico: i.ex?.mnemonico || null, nome: i.ex?.nome || i.normalizado || i.lido, setor: i.ex?.setor || null, valor: i.valor ?? null, prazoDias: i.prazoDias ?? null, lido: i.lido || null, status: i.status, solicitacaoId: i.solId || null, iaMn: i.iaMn ?? null, resultado: resultadoLeitura(i) }));
  const pend = st.itens.some(i => i.status !== 'ok');
  return { status: status || (pend ? 'aguardando_conferencia' : 'gravado'), unidade: perfil.unidade, atendenteNome: perfil.nome, convenio: st.convSlug, convenioNome: st.convenio, renal: st.renal,
    paciente: $('pac').value.trim() || null, pacienteBusca: norm($('pac').value), telefone: $('tel').value.trim() || null, telefoneDigitos: soDigitos($('tel').value),
    itens, total: st.itens.reduce((a, i) => a + (i.valor || 0), 0), qtd: itens.length, mnemonicos: itens.map(i => i.mnemonico).filter(Boolean),
    leituraIA: st.leitura ? { modelo: st.leitura.modelo, ms: st.leitura.ms, exames: st.leitura.exames.length, medico: st.leitura.medico || null, crm: st.leitura.crm || null, descartados: st.descartados } : null };
}
/** Como terminou cada leitura da IA (para o painel de acurácia): auto = IA acertou sozinha; confirmado = estava em dúvida e a atendente confirmou;
 *  corrigido = a atendente trocou o exame; conferencia = foi para a gestão; null = item adicionado à mão (não é leitura). */
function resultadoLeitura(i) {
  if (!i.lido) return null;
  if (i.corrigido) return 'corrigido';
  if (i.status === 'conferencia') return 'conferencia';
  if (i.resultado) return i.resultado;            // orçamento reaberto: mantém o que já foi apurado
  if (i.confirmado) return 'confirmado';
  if (i.status === 'ok' && i.iaStatus === 'ok') return 'auto';
  return i.status === 'ok' ? 'confirmado' : 'pendente';
}
$('btnSalvar').addEventListener('click', async () => {
  if (!st.itens.length) { toast('Adicione ao menos um exame.'); return; }
  if (!validarPaciente()) return;
  const pend = st.itens.filter(i => ['flag', 'miss', 'semvalor'].includes(i.status)).length; if (pend) { toast(`Ainda há ${pend} exame(s) a confirmar ou sem valor.`); return; }
  try {
    await garantirOrcamento(st.itens.some(i => i.status === 'conferencia') ? 'aguardando_conferencia' : 'gravado'); toast(`Orçamento #${numOrc(st.numero)} gravado — gerando PDF…`, true);
    await baixarPdf();
  } catch (e) { toast('Erro ao gravar: ' + e.message); }
});
async function baixarPdf() {
  if (!st.itens.length) { toast('Adicione ao menos um exame.'); return; }
  if (!validarPaciente()) return;
  try { if (!st.id) await garantirOrcamento(); if (!st.preToken) st.preToken = await D.garantirPreToken(st.id, { preToken: st.preToken }); await gerarPdf({ ...montarDados(), id: st.id, preToken: st.preToken, numero: st.numero, unitarioLiberado: !!st.unitario }, { validadeDias: cfg.validadeDias || 7, unitario: !!st.unitario }); }
  catch (e) { toast('Não consegui gerar o PDF: ' + e.message); }
}
$('btnPdf').addEventListener('click', baixarPdf);
// ---------- valores unitários: pede liberação à gestão; quando aprovada, o PDF sai exame por exame ----------
$('btnUnit').addEventListener('click', async () => {
  if (!st.itens.length) { toast('Adicione ao menos um exame.'); return; }
  if (!validarPaciente()) return;
  if (st.unitario) { toast('Liberado pela gestão — o PDF já sai com os valores unitários.', true); baixarPdf(); return; }
  if (st.unitPedido) { toast('Pedido já enviado — aguardando a gestão liberar.'); return; }
  try { await garantirOrcamento(); await D.solicitarLiberacaoUnitario({ orcamentoId: st.id, orcamentoNumero: st.numero, paciente: $('pac').value.trim() }); st.unitPedido = true; $('btnUnit').textContent = 'Aguardando liberação…'; toast('Pedido enviado — a gestão já vê na fila de solicitações.', true); }
  catch (e) { toast('Não foi possível pedir a liberação: ' + e.message); }
});
function marcarUnitarioLiberado() { st.unitario = true; st.unitPedido = false; $('btnUnit').textContent = '✓ Unitários liberados'; $('btnUnit').classList.add('blue'); $('btnUnit').classList.remove('ghost'); }
// ---------- transferir para outra atendente ----------
$('btnTransf').addEventListener('click', async () => {
  if (!st.itens.length) { toast('Nada para transferir ainda.'); return; }
  const us = (await D.usuarios()).filter(u => u.ativo !== false && u.id !== perfil.uid);
  if (!us.length) { toast('Nenhuma outra atendente cadastrada.'); return; }
  const m = modal(`<h2 style="margin:0 0 6px;color:var(--blue-d)">Transferir orçamento${st.numero ? ' #' + numOrc(st.numero) : ''}</h2><p class="note">O orçamento passa para a atendente escolhida, que o abre em “Meus orçamentos” e continua de onde parou.</p>
    <label class="f">Para quem<select class="in" id="trPara">${us.map(u => `<option value="${u.id}">${escapeHtml(u.nome || u.email)} · ${u.papel === 'admin' ? 'gestão' : 'atendente'}${u.status ? ' · ' + u.status : ''}</option>`).join('')}</select></label>
    <div style="display:flex;gap:8px;margin-top:14px;justify-content:flex-end"><button class="btn ghost" id="trNao">Cancelar</button><button class="btn blue" id="trSim">Transferir</button></div>`, { largura: 460 });
  m.querySelector('#trNao').onclick = fecharModal;
  m.querySelector('#trSim').onclick = async () => {
    const uid = m.querySelector('#trPara').value; const u = us.find(x => x.id === uid);
    try { await garantirOrcamento(); await D.transferirOrcamento(st.id, { uid, nome: u.nome || u.email }); fecharModal(); toast(`Orçamento #${numOrc(st.numero)} transferido para ${u.nome || u.email}`, true); $('btnLimpar').click(); }
    catch (e) { toast('Não foi possível transferir: ' + e.message); }
  };
});
$('btnZap').addEventListener('click', async () => {
  if (!st.itens.length) return; if (!validarPaciente()) return; try { await garantirOrcamento(); } catch {}
  const linhas = st.itens.filter(i => i.ex).map(i => `• ${i.ex.nome}${i.prazoDias != null ? ` — ${i.prazoDias} d.u.` : ''}${i.valor != null ? ` — ${brl(i.valor)}` : ''}`);
  const txt = `*Célula Diagnósticos* — Orçamento ${st.numero ? '#' + st.numero : ''}\nPaciente: ${$('pac').value || '-'}\nConvênio: ${st.convenio}\n\n${linhas.join('\n')}\n\n*Total: ${brl(st.itens.reduce((a, i) => a + (i.valor || 0), 0))}*\nValidade: ${cfg.validadeDias || 7} dias · prazos em dias úteis após a coleta.`;
  const tel = soDigitos($('tel').value); window.open(`https://wa.me/${tel ? '55' + tel : ''}?text=${encodeURIComponent(txt)}`, '_blank');
  if (st.id) D.mudarStatus(st.id, 'enviado').catch(() => {});
});
$('btnLimpar').addEventListener('click', () => { if (st.offSol) st.offSol(); Object.assign(st, { id: null, numero: null, itens: [], fotos: [], leitura: null, offSol: null, _fotosSol: null, unitario: false, unitPedido: false, preToken: null, descartados: [] }); $('btnUnit').textContent = 'Valores unitários'; $('btnUnit').classList.add('ghost'); $('btnUnit').classList.remove('blue'); history.replaceState(null, '', location.pathname); $('prevWrap').hidden = true; $('prev').innerHTML = ''; $('btnRun').disabled = true; $('btnRun').textContent = 'Analisar pedido com a IA'; $('numLbl').textContent = 'novo'; $('leituraInfo').textContent = ''; $('pac').value = ''; $('tel').value = ''; $('pac').style.borderColor = ''; $('tel').style.borderColor = ''; render(); });
render();

// ---------- abrir um orçamento existente para editar (orcamento.html?id=...) ----------
const idEdit = new URLSearchParams(location.search).get('id');
if (idEdit) (async () => {
  try {
    const o = await D.orcamento(idEdit); if (!o) { toast('Orçamento não encontrado.'); return; }
    const cat = await D.catalogoMap(); st.id = o.id; st.numero = o.numero; st.preToken = o.preToken || null; $('numLbl').textContent = '#' + numOrc(o.numero);
    if (o.convenio && convs.some(c => c.slug === o.convenio)) { $('conv').value = o.convenio; st.convSlug = o.convenio; st.convenio = o.convenioNome || convs.find(c => c.slug === o.convenio)?.nome; }
    $('pac').value = o.paciente || ''; $('tel').value = o.telefone || ''; st.renal = false;
    st.manuais = await D.precosManuais(st.convSlug);
    st.itens = (o.itens || []).map(i => { const ex = i.mnemonico ? cat[i.mnemonico] : null; return { uid: Math.random().toString(36).slice(2), lido: i.lido || null, normalizado: i.nome, confIA: 1, conf: 1, cands: [], ex, status: i.status === 'conferencia' ? 'conferencia' : ex ? (i.valor != null ? 'ok' : 'semvalor') : 'miss', valor: i.valor ?? null, prazoDias: i.prazoDias ?? null, origem: null, solId: i.solicitacaoId || null, iaMn: i.iaMn ?? null, resultado: i.resultado || null }; });
    if (o.unitarioLiberado) marcarUnitarioLiberado();
    st.offSol = D.ouvirSolicitacoesDoOrcamento(st.id, onSolicitacoes);
    render(); $('leituraInfo').textContent = `Editando o orçamento #${numOrc(o.numero)} de ${o.atendenteNome || ''}`; toast(`Orçamento #${numOrc(o.numero)} carregado para edição`, true);
  } catch (e) { toast('Erro ao abrir: ' + e.message); }
})();
