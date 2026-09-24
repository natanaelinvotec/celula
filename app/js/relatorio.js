// relatorio.js — lê o PDF "Atendimento por recepcionista" do AutoLAC (só no navegador; o arquivo nunca é enviado nem guardado)
// e cruza com os orçamentos para marcar "Convertido em coleta" automaticamente.
import { norm } from './firebase.js';
import { similar } from './dados.js';

let _pdfjs;
async function pdfjs() {
  if (_pdfjs) return _pdfjs;
  await new Promise((ok, err) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'; s.onload = ok; s.onerror = err; document.head.appendChild(s); });
  _pdfjs = window.pdfjsLib; _pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  return _pdfjs;
}

/** Extrai as linhas de texto de todas as páginas (agrupando por coordenada Y). */
export async function linhasDoPdf(file) {
  const lib = await pdfjs(); const buf = await file.arrayBuffer();
  const pdf = await lib.getDocument({ data: buf }).promise; const linhas = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p); const tc = await page.getTextContent();
    const porY = new Map();
    for (const it of tc.items) { if (!it.str.trim()) continue; const y = Math.round(it.transform[5] / 2) * 2; if (!porY.has(y)) porY.set(y, []); porY.get(y).push({ x: it.transform[4], s: it.str }); }
    [...porY.entries()].sort((a, b) => b[0] - a[0]).forEach(([, its]) => linhas.push(its.sort((a, b) => a.x - b.x).map(i => i.s).join(' ').replace(/\s+/g, ' ').trim()));
  }
  return { linhas, paginas: pdf.numPages };
}

const RE_INI = /^(\d{2}\/\d{2}\/\d{4})\s+(\d{2}-\d{6})\s+(.*)$/;                 // data protocolo resto
const RE_FIM = /^(.*?)\s*(\d{1,2})\s+([A-ZÀ-Ú0-9][A-ZÀ-Ú0-9 .\-\/&]*?)\s+(\d+)\s+([\d.]+,\d{2})$/; // nome guia convênio qtd valor
const num = v => Number(String(v).replace(/\./g, '').replace(',', '.'));

/** Converte as linhas em registros {data, protocolo, paciente, guia, convenio, qtd, valor, atendente}. */
export function parseRelatorio(linhas) {
  const regs = []; let atendente = '', periodo = '', pend = null;
  for (const l of linhas) {
    const mu = l.match(/^Usu[aá]rio:\s*(.+)$/i); if (mu) { atendente = mu[1].trim(); pend = null; continue; }
    const mp = l.match(/^Per[ií]odo:\s*(.+)$/i); if (mp) { periodo = mp[1].trim(); continue; }
    if (/^Total|^Descontos|^Taxas|^Data\s+Protocolo/i.test(l)) { pend = null; continue; }
    let mi = l.match(RE_INI);
    if (mi) {
      const resto = mi[3]; const mf = resto.match(RE_FIM);
      if (mf) { regs.push({ data: mi[1], protocolo: mi[2], paciente: mf[1].trim(), guia: +mf[2], convenio: mf[3].trim(), qtd: +mf[4], valor: num(mf[5]), atendente }); pend = null; }
      else pend = { data: mi[1], protocolo: mi[2], paciente: resto.trim(), atendente }; // nome longo: o resto vem na próxima linha
      continue;
    }
    if (pend) { const mf = l.match(/^(\d{1,2})\s+([A-ZÀ-Ú0-9][A-ZÀ-Ú0-9 .\-\/&]*?)\s+(\d+)\s+([\d.]+,\d{2})$/); if (mf) { regs.push({ ...pend, guia: +mf[1], convenio: mf[2].trim(), qtd: +mf[3], valor: num(mf[4]) }); } pend = null; }
  }
  // soma por protocolo (um paciente pode ter 2 guias no mesmo atendimento)
  const porProt = new Map();
  for (const r of regs) { const k = r.protocolo; if (!porProt.has(k)) porProt.set(k, { ...r, guias: [] }); const g = porProt.get(k); g.guias.push({ guia: r.guia, convenio: r.convenio, qtd: r.qtd, valor: r.valor }); g.total = g.guias.reduce((a, x) => a + x.valor, 0); g.qtdTotal = g.guias.reduce((a, x) => a + x.qtd, 0); }
  return { registros: regs, atendimentos: [...porProt.values()], periodo };
}

/** Cruza atendimentos do relatório com orçamentos abertos. Retorna {auto:[], quase:[]} com {orc, at, motivo}. */
export function cruzar(atendimentos, orcamentos) {
  const auto = [], quase = [], usados = new Set();
  const abertos = orcamentos.filter(o => o.status !== 'convertido' && o.status !== 'perdido' && o.paciente);
  for (const at of atendimentos) {
    const nAt = norm(at.paciente); if (!nAt) continue;
    let melhor = null;
    for (const o of abertos) {
      if (usados.has(o.id)) continue;
      const nO = o.pacienteBusca || norm(o.paciente); const simNome = nAt === nO ? 1 : similar(nAt, nO);
      if (simNome < 0.72) continue;
      const tot = Number(o.total || 0); const cand = [at.total, ...at.guias.map(g => g.valor)];
      const difs = cand.map(v => tot ? Math.abs(v - tot) / tot : 1); const dif = Math.min(...difs);
      const score = simNome * 0.6 + Math.max(0, 1 - dif) * 0.4;
      if (!melhor || score > melhor.score) melhor = { o, simNome, dif, score, valorRel: cand[difs.indexOf(dif)] };
    }
    if (!melhor) continue;
    const nomeOk = melhor.simNome >= 0.92, valorOk = melhor.dif <= 0.12;
    const item = { orc: melhor.o, at, simNome: melhor.simNome, dif: melhor.dif, valorRel: melhor.valorRel, motivo: `${nomeOk ? 'nome igual' : 'nome parecido (' + Math.round(melhor.simNome * 100) + '%)'} · valor ${valorOk ? 'bate' : 'difere ' + Math.round(melhor.dif * 100) + '%'}` };
    if (nomeOk && valorOk) { auto.push(item); usados.add(melhor.o.id); }
    else if (melhor.simNome >= 0.8 && melhor.dif <= 0.35) quase.push(item);
  }
  return { auto, quase };
}
