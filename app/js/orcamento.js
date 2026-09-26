// orcamento.js — tela da atendente: foto → IA → conferência → orçamento (tempo real com o painel).
import { exigirLogin, brl, norm, slug, toast, comprimirImagem, escapeHtml, SETORES, SETOR_ORDEM, soDigitos } from './firebase.js';
import { montarShell } from './shell.js';
import * as D from './dados.js';
import { lerPedido } from './ia.js';
import { mnemonicoHtml, copiar, fichaExame, fotoZoom, aviso, gerarPdf, numOrc, ICO, modal, fecharModal, rotuloQtd } from './ui.js';

const { perfil } = await exigirLogin();
const root = montarShell({ perfil, ativo: 'novo', titulo: 'Novo orçamento por IA', subtitulo: 'fotografe o pedido, confira e grave' });
const $ = id => document.getElementById(id);
const CONF_MIN = 0.85;

// ---------- estado ----------
const st = { id: null, numero: null, itens: [], fotos: [], convenio: null, convSlug: null, renal: false, manuais: {}, leitura: null, offSol: null, descartados: [], duplo: false, convSlug2: null, convenio2: null, manuais2: {}, lancarEm: 1, perfis: {} };
// lancarEm: tabela em que os NOVOS exames entram (1 = 1º convênio; vira 2 quando a caixinha é marcada). perfis: {slug: [mnemônicos]} das tabelas PERFIL em uso.
// dois convênios: cada item tem `tab` (1 ou 2). Sem o modo duplo, tudo é 1.
const slugDe = it => (st.duplo && it.tab === 2) ? st.convSlug2 : st.convSlug;
const nomeDe = it => (st.duplo && it.tab === 2) ? st.convenio2 : st.convenio;
const vTot = i => (i.valor || 0) * (Number(i.qtd) || 1); // valor da linha = unitário × quantidade (amostras/dosagens/pontos)
/** Exame já está no orçamento? Devolve a linha existente (ignora linhas em conferência). */
const jaTem = mn => mn ? st.itens.find(i => i.ex?.mnemonico === mn && i.status !== 'conferencia') : null;
/** Marca na linha existente que o pedido repetiu o exame e avisa a atendente. */
function marcarRepetido(existente, lido, origem) {
  existente.repetido = [...new Set([...(existente.repetido || []), lido || origem || 'adicionado de novo'])];
  toast(`${existente.ex.nome} já está no orçamento${lido ? ` — o pedido repete em “${lido}”` : ''}. Não foi duplicado.`);
}
const curto = n => String(n || '').replace(/^tabela\s+/i, '').split(/\s+/).slice(0, 2).join(' ');
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
      <label class="chk" style="display:flex;gap:8px;align-items:center;font-weight:700;cursor:pointer"><input type="checkbox" id="duplo"> Orçamento com dois convênios</label>
      <label class="f" id="conv2Wrap" hidden>Convênio 2 — para o que o 1º não cobre<select class="in" id="conv2">${convs.map(c => `<option value="${c.slug}" ${norm(c.nome) === 'TABELA SOCIAL' ? 'selected' : ''}>${escapeHtml(c.nome)}${ehPerfil(c) ? ' ★' : ''}</option>`).join('')}</select><small hidden class="note" style="text-transform:none;letter-spacing:0;font-weight:600;margin-top:4px">Os exames que já estavam ficam no 1º; os próximos entram em: <label style="display:inline-flex;gap:4px;align-items:center;margin:0 6px 0 2px;cursor:pointer"><input type="radio" name="lancarEm" value="1"> 1º</label><label style="display:inline-flex;gap:4px;align-items:center;cursor:pointer"><input type="radio" name="lancarEm" value="2" checked> 2º</label>. Sem valor numa tabela, cai para a outra. Perfil (★) entra completo e sobressai. Para trocar um exame de tabela, clique no botão da coluna “Tabela”.</small></label>
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
      <div><span class="note">Total</span><br><b style="font-size:1.4rem;color:var(--blue-d)" id="fT">R$ 0,00</b><small class="note" id="fT2" style="display:block" hidden></small></div>
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
  const antes = st.convSlug; st.convSlug = $('conv').value; const c = convs.find(x => x.slug === st.convSlug); st.convenio = c?.nome;
  limparPerfil(antes);
  if (ehPerfil(c)) { await carregarPerfil(c, 1); return; }
  await reprecificar(); render(); toast('Valores recalculados pela tabela ' + st.convenio);
});
$('duplo').addEventListener('change', async () => {
  st.duplo = $('duplo').checked; $('conv2Wrap').hidden = !st.duplo;
  if (st.duplo) {
    st.convSlug2 = $('conv2').value; st.convenio2 = convs.find(c => c.slug === st.convSlug2)?.nome; if (st.convSlug2 === st.convSlug) { toast('Escolha um 2º convênio diferente do 1º.'); }
    st.lancarEm = 2; syncLancarEm(); // daqui em diante o que entrar vai para o 2º
    const c2 = convs.find(c => c.slug === st.convSlug2); if (ehPerfil(c2)) { await carregarPerfil(c2, 2); return; }
  } else { const antes2 = st.convSlug2; st.convSlug2 = null; limparPerfil(antes2); st.lancarEm = 1; for (const it of st.itens) { it.tab = 1; it.tabFixo = false; it.tabLanc = 1; } }
  await reprecificar(); render(); toast(st.duplo ? `Dois convênios: ${st.convenio} + ${st.convenio2} — os próximos exames entram em ${st.convenio2}` : 'Voltou para um convênio só', true);
});
$('conv2').addEventListener('change', async () => {
  const antes = st.convSlug2; st.convSlug2 = $('conv2').value; st.convenio2 = convs.find(c => c.slug === st.convSlug2)?.nome;
  limparPerfil(antes); for (const it of st.itens) if (!it.tabFixo) it.tab = it.tabLanc === 2 ? 2 : 1;
  const c2 = convs.find(c => c.slug === st.convSlug2); if (ehPerfil(c2)) { await carregarPerfil(c2, 2); return; }
  await reprecificar(); render(); toast('2º convênio: ' + st.convenio2);
});
document.addEventListener('change', e => { if (!e.target.matches('[name="lancarEm"]')) return; st.lancarEm = Number(e.target.value) === 2 ? 2 : 1; toast(`Novos exames entram em ${st.lancarEm === 2 ? st.convenio2 : st.convenio}`, true); });
function syncLancarEm() { document.querySelectorAll('[name="lancarEm"]').forEach(r => { r.checked = Number(r.value) === st.lancarEm; }); }
/** Perfil (pacote) saiu das tabelas: tira os exames que só entraram por causa dele (não lidos do pedido). */
function limparPerfil(slug) {
  if (!slug || !st.perfis[slug] || slug === st.convSlug || (st.duplo && slug === st.convSlug2)) return;
  delete st.perfis[slug];
  st.itens = st.itens.filter(i => !(i.viaPerfil === slug && !i.lido && i.status !== 'conferencia'));
}
/**
 * Perfil (pacote) na posição `tabN`: entra COMPLETO. Os exames que faltam são adicionados; os que já estavam e fazem parte
 * do perfil são reprecificados pela regra "perfil sobressai" (troca de tabela e reduz o valor) — nunca duplica.
 */
