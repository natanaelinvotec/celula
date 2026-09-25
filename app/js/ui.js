// ui.js — peças de interface compartilhadas: copiar mnemônico, ficha do exame (lupa), foto com zoom/tela cheia,
// aviso no canto com campainha, PDF do orçamento.
import { brl, escapeHtml, toast } from './firebase.js';

const SVG = {
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a1 1 0 0 1 1-1h10"/></svg>',
  lupa: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>',
  lapis: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20h4l10-10-4-4L4 16z"/><path d="m12.5 7.5 4 4"/></svg>',
  pdf: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></svg>',
  expand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  zap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20l1.3-4A8 8 0 1 1 8.5 19z"/><path d="M9 10c0 3 2 5 5 5l1-1.5-1.5-1-1 .5c-1-.5-1.5-1-2-2l.5-1L10 8.5z"/></svg>',
  lixo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M9 7V4h6v3m-7 0v13h8V7"/></svg>',
};
export const ICO = SVG;

/** Pílula do mnemônico com botãozinho de copiar + lupa da ficha. */
export function mnemonicoHtml(ex, { cor, lupa = true } = {}) {
  if (!ex) return '<span class="pill crit">?</span>';
  return `<span class="mnwrap"><span class="mn sec" style="--c:${cor || ex.cor || 'var(--blue)'}">${escapeHtml(ex.mnemonico)}</span><button class="ib" title="Copiar ${escapeHtml(ex.mnemonico)}" data-copy="${escapeHtml(ex.mnemonico)}">${SVG.copy}</button>${lupa ? `<button class="ib" title="Ficha do exame (material, preparo, coleta)" data-ficha="${escapeHtml(ex.mnemonico)}">${SVG.lupa}</button>` : ''}</span>`;
}
export async function copiar(txt) {
  try { await navigator.clipboard.writeText(txt); } catch { const t = document.createElement('textarea'); t.value = txt; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); }
  toast(`Copiado: ${txt}`, true);
}

// ---------- modal genérico ----------
export function modal(html, { largura = 640, aoFechar } = {}) {
  fecharModal();
  const m = document.createElement('div'); m.className = 'modal-bg'; m.id = 'modalBg';
  m.innerHTML = `<div class="modal" style="max-width:${largura}px" role="dialog" aria-modal="true"><button class="modal-x" title="Fechar (ESC)">${SVG.x}</button><div class="modal-b">${html}</div></div>`;
  document.body.appendChild(m);
  const fechar = () => { m.remove(); document.removeEventListener('keydown', esc); aoFechar?.(); };
  const esc = e => { if (e.key === 'Escape') fechar(); };
  m.querySelector('.modal-x').onclick = fechar; m.addEventListener('click', e => { if (e.target === m) fechar(); }); document.addEventListener('keydown', esc);
  m.fechar = fechar; return m;
}
export const fecharModal = () => document.getElementById('modalBg')?.fechar?.();

/** Lupa: ficha do exame com abreviatura, material, preparo (jejum), meios de coleta. */
export function fichaExame(ex) {
  const linha = (k, v) => v ? `<div class="fl"><b>${k}</b><span>${escapeHtml(String(v)).replace(/\n/g, '<br>')}</span></div>` : '';
  modal(`<h2 style="margin:0 0 4px;color:var(--blue-d)">${escapeHtml(ex.nome)}</h2>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px">${mnemonicoHtml(ex, { lupa: false })}<span class="pill">${escapeHtml(ex.setor || '')}</span>${ex.bancada ? `<span class="pill">${escapeHtml(ex.bancada)}</span>` : ''}${ex.foraAutolac ? '<span class="pill crit">fora do AutoLAC · sem valor</span>' : ''}</div>
    ${linha('Abreviatura (mnemônico)', ex.mnemonico)}
    ${linha('Material', ex.material)}
    ${linha('Preparo do paciente', ex.preparo || ex.jejum)}
    ${linha('Meios de coleta', ex.meios ? ex.meios + (ex.meiosOrigem === 'material' ? ' (sugerido pelo material)' : '') : '')}
    ${linha('Método', ex.metodo)}
    ${linha('Prazo de entrega', ex.prazoDias != null ? `${ex.prazoDias} dia(s) útil(eis)` : '')}
    ${linha('Sinonímia', ex.sinonimia)}
    ${linha('TUSS', ex.codigoTuss)}
    ${!ex.material && !ex.preparo ? '<div class="note">Ficha ainda não importada do AutoLAC para este exame.</div>' : ''}`);
}

