/* MedRim · etiquetas do sistema do laboratório e mapa de coleta.
   Depois do cadastro no Autolac, o "Resumo de Solicitações Incluídas" (PDF, um por perfil: normal, gli, cr, glicr)
   traz o protocolo de cada paciente (13-XXXXXX). Esta tela lê os PDFs NO NAVEGADOR (sem biblioteca externa,
   nada sai do computador), liga cada protocolo ao paciente da escala e imprime o mapa de coleta:
   salão × turno × máquina, com nome + código embaixo, para o técnico achar o tubo certo na hora. */
(function (M) {
  'use strict';
  const A = M.app;
  const { $, $$, esc, ic, titulo, fmtData } = A;
  const E = () => A.E;

  // =====================================================================
  // Leitura do PDF (ReportBuilder/Autolac: texto simples em BT … Tm (…) Tj … ET, streams FlateDecode)
  // =====================================================================
  const latin1 = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192)); return s; };
  const win1252 = new TextDecoder('windows-1252');

  async function inflar(bytes) {
    const ds = new DecompressionStream('deflate');
    return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(ds)).arrayBuffer());
  }

  /** Conteúdo (descomprimido) de cada stream do PDF que não seja imagem. */
  async function streamsDoPdf(buf) {
    const txt = latin1(buf), out = [];
    const tamanhoIndireto = n => { const m = new RegExp('(?:^|[\\s>])' + n + '\\s+0\\s+obj\\s*(\\d+)\\s*endobj').exec(txt); return m ? +m[1] : null; };
    const re = /<<((?:[^<>]|<<(?:[^<>]|<<[^<>]*>>)*>>)*)>>\s*stream\r?\n/g;
    let m;
    while ((m = re.exec(txt))) {
      const dict = m[1], ini = re.lastIndex;
      if (/\/Subtype\s*\/Image/.test(dict)) continue;
      const lm = dict.match(/\/Length\s+(\d+)(?:\s+(\d+)\s+R)?/);
      let len = lm ? (lm[2] != null ? tamanhoIndireto(lm[1]) : +lm[1]) : null;
      let fim = len != null ? ini + len : txt.indexOf('endstream', ini);
      if (len == null) while (fim > ini && /[\r\n]/.test(txt[fim - 1])) fim--;
      let dados = buf.subarray(ini, fim);
      if (/\/FlateDecode/.test(dict)) { try { dados = await inflar(dados); } catch (e) { continue; } }
      else if (/\/Filter/.test(dict)) continue;
      out.push(dados);
    }
    return out;
  }

  /** String literal do PDF → texto (Windows-1252). */
  function strPdf(raw) {
    const b = [];
    for (let i = 0; i < raw.length; i++) {
      const c = raw[i];
      if (c !== '\\') { b.push(raw.charCodeAt(i) & 255); continue; }
      const n = raw[++i];
      if (n === undefined) break;
      if (/[0-7]/.test(n)) { let o = n; while (o.length < 3 && /[0-7]/.test(raw[i + 1] || '')) o += raw[++i]; b.push(parseInt(o, 8) & 255); }
      else if (n === '\r') { if (raw[i + 1] === '\n') i++; }
      else if (n !== '\n') b.push(({ n: 10, r: 13, t: 9, b: 8, f: 12 })[n] || n.charCodeAt(0));
    }
    return win1252.decode(new Uint8Array(b));
  }

  /** Textos posicionados de um content stream: [{x, y, t}]. */
  function textosDoConteudo(bytes) {
    const s = latin1(bytes), itens = [];
    let x = 0, y = 0;
    const re = /(-?\d*\.?\d+)\s+(-?\d*\.?\d+)\s+(-?\d*\.?\d+)\s+(-?\d*\.?\d+)\s+(-?\d*\.?\d+)\s+(-?\d*\.?\d+)\s+Tm\b|(-?\d*\.?\d+)\s+(-?\d*\.?\d+)\s+T[dD]\b|\(((?:\\[\s\S]|[^\\)])*)\)\s*(?:Tj|'|")|\[((?:\\[\s\S]|[^\]\\])*)\]\s*TJ|\bBT\b/g;
    let m;
    while ((m = re.exec(s))) {
      if (m[0] === 'BT') { x = 0; y = 0; }
      else if (m[6] !== undefined) { x = +m[5]; y = +m[6]; }
      else if (m[7] !== undefined) { x += +m[7]; y += +m[8]; }
      else if (m[9] !== undefined) itens.push({ x, y, t: strPdf(m[9]) });
      else if (m[10] !== undefined) {
        let t = ''; const r2 = /\(((?:\\[\s\S]|[^\\)])*)\)|(-?\d*\.?\d+)/g; let k;
        while ((k = r2.exec(m[10]))) t += k[1] !== undefined ? strPdf(k[1]) : (+k[2] < -200 ? ' ' : '');
        itens.push({ x, y, t });
      }
    }
    return itens;
  }

  const RE_PROTOCOLO = /^\d{2}-\d{4,8}$/;
  /** Linhas protocolo + paciente de uma página (colunas pelo cabeçalho "Paciente" / "Enviar laudo"). */
  function linhasDaPagina(itens) {
    const hPac = itens.find(o => /^Paciente$/i.test(o.t.trim()));
    const hFim = itens.find(o => /Enviar laudo/i.test(o.t));
    const prot = itens.filter(o => RE_PROTOCOLO.test(o.t.trim()));
    const out = [];
    for (const it of prot) {
      const x0 = hPac ? hPac.x - 6 : it.x + 30, x1 = hFim ? hFim.x - 2 : Infinity;
      const naColuna = o => o.x >= x0 && o.x < x1 && !RE_PROTOCOLO.test(o.t.trim());
      const linha = itens.filter(o => naColuna(o) && Math.abs(o.y - it.y) < 2.5);
      // nome longo quebrado em 2 linhas: continuação logo abaixo, numa altura sem outro protocolo
      const cont = itens.filter(o => naColuna(o) && o.y < it.y - 2.5 && o.y > it.y - 13 && !prot.some(p => Math.abs(p.y - o.y) < 2.5));
      const nome = [...linha.sort((a, b) => a.x - b.x), ...cont.sort((a, b) => b.y - a.y || a.x - b.x)].map(o => o.t.trim()).join(' ').replace(/\s+/g, ' ').trim();
      if (nome) out.push({ protocolo: it.t.trim(), nome });
    }
    return out;
  }

  /** Perfil (controles extras) pelo nome do arquivo: normal · gli · cr · glicr (e hbgl, se existir). */
  function perfilDoArquivo(nome) {
    let n = nome.toLowerCase().replace(/\.pdf$/, '');
    const k = [];
    if (/hb.?gl|glicad/.test(n)) { k.push('hbgl'); n = n.replace(/hb.?gl(icada)?|glicad[ao]?/g, ' '); }
    if (/gli/.test(n)) { k.push('glic'); n = n.replace(/gli(cose)?/g, ' '); }
    if (/cr/.test(n)) k.push('cr');
    return ['glic', 'cr', 'hbgl'].filter(x => k.includes(x));
  }
  M.perfilDoArquivo = perfilDoArquivo;

  /** Lê um PDF de etiquetas → { arquivo, data, perfil, linhas: [{protocolo, nome}] }. */
  M.lerEtiquetasPdf = async function (arquivo) {
    const buf = new Uint8Array(await arquivo.arrayBuffer());
    if (latin1(buf.subarray(0, 5)) !== '%PDF-') throw new Error(arquivo.name + ': não é um PDF.');
    const vistos = new Set(), linhas = [];
    let data = '';
    for (const st of await streamsDoPdf(buf)) {
      const itens = textosDoConteudo(st);
      if (!itens.length) continue;
      const d = itens.map(o => o.t.trim()).find(t => /^\d{2}\/\d{2}\/\d{4}$/.test(t)); if (d && !data) data = d;
      for (const l of linhasDaPagina(itens)) if (!vistos.has(l.protocolo)) { vistos.add(l.protocolo); linhas.push(l); }
    }
    if (!linhas.length) throw new Error(arquivo.name + ': não achei protocolos (13-XXXXXX) com nome de paciente.');
    return { arquivo: arquivo.name, data, perfil: perfilDoArquivo(arquivo.name), linhas };
  };

  // =====================================================================
  // Vínculo protocolo → paciente
  // =====================================================================
  const PREP = new Set(['DE', 'DA', 'DO', 'DOS', 'DAS', 'E']);
  const toks = n => M.norm(n).split(' ').filter(t => t && !PREP.has(t));
  function dist(a, b) {
    const m = a.length, n = b.length; let ant = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) { const cur = [i]; for (let j = 1; j <= n; j++) cur[j] = Math.min(ant[j] + 1, cur[j - 1] + 1, ant[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); ant = cur; }
    return ant[n];
  }
  /** Semelhança entre dois nomes completos (0–1): tokens iguais ou com 1–2 letras trocadas; o primeiro nome pesa. */
  function simNomes(a, b) {
    const x = toks(a), y = toks(b); if (!x.length || !y.length) return 0;
    const usados = new Set(); let ok = 0;
    for (const t of x) {
      let mj = -1, mv = 0;
      y.forEach((u, j) => {
        if (usados.has(j)) return;
        const v = t === u ? 1 : (Math.min(t.length, u.length) >= 4 && dist(t, u) <= (Math.max(t.length, u.length) >= 7 ? 2 : 1)) ? 0.85 : 0;
        if (v > mv) { mv = v; mj = j; }
      });
      if (mj >= 0) { usados.add(mj); ok += mv; }
    }
    const primeiro = x[0] === y[0] || dist(x[0], y[0]) <= 1;
    return (2 * ok / (x.length + y.length)) * (primeiro ? 1 : 0.6);
  }

  const compAtual = () => `${E().ref.ano}-${String(E().ref.mes).padStart(2, '0')}`;
  function estado() {
    const st = E();
    if (!st.etiquetas || st.etiquetas.comp !== compAtual()) st.etiquetas = { comp: compAtual(), arquivos: {}, itens: {} };
    return st.etiquetas;
  }
  const temEtiquetas = () => !!(E() && E().etiquetas && E().etiquetas.comp === compAtual() && Object.keys(E().etiquetas.itens).length);
  /** Índice paciente → item de etiqueta (só da competência atual). */
  function indice() {
    const m = {};
    if (temEtiquetas()) Object.values(E().etiquetas.itens).forEach(i => { if (i.pid) m[i.pid] = i; });
    return m;
  }
  A.etiquetaDe = p => (p ? indice()[p.id] : null) || null;

  /** Pacientes que podem receber etiqueta (vieram do CSV ou foram cadastrados aqui). */
  const candidatos = () => Object.values(E().pacientes).filter(p => p.nome && !['escala', 'resultado'].includes(p.origem));

  /** Liga cada protocolo sem vínculo a um paciente: nome idêntico primeiro; depois semelhante e sem empate. */
  function casar() {
    const et = estado(), pacs = candidatos();
    const usados = new Set(Object.values(et.itens).filter(i => i.pid).map(i => i.pid));
    const porNome = new Map();
    pacs.forEach(p => { const k = M.norm(p.nome); if (!porNome.has(k)) porNome.set(k, []); porNome.get(k).push(p); });
    const livres = () => pacs.filter(p => !usados.has(p.id));
    const pend = Object.values(et.itens).filter(i => !i.pid && !i.semVinculo);
    // 1) exato
    for (const i of pend) {
      const c = (porNome.get(M.norm(i.nome)) || []).filter(p => !usados.has(p.id));
      const col = c.filter(p => A.situacao(p).coleta);
      const p = c.length === 1 ? c[0] : col.length === 1 ? col[0] : null;
      if (p) { i.pid = p.id; i.conf = 'exato'; i.score = 1; usados.add(p.id); }
    }
    // 2) aproximado (melhor candidato claro)
    for (const i of pend.filter(x => !x.pid)) {
      const r = livres().map(p => ({ p, s: simNomes(i.nome, p.nome) })).sort((a, b) => b.s - a.s);
      if (r[0] && r[0].s >= 0.8 && (!r[1] || r[0].s - r[1].s >= 0.12)) { i.pid = r[0].p.id; i.conf = 'aproximado'; i.score = +r[0].s.toFixed(2); usados.add(r[0].p.id); }
    }
  }

  async function importarPdfs(files) {
    if (!A.ehProgramador()) return A.toast('Só o laboratório sobe as etiquetas.', 'shield');
    const pdfs = files.filter(f => /\.pdf$/i.test(f.name));
    if (!pdfs.length) return A.toast('Escolha os PDFs “Resumo de Solicitações Incluídas” do Autolac.', 'alert');
    const lidos = [], erros = [];
    for (const f of pdfs) { try { lidos.push(await M.lerEtiquetasPdf(f)); } catch (e) { erros.push(e.message); } }
    if (!lidos.length) return A.toast(erros[0] || 'Não consegui ler os PDFs.', 'alert');
    A.marcar('etiquetas');
    const et = estado();
    let novos = 0, repetidos = 0;
    for (const l of lidos) {
      // reenviar o mesmo arquivo substitui o anterior
      Object.values(et.itens).filter(i => i.arquivo === l.arquivo).forEach(i => { delete et.itens[i.protocolo]; });
      et.arquivos[l.arquivo] = { perfil: l.perfil, qtd: l.linhas.length, data: l.data, em: new Date().toISOString() };
      for (const r of l.linhas) {
        if (et.itens[r.protocolo]) { repetidos++; continue; }
        et.itens[r.protocolo] = { protocolo: r.protocolo, nome: r.nome, arquivo: l.arquivo, perfil: l.perfil.slice(), pid: null, conf: null, score: null };
        novos++;
      }
    }
    casar();
    A.evento('etiquetas', null, `Etiquetas: ${lidos.length} PDF(s), ${novos} protocolos${repetidos ? ` (${repetidos} repetidos ignorados)` : ''}`);
    A.salvar(); A.render();
    const r = resumo();
    A.toast(`${novos} protocolos lidos · ${r.vinculados} ligados aos pacientes${r.semPaciente.length ? ` · ${r.semPaciente.length} sem paciente` : ''}${erros.length ? ` · ${erros.length} PDF com erro` : ''}`, 'tag');
  }

  // =====================================================================
  // Conferências
  // =====================================================================
  /** Controles que o paciente deveria ter nas etiquetas deste mês (glic/cr/hbgl que entram como exame extra). */
  function perfilEsperado(p) {
    const tipo = A.tipoDoPaciente(p), b = M.BATERIAS[tipo];
    if (b.semControle || b.especial) return null;          // anual/admissional: perfil próprio, não compara
    return Object.keys(M.CONTROLES).filter(k => p.controles && p.controles[k] && E().regras[k] && E().regras[k][tipo] && !b.exames.includes(M.CONTROLES[k].exame));
  }
  const rotPerfil = k => !k ? '—' : k.length ? '+ ' + k.map(x => M.CONTROLES[x].rotulo).join(' + ') : 'Bateria do mês';
  const chipsPerfil = k => (k || []).map(x => `<span class="k" style="--cor:${M.CONTROLES[x].cor}" title="${esc(M.CONTROLES[x].rotulo)}">${M.CONTROLES[x].sigla}</span>`).join('');
  const mesmoPerfil = (a, b) => a.slice().sort().join() === b.slice().sort().join();

  /** Quem coleta neste mês (com máquina ou sem), na ordem do relatório. */
  function coletam() {
    const vs = E().vagas.filter(v => v.pacienteId && !(v.match && v.match.duplicadaDe)).sort(A.ordemRelatorio);
    const comVaga = vs.map(v => ({ v, p: A.pacDe(v) })).filter(x => x.p && !['escala', 'resultado'].includes(x.p.origem) && A.situacao(x.p).coleta);
    const semVaga = Object.values(E().pacientes).filter(p => p.origem === 'csv' && !p.vagaId && A.situacao(p).coleta).map(p => ({ v: null, p }));
    return [...comVaga, ...semVaga];
  }

  function resumo() {
    const et = temEtiquetas() ? E().etiquetas : { itens: {}, arquivos: {} };
    const itens = Object.values(et.itens), idx = indice();
    const col = coletam();
    const semEtiqueta = col.filter(x => !idx[x.p.id]);
    const semPaciente = itens.filter(i => !i.pid);
    const aproximados = itens.filter(i => i.pid && i.conf === 'aproximado');
    const naoColeta = itens.filter(i => i.pid && E().pacientes[i.pid] && !A.situacao(E().pacientes[i.pid]).coleta);
    const perfilDif = itens.filter(i => {
      const p = i.pid && E().pacientes[i.pid]; if (!p) return false;
      const esp = perfilEsperado(p); return esp && !mesmoPerfil(esp, i.perfil);
    });
    return { itens, vinculados: itens.length - semPaciente.length, col, semEtiqueta, semPaciente, aproximados, naoColeta, perfilDif, arquivos: et.arquivos };
  }

  // =====================================================================
  // Mapa de coleta
  // =====================================================================
  const filtro = { dias: 'SQS', turnos: { M: true, T: true, N: true }, saloes: {}, naoColeta: true };
  try { Object.assign(filtro, JSON.parse(localStorage.getItem('medrim:mapa') || '{}')); } catch (e) { /* ok */ }
  const guardarFiltro = () => { try { localStorage.setItem('medrim:mapa', JSON.stringify(filtro)); } catch (e) { /* ok */ } };

  const MOTIVO_CURTO = st => st.travado ? 'outro laboratório' : /Internado/.test(st.motivo) ? 'internado' : /trânsito/i.test(st.motivo) ? 'trânsito' : /Óbito/.test(st.motivo) ? 'óbito' : /Saiu/.test(st.motivo) ? 'saiu' : /Abandonou/.test(st.motivo) ? 'abandono' : /Transplantado/.test(st.motivo) ? 'transplantado' : /Admiss/.test(st.motivo) ? 'admissional — mês seguinte' : 'não coleta';

  function blocoPaciente(v, idx) {
    const g = M.GRUPOS[v.grupo].dias.map(d => M.DIAS[d].toUpperCase()).join(' ');
    if (!A.ocupada(v)) return `<div class="mq-p livre"><span class="mq-g">${g}</span><span class="mq-n">livre</span></div>`;
    const p = A.pacDe(v);
    if (v.match && v.match.duplicadaDe) {
      const pr = A.vagaPor(v.match.duplicadaDe);
      return `<div class="mq-p nao"><span class="mq-g">${g}</span><span class="mq-n">${esc(p ? p.nome : v.nomeEscala)}</span><span class="mq-x">coleta na ${esc(pr ? (pr.salao !== v.salao || pr.turno !== v.turno ? A.local(pr, true) : 'máq ' + pr.maq) : 'outra máquina')}</span></div>`;
    }
    if (!p || ['escala', 'resultado'].includes(p.origem)) {
      const tv = A.travaDe(v);
      if (!filtro.naoColeta) return `<div class="mq-p livre"><span class="mq-g">${g}</span><span class="mq-n">—</span></div>`;
      return `<div class="mq-p nao"><span class="mq-g">${g}</span><span class="mq-n">${esc(v.nomeEscala)}</span><span class="mq-x">${tv ? ic('lock') + ' outro laboratório' : 'sem pedido'}</span></div>`;
    }
    const st = A.situacao(p);
    if (!st.coleta) {
      if (!filtro.naoColeta) return `<div class="mq-p livre"><span class="mq-g">${g}</span><span class="mq-n">—</span></div>`;
      return `<div class="mq-p nao"><span class="mq-g">${g}</span><span class="mq-n">${esc(p.nome)}</span><span class="mq-x">${st.travado ? ic('lock') + ' ' : ''}${esc(MOTIVO_CURTO(st))}</span></div>`;
    }
    const e = idx[p.id];
    const k = e ? e.perfil : perfilEsperado(p) || [];
    const conv = A.convenioDe(p);
    return `<div class="mq-p ${e ? 'ok' : 'sem-etq'}"><span class="mq-g">${g}</span>
      <span class="mq-n">${esc(e ? e.nome : p.nome)}</span>
      <span class="mq-c">${e ? esc(e.protocolo) : 'SEM ETIQUETA'}<span class="mq-k">${chipsPerfil(k)}${conv ? A.seloConvenio(conv) : ''}</span></span></div>`;
  }

  function paginasMapa() {
    const idx = indice(), b = A.bateriaRef(), tipo = A.tipoRef();
    const legenda = Object.entries(M.CONTROLES).filter(([k, c]) => E().regras[k] && E().regras[k][tipo] && !b.exames.includes(c.exame)).map(([k, c]) => `${chipsPerfil([k])} ${esc(c.rotulo.toLowerCase())}`).join(' · ') || 'sem exames extras neste mês';
    const grupos = filtro.dias === 'ambos' ? ['SQS', 'TQS'] : [filtro.dias];
    const saloes = A.saloes().filter(s => filtro.saloes[s] !== false);
    const pgs = [];
    for (const s of saloes) for (const t of ['M', 'T', 'N']) {
      if (!filtro.turnos[t]) continue;
      const doTurno = E().vagas.filter(v => v.salao === s && v.turno === t);
      if (!doTurno.length) continue;
      const maqs = [...new Map(doTurno.slice().sort((a, b2) => a.pos - b2.pos).map(v => [v.maq, v.pos])).keys()];
      let nCol = 0, nSem = 0;
      const cards = maqs.map(maq => {
        const partes = grupos.map(gr => doTurno.find(v => v.maq === maq && v.grupo === gr)).filter(Boolean);
        partes.forEach(v => { const p = A.pacDe(v); if (p && !['escala', 'resultado'].includes(p.origem) && A.situacao(p).coleta && !(v.match && v.match.duplicadaDe)) { nCol++; if (!idx[p.id]) nSem++; } });
        const hdf = /HDF/.test(maq);
        return `<div class="mq"><div class="mq-h">${hdf ? 'HDF ' + esc(maq.slice(3)) : 'MÁQ ' + esc(maq)}</div>${partes.map(v => blocoPaciente(v, idx)).join('')}</div>`;
      }).join('');
      const rotDias = grupos.map(gr => M.GRUPOS[gr].rotulo).join(' + ');
      pgs.push(`<section class="mapa-pg ${grupos.length > 1 ? 'dois' : 'um'}">
        <header><div><b>Salão ${s} · ${esc(A.rotTurno(t))}</b><span>${esc(rotDias)}</span></div>
          <div class="mapa-meta">Coleta · Bateria ${esc(b.rotulo)} de ${esc(A.nomeRef())}<br><b>${nCol}</b> coletas${nSem ? ` · <b class="alerta">${nSem} sem etiqueta</b>` : ''}</div></header>
        <div class="mapa-grade">${cards}</div>
        <footer>Confira nome + protocolo do tubo com o paciente da máquina antes da coleta · ${legenda} · MedRim — Célula Diagnósticos</footer>
      </section>`);
    }
    return pgs.join('') || '<div class="vazio">Escolha ao menos um salão e um turno.</div>';
  }

  // =====================================================================
  // Tela
  // =====================================================================
  function vEtiquetas() {
    if (!E() || !E().vagas.length) return `<div class="card vazio">Importe a escala e os CSVs primeiro (Importar arquivos).</div>`;
    const r = resumo(), b = A.bateriaRef();
    const outraComp = E().etiquetas && E().etiquetas.comp !== compAtual() && Object.keys(E().etiquetas.itens || {}).length;
    const P = id => E().pacientes[id];
    const local = p => p && p.vagaId ? esc(A.local(A.vagaPor(p.vagaId), true)) : '<span class="faint">sem máquina</span>';
    const arquivos = Object.entries(r.arquivos).map(([nome, a]) => `<tr><td><b>${esc(nome)}</b>${a.data ? `<br><small class="faint">Autolac · ${esc(a.data)}</small>` : ''}</td>
      <td><select class="sel-cand" data-perfil="${esc(nome)}" aria-label="Perfil do arquivo">${[[], ['glic'], ['cr'], ['glic', 'cr'], ['hbgl'], ['glic', 'hbgl']].map(k => `<option value="${k.join(',')}" ${mesmoPerfil(k, a.perfil) ? 'selected' : ''}>${esc(rotPerfil(k))}</option>`).join('')}</select></td>
      <td class="mono">${a.qtd}</td><td><button class="btn sm ghost" data-etq="remover-arq" data-a="${esc(nome)}">${ic('x')} Remover</button></td></tr>`).join('');

    const opcoes = i => {
      const idx = indice();
      const livres = candidatos().filter(p => !idx[p.id]).map(p => ({ p, s: simNomes(i.nome, p.nome) })).sort((a, c) => c.s - a.s);
      return `<option value="">Ligar a…</option>` + livres.slice(0, 8).map(x => `<option value="${esc(x.p.id)}">${esc(x.p.nome)} · ${Math.round(x.s * 100)}%</option>`).join('')
        + `<option value="-">Não é paciente da Hiperrim</option>`;
    };
    const secSemPac = r.semPaciente.filter(i => !i.semVinculo).map(i => `<tr><td class="mono"><b>${esc(i.protocolo)}</b></td><td>${esc(i.nome)}</td><td>${chipsPerfil(i.perfil)}</td>
      <td><select class="sel-cand" data-ligar="${esc(i.protocolo)}" aria-label="Ligar ao paciente">${opcoes(i)}</select></td></tr>`).join('');
    const secSemEtq = r.semEtiqueta.map(x => `<tr><td>${local(x.p)}</td><td><b>${esc(x.p.nome)}</b></td><td>${chipsPerfil(perfilEsperado(x.p) || [])}</td></tr>`).join('');
    const secPerfil = r.perfilDif.map(i => { const p = P(i.pid); return `<tr><td>${local(p)}</td><td><b>${esc(p.nome)}</b><br><span class="mono">${esc(i.protocolo)}</span></td>
      <td>PDF: ${chipsPerfil(i.perfil) || 'base'} <span class="faint">·</span> MedRim: ${chipsPerfil(perfilEsperado(p)) || 'base'}</td></tr>`; }).join('');
    const secAprox = r.aproximados.map(i => { const p = P(i.pid); return `<tr><td class="mono"><b>${esc(i.protocolo)}</b></td><td>${esc(i.nome)}<br><small class="faint">MedRim: ${esc(p.nome)}</small></td><td class="mono">${Math.round(i.score * 100)}%</td>
      <td><button class="btn sm" data-etq="confirmar" data-pr="${esc(i.protocolo)}">${ic('check')} Confirmar</button> <button class="btn sm ghost" data-etq="desligar" data-pr="${esc(i.protocolo)}">${ic('x')} Desligar</button></td></tr>`; }).join('');
    const secNaoCol = r.naoColeta.map(i => { const p = P(i.pid); return `<tr><td class="mono"><b>${esc(i.protocolo)}</b></td><td>${esc(p.nome)}</td><td><small>${esc(A.situacao(p).motivo)}</small></td></tr>`; }).join('');
    const tab = (cor, icn, t, sub, n, cab, linhas) => n ? `<div class="card" style="--cor:${cor};margin-top:14px"><div class="sec-t"><span class="ic" style="--cor:${cor}">${ic(icn)}</span><div><b>${t}</b> <span class="cnt">${n}</span><br><small class="faint">${sub}</small></div></div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr>${cab.map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>${linhas}</tbody></table></div></div>` : '';

    const temArq = Object.keys(r.arquivos).length;
    const chk = (nome, val, rot, extra = '') => `<label ${extra}><input type="checkbox" data-mapa="${nome}" data-v="${val}" ${(nome === 't' ? filtro.turnos[val] : nome === 's' ? filtro.saloes[val] !== false : filtro.naoColeta) ? 'checked' : ''}> ${rot}</label>`;
    return `
    <section class="card no-print">
      <div class="etq-topo">
        <div>
          <div class="eyebrow" style="color:var(--muted)">Depois do cadastro no sistema do laboratório</div>
          <h2 style="margin:4px 0 6px">Etiquetas de ${esc(A.nomeRef())}</h2>
          <p class="faint" style="margin:0;max-width:640px">Solte os PDFs <b>“Resumo de Solicitações Incluídas”</b> do Autolac — um por perfil
          (<i>normal</i>, <i>gli</i>, <i>cr</i>, <i>glicr</i>). O MedRim liga cada protocolo ao paciente da máquina e monta o mapa de coleta para imprimir.
          Os PDFs são lidos aqui no navegador; nada é enviado para fora.</p>
        </div>
        <div class="etq-kpis">
          <div><b class="mono" data-n="${r.itens.length}">${r.itens.length}</b><small>protocolos</small></div>
          <div><b class="mono" data-n="${r.vinculados}">${r.vinculados}</b><small>ligados</small></div>
          <div class="${r.semEtiqueta.length ? 'alerta' : 'ok'}"><b class="mono">${r.semEtiqueta.length}</b><small>coletam sem etiqueta</small></div>
        </div>
      </div>
      ${outraComp ? `<div class="alerta-box" style="margin-top:12px">${ic('alert')}<div>As etiquetas guardadas são de <b>${esc(E().etiquetas.comp)}</b>. Para ${esc(A.nomeRef())}, solte os PDFs deste mês.</div></div>` : ''}
      <div class="drop so-prog" id="etq-drop" tabindex="0" role="button" aria-label="Escolher PDFs de etiquetas" style="margin-top:14px">
        ${ic('tag')}<b>Arraste os PDFs aqui ou clique para escolher</b><small>Ex.: 2110-normal.pdf · 2110-normalgli.pdf · 2110-normalcr.pdf · 2110-normalglicr.pdf</small>
      </div>
      <input type="file" id="etq-arq" accept=".pdf,application/pdf" multiple hidden>
      ${temArq ? `<div class="tbl-wrap so-prog" style="margin-top:12px"><table class="tbl"><thead><tr><th>Arquivo</th><th>Perfil das etiquetas</th><th>Protocolos</th><th></th></tr></thead><tbody>${arquivos}</tbody></table></div>
        <div class="so-prog" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><button class="btn sm" data-etq="refazer">${ic('sync')} Refazer ligações automáticas</button><button class="btn sm perigo" data-etq="limpar">${ic('x')} Apagar etiquetas do mês</button></div>` : ''}
    </section>

    <div class="no-print">
      ${tab('var(--crit)', 'alert', 'Coletam, mas não têm etiqueta', 'Estão no relatório de cadastro deste mês e nenhum protocolo foi ligado a eles. Cadastrar no Autolac ou ligar abaixo.', r.semEtiqueta.length, ['Local', 'Paciente', 'Perfil esperado'], secSemEtq)}
      ${tab('var(--warn)', 'tag', 'Protocolos sem paciente', 'O nome do PDF não bate com nenhum paciente. Escolha quem é — o MedRim sugere os mais parecidos.', r.semPaciente.filter(i => !i.semVinculo).length, ['Protocolo', 'Nome no PDF', 'Perfil', 'Ligar'], secSemPac)}
      ${tab('var(--c5)', 'flask', 'Perfil diferente do MedRim', 'O PDF em que o protocolo veio (normal / gli / cr / glicr) não bate com os controles marcados no MedRim. Confira o pedido.', r.perfilDif.length, ['Local', 'Paciente', 'Perfil'], secPerfil)}
      ${tab('var(--blue)', 'link', 'Ligados por semelhança — conferir', 'O nome do PDF é parecido, mas não idêntico ao do MedRim.', r.aproximados.length, ['Protocolo', 'Nomes', 'Semelhança', ''], secAprox)}
      ${tab('var(--muted)', 'info', 'Têm etiqueta, mas não coletam este mês', 'Internado, trânsito, outro laboratório… A etiqueta existe; o mapa mostra o motivo.', r.naoColeta.length, ['Protocolo', 'Paciente', 'Motivo'], secNaoCol)}
    </div>

    <section class="card" id="mapa-coleta" style="margin-top:14px">
      <div class="mapa-ctl no-print">
        <div><b style="font-size:16px">${ic('printer')} Mapa de coleta</b><br><small class="faint">Uma folha por salão e turno · máquinas na ordem do salão · nome + protocolo do tubo</small></div>
        <div class="seg" role="group" aria-label="Dias">${[['SQS', 'Seg · Qua · Sex'], ['TQS', 'Ter · Qui · Sáb'], ['ambos', 'Ambos']].map(([v, rot]) => `<button type="button" aria-pressed="${filtro.dias === v}" data-dias="${v}">${rot}</button>`).join('')}</div>
        <div class="mapa-chk">${['M', 'T', 'N'].map(t => chk('t', t, A.rotTurno(t))).join('')}<span class="sep"></span>${A.saloes().map(s => chk('s', s, 'Salão ' + s)).join('')}<span class="sep"></span>${chk('nc', 1, 'Mostrar quem não coleta')}</div>
        <button class="btn pri" data-etq="imprimir">${ic('printer')} Imprimir mapa</button>
      </div>
      ${!temEtiquetas() ? `<div class="alerta-box no-print" style="margin:12px 0">${ic('info')}<div>Sem etiquetas deste mês ainda: o mapa sai com os nomes e “SEM ETIQUETA” no lugar do código.</div></div>` : ''}
      <div class="mapa-paginas">${paginasMapa()}</div>
    </section>`;
  }

  function ligarEtiquetas() {
    const drop = $('#etq-drop'), inp = $('#etq-arq');
    if (drop) {
      drop.onclick = () => inp.click();
      drop.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inp.click(); } };
      ['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('on'); }));
      ['dragleave', 'drop'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove('on'); }));
      drop.addEventListener('drop', e => importarPdfs([...e.dataTransfer.files]));
      inp.onchange = () => { const f = [...inp.files]; inp.value = ''; importarPdfs(f); };
    }
    const c = $('#conteudo');
    c.onchange = e => {
      const t = e.target, et = E().etiquetas;
      if ((t.dataset.perfil || t.dataset.ligar) && !A.ehProgramador()) { A.render(); return A.toast('Só o laboratório altera as etiquetas.', 'shield'); }
      if (t.dataset.perfil) {
        A.marcar('perfil das etiquetas');
        const k = t.value ? t.value.split(',') : [];
        et.arquivos[t.dataset.perfil].perfil = k;
        Object.values(et.itens).filter(i => i.arquivo === t.dataset.perfil).forEach(i => { i.perfil = k.slice(); });
        A.salvar(); A.render(); return;
      }
      if (t.dataset.ligar) {
        const i = et.itens[t.dataset.ligar]; if (!i || !t.value) return;
        A.marcar('ligar protocolo');
        if (t.value === '-') { i.semVinculo = true; i.pid = null; }
        else { i.pid = t.value; i.conf = 'manual'; i.score = null; }
        A.evento('etiquetas', i.pid, `Protocolo ${i.protocolo} ${i.pid ? 'ligado a ' + titulo(E().pacientes[i.pid].nome) : 'marcado como não sendo da Hiperrim'}`);
        A.salvar(); A.render(); return;
      }
      if (t.dataset.mapa) {
        const v = t.dataset.v;
        if (t.dataset.mapa === 't') filtro.turnos[v] = t.checked;
        else if (t.dataset.mapa === 's') filtro.saloes[v] = t.checked;
        else filtro.naoColeta = t.checked;
        guardarFiltro(); redesenharMapa();
      }
    };
    c.onclick = e => {
      const bd = e.target.closest('[data-dias]');
      if (bd) { filtro.dias = bd.dataset.dias; guardarFiltro(); $$('[data-dias]').forEach(x => x.setAttribute('aria-pressed', String(x === bd))); return redesenharMapa(); }
      const b = e.target.closest('[data-etq]'); if (!b) return;
      const ac = b.dataset.etq, et = E().etiquetas;
      if (ac === 'imprimir') return imprimir();
      if (!A.ehProgramador()) return A.toast('Só o laboratório altera as etiquetas.', 'shield');
      if (ac === 'refazer') { A.marcar('refazer ligações'); Object.values(et.itens).forEach(i => { if (i.conf !== 'manual') { i.pid = null; i.conf = null; i.score = null; } }); casar(); A.salvar(); A.render(); return A.toast('Ligações refeitas', 'sync'); }
      if (ac === 'limpar') return A.abrirModal({ titulo: 'Apagar etiquetas do mês', ic: 'x', cor: 'var(--crit)', corpo: `<p style="margin:0">Apaga os protocolos lidos de ${esc(A.nomeRef())} deste navegador. Os PDFs no seu computador não são tocados.</p>`,
        botoes: [{ rot: 'Cancelar' }, { rot: 'Apagar', cls: 'rim', ic: 'x', acao: () => { A.marcar('apagar etiquetas'); E().etiquetas = null; A.salvar(); A.fechar(); A.render(); } }] });
      if (ac === 'remover-arq') { A.marcar('remover PDF'); const a = b.dataset.a; Object.values(et.itens).filter(i => i.arquivo === a).forEach(i => { delete et.itens[i.protocolo]; }); delete et.arquivos[a]; A.salvar(); return A.render(); }
      if (ac === 'confirmar') { const i = et.itens[b.dataset.pr]; if (i) { A.marcar('confirmar protocolo'); i.conf = 'manual'; A.salvar(); A.render(); } return; }
      if (ac === 'desligar') { const i = et.itens[b.dataset.pr]; if (i) { A.marcar('desligar protocolo'); i.pid = null; i.conf = null; i.semVinculo = false; A.salvar(); A.render(); } }
    };
  }

  function redesenharMapa() { const el = $('#mapa-coleta .mapa-paginas'); if (el) el.innerHTML = paginasMapa(); }

  function imprimir() {
    document.body.classList.add('imprimindo-mapa');
    const fim = () => { document.body.classList.remove('imprimindo-mapa'); window.removeEventListener('afterprint', fim); };
    window.addEventListener('afterprint', fim);
    window.addEventListener('hashchange', fim, { once: true });
    setTimeout(() => window.print(), 60);
  }

  A.views.vEtiquetas = vEtiquetas;
  A.ligar.etiquetas = ligarEtiquetas;
  Object.assign(A, { resumoEtiquetas: () => (E() && E().vagas.length ? resumo() : null), lerEtiquetas: importarPdfs });
})(window.MED = window.MED || {});
