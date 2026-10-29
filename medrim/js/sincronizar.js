/* MedRim · sincronização escala (nomes abreviados) × CSV (nome completo, CPF, nascimento).
   Estratégia:
   1) o CSV já diz o grupo de dias e o turno → só comparo com pacientes do mesmo "bolsão"
   2) cada máquina tem até 3 grafias do mesmo nome (seg/qua/sex) → uso a melhor
   3) alinhamento de palavras em ordem (prefixos, iniciais, Mª/Apª, nomes colados, erros de digitação)
   4) apelidos confirmados viram dicionário e casam direto nos próximos meses */
(function (M) {
  'use strict';

  const PARADAS = new Set(['DA', 'DE', 'DO', 'DOS', 'DAS', 'E', 'D', 'DI', 'DU']);
  const ABREV = { STOS: 'SANTOS', STO: 'SANTOS', STS: 'SANTOS', JR: 'JUNIOR', FLHO: 'FILHO' };
  const TAGS = /\(\s*(?:HD\s*)?extra\s*\)|_?\(\s*extra\s*\)|\bextra\b|\(\s*trans[^)]*\)|\b\d{1,2}\s*\/\s*\d{1,2}(?:\s*\/\s*\d{2,4})?\b|\b\d{3,}\b/gi;

  M.limparTags = t => (t || '').replace(TAGS, ' ').replace(/[()_]/g, ' ').replace(/\s+/g, ' ').trim();

  /** "MªJoséP.Souza" → ["MARIA","JOSE","P","SOUZA"] (sem preposições) */
  M.tokensAbrev = function (bruto) {
    let s = M.limparTags(bruto)
      .replace(/Apd?ª|Apda(?![a-zà-ÿ])/g, 'Aparecida ')
      .replace(/Apdº/g, 'Aparecido ')
      .replace(/Antº/g, 'Antonio ')
      .replace(/Mª/g, 'Maria ')
      .replace(/[ºª°]/g, ' ')
      .replace(/([a-zà-ÿ])([A-ZÀ-Ý])/g, '$1 $2')
      .replace(/\./g, '. ');
    return M.norm(s).split(' ').filter(t => t && !/^\d+$/.test(t)).map(t => ABREV[t] || t).filter(t => !PARADAS.has(t));
  };
  M.tokensNome = nome => M.norm(nome).split(' ').filter(t => t && !/^\d+$/.test(t));

  function damerau(a, b) {
    const m = a.length, n = b.length, d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
    for (let j = 1; j <= n; j++) d[0][j] = j;
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
    return d[m][n];
  }

  const cacheSim = new Map();
  function simToken(a, f) {
    const k = a + '|' + f;
    let v = cacheSim.get(k);
    if (v === undefined) { v = simTokenBruto(a, f); cacheSim.set(k, v); }
    return v;
  }
  function simTokenBruto(a, f) {
    if (a === f) return 1;
    if (a.length === 1) return f[0] === a ? 0.7 : 0;                                       // inicial: R. → RAFAEL
    if (a.length >= 3 && f.startsWith(a)) return 0.82 + 0.18 * a.length / f.length;      // BATIS → BATISTA
    if (a[0] !== f[0]) return 0;
    const r = 1 - damerau(a, f) / Math.max(a.length, f.length);
    if (r >= 0.74) return 0.9 * r;                                                        // PIMO → PRIMO
    if (a.length >= 4 && f.length > a.length && damerau(a, f.slice(0, a.length)) <= 1) return 0.7; // ARGUELLH → ARGUELHO
    if (a.length <= 4 && ehSubsequencia(a, f)) return 0.65;                               // SZ → SOUZA
    return 0;
  }
  function ehSubsequencia(a, f) { let i = 0; for (const c of f) if (c === a[i]) i++; return i === a.length; }

  /** Pontua (0–1) o quanto um nome abreviado corresponde a um nome completo.
      85% = quanto da abreviação foi explicado · 15% = quanto do nome completo foi coberto. */
  M.pontuar = function (abrev, nomeCompleto) {
    const A = Array.isArray(abrev) ? abrev : M.tokensAbrev(abrev);
    const F = Array.isArray(nomeCompleto) ? nomeCompleto : M.tokensNome(nomeCompleto);
    if (!A.length || !F.length) return 0;
    const memo = new Map();
    const go = (i, j) => {
      if (i === A.length || j >= F.length) return 0;
      const k = i * 100 + j;
      if (memo.has(k)) return memo.get(k);
      let best = Math.max(go(i, j + 1), go(i + 1, j));
      const a = A[i];
      if (!PARADAS.has(F[j])) { const s = simToken(a, F[j]); if (s) best = Math.max(best, s + go(i + 1, j + 1)); }
      if (a.length >= 5) {                                          // nomes colados: JOAOPEDRO, ANADA
        let cat = F[j];
        for (let t = j + 1; t < Math.min(F.length, j + 3); t++) {
          cat += F[t];
          if (cat === a || (a.length >= 6 && cat.startsWith(a))) best = Math.max(best, 0.95 + go(i + 1, t + 1));
        }
      }
      memo.set(k, best);
      return best;
    };
    let s = go(0, 0) / A.length;
    if (!primeiroNomeBate(A[0], F)) s *= 0.72;                      // o 1º nome quase sempre vem na escala
    const fortes = F.filter(t => !PARADAS.has(t));
    const cobertos = fortes.filter(t => A.some(a => simToken(a, t) >= 0.6 || (a.length > t.length && a.includes(t)))).length;
    const final = 0.85 * s + 0.15 * (fortes.length ? cobertos / fortes.length : 0);
    return Math.round(final * 1000) / 1000;
  };
  const primeiroNomeBate = (a0, F) => simToken(a0, F[0]) >= 0.55 || (a0.length > F[0].length && (F[0] + (F[1] || '') + (F[2] || '')).startsWith(a0.slice(0, F[0].length + 2)));

  /** Duas grafias da escala são a mesma pessoa? ("Jeferson Simões" × "Jefferson Simões") */
  M.mesmaPessoa = function (x, y) {
    const a = M.tokensAbrev(x), b = M.tokensAbrev(y);
    if (!a.length || !b.length) return false;
    if (a.join('').slice(0, 4) === b.join('').slice(0, 4)) return true;
    return Math.max(M.pontuar(a, b), M.pontuar(b, a)) >= 0.7;
  };

  const chaveApelido = (nome, grupo, turno) => M.norm(M.limparTags(nome)).replace(/ /g, '') + '|' + grupo + turno;
  M.chaveApelido = chaveApelido;

  /** Converte as linhas do docx em "vagas" (máquina × grupo de dias). */
  M.montarVagas = function (linhas) {
    const vagas = [], foraDaGrade = [];
    let ultimo = 0, hdf = 0, chaveTab = '';
    for (const L of linhas) {
      const tab = L.salao + L.turno;
      if (tab !== chaveTab) { chaveTab = tab; ultimo = 0; hdf = 0; }
      if (/^\d+$/.test(L.maq)) { ultimo = +L.maq; hdf = 0; L.pos = ultimo; } else L.pos = ultimo + 0.1 * (++hdf);
      if (L.foraDaGrade.length) foraDaGrade.push({ salao: L.salao, turno: L.turno, maq: L.maq, textos: L.foraDaGrade });
      for (const grupo of ['SQS', 'TQS']) {
        const vals = M.GRUPOS[grupo].dias
          .map(dia => ({ dia, ...(L.celulas[dia] || { texto: '' }) }))
          .filter(v => v.texto);
        vals.forEach(v => {
          v.extra = /\bextra\b/i.test(v.texto);
          v.trans = (v.texto.match(/\(\s*trans[^)]*\)/i) || [null])[0];
          v.limpo = M.limparTags(v.texto);
        });
        const grupos = [];
        vals.filter(v => !v.extra && v.limpo).forEach(v => {
          const g = grupos.find(g => M.mesmaPessoa(g[0].limpo, v.limpo));
          if (g) g.push(v); else grupos.push([v]);
        });
        const principal = grupos.sort((a, b) => b.length - a.length)[0] || [];
        const maisLongo = principal.slice().sort((a, b) => b.limpo.length - a.limpo.length)[0];
        vagas.push({
          id: `S${L.salao}-${L.turno}-${grupo}-${L.maq}`,
          salao: L.salao, turno: L.turno, grupo, maq: L.maq, ordem: L.ordem, pos: L.pos,
          nomeEscala: maisLongo ? maisLongo.limpo : '',
          variantes: [...new Set(principal.map(v => v.limpo))],
          dias: principal.map(v => v.dia),
          riscado: principal.length > 0 && principal.filter(v => v.riscado).length * 2 > principal.length,
          notaTransito: (principal.find(v => v.trans) || {}).trans || null,
          extras: vals.filter(v => !principal.includes(v)).map(v => ({ dia: v.dia, nome: v.limpo, riscado: v.riscado, extra: v.extra })),
          pacienteId: null, match: null, alternativas: [],
        });
      }
    }
    return { vagas, foraDaGrade };
  };

  /** Casa vagas × pacientes do CSV (atribuição gulosa global). Muta as vagas; devolve as divergências. */
  M.sincronizar = function (vagas, pacientes, apelidos) {
    const lista = Object.values(pacientes).filter(p => p.origem === 'csv');
    const tokPac = new Map(lista.map(p => [p.id, M.tokensNome(p.nome)]));
    const usados = new Set(), pares = [];

    for (const v of vagas) {
      v.pacienteId = null; v.match = null; v.alternativas = [];
      if (!v.nomeEscala) continue;
      const ap = apelidos[chaveApelido(v.nomeEscala, v.grupo, v.turno)];
      if (ap && pacientes[ap] && !usados.has(ap)) {                  // apelido já confirmado por alguém
        v.pacienteId = ap; usados.add(ap);
        v.match = { conf: 'confirmado', score: 1 };
        continue;
      }
      const toks = v.variantes.map(M.tokensAbrev).filter(t => t.length);
      const cands = [];
      for (const p of lista) {
        const F = tokPac.get(p.id);
        const noBolsao = p.grupo === v.grupo && p.turno === v.turno;
        if (!noBolsao && !toks.some(t => primeiroNomeBate(t[0], F))) continue;   // fora do bolsão: só se o 1º nome bater
        const s = Math.max(...toks.map(t => M.pontuar(t, F)));
        if (s < 0.55 || (!noBolsao && s < 0.85)) continue;
        cands.push({ cpf: p.id, score: s, adj: s - (noBolsao ? 0 : 0.06), noBolsao });
      }
      cands.sort((a, b) => b.adj - a.adj);
      v.alternativas = cands.slice(0, 5);
      cands.forEach(c => pares.push({ v, ...c }));
    }

    // atribuição gulosa: o par mais provável de toda a escala primeiro (resolve "Ana da Silva" × "Ana de Paula M. da Silva": o nome mais completo leva o par mais específico)
    pares.sort((a, b) => (b.adj - a.adj) || (b.v.dias.length - a.v.dias.length));
    for (const par of pares) {
      if (par.v.pacienteId || usados.has(par.cpf)) continue;
      const v = par.v; usados.add(par.cpf);
      const prox = v.alternativas.find(c => c.cpf !== par.cpf);
      const margem = par.adj - (prox ? prox.adj : 0);
      v.pacienteId = par.cpf;
      v.match = { conf: par.noBolsao && par.score >= 0.85 && margem >= 0.08 ? 'alta' : 'media', score: par.score };
      if (!par.noBolsao) v.match.foraDoBolsao = { grupo: pacientes[par.cpf].grupo, turno: pacientes[par.cpf].turno };
    }

    // mesmo paciente em 2 máquinas (ex.: sessão de sábado em outra máquina)
    const vagaDe = {};
    vagas.forEach(v => { if (v.pacienteId) vagaDe[v.pacienteId] = v; });
    for (const v of vagas) {
      if (!v.nomeEscala || v.pacienteId) continue;
      const top = v.alternativas[0];
      if (top && top.score >= 0.9 && vagaDe[top.cpf]) {
        v.pacienteId = top.cpf;
        v.match = { conf: 'media', score: top.score, duplicadaDe: vagaDe[top.cpf].id };
      }
    }

    lista.forEach(p => { p.vagaId = null; });
    vagas.forEach(v => { if (v.pacienteId && !(v.match && v.match.duplicadaDe)) pacientes[v.pacienteId].vagaId = v.id; });
    return M.resumoDivergencias(vagas, pacientes);
  };

  M.resumoDivergencias = function (vagas, pacientes) {
    const ocupadas = vagas.filter(v => v.nomeEscala || v.pacienteId);
    const doCsv = v => v.pacienteId && pacientes[v.pacienteId] && pacientes[v.pacienteId].origem === 'csv';
    const m = v => v.match || {};
    return {
      totalEscala: ocupadas.length,
      alta: ocupadas.filter(v => doCsv(v) && ['alta', 'confirmado', 'manual'].includes(m(v).conf) && !m(v).foraDoBolsao && !m(v).duplicadaDe).length,
      revisar: ocupadas.filter(v => doCsv(v) && m(v).conf === 'media' && !m(v).foraDoBolsao && !m(v).duplicadaDe && !(v.riscado && !m(v).riscoResolvido)),
      semCsv: ocupadas.filter(v => v.nomeEscala && (!v.pacienteId || (pacientes[v.pacienteId] && ['escala', 'resultado'].includes(pacientes[v.pacienteId].origem) && pacientes[v.pacienteId].status === 'ativo'))),
      foraDoBolsao: ocupadas.filter(v => doCsv(v) && m(v).foraDoBolsao && m(v).conf !== 'confirmado'),
      riscadosNoCsv: ocupadas.filter(v => v.riscado && doCsv(v) && !m(v).riscoResolvido),
      duplicadas: ocupadas.filter(v => m(v).duplicadaDe),
      csvSemVaga: Object.values(pacientes).filter(p => p.origem === 'csv' && !p.vagaId && p.status !== 'obito' && p.status !== 'abandono' && p.status !== 'transplante'),
    };
  };
})(window.MED = window.MED || {});