// ---------- foto com zoom (hover) e tela cheia ----------
/** Envolve as imagens de um container: hover amplia, botão expande para a tela toda (X ou ESC fecham). */
export function fotoZoom(container) {
  container.querySelectorAll('img:not([data-zoom])').forEach(img => {
    img.dataset.zoom = '1';
    const w = document.createElement('div'); w.className = 'zoomw'; img.replaceWith(w); w.appendChild(img);
    const b = document.createElement('button'); b.className = 'zoomx'; b.title = 'Expandir (tela cheia)'; b.innerHTML = SVG.expand; w.appendChild(b);
    b.onclick = e => { e.stopPropagation(); telaCheia(img.src); }; img.onclick = () => telaCheia(img.src);
  });
}
export function telaCheia(src) {
  const m = document.createElement('div'); m.className = 'fullimg';
  m.innerHTML = `<button class="modal-x" title="Fechar (ESC)">${SVG.x}</button><img src="${src}" alt="">`;
  document.body.appendChild(m);
  const fechar = () => { m.remove(); document.removeEventListener('keydown', esc); };
  const esc = e => { if (e.key === 'Escape') fechar(); };
  m.querySelector('.modal-x').onclick = fechar; m.addEventListener('click', e => { if (e.target === m) fechar(); }); document.addEventListener('keydown', esc);
}

// ---------- aviso no canto inferior direito + campainha ----------
let _ac;
export function campainha() {
  try {
    _ac = _ac || new (window.AudioContext || window.webkitAudioContext)(); if (_ac.state === 'suspended') _ac.resume();
    const t0 = _ac.currentTime;
    [[880, 0], [1174.7, .18]].forEach(([f, dt]) => { const o = _ac.createOscillator(), g = _ac.createGain(); o.type = 'sine'; o.frequency.value = f; g.gain.setValueAtTime(0, t0 + dt); g.gain.linearRampToValueAtTime(.4, t0 + dt + .02); g.gain.exponentialRampToValueAtTime(.001, t0 + dt + 1.1); o.connect(g).connect(_ac.destination); o.start(t0 + dt); o.stop(t0 + dt + 1.2); });
  } catch {}
}
export function aviso(titulo, texto, { som = true, ms = 9000 } = {}) {
  let box = document.getElementById('avisos'); if (!box) { box = document.createElement('div'); box.id = 'avisos'; box.className = 'avisos'; document.body.appendChild(box); }
  const a = document.createElement('div'); a.className = 'aviso'; a.innerHTML = `<b>${escapeHtml(titulo)}</b><span>${escapeHtml(texto)}</span><button class="modal-x" title="Fechar">${SVG.x}</button>`;
  a.querySelector('button').onclick = () => a.remove(); box.appendChild(a); setTimeout(() => a.classList.add('on'), 20); setTimeout(() => a.remove(), ms);
  if (som) campainha();
}

