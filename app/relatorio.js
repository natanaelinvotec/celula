// relatorio.js — lê o PDF "Atendimento por recepcionista" do AutoLAC (só no navegador; o arquivo nunca é enviado nem guardado)
// e cruza com os orçamentos para marcar "Convertido em coleta" automaticamente.
import { norm } from './firebase.js';
import { similar } from './dados.js';

let _pdfjs;
export async function pdfjs() {
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

// ---------- comparação de nomes (regra 28/09: atendente muitas vezes digita só o 1º nome; o relatório traz o nome completo) ----------
const LIGA = new Set(['DE', 'DA', 'DO', 'DAS', 'DOS', 'E', 'D']);
const tokens = n => norm(n).split(' ').filter(t => t && !LIGA.has(t));
/** distância de edição (Levenshtein) — para erro de digitação: SIMONI × SIMONE */
function lev(a, b) { const m = a.length, n = b.length; if (!m || !n) return m || n; let p = Array.from({ length: n + 1 }, (_, j) => j); for (let i = 1; i <= m; i++) { const c = [i]; for (let j = 1; j <= n; j++) c[j] = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); p = c; } return p[n]; }
/** palavra igual, com 1 letra de tolerância a partir de 5 letras; letra solta (inicial "S.") casa com palavra que começa com ela */
const palavraIgual = (a, b) => a === b || (a.length === 1 && b.startsWith(a)) || (b.length === 1 && a.startsWith(b)) || (Math.min(a.length, b.length) >= 5 && lev(a, b) <= 1);
/**
 * Compara o nome do orçamento com o do relatório. Níveis:
 *  3 completo  — nome inteiro igual (tolera acento/abreviação ≥ 92%)
 *  2 parcial   — todas as palavras do orçamento (2 ou mais) estão no nome do relatório, na ordem, começando pelo 1º nome
 *  1 primeiro  — o orçamento tem só o 1º nome (ou 1º nome + inicial) e ele bate com o 1º nome do relatório
 *  0 não casa  — inclusive quando o 1º nome bate mas o sobrenome digitado é outro (pessoa diferente)
 */
export function compararNomes(nomeOrc, nomeRel) {
  const a = norm(nomeOrc), b = norm(nomeRel); if (!a || !b) return { nivel: 0 };
  const sim = a === b ? 1 : similar(a, b); if (sim >= 0.92) return { nivel: 3, sim, tipo: 'nome completo' };
  const tO = tokens(nomeOrc), tR = tokens(nomeRel); if (!tO.length || !tR.length || !palavraIgual(tO[0], tR[0])) return { nivel: 0 };
  let j = 1; for (let i = 1; i < tO.length; i++) { while (j < tR.length && !palavraIgual(tO[i], tR[j])) j++; if (j >= tR.length) return { nivel: 0 }; j++; }
  const cheias = tO.filter(t => t.length > 1).length; // palavras de verdade (sem as iniciais)
  return cheias >= 2 ? { nivel: 2, tipo: 'nome parcial' } : { nivel: 1, tipo: 'só o 1º nome' };
}
const dia = d => { if (!d) return null; if (typeof d === 'string') { const m = d.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); return m ? Date.UTC(+m[3], m[2] - 1, +m[1]) / 86400000 : null; } const x = d.toDate ? d.toDate() : new Date(d); return Date.UTC(x.getFullYear(), x.getMonth(), x.getDate()) / 86400000; };

/**
 * Cruza atendimentos do relatório com orçamentos abertos. Retorna {auto:[], quase:[]} com {orc, at, motivo, nivel, nomeCompleto}.
 * Regras (Natanael, 28/09):
 *  • Nome completo igual (nível 3) ou parcial (nível 2): valor igual (≤ R$ 0,05) → convertido automático; valor diferente → "confira e confirme".
 *  • Só o 1º nome (nível 1) é fraco (há muitas "MARIA"), então precisa de reforço:
 *      automático só se o valor bate, mais a qtd de exames ou o convênio, E o par é único (ninguém disputa o mesmo nome);
 *      senão vai para conferência se tiver ao menos um reforço: valor bate, valor até 15% de diferença, mesma qtd de exames ou mesmo convênio;
 *      sem nenhum reforço, não sugere.
 *  • Níveis 1 e 2 exigem que o atendimento seja no dia do orçamento ou depois.
 *  • Cada orçamento e cada atendimento casa uma vez só: primeiro os pares mais fortes (nível, valor, exames, convênio, data mais próxima).
 */
