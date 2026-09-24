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
let _jspdf;
async function jspdf() {
  if (_jspdf) return _jspdf;
  const load = src => new Promise((ok, err) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = err; document.head.appendChild(s); });
  await load('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
  await load('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js');
  _jspdf = window.jspdf.jsPDF; return _jspdf;
}
const pad5 = n => n != null ? String(n).padStart(5, '0') : '—';
export const numOrc = pad5;
/** Gera e baixa o PDF do orçamento. `orc` = documento gravado (numero, paciente, itens, total…). */
export async function gerarPdf(orc, { validadeDias = 7, baixar = true } = {}) {
  const JsPDF = await jspdf(); const d = new JsPDF({ unit: 'mm', format: 'a4' });
  const azul = [37, 99, 235], verm = [211, 26, 33], cinza = [100, 116, 139];
  d.setFillColor(...azul); d.rect(0, 0, 210, 22, 'F'); d.setFillColor(...verm); d.rect(0, 22, 210, 1.5, 'F');
  d.setTextColor(255); d.setFont('helvetica', 'bold'); d.setFontSize(16); d.text('Célula Diagnósticos', 14, 10);
  d.setFontSize(10); d.setFont('helvetica', 'normal'); d.text('Central de Atendimento Célula MS · Campo Grande/MS', 14, 16);
  d.setFontSize(13); d.setFont('helvetica', 'bold'); d.text(`ORÇAMENTO Nº ${pad5(orc.numero)}`, 196, 12, { align: 'right' });
  d.setTextColor(30); d.setFontSize(10); d.setFont('helvetica', 'normal');
  const data = orc.criadoEm?.toDate ? orc.criadoEm.toDate() : new Date();
  const info = [[`Paciente: ${orc.paciente || '—'}`, `Data: ${data.toLocaleDateString('pt-BR')}`], [`Convênio: ${orc.convenioNome || orc.convenio || '—'}`, `Telefone: ${orc.telefone || '—'}`], [`Atendente: ${orc.atendenteNome || '—'}`, `Unidade: ${orc.unidade || '—'}`]];
  info.forEach((l, i) => { d.text(l[0], 14, 32 + i * 5.5); d.text(l[1], 120, 32 + i * 5.5); });
  const itens = (orc.itens || []).map(i => [i.mnemonico || '?', i.nome || '', i.setor || '', i.prazoDias != null ? `${i.prazoDias} d.u.` : '—', i.valor != null ? brl(i.valor) : 'sem valor']);
  d.autoTable({ startY: 50, head: [['Mnemônico', 'Exame', 'Setor', 'Prazo', 'Valor']], body: itens, styles: { fontSize: 8.5, cellPadding: 2 }, headStyles: { fillColor: azul }, columnStyles: { 0: { fontStyle: 'bold', cellWidth: 26 }, 3: { cellWidth: 18 }, 4: { halign: 'right', cellWidth: 26 } }, alternateRowStyles: { fillColor: [244, 245, 249] } });
  let y = d.lastAutoTable.finalY + 6;
  d.setFont('helvetica', 'bold'); d.setFontSize(12); d.text(`TOTAL: ${brl(orc.total || 0)}`, 196, y, { align: 'right' });
  d.setFont('helvetica', 'normal'); d.setFontSize(8.5); d.setTextColor(...cinza); y += 7;
  [`Validade do orçamento: ${validadeDias} dias. Prazos em dias úteis contados a partir da coleta.`, `Exames sem valor dependem de conferência da gestão. Mnemônicos: ${(orc.mnemonicos || []).join(', ') || '—'}`, `Emitido em ${new Date().toLocaleString('pt-BR')} · Pedidos por IA`]
    .forEach(t => { d.text(d.splitTextToSize(t, 180), 14, y); y += 5; });
  const nome = `orcamento-${pad5(orc.numero)}${orc.paciente ? '-' + orc.paciente.replace(/[^\w]+/g, '_').slice(0, 30) : ''}.pdf`;
  if (baixar) d.save(nome); return d;
}