// ---------- PDF do orçamento ----------
let _jspdf, _logo;
async function jspdf() {
  if (_jspdf) return _jspdf;
  const load = src => new Promise((ok, err) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = err; document.head.appendChild(s); });
  if (!window.jspdf) await load('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
  if (!window.jspdf.jsPDF.API.autoTable) await load('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js');
  _jspdf = window.jspdf.jsPDF; return _jspdf;
}
let _qr;
/** Biblioteca de QR code (qrcode-generator, cdnjs). Devolve função qrcode(tipo, nivel). */
async function qrLib() {
  if (_qr) return _qr; if (!window.qrcode) await new Promise((ok, err) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js'; s.onload = ok; s.onerror = err; document.head.appendChild(s); });
  _qr = window.qrcode; return _qr;
}
/** Desenha um QR code no jsPDF como quadradinhos (sem imagem). */
function desenharQr(d, texto, x, y, tam) {
  const qr = window.qrcode(0, 'M'); qr.addData(texto); qr.make(); const n = qr.getModuleCount(); const m = tam / n;
  d.setFillColor(255, 255, 255); d.rect(x - 1, y - 1, tam + 2, tam + 2, 'F'); d.setFillColor(27, 37, 64);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d.rect(x + c * m, y + r * m, m + 0.02, m + 0.02, 'F');
}
async function logoDataUrl() {
  if (_logo) return _logo;
  try { const b = await (await fetch('img/logo-pdf.png')).blob(); _logo = await new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b); }); } catch { _logo = null; }
  return _logo;
}
const pad5 = n => n != null ? String(n).padStart(5, '0') : '—';
export const numOrc = pad5;
/** Rótulo da quantidade para o paciente: curvas/tolerâncias contam "dosagens"; fezes, urina e demais contam "amostras". */
export function rotuloQtd(nome, qtd) { const q = Number(qtd) || 1; if (q <= 1) return ''; const n = String(nome || '').toUpperCase(); const u = /CURVA|TOLERANCIA|TOLERÂNCIA|DOSAGE/.test(n) ? 'dosagens' : 'amostras'; return ` (${q} ${u})`; }
export const CENTRAL = { fone: '(67) 98124-0201', instagram: '@celula.ms', site: 'www.celulams.com.br', cnpj: '08.257.861/0001-61' };
export const UNIDADES = [
  { nome: 'Matriz', end: 'Rua Abrão Júlio Rahe, 87 · Centro', atend: '06:15–18:00', coleta: 'até 17:30', sab: '06:15–11:00' },
  { nome: 'Coronel Antonino', end: 'Av. Castelo Branco, 630', atend: '06:15–12:00 | 13:00–16:15', coleta: 'até 15:00', sab: '06:15–10:15' },
  { nome: 'Nova Lima', end: 'Rua Zulmira Borba, 1192', atend: '06:15–11:00 | 13:00–16:15', coleta: 'até 15:00', sab: '06:15–10:15' },
  { nome: 'Guaicurus', end: 'Av. Guaicurus, 4483 · Jd. Monumento', atend: '06:15–11:30 | 13:30–16:15', coleta: 'até 15:30', sab: '06:15–10:15' },
  { nome: 'Coophavila', end: 'Av. Marinha, 611 · Coophavila II', atend: '06:15–16:30', coleta: 'até 16:00', sab: '06:15–10:15' },
  { nome: 'Júlio de Castilhos', end: 'Av. Júlio de Castilho, 1925 · Lar do Trabalhador', atend: '06:15–12:00 | 13:00–16:15', coleta: 'até 15:00', sab: '06:15–10:15' },
  { nome: 'São Gabriel do Oeste', end: 'Rua João Evangelista Rosa, 72 · Centro', atend: '06:00–11:00 | 13:00–16:00', coleta: 'verificar na unidade', sab: '06:00–10:00' },
  { nome: 'Coleta Externa', end: 'Residencial e empresarial', atend: 'agendamento 06:15–17:30', coleta: 'pedidos após o horário: dia seguinte', sab: 'agende: (67) 98124-0201', ext: true },
];
/** Perfis de check-up do site (padrão; a gestão edita em Painel → Perfis, gravados em config/app.perfis). */
export const PERFIS_PADRAO = [
  { id: 'saude', nome: 'Perfil Saúde', categoria: 'Básico', cor: 'azul', descricao: 'Avalia anemia, infecções, glicose, colesterol e a função dos seus rins e fígado.', palavras: 'hemograma, glicose, glicemia, colesterol, hdl, ldl, triglicer, creatinina, ureia, tgo, tgp, gama, fosfatase, bilirrubina, urina, eas', ativo: true },
  { id: 'prime', nome: 'Perfil Saúde Prime', categoria: 'Avançado', cor: 'azul', descricao: 'Visão mais profunda: tireoide, níveis de energia e vitaminas D e B12, essenciais para memória e foco. Inclui todo o Perfil Saúde.', palavras: 'tsh, t4, tireo, vitamina d, vitamina b12, b12, sodio, potassio, magnesio, ferritina, hemograma, glicose, colesterol', ativo: true },
  { id: 'precaneta', nome: 'Perfil Pré-Caneta', categoria: 'Emagrecimento', cor: 'verde', descricao: 'Garante que o seu emagrecimento seja seguro e eficiente, avaliando pâncreas, insulina e fígado.', palavras: 'insulina, glicose, glicada, hba1c, amilase, lipase, tgo, tgp, gama, triglicer, colesterol, peptideo c, homa', ativo: true },
  { id: 'biofit', nome: 'Perfil Biofit', categoria: 'Performance', cor: 'vermelho', descricao: 'Para quem quer superar limites: composição corporal, hipertrofia e mais energia no treino.', palavras: 'testosterona, ck, creatina, creatinina, proteina, albumina, ferritina, cortisol, vitamina d, magnesio, zinco, hemograma', ativo: true },
  { id: 'infantil', nome: 'Perfil Infantil', categoria: 'Cuidado especial', cor: 'verde', descricao: 'Acompanha o ritmo intenso de crescimento e a saúde das crianças.', palavras: 'parasitolog, fezes, hemograma, ferritina, ferro, vitamina d, ige, urina, eas', ativo: true },
  { id: 'vitamine', nome: 'Perfil Vitamine', categoria: 'Nutrição', cor: 'verde', descricao: 'Descubra se o seu corpo está realmente nutrido e protegido: vitaminas, ferro e minerais.', palavras: 'vitamina, b12, vitamina d, acido folico, folato, ferro, ferritina, zinco, magnesio, calcio, selenio, vitamina a, vitamina e', ativo: true },
  { id: 'anemia', nome: 'Perfil Anemia', categoria: 'Investigação', cor: 'vermelho', descricao: 'Investiga a fundo as causas do cansaço excessivo e da fraqueza em adultos.', palavras: 'hemograma, ferritina, ferro, transferrina, b12, folato, acido folico, reticulocito, saturacao', ativo: true },
  { id: 'imunochek', nome: 'Perfil Imunochek', categoria: 'Imunidade', cor: 'azul', descricao: 'Avalia detalhadamente sua resistência contra infecções e vírus.', palavras: 'igg, igm, iga, ige, imunoglobulina, pcr, vhs, hemograma, vitamina d, sorologia, anticorpos, hepatite, hiv', ativo: true },
  { id: 'personalizado', nome: 'Perfil Personalizado', categoria: 'Sob medida', cor: 'vermelho', descricao: 'Montado conforme a sua necessidade, conversando com um de nossos bioquímicos.', palavras: '', ativo: true },
];
const semAcento = t => String(t || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
/** Escolhe até `n` perfis pelos exames do orçamento (pontua palavras-chave); completa com os primeiros ativos. */
export function sugerirPerfis(perfis, nomesExames, n = 3) {
  const ativos = (perfis || PERFIS_PADRAO).filter(p => p.ativo !== false);
  const txt = ' ' + nomesExames.map(semAcento).join(' | ') + ' ';
  const pont = ativos.map(p => { const ks = String(p.palavras || '').split(',').map(k => semAcento(k.trim())).filter(Boolean); const hits = ks.filter(k => txt.includes(k)); return { p, s: hits.length / Math.max(3, ks.length) + hits.length * 0.02, hits: hits.length }; });
  const comHit = pont.filter(x => x.hits > 0).sort((a, b) => b.s - a.s).map(x => x.p);
  const resto = ativos.filter(p => !comHit.includes(p) && p.id !== 'personalizado');
  const esc = [...comHit, ...resto].slice(0, n); return { escolhidos: esc, indicado: comHit[0] || null, outros: ativos.filter(p => !esc.includes(p)) };
}
/** Maior jejum entre os exames (em horas) a partir do campo `jejum` do catálogo; null = nenhum exige. */
export function maiorJejum(exames) {
  let max = 0, txt = '';
  for (const e of exames) { const t = e?.jejum || e?.preparo || ''; const m = t.match(/(\d{1,2})\s*(?:h\b|hora)/i); if (m && +m[1] > max) { max = +m[1]; txt = t; } }
  return max ? { horas: max, texto: txt } : null;
}
/** Gera e baixa o PDF do orçamento no layout Célula (A4). `orc` = documento gravado (numero, paciente, itens, total…). */
export async function gerarPdf(orc, { validadeDias = 7, baixar = true, unitario = false } = {}) {
  const JsPDF = await jspdf(); const d = new JsPDF({ unit: 'mm', format: 'a4' });
  const AZ = [30, 64, 175], AZ2 = [37, 99, 235], VM = [211, 26, 33], CZ = [100, 116, 139], TX = [27, 37, 64], F = [244, 246, 251], LN = [230, 233, 240];
  const W = 210, ML = 11, MR = 11, CW = W - ML - MR;
  // catálogo para jejum/setor
  let cat = {}, cfgApp = {}; try { const D = await import('./dados.js'); cat = await D.catalogoMap(); cfgApp = await D.config(); } catch {}
  const mostraValor = unitario || !!orc.unitarioLiberado; // padrão: só o total (valor unitário só com liberação da gestão)
  const itens = (orc.itens || []); const exs = itens.map(i => cat[i.mnemonico] || {});
  const jej = maiorJejum(exs);
  const linkPre = orc.id && orc.preToken ? `https://celulams.com.br/app/pre.html?o=${orc.id}&t=${orc.preToken}${orc.numero ? '&n=' + orc.numero : ''}` : null;
  // ---- cabeçalho
  const logo = await logoDataUrl(); let y = 10;
  if (logo) d.addImage(logo, 'PNG', ML, y, 22, 21);
  const tx = ML + (logo ? 26 : 0);
  d.setTextColor(...AZ); d.setFont('helvetica', 'bold'); d.setFontSize(15); d.text('ORÇAMENTO DE EXAMES', tx, y + 6);
  d.setTextColor(...CZ); d.setFont('helvetica', 'normal'); d.setFontSize(8.5);
  d.text(`Central de Atendimento Célula MS · Campo Grande/MS · CNPJ ${CENTRAL.cnpj}`, tx, y + 11.5);
  const emitido = new Date(); const criado = orc.criadoEm?.toDate ? orc.criadoEm.toDate() : emitido;
  d.text(`Emitido em ${emitido.toLocaleDateString('pt-BR')} às ${emitido.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} · Atendente: ${orc.atendenteNome || '—'}${orc.unidade ? ' · ' + orc.unidade : ''}`, tx, y + 16);
  d.setTextColor(...VM); d.setFont('helvetica', 'bold'); d.setFontSize(19); d.text(`Nº ${pad5(orc.numero)}`, W - MR, y + 7, { align: 'right' });
  const val = new Date(criado.getTime() + validadeDias * 86400000);
  d.setTextColor(...CZ); d.setFontSize(8.5); d.text(`Validade: ${validadeDias} dias (até ${val.toLocaleDateString('pt-BR')})`, W - MR, y + 13, { align: 'right' });
  y += 24; d.setDrawColor(...VM); d.setLineWidth(0.9); d.line(ML, y, W - MR, y); y += 4;
  // ---- cartões de informação
  const duplo = !!orc.duplo && !!orc.convenio2; const curto = n => String(n || '').replace(/^(tabela|perfil)\s+/i, '');
  const cards = [['PACIENTE', orc.paciente || '—', 1.4], [duplo ? 'CONVÊNIOS / TABELAS' : 'CONVÊNIO / TABELA', duplo ? `${orc.convenioNome || orc.convenio} + ${orc.convenio2Nome || orc.convenio2}` : (orc.convenioNome || orc.convenio || '—'), duplo ? 1.3 : 1], ['TELEFONE', orc.telefone || '—', duplo ? 0.8 : 1]];
  const tot = cards.reduce((a, c) => a + c[2], 0); let cx = ML;
  for (const [k, v, f] of cards) { const cw = (CW - 4) * f / tot; d.setFillColor(...F); d.roundedRect(cx, y, cw, 11, 2, 2, 'F'); d.setTextColor(...CZ); d.setFont('helvetica', 'bold'); d.setFontSize(6.5); d.text(k, cx + 3, y + 4); d.setTextColor(...TX); d.setFontSize(10); d.text(d.splitTextToSize(String(v), cw - 6)[0], cx + 3, y + 8.8); cx += cw + 2; }
  y += 14;
  // ---- tabela de exames (sem mnemônico)
  const body = itens.map((i, k) => { const q = Number(i.qtd) || 1; const r = [(i.nome || '') + rotuloQtd(i.nome, q), i.setor || exs[k].setor || '']; if (duplo) r.push(curto(i.tabelaNome || (i.tabela === orc.convenio2 ? orc.convenio2Nome : orc.convenioNome) || '')); r.push(i.prazoDias != null ? `${i.prazoDias} ${i.prazoDias === 1 ? 'dia útil' : 'dias úteis'}` : '—'); if (mostraValor) r.push(i.valor != null ? brl(i.valorTotal ?? i.valor * q) : 'sem valor'); return r; });
  const head = ['EXAME', 'SETOR']; if (duplo) head.push('TABELA'); head.push('PRAZO'); if (mostraValor) head.push('VALOR');
  const cs = duplo ? { 0: { cellWidth: 'auto' }, 1: { cellWidth: 30 }, 2: { cellWidth: 24, textColor: CZ, fontStyle: 'bold', fontSize: 7.5 }, 3: { cellWidth: 24, textColor: AZ, fontStyle: 'bold' }, 4: { cellWidth: 26, halign: 'right', fontStyle: 'bold' } }
                   : { 0: { cellWidth: 'auto' }, 1: { cellWidth: 36 }, 2: { cellWidth: 26, textColor: AZ, fontStyle: 'bold' }, 3: { cellWidth: 26, halign: 'right', fontStyle: 'bold' } };
  d.autoTable({ startY: y, margin: { left: ML, right: MR }, head: [head], body,
    styles: { font: 'helvetica', fontSize: 9, cellPadding: { top: 2.4, bottom: 2.4, left: 2.5, right: 2.5 }, textColor: TX, lineColor: LN, lineWidth: { bottom: 0.2 } },
    headStyles: { fillColor: AZ, textColor: 255, fontSize: 7.5, fontStyle: 'bold' }, alternateRowStyles: { fillColor: [249, 250, 252] },
    columnStyles: cs });
  y = d.lastAutoTable.finalY + 4;
  // ---- faixa do total
  d.setFillColor(...AZ2); d.roundedRect(ML, y, CW, 15, 2.5, 2.5, 'F');
  d.setTextColor(255); d.setFont('helvetica', 'bold'); d.setFontSize(8.5); d.text(`${itens.length} exame${itens.length !== 1 ? 's' : ''}`, ML + 4, y + 5.5);
  d.setFont('helvetica', 'normal'); d.text(' · prazos em dias úteis contados a partir da coleta · atendimento por ordem de chegada', ML + 4 + d.getTextWidth(`${itens.length} exame${itens.length !== 1 ? 's' : ''}`), y + 5.5);
  d.setFontSize(7.5); d.text(linkPre ? 'Para agilizar o atendimento, faça o pré-cadastro pelo QR code abaixo: reduz o tempo com a atendente e agiliza a coleta.' : 'Para agilizar o atendimento, solicite o pré-cadastro deste orçamento: reduz o tempo com a atendente e agiliza a coleta.', ML + 4, y + 10.5);
  d.setFontSize(7); d.text('TOTAL DO ORÇAMENTO', W - MR - 4, y + 5, { align: 'right' }); d.setFont('helvetica', 'bold'); d.setFontSize(16); d.text(brl(orc.total || 0), W - MR - 4, y + 12, { align: 'right' });
  y += 19;
  if (duplo) { // subtotais por tabela
    const t1 = orc.totalConv1 ?? itens.filter(i => i.tabela !== orc.convenio2).reduce((a, i) => a + (i.valorTotal ?? (i.valor || 0) * (Number(i.qtd) || 1)), 0), t2 = orc.totalConv2 ?? itens.filter(i => i.tabela === orc.convenio2).reduce((a, i) => a + (i.valorTotal ?? (i.valor || 0) * (Number(i.qtd) || 1)), 0);
    const n1 = itens.filter(i => i.tabela !== orc.convenio2).length, n2 = itens.length - n1;
    d.setTextColor(...TX); d.setFont('helvetica', 'bold'); d.setFontSize(8.5);
    d.text(`${orc.convenioNome || orc.convenio}: ${n1} exame${n1 !== 1 ? 's' : ''} · ${brl(t1)}     |     ${orc.convenio2Nome || orc.convenio2}: ${n2} exame${n2 !== 1 ? 's' : ''} · ${brl(t2)}`, W / 2, y - 1.5, { align: 'center' });
    y += 4;
  }
  // ---- convênio com cobertura (ex.: IMPCG/UFMS cobrem 70%): deixa claro que os valores são a parte do paciente
  { const notas = [];
    if (orc.repassePct && orc.repassePct !== 100) notas.push(`${orc.convenioNome || orc.convenio} cobre ${100 - orc.repassePct}% da tabela — os valores deste orçamento são a parte do paciente (${orc.repassePct}%).`);
    if (duplo && orc.repassePct2 && orc.repassePct2 !== 100) notas.push(`${orc.convenio2Nome || orc.convenio2} cobre ${100 - orc.repassePct2}% da tabela — os valores são a parte do paciente (${orc.repassePct2}%).`);
    if (notas.length) { d.setTextColor(...AZ2); d.setFont('helvetica', 'bold'); d.setFontSize(7.8); for (const n of notas) { d.text(n, W / 2, y - 1, { align: 'center' }); y += 4; } }
  }
  // ---- pré-cadastro pelo celular (QR + link), quando o orçamento tem token
  if (linkPre) {
    try {
      await qrLib(); const qh = 21;
      d.setFillColor(...F); d.setDrawColor(...LN); d.setLineWidth(0.25); d.roundedRect(ML, y, CW, qh, 2.5, 2.5, 'FD');
      desenharQr(d, linkPre, ML + 2.5, y + 2, qh - 4);
      const tx0 = ML + qh + 2;
      d.setTextColor(...AZ); d.setFont('helvetica', 'bold'); d.setFontSize(9.5); d.text('PRÉ-CADASTRO PELO CELULAR — 1 minuto', tx0, y + 5.5);
      d.setTextColor(...TX); d.setFont('helvetica', 'normal'); d.setFontSize(7.6);
      d.text(d.splitTextToSize('Aponte a câmera do celular para o QR code e preencha nome, CPF, data de nascimento e celular. Quando chegar à unidade, é só informar seu nome: o cadastro já estará pronto e a coleta sai mais rápido.', CW - qh - 6), tx0, y + 9.5);
      d.setTextColor(...AZ2); d.setFontSize(6.6); d.text('ou acesse: ' + linkPre.replace(/^https?:\/\//, ''), tx0, y + qh - 2.5);
      y += qh + 4;
    } catch { /* sem QR (biblioteca indisponível): segue sem o bloco */ }
  }
  // ---- preparo (maior jejum em negrito, mesmo tamanho)
  d.setFontSize(8); d.setTextColor(...CZ);
  const partes = jej
    ? [['Preparo: ', 'normal'], [`JEJUM DE ${jej.horas} HORAS`, 'bold'], [` (maior jejum entre os exames deste orçamento; os demais exames podem ser coletados junto). `, 'normal']]
    : [['Preparo: ', 'normal'], ['NÃO É NECESSÁRIO JEJUM', 'bold'], [' para os exames deste orçamento, salvo orientação médica. ', 'normal']];
  partes.push(['Traga documento com foto e o pedido médico original. Este orçamento não substitui a solicitação médica e pode sofrer alteração após conferência do pedido na unidade.', 'normal']);
  let px = ML, py = y; const maxX = W - MR;
  for (const [t, st] of partes) { d.setFont('helvetica', st); for (const w of t.split(/(\s+)/)) { if (!w) continue; const ww = d.getTextWidth(w); if (px + ww > maxX && w.trim()) { px = ML; py += 4; } if (px === ML && !w.trim()) continue; d.text(w, px, py); px += ww; } }
  y = py + 5;
  // ---- perfis de check-up sugeridos pelos exames
  const perfis = Array.isArray(cfgApp.perfis) && cfgApp.perfis.length ? cfgApp.perfis : PERFIS_PADRAO;
  const sug = sugerirPerfis(perfis, itens.map(i => i.nome || ''), 3);
  if (sug.escolhidos.length) {
    d.setTextColor(...AZ); d.setFont('helvetica', 'bold'); d.setFontSize(9); d.text('CONHEÇA NOSSOS PERFIS DE CHECK-UP', ML, y);
    d.setTextColor(...CZ); d.setFont('helvetica', 'normal'); d.setFontSize(7); d.text('sugeridos a partir dos exames deste orçamento · valores especiais', W - MR, y, { align: 'right' }); y += 3;
    const pw = (CW - 4) / 3, ph = 19; const cores = { azul: [[30, 58, 138], [37, 99, 235]], verde: [[15, 118, 110], [20, 184, 166]], vermelho: [[127, 29, 29], [211, 26, 33]] };
    sug.escolhidos.forEach((p, i) => {
      const x = ML + i * (pw + 2); const c = cores[p.cor] || cores.azul;
      d.setFillColor(...c[0]); d.roundedRect(x, y, pw, ph, 2, 2, 'F'); d.setFillColor(...c[1]); d.roundedRect(x + pw * 0.55, y, pw * 0.45, ph, 2, 2, 'F'); d.setFillColor(...c[0]); d.rect(x + pw * 0.55, y, 3, ph, 'F');
      d.setTextColor(255); d.setFont('helvetica', 'bold'); d.setFontSize(5.8); d.text(String(p.categoria || '').toUpperCase(), x + 3, y + 4);
      if (sug.indicado && sug.indicado.id === p.id) { const t = 'INDICADO PARA VOCÊ'; const tw = d.getTextWidth(t) + 5; d.setFillColor(255, 255, 255); d.roundedRect(x + pw - tw - 2.5, y + 1.8, tw, 4, 2, 2, 'F'); d.setTextColor(...c[0]); d.text(t, x + pw - tw, y + 4.6); d.setTextColor(255); }
      d.setFontSize(9.5); d.text(p.nome, x + 3, y + 8.6);
      d.setFont('helvetica', 'normal'); d.setFontSize(6.6); d.text(d.splitTextToSize(p.descricao || '', pw - 6).slice(0, 3), x + 3, y + 12);
    });
    y += ph + 3.5;
    if (sug.outros.length) { d.setTextColor(71, 85, 105); d.setFontSize(7); d.setFont('helvetica', 'normal'); const linha = 'Também: ' + sug.outros.map(p => p.nome.replace(/^Perfil /, '')).join(' · ') + ` — peça na central ${CENTRAL.fone}`; d.text(d.splitTextToSize(linha, CW)[0], ML, y); y += 5; }
  }
  // ---- unidades (no rodapé da página; se não couber, vai para a próxima)
  const uh = 24.5, gap = 1.6, uw = (CW - gap * 3) / 4, blocoH = 6 + uh * 2 + gap + 16;
  if (y > 297 - 8 - blocoH) { d.addPage(); y = 12; } else y = Math.max(y, 297 - 8 - blocoH);
  d.setTextColor(...AZ); d.setFont('helvetica', 'bold'); d.setFontSize(9); d.text('NOSSAS UNIDADES', ML, y);
  d.setTextColor(...CZ); d.setFont('helvetica', 'normal'); d.setFontSize(7); d.text(`colete em qualquer unidade · ${CENTRAL.site}`, W - MR, y, { align: 'right' });
  d.setDrawColor(...LN); d.setLineWidth(0.2); d.line(ML + 34, y - 1, W - MR - 48, y - 1); y += 3;
  UNIDADES.forEach((u, i) => {
    const col = i % 4, row = Math.floor(i / 4); const x = ML + col * (uw + gap), yy = y + row * (uh + gap);
    d.setFillColor(...(u.ext ? F : [255, 255, 255])); d.setDrawColor(...LN); d.setLineWidth(0.25); d.roundedRect(x, yy, uw, uh, 1.6, 1.6, 'FD');
    d.setFillColor(...(u.ext ? AZ : VM)); d.rect(x + 1.6, yy, uw - 3.2, 0.9, 'F');
    d.setTextColor(...AZ); d.setFont('helvetica', 'bold'); d.setFontSize(8); d.text(u.nome, x + 2.2, yy + 5);
    d.setTextColor(71, 85, 105); d.setFont('helvetica', 'normal'); d.setFontSize(6.6); const endL = d.splitTextToSize(u.end, uw - 4.4); d.text(endL[0], x + 2.2, yy + 8.6);
    const lin = [['Atend.: ', u.atend], ['Coleta: ', u.coleta], ['Sáb.: ', u.sab]]; let ly = yy + 12.6;
    for (const [k, v] of lin) { d.setTextColor(...AZ); d.setFont('helvetica', 'bold'); d.text(k, x + 2.2, ly); d.setTextColor(51, 65, 85); d.setFont('helvetica', 'normal'); d.text(d.splitTextToSize(v, uw - 4.4 - d.getTextWidth(k))[0], x + 2.2 + d.getTextWidth(k), ly); ly += 3.6; }
  });
  y += uh * 2 + gap + 4;
  // ---- rodapé: redes e central
  d.setDrawColor(...AZ); d.setLineWidth(0.6); d.line(ML, y, W - MR, y); y += 5;
  const chip = (x, txt, cor) => { const w = d.getTextWidth(txt) + 11; d.setFillColor(...F); d.roundedRect(x, y - 3.8, w, 5.6, 2.8, 2.8, 'F'); d.setFillColor(...cor); d.circle(x + 3.4, y - 1, 1.5, 'F'); d.setTextColor(...TX); d.text(txt, x + 6.6, y); return x + w + 3; };
  d.setFont('helvetica', 'bold'); d.setFontSize(8);
  let fx = chip(ML, CENTRAL.instagram, [225, 48, 108]); fx = chip(fx, `Central de Atendimento ${CENTRAL.fone}`, [37, 211, 102]);
  d.setTextColor(...VM); d.text(CENTRAL.site, W - MR, y, { align: 'right' });
  d.setTextColor(...CZ); d.setFont('helvetica', 'normal'); d.setFontSize(6.4);
  d.text(d.splitTextToSize('LGPD (Lei 13.709/2018): seus dados pessoais são usados apenas para este orçamento e para o seu atendimento no Laboratório Célula, não são compartilhados com terceiros e você pode solicitar a exclusão a qualquer momento pela Central de Atendimento.', CW), ML, y + 5);
  const nome = `orcamento-${pad5(orc.numero)}${orc.paciente ? '-' + orc.paciente.replace(/[^\w]+/g, '_').slice(0, 30) : ''}.pdf`;
  if (baixar) d.save(nome); return d;
}