export function cruzar(atendimentos, orcamentos) {
  const abertos = orcamentos.filter(o => o.status !== 'convertido' && o.status !== 'perdido' && o.paciente);
  const brl = v => 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',');
  const pares = [];
  for (const at of atendimentos) {
    if (!norm(at.paciente)) continue; const dAt = dia(at.data);
    for (const o of abertos) {
      if ((o.conversaoRecusada || []).includes(String(at.protocolo))) continue; // gestão já recusou este par
      const cmp = compararNomes(o.paciente, at.paciente); if (!cmp.nivel) continue;
      const dOrc = dia(o.criadoEm), dias = dAt != null && dOrc != null ? dAt - dOrc : null;
      if (cmp.nivel < 3 && dias != null && dias < 0) continue; // atendimento antes do orçamento: não é conversão dele
      const tot = Number(o.total || 0); const cand = [at.total, ...at.guias.map(g => g.valor)];
      const difs = cand.map(v => Math.abs(v - tot)); const dif = Math.min(...difs); const valorRel = cand[difs.indexOf(dif)];
      const valorOk = dif <= 0.05, valorPerto = tot > 0 && dif / tot <= 0.15;
      const qtdOk = !!o.qtd && (o.qtd === at.qtdTotal || at.guias.some(g => g.qtd === o.qtd));
      const cOs = [o.convenioOficial || o.convenioNome || o.convenio, o.convenio2Oficial || o.convenio2Nome].map(norm).filter(Boolean); // nome oficial (AutoLAC), não o nome fantasia
      const convOk = cOs.some(cO => at.guias.some(g => { const cR = norm(g.convenio); return cR && (cR === cO || cO.includes(cR) || cR.includes(cO)); }));
      if (cmp.nivel === 1 && !(valorOk || valorPerto || qtdOk || convOk)) continue; // só o 1º nome e nada mais bate: não sugere
      const score = cmp.nivel * 1000 + (valorOk ? 300 : valorPerto ? 100 : 0) + (qtdOk ? 60 : 0) + (convOk ? 40 : 0) + (cmp.sim || 0) * 10 - Math.min(dias ?? 30, 90) * 0.1;
      pares.push({ o, at, ...cmp, dif, valorRel, valorOk, valorPerto, qtdOk, convOk, dias, score });
    }
  }
  // disputa: quantos candidatos de nível 1 cada orçamento/atendimento tem
  const nO = new Map(), nA = new Map();
  for (const p of pares) if (p.nivel === 1) { nO.set(p.o.id, (nO.get(p.o.id) || 0) + 1); nA.set(p.at.protocolo, (nA.get(p.at.protocolo) || 0) + 1); }
  const auto = [], quase = [], usO = new Set(), usA = new Set();
  for (const p of pares.sort((a, b) => b.score - a.score)) {
    if (usO.has(p.o.id) || usA.has(p.at.protocolo)) continue;
    usO.add(p.o.id); usA.add(p.at.protocolo);
    const unico = p.nivel > 1 || (nO.get(p.o.id) === 1 && nA.get(p.at.protocolo) === 1);
    const automatico = p.valorOk && unico && (p.nivel > 1 || p.qtdOk || p.convOk); // 1º nome: valor + (exames ou convênio)
    const reforcos = [p.valorOk ? 'valor bate' : `valor diferente: orçamento ${brl(p.o.total)} × cadastro ${brl(p.valorRel)}`, p.qtdOk ? 'mesma qtd de exames' : '', p.convOk ? 'mesmo convênio' : '', p.dias != null && p.nivel < 3 ? (p.dias === 0 ? 'veio no mesmo dia' : `veio ${p.dias} dia(s) depois`) : ''].filter(Boolean);
    const nome = p.nivel === 3 ? `nome igual${p.sim < 1 ? ' (' + Math.round(p.sim * 100) + '%)' : ''}` : `${p.tipo}: “${p.o.paciente}” → “${p.at.paciente}”`;
    const aviso = p.nivel === 1 && p.valorOk && !unico ? ' · mais de um paciente com esse nome — confirme' : '';
    const item = { orc: p.o, at: p.at, nivel: p.nivel, simNome: p.sim || 0, dif: p.dif, valorRel: p.valorRel, nomeCompleto: p.nivel < 3 ? p.at.paciente : null, motivo: `${nome} · ${reforcos.join(' · ')}${aviso}` };
    (automatico ? auto : quase).push(item);
  }
  return { auto, quase };
}