async function carregarPerfil(c, tabN = 1, soSomar = false) {
  const cat = await D.catalogo(); const exs = cat.filter(e => e.ativo !== false && e.precos?.[c.slug] != null).sort((a, b) => a.nome.localeCompare(b.nome));
  if (!exs.length) { toast(`A tabela ${c.nome} não tem exames com valor cadastrado.`); await reprecificar(); render(); return; }
  st.perfis[c.slug] = exs.map(e => e.mnemonico);
  const aplicar = async (substituir) => {
    if (substituir) st.itens = st.itens.filter(i => i.status === 'conferencia'); // mantém só o que está na gestão
    let novos = 0, jaTinha = 0;
    for (const ex of exs) {
      const ex0 = jaTem(ex.mnemonico); if (ex0) { jaTinha++; continue; }
      const it = { uid: Math.random().toString(36).slice(2), lido: null, conf: 1, cands: [], ex, status: 'ok', valor: null, prazoDias: null, origem: null, viaPerfil: c.slug, tabLanc: tabN }; st.itens.push(it); novos++;
    }
    await reprecificar(); render();
    const noPerfil = st.itens.filter(i => i.ex && st.perfis[c.slug].includes(i.ex.mnemonico) && slugDe(i) === c.slug).length;
    toast(`${c.nome}: ${novos} exame(s) adicionados${jaTinha ? `, ${jaTinha} já constavam` : ''} · ${noPerfil}/${exs.length} no perfil · total ${brl(st.itens.reduce((a, i) => a + vTot(i), 0))}`, true);
  };
  const temItens = st.itens.some(i => i.status !== 'conferencia');
  if (!temItens || tabN === 2 || soSomar) { await aplicar(false); return; } // no 2º convênio o perfil sempre soma ao que já existe
  const m = modal(`<h2 style="margin:0 0 6px;color:var(--blue-d)">${escapeHtml(c.nome)}</h2><p class="note">Este perfil tem <b>${exs.length}</b> exames com valor na tabela e entra completo. O orçamento já tem ${st.itens.length} exame(s): o que você quer fazer?</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;margin-top:14px"><button class="btn ghost" id="pfAdd">Somar ao que já tem (sem duplicar)</button><button class="btn blue" id="pfSub">Substituir pelo perfil</button></div>`, { largura: 480 });
  m.querySelector('#pfAdd').onclick = async () => { fecharModal(); await aplicar(false); };
  m.querySelector('#pfSub').onclick = async () => { fecharModal(); await aplicar(true); };
}
/** Perfis em uso com exames faltando (a atendente removeu): [{slug, nome, faltam:[mn]}]. O valor rateado só vale com o pacote inteiro. */
function perfisIncompletos() {
  const out = [];
  for (const [slug, mns] of Object.entries(st.perfis)) {
    if (slug !== st.convSlug && !(st.duplo && slug === st.convSlug2)) continue;
    const faltam = mns.filter(m => !jaTem(m)); if (faltam.length) out.push({ slug, nome: convs.find(c => c.slug === slug)?.nome || slug, faltam });
  }
  return out;
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
  // termo composto ("Ferrograma", "Lipidograma"…): abre os exames do grupo cadastrado pela gestão
  const g = await D.grupoPara(e.texto, e.normalizado).catch(() => null);
  if (g && await expandirGrupo(g, e.texto)) return;
  const cands = await D.resolver(e.texto, { renal: st.renal, normalizadoIA: e.normalizado });
  const qtd = Math.max(1, Math.min(12, Number(e.quantidade) || 1));
  const it = { uid: Math.random().toString(36).slice(2), lido: e.texto, normalizado: e.normalizado, confIA: e.confianca, cands, ex: null, status: 'miss', valor: null, prazoDias: null, origem: null, qtd };
  if (cands.length) {
    const best = cands[0];
    if (best.via !== 'busca' || best.confianca >= CONF_MIN_CFG) { const ex0 = jaTem(best.ex.mnemonico); if (ex0) { marcarRepetido(ex0, e.texto); return; } }
    it.ex = best.ex; it.conf = Math.min(e.confianca, best.confianca);
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
  // "EPF 3 amostras": se o catálogo tem a série (EPF, EPF2, EPF3 / "2ª AMOSTRA"), vira uma linha por amostra; senão fica 1 linha com quantidade
  // "curva glicêmica 5 dosagens": se existe o exame específico (CURVA GLICÊMICA - 5 DOSAGENS), usa ele em vez de multiplicar
  if (qtd > 1 && it.ex) { const v = await varianteComQuantidade(it.ex, qtd); if (v) { it.ex = v; it.iaMn = v.mnemonico; it.qtd = 1; await precificar(it); return; }
    // o exame casado já traz outra quantidade no nome (ex.: "[3 DOSAGENS]" e o pedido diz 4): não multiplica, pede confirmação
    if (/\d+\s*(DOSAGENS?|PONTOS?|AMOSTRAS?)/.test(it.ex.nomeBusca)) { it.qtd = 1; it.status = 'flag'; it.conf = Math.min(it.conf, 0.6); return; } }
  if (qtd > 1 && it.ex) { const serie = await serieDoExame(it.ex, qtd); if (serie.length === qtd - 1) { it.qtd = 1; for (const ex of serie) { if (jaTem(ex.mnemonico)) { marcarRepetido(jaTem(ex.mnemonico), e.texto); continue; } const s2 = { uid: Math.random().toString(36).slice(2), lido: e.texto, normalizado: e.normalizado, confIA: e.confianca, cands: [], ex, status: it.status === 'flag' ? 'flag' : 'ok', conf: it.conf, iaMn: ex.mnemonico, iaStatus: it.status, valor: null, prazoDias: null, origem: null, qtd: 1, serieDe: it.uid }; await precificar(s2); st.itens.push(s2); } } }
}
/** Modal: a atendente monta o grupo para o termo lido (nome, grafias, exames) — grava em `grupos` e já abre as linhas. */
async function abrirEditorGrupo(it) {
  const cat = await D.catalogo(); const lido = it.lido || ''; const sel = new Map();
  const m = modal(`<h2 style="margin:0 0 4px;color:var(--blue-d)">🧩 Grupo de pedido</h2>
    <p class="note">O termo <b>“${escapeHtml(lido)}”</b> abre vários exames. Escolha quais — da próxima vez a IA já sabe.</p>
    <div class="form" style="grid-template-columns:1fr 1fr;gap:10px">
      <label class="f">Nome do grupo<input class="in" id="gNome" value="${escapeHtml(lido.replace(/\b\w/g, c => c.toUpperCase()))}"></label>
      <label class="f">Outras grafias (separe por vírgula)<input class="in" id="gTermos" placeholder="ex.: perfil de ferro, cinética do ferro"></label>
      <label class="f full">Buscar exame para incluir<div class="search"><input class="in" id="gBusca" placeholder="nome ou mnemônico" autocomplete="off"><div class="sug" id="gSug" hidden></div></div></label>
      <div class="full" id="gLista" style="display:flex;gap:6px;flex-wrap:wrap;min-height:34px"></div>
    </div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px"><button class="btn ghost" id="gCancel">Cancelar</button><button class="btn blue" id="gSalvar">Salvar grupo e adicionar exames</button></div>`, { largura: 640 });
  const $m = id => m.querySelector('#' + id);
  const desenhar = () => { $m('gLista').innerHTML = [...sel.values()].map(ex => `<span class="pill on" style="gap:6px">${escapeHtml(ex.mnemonico)} · ${escapeHtml(ex.nome)} <button class="ib" data-gdel="${escapeHtml(ex.mnemonico)}" title="Tirar">${ICO.x}</button></span>`).join('') || '<span class="note">Nenhum exame escolhido ainda.</span>'; };
  desenhar();
  $m('gBusca').addEventListener('input', () => { const v = norm($m('gBusca').value); const box = $m('gSug'); if (v.length < 2) { box.hidden = true; return; } const toks = v.split(' ');
    const hits = cat.filter(c => c.ativo !== false && !c.renal && toks.every(t => c.nomeBusca.includes(t) || c.mnemonico.includes(t))).slice(0, 10);
    box.innerHTML = hits.map(c => `<button data-gadd="${c.mnemonico}"><span class="m">${c.mnemonico}</span><span>${escapeHtml(c.nome)}</span></button>`).join('') || '<div class="note" style="padding:8px 12px">Nada encontrado.</div>'; box.hidden = false; });
  m.addEventListener('click', e => { const a = e.target.closest('[data-gadd]'); if (a) { const ex = cat.find(c => c.mnemonico === a.dataset.gadd); if (ex) sel.set(ex.mnemonico, ex); $m('gBusca').value = ''; $m('gSug').hidden = true; desenhar(); return; }
    const d = e.target.closest('[data-gdel]'); if (d) { sel.delete(d.dataset.gdel); desenhar(); } });
  $m('gCancel').onclick = () => fecharModal();
  $m('gSalvar').onclick = async () => {
    const nome = $m('gNome').value.trim(); if (!nome || !sel.size) { toast('Dê um nome e escolha ao menos um exame.'); return; }
    const termos = [lido, nome, ...$m('gTermos').value.split(',')].map(t => t.trim()).filter(Boolean);
    try { await D.salvarGrupo(null, { nome, termos, mnemonicos: [...sel.keys()] }); } catch (e) { toast('Não foi possível gravar o grupo: ' + e.message); return; }
    fecharModal(); st.itens = st.itens.filter(i => i.uid !== it.uid);
    await expandirGrupo({ nome, mnemonicos: [...sel.keys()] }, lido); render();
  };
}
/** Abre um grupo de pedido em linhas (uma por exame do catálogo). Devolve quantas linhas entraram. */
async function expandirGrupo(g, lido) {
  const cat = await D.catalogoMap(); let n = 0;
  for (const mn of g.mnemonicos) { const ex = cat[mn]; if (!ex || ex.ativo === false) continue; const ex0 = jaTem(mn); if (ex0) { if (ex0.grupo !== g.nome) marcarRepetido(ex0, lido, 'grupo ' + g.nome); continue; }
    const it = { uid: Math.random().toString(36).slice(2), lido, normalizado: g.nome.toUpperCase(), confIA: 1, conf: 1, cands: [], ex, status: 'ok', valor: null, prazoDias: null, origem: null, qtd: 1, grupo: g.nome, iaMn: mn, iaStatus: 'ok' };
    await precificar(it); st.itens.push(it); n++; }
  if (n) toast(`“${lido}” = grupo ${g.nome}: ${n} exame${n > 1 ? 's' : ''} adicionado${n > 1 ? 's' : ''}`, true);
  return n;
}
/** Exame do catálogo que já embute a quantidade no nome (ex.: "CURVA GLICEMICA 5 DOSAGENS", "LACTOSE 4 PONTOS"). */
async function varianteComQuantidade(ex, n) {
  const cat = await D.catalogo(); const pref = ex.nomeBusca.split(' ').slice(0, 2).join(' ');
  const re = new RegExp(`(^|[^0-9])${n}\\s*(DOSAGENS?|PONTOS?|AMOSTRAS?|COLETAS?)\\b`);
  return cat.filter(c => c.ativo !== false && !c.renal && c.nomeBusca.startsWith(pref) && re.test(c.nomeBusca)).sort((a, b) => a.nomeBusca.length - b.nomeBusca.length)[0] || null;
}
/** Exames "irmãos" numerados de um exame base (EPF → EPF2, EPF3…; ou nome com "2ª AMOSTRA"/"3A AMOSTRA"). */
async function serieDoExame(ex, n) {
  const cat = await D.catalogo(); const base = ex.mnemonico.replace(/-DB$/, ''); const out = [];
  for (let k = 2; k <= n; k++) {
    const mn = cat.find(c => c.ativo !== false && !c.renal && (c.mnemonico === base + k || c.mnemonico === `${base}${k}-DB` || c.mnemonico === `${base}-${k}`))
      || cat.find(c => c.ativo !== false && !c.renal && c.nomeBusca.startsWith(ex.nomeBusca.split(' ')[0]) && new RegExp(`\\b${k}\\s*[ªAº]?\\s*(AMOSTRA|DOSAGEM|COLETA|PONTO)`).test(c.nomeBusca));
    if (!mn || mn.mnemonico === ex.mnemonico) break; out.push(mn);
  }
  return out;
}
/** Qual das duas tabelas é PERFIL (2 tem prioridade se as duas forem). null = nenhuma. */
function tabPerfil() { if (!st.duplo || !st.convSlug2) return ehPerfil(convs.find(c => c.slug === st.convSlug)) ? 1 : null; if (ehPerfil(convs.find(c => c.slug === st.convSlug2))) return 2; return ehPerfil(convs.find(c => c.slug === st.convSlug)) ? 1 : null; }
/**
 * Regra de precificação com dois convênios (combinada com o Natanael, 25/09):
 *  - cada exame fica na tabela em que foi LANÇADO (tabLanc): antes da caixinha tudo é 1º; depois, o que entra vai para o 2º.
 *    Se a tabela de lançamento não tem o exame, cai para a outra.
 *  - PERFIL sobressai: se uma das tabelas é perfil e o exame faz parte dele, o perfil ganha no empate ou quando é mais barato
 *    (valor cheio da tabela); se a outra tabela for mais barata (ou custo zero) o exame fica onde está — nunca duplica.
 *  - troca manual pelo botão da coluna Tabela (tabFixo) vale acima de tudo.
 */
async function precificar(it) {
  if (!it.ex) return;
  if (it.tabLanc == null) it.tabLanc = (st.duplo && st.convSlug2) ? (st.lancarEm === 2 ? 2 : 1) : 1;
  let p;
  if (st.duplo && st.convSlug2) {
    const pr = t => D.precoPrazo(it.ex, t === 2 ? st.convSlug2 : st.convSlug, t === 2 ? st.manuais2 : st.manuais);
    if (it.tabFixo) p = await pr(it.tab);
    else {
      const t0 = it.tabLanc === 2 ? 2 : 1, t1 = t0 === 2 ? 1 : 2;
      it.tab = t0; p = await pr(t0);
      if (p.valor == null) { const p2 = await pr(t1); if (p2.valor != null) { it.tab = t1; p = p2; } }
      const tp = tabPerfil();
      if (tp && it.tab !== tp && st.perfis[tp === 2 ? st.convSlug2 : st.convSlug]?.includes(it.ex.mnemonico)) {
        const pp = await pr(tp); if (pp.valor != null && (p.valorTabela == null || pp.valorTabela <= p.valorTabela)) { it.tab = tp; p = pp; }
      }
    }
  } else { it.tab = 1; p = await D.precoPrazo(it.ex, st.convSlug, st.manuais); }
  it.valor = p.valor; it.prazoDias = p.prazoDias; it.origem = p.origem; it.valorTabela = p.valorTabela ?? p.valor; it.repassePct = p.repassePct ?? 100;
  if (it.valor == null && it.status === 'ok') it.status = 'semvalor';
  if (it.valor != null && it.status === 'semvalor') it.status = 'ok';
}
async function reprecificar() { st.manuais = await D.precosManuais(st.convSlug); st.manuais2 = st.duplo && st.convSlug2 ? await D.precosManuais(st.convSlug2) : {}; for (const it of st.itens) if (it.status !== 'conferencia') await precificar(it); }
async function reresolver() { const lidos = st.itens.filter(i => i.lido && i.status !== 'conferencia'); st.itens = st.itens.filter(i => !lidos.includes(i)); for (const l of lidos) await adicionarLido({ texto: l.lido, normalizado: l.normalizado, confianca: l.confIA ?? 1 }); render(); }

// ---------- render ----------
function render() {
  const g = $('groups');
  if (!st.itens.length) { g.innerHTML = '<div class="card"><div class="card-b" style="text-align:center;color:var(--muted);font-weight:700;padding:40px">Nenhum exame ainda.</div></div>'; stats(); return; }
  g.innerHTML = '';
  for (const p of perfisIncompletos()) { // perfil é pacote: o valor rateado só vale com todos os exames
    g.insertAdjacentHTML('beforeend', `<div class="ask crit" style="margin-bottom:10px"><div style="display:flex;gap:10px;align-items:flex-start;color:var(--red)"><div><b>${escapeHtml(p.nome)} incompleto</b> — faltam ${p.faltam.length} exame(s): ${escapeHtml(p.faltam.join(', '))}. O valor rateado do perfil só vale com o pacote inteiro; complete ou troque o convênio.</div></div><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px"><button class="btn blue sm" data-recompor="${escapeHtml(p.slug)}">Recompor perfil</button></div></div>`);
  }
  const semSetor = st.itens.filter(i => !i.ex);
  const grupos = SETOR_ORDEM.map(s => [s, st.itens.filter(i => i.ex && i.ex.setor === s)]).filter(x => x[1].length);
  if (semSetor.length) grupos.push(['Não identificado', semSetor]);
  for (const [s, list] of grupos) {
    const meta = SETORES[s] || { cor: 'var(--red)', label: 'Não encontrado no catálogo — precisa de conferência' };
    const sub = list.reduce((a, i) => a + vTot(i), 0);
    const sec = document.createElement('section'); sec.className = 'sector'; sec.style.setProperty('--c', meta.cor);
    sec.innerHTML = `<div class="sec-h"><h3>${escapeHtml(meta.label)}</h3><span class="cnt">${list.length} exame${list.length > 1 ? 's' : ''}</span><span class="sub">${brl(sub)}</span></div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Mnemônico</th><th>Exame</th><th>Leitura</th>${st.duplo ? '<th>Tabela</th>' : ''}<th>Prazo</th><th title="Amostras / dosagens / pontos">Qtd</th><th class="num">Valor</th><th></th></tr></thead><tbody></tbody></table></div>`;
    const tb = sec.querySelector('tbody');
    for (const it of list) {
      const c = it.conf >= .85 ? 'g' : it.conf >= .7 ? 'w' : 'c';
      const tr = document.createElement('tr'); tr.className = it.status === 'flag' ? 'flag' : ['miss', 'semvalor', 'conferencia'].includes(it.status) ? 'miss' : '';
      tr.innerHTML = `<td>${mnemonicoHtml(it.ex, { cor: meta.cor })}</td>
        <td class="nm"><b>${escapeHtml(it.ex ? it.ex.nome : it.normalizado || it.lido)}${it.qtd > 1 ? `<span style="color:var(--c3)">${escapeHtml(rotuloQtd(it.ex?.nome, it.qtd))}</span>` : ''}</b><small>${it.ex ? (it.ex.codigoTuss ? 'TUSS ' + it.ex.codigoTuss : 'sem TUSS') : 'não está no AutoLAC'}${it.origem === 'manual' ? ' · valor aprovado pela gestão' : ''}${it.valor != null && it.repassePct && it.repassePct !== 100 ? ` · <span class="pill on" style="padding:0 7px" title="O convênio cobre ${100 - it.repassePct}% da tabela (${brl(it.valorTabela)}); o paciente paga ${it.repassePct}%">paciente paga ${it.repassePct}% · tabela ${brl(it.valorTabela)}</span>` : ''}${it.grupo ? ` · <span class="pill on" style="padding:0 7px">grupo ${escapeHtml(it.grupo)}</span>` : ''}${it.repetido?.length ? ` · <span class="pill warn" style="padding:0 7px" title="O pedido pede este exame mais de uma vez; entrou só uma">repetido no pedido: ${escapeHtml(it.repetido.join(', '))}</span>` : ''}</small></td>
        <td>${it.lido ? `<span class="conf ${c}"><i><b style="width:${Math.round(it.conf * 100)}%"></b></i>${Math.round(it.conf * 100)}%</span><small class="note" style="display:block">leu “${escapeHtml(it.lido)}”</small>` : '<span class="note">digitado</span>'}</td>
        ${st.duplo ? `<td><button class="tabsw t${it.tab === 2 ? 2 : 1}" title="Clique para trocar de tabela" data-tab="${it.uid}">${escapeHtml(curto(nomeDe(it)))}</button></td>` : ''}
        <td>${it.prazoDias != null ? `<span class="pz ${it.prazoDias > 5 ? 'long' : ''}">${it.prazoDias} ${it.prazoDias > 1 ? 'dias úteis' : 'dia útil'}</span>` : '<span class="pz long">—</span>'}</td>
        <td><input class="in qtd" type="number" min="1" max="12" value="${it.qtd || 1}" data-qtd="${it.uid}" title="Quantidade de amostras/dosagens/pontos"></td>
        <td class="num">${it.valor != null ? (it.qtd > 1 ? `${brl(vTot(it))}<small class="note" style="display:block;font-weight:600">${it.qtd} × ${brl(it.valor)}</small>` : brl(it.valor)) : '<span style="color:var(--red)">sem valor</span>'}</td>
        <td style="white-space:nowrap">${it.status === 'ok' ? `<button class="ib" title="Editar / trocar exame" data-edit="${it.uid}">${ICO.lapis}</button>` : ''}<button class="ib red" title="Remover" data-rm="${it.uid}">${ICO.lixo}</button></td>`;
      tb.appendChild(tr);
      if (it.status !== 'ok' || it.editar) { const ar = document.createElement('tr'); const td = document.createElement('td'); td.colSpan = st.duplo ? 8 : 7; td.style.padding = '0'; td.innerHTML = askBox(it); ar.appendChild(td); tb.appendChild(ar); }
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
      ${it.lido ? `<button class="btn ghost sm" data-grupo="${it.uid}" title="Este termo abre vários exames (ex.: Ferrograma = Ferro + Ferritina + Capacidade)">🧩 É um grupo (vários exames)</button>` : ''}
      <button class="btn red sm" data-send="${it.uid}">Enviar para conferência</button>
    </div>
    <div class="search" data-fixwrap="${it.uid}" ${it.abrirBusca ? '' : 'hidden'}><input class="in" placeholder="Digite o nome correto do exame — o sistema puxa do catálogo (ex.: insulina, ferritina, anti tireoglobulina)" data-fix="${it.uid}" autocomplete="off" value="${escapeHtml(it.buscaTxt || '')}"><div class="sug" hidden></div></div>
    ${it.abrirConf ? formConf(it) : ''}`;
  if (it.status === 'flag') return `<div class="ask"><div style="display:flex;gap:10px;align-items:flex-start;color:var(--warn)">${warn}<div>A IA leu <span class="hand">${escapeHtml(it.lido)}</span> e entendeu <b>${escapeHtml(it.ex.nome)}</b> (${Math.round(it.conf * 100)}% de certeza). Está correto?</div></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><button class="btn blue sm" data-ok="${it.uid}">Sim, está correto</button>
    ${it.cands.length > 1 ? `<div class="cands">${it.cands.slice(1, 4).map(c => `<button data-pick="${it.uid}" data-m="${c.ex.mnemonico}"><span class="mn">${c.ex.mnemonico}</span> ${escapeHtml(c.ex.nome)}<small>${escapeHtml(c.ex.setor)}</small></button>`).join('')}</div>` : ''}</div>
    <div class="note">Não é nenhum desses? Digite o nome certo abaixo ou mande para a gestão conferir.</div>${acoes}</div>`;
  if (it.status === 'semvalor') return `<div class="ask crit"><div style="display:flex;gap:10px;align-items:flex-start;color:var(--red)">${warn}<div><b>${escapeHtml(it.ex.nome)}</b> não tem valor cadastrado para ${st.duplo ? `<b>${escapeHtml(st.convenio)}</b> nem <b>${escapeHtml(st.convenio2)}</b>` : `o convênio <b>${escapeHtml(st.convenio)}</b>`}. Envie para a gestão definir valor e prazo — o orçamento atualiza sozinho quando for aprovado.</div></div>${acoes}</div>`;
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
  const n = st.itens.length, t = st.itens.reduce((a, i) => a + vTot(i), 0);
  $('kN').textContent = n; $('kT').textContent = brl(t); $('fT').textContent = brl(t);
  const f2 = $('fT2'); if (f2) { if (st.duplo) { const t1 = st.itens.filter(i => i.tab !== 2).reduce((a, i) => a + vTot(i), 0), t2 = t - t1; f2.textContent = `${curto(st.convenio)}: ${brl(t1)} · ${curto(st.convenio2)}: ${brl(t2)}`; f2.hidden = false; } else f2.hidden = true; }
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
  if (b.dataset.grupo) { const it = find(b.dataset.grupo); abrirEditorGrupo(it); return; }
  if (b.dataset.tab) { const it = find(b.dataset.tab); it.tab = it.tab === 2 ? 1 : 2; it.tabFixo = true; await precificar(it); render(); return; }
  if (b.dataset.recompor) { const c = convs.find(x => x.slug === b.dataset.recompor); if (c) await carregarPerfil(c, st.duplo && c.slug === st.convSlug2 ? 2 : 1, true); return; }
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
// quantidade (amostras/dosagens/pontos) por linha
document.addEventListener('change', e => { const inp = e.target; if (!inp.matches('[data-qtd]')) return; const it = st.itens.find(i => i.uid === inp.dataset.qtd); if (!it) return; it.qtd = Math.max(1, Math.min(12, Number(inp.value) || 1)); render(); });
// guarda o que a atendente digita para sobreviver ao re-render
document.addEventListener('input', e => { const inp = e.target; if (inp.matches('[data-fix]')) { const it = st.itens.find(i => i.uid === inp.dataset.fix); if (it) it.buscaTxt = inp.value; } if (inp.matches('[data-sf]')) { const it = st.itens.find(i => i.uid === inp.closest('[data-confwrap]')?.dataset.confwrap); if (it) lerSugestao(it); } });
async function escolher(it, mnemonico) {
  const cat = await D.catalogoMap(); const ex = cat[mnemonico]; if (!ex) return;
  const ex0 = jaTem(mnemonico); if (ex0 && ex0.uid !== it.uid) { marcarRepetido(ex0, it.lido); st.itens = st.itens.filter(i => i.uid !== it.uid); render(); if (it.lido) D.ensinar(it.lido, mnemonico, perfil.unidade); return; }
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
  box.innerHTML = hits.map(c => `<button data-${inp.id === 'q' ? 'novo' : 'add'}="${inp.dataset.fix || 'q'}" data-m="${c.mnemonico}"><span class="m">${c.mnemonico}</span><span>${escapeHtml(c.nome)}</span><span class="m" style="margin-left:auto">${brl(c.precos?.[st.convSlug])}${st.duplo && st.convSlug2 ? ' / ' + brl(c.precos?.[st.convSlug2]) : ''}</span></button>`).join('') || naoAchou;
  box.hidden = false;
});
$('sug').addEventListener('click', async e => { const b = e.target.closest('[data-novo]'); if (!b) return; const cat = await D.catalogoMap(); const ex0 = jaTem(b.dataset.m); if (ex0) { marcarRepetido(ex0, null, 'adicionado manualmente'); $('q').value = ''; $('sug').hidden = true; render(); return; } const it = { uid: Math.random().toString(36).slice(2), lido: null, conf: 1, cands: [], ex: cat[b.dataset.m], status: 'ok' }; st.manuais = st.manuais || {}; await precificar(it); st.itens.push(it); $('q').value = ''; $('sug').hidden = true; render(); });
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
    it.solId = await D.solicitar({ orcamentoId: st.id, orcamentoNumero: st.numero, textoLido: it.lido || sug?.nome || (guia?.nome) || '', normalizadoIA: sug?.nome || it.normalizado || guia?.nome || null, guiaDb: guia ? { mnemonico: guia.mnemonico, nome: guia.nome, setor: guia.setor, prazoDias: guia.prazoDias } : null, convenio: slugDe(it), setorSugerido: guia?.setor, sugestao: sug, fotos,
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
      it.valor = s.precos?.[slugDe(it)] ?? it.ex?.precos?.[slugDe(it)] ?? null; it.prazoDias = s.prazoDias ?? it.ex?.prazoDias ?? null; it.origem = 'aprovado';
      it.valorTabela = it.valor; it.repassePct = await D.repasseDe(slugDe(it)); if (it.valor != null && it.repassePct !== 100) it.valor = D.aplicarRepasse(it.valor, it.repassePct);
      if (it.valor == null) it.status = 'semvalor'; mudou = true; aviso('Conferência aprovada', `${s.mnemonico} · ${it.ex?.nome || ''} voltou para o orçamento${it.valor != null ? ' com ' + brl(it.valor) : ''}${it.prazoDias != null ? ' · ' + it.prazoDias + ' d.u.' : ''}`);
    }
    if (s.status === 'recusada' && it.status === 'conferencia') { it.status = it.ex ? 'semvalor' : 'miss'; it.recusa = s.motivo; mudou = true; aviso('Conferência recusada', `${it.lido || it.ex?.nome || ''}: ${s.motivo || 'sem motivo informado'}`); }
  }
  if (mudou) render();
}

// ---------- gravar / whatsapp / limpar ----------
function montarDados(status) {
  const itens = st.itens.map(i => ({ mnemonico: i.ex?.mnemonico || null, nome: i.ex?.nome || i.normalizado || i.lido, setor: i.ex?.setor || null, valor: i.valor ?? null, prazoDias: i.prazoDias ?? null, lido: i.lido || null, status: i.status, solicitacaoId: i.solId || null, iaMn: i.iaMn ?? null, resultado: resultadoLeitura(i), tabela: slugDe(i) || null, tabelaNome: nomeDe(i) || null, qtd: Number(i.qtd) || 1, valorTotal: i.valor != null ? vTot(i) : null, grupo: i.grupo || null, valorTabela: i.valorTabela ?? i.valor ?? null, repassePct: i.repassePct ?? 100, tabLanc: i.tabLanc || 1, viaPerfil: i.viaPerfil || null }));
  const pend = st.itens.some(i => i.status !== 'ok');
  const repassePct = st.itens.find(i => i.tab !== 2 && i.valor != null)?.repassePct ?? 100, repassePct2 = st.itens.find(i => i.tab === 2 && i.valor != null)?.repassePct ?? 100;
  return { status: status || (pend ? 'aguardando_conferencia' : 'gravado'), unidade: perfil.unidade, atendenteNome: perfil.nome, convenio: st.convSlug, convenioNome: st.convenio, renal: st.renal,
    duplo: !!st.duplo, convenio2: st.duplo ? st.convSlug2 : null, convenio2Nome: st.duplo ? st.convenio2 : null, repassePct, repassePct2: st.duplo ? repassePct2 : null,
    totalConv1: st.itens.filter(i => i.tab !== 2).reduce((a, i) => a + vTot(i), 0), totalConv2: st.itens.filter(i => i.tab === 2).reduce((a, i) => a + vTot(i), 0),
    paciente: $('pac').value.trim() || null, pacienteBusca: norm($('pac').value), telefone: $('tel').value.trim() || null, telefoneDigitos: soDigitos($('tel').value),
    itens, total: st.itens.reduce((a, i) => a + vTot(i), 0), qtd: itens.length, mnemonicos: itens.map(i => i.mnemonico).filter(Boolean),
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
/** Frase para o paciente quando o convênio cobre parte da tabela (ex.: "IMPCG cobre 70% — você paga 30%"). */
function notaRepasse() {
  const partes = [];
  for (const [tab, nome] of [[1, st.convenio], [2, st.convenio2]]) { const it = st.itens.find(i => i.valor != null && (i.tab === 2) === (tab === 2) && i.repassePct && i.repassePct !== 100); if (it) partes.push(`${nome} cobre ${100 - it.repassePct}% da tabela — os valores acima são a sua parte (${it.repassePct}%)`); }
  return partes.length ? partes.join('. ') + '.\n' : '';
}
$('btnZap').addEventListener('click', async () => {
  if (!st.itens.length) return; if (!validarPaciente()) return; try { await garantirOrcamento(); } catch {}
  const linhas = st.itens.filter(i => i.ex).map(i => `• ${i.ex.nome}${st.duplo ? ` (${curto(nomeDe(i))})` : ''}${i.prazoDias != null ? ` — ${i.prazoDias} d.u.` : ''}${rotuloQtd(i.ex.nome, i.qtd)}${i.valor != null ? ` — ${brl(vTot(i))}` : ''}`);
  const txt = `*Célula Diagnósticos* — Orçamento ${st.numero ? '#' + st.numero : ''}\nPaciente: ${$('pac').value || '-'}\nConvênio: ${st.convenio}${st.duplo ? ' + ' + st.convenio2 : ''}\n\n${linhas.join('\n')}\n\n*Total: ${brl(st.itens.reduce((a, i) => a + vTot(i), 0))}*\n${notaRepasse()}Validade: ${cfg.validadeDias || 7} dias · prazos em dias úteis após a coleta.`;
  const tel = soDigitos($('tel').value); window.open(`https://wa.me/${tel ? '55' + tel : ''}?text=${encodeURIComponent(txt)}`, '_blank');
  if (st.id) D.mudarStatus(st.id, 'enviado').catch(() => {});
});
$('btnLimpar').addEventListener('click', () => { if (st.offSol) st.offSol(); Object.assign(st, { id: null, numero: null, itens: [], fotos: [], leitura: null, offSol: null, _fotosSol: null, unitario: false, unitPedido: false, preToken: null, descartados: [], duplo: false, convSlug2: null, convenio2: null, manuais2: {}, lancarEm: 1, perfis: {} }); $('duplo').checked = false; $('conv2Wrap').hidden = true; $('btnUnit').textContent = 'Valores unitários'; $('btnUnit').classList.add('ghost'); $('btnUnit').classList.remove('blue'); history.replaceState(null, '', location.pathname); $('prevWrap').hidden = true; $('prev').innerHTML = ''; $('btnRun').disabled = true; $('btnRun').textContent = 'Analisar pedido com a IA'; $('numLbl').textContent = 'novo'; $('leituraInfo').textContent = ''; $('pac').value = ''; $('tel').value = ''; $('pac').style.borderColor = ''; $('tel').style.borderColor = ''; render(); });
render();

// ---------- abrir um orçamento existente para editar (orcamento.html?id=...) ----------
const idEdit = new URLSearchParams(location.search).get('id');
if (idEdit) (async () => {
  try {
    const o = await D.orcamento(idEdit); if (!o) { toast('Orçamento não encontrado.'); return; }
    const cat = await D.catalogoMap(); st.id = o.id; st.numero = o.numero; st.preToken = o.preToken || null; $('numLbl').textContent = '#' + numOrc(o.numero);
    if (o.convenio && convs.some(c => c.slug === o.convenio)) { $('conv').value = o.convenio; st.convSlug = o.convenio; st.convenio = o.convenioNome || convs.find(c => c.slug === o.convenio)?.nome; }
    if (o.duplo && o.convenio2 && convs.some(c => c.slug === o.convenio2)) { st.duplo = true; $('duplo').checked = true; $('conv2Wrap').hidden = false; $('conv2').value = o.convenio2; st.convSlug2 = o.convenio2; st.convenio2 = o.convenio2Nome || convs.find(c => c.slug === o.convenio2)?.nome; st.manuais2 = await D.precosManuais(st.convSlug2); }
    $('pac').value = o.paciente || ''; $('tel').value = o.telefone || ''; st.renal = false;
    st.manuais = await D.precosManuais(st.convSlug);
    st.itens = (o.itens || []).map(i => { const ex = i.mnemonico ? cat[i.mnemonico] : null; return { uid: Math.random().toString(36).slice(2), lido: i.lido || null, normalizado: i.nome, confIA: 1, conf: 1, cands: [], ex, status: i.status === 'conferencia' ? 'conferencia' : ex ? (i.valor != null ? 'ok' : 'semvalor') : 'miss', valor: i.valor ?? null, prazoDias: i.prazoDias ?? null, origem: null, solId: i.solicitacaoId || null, iaMn: i.iaMn ?? null, resultado: i.resultado || null, tab: st.duplo && i.tabela === o.convenio2 ? 2 : 1, tabFixo: !!st.duplo, tabLanc: st.duplo && i.tabela === o.convenio2 ? 2 : 1, viaPerfil: i.viaPerfil || null, qtd: Number(i.qtd) || 1, grupo: i.grupo || null }; });
    st.lancarEm = st.duplo ? 2 : 1; syncLancarEm(); st.perfis = {};
    for (const slug of [st.convSlug, st.duplo ? st.convSlug2 : null]) { const c = convs.find(x => x.slug === slug); if (ehPerfil(c)) st.perfis[slug] = Object.values(cat).filter(e => e.ativo !== false && e.precos?.[slug] != null).map(e => e.mnemonico); }
    if (o.unitarioLiberado) marcarUnitarioLiberado();
    st.offSol = D.ouvirSolicitacoesDoOrcamento(st.id, onSolicitacoes);
    render(); $('leituraInfo').textContent = `Editando o orçamento #${numOrc(o.numero)} de ${o.atendenteNome || ''}`; toast(`Orçamento #${numOrc(o.numero)} carregado para edição`, true);
  } catch (e) { toast('Erro ao abrir: ' + e.message); }
})();
