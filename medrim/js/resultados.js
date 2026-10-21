/* MedRim · resultados (TXT padrão Nephrosys): importação, histórico por paciente, visão do médico,
   arquivos para a Hiperrim baixar e configuração da interface.
   Armazenamento do mockup: IndexedDB do navegador (o TXT original é guardado byte a byte). */
(function (M) {
  'use strict';
  const A = M.app;
  const { $, $$, esc, ic, titulo, nomeCurto, iniciais, fmtData, idade, mascCpf, fmtCpf, cpfValido } = A;
  const E = () => A.E;

  // ================= armazenamento (IndexedDB) =================
  const R = { lotes: [], ok: true };
  A.R = R;
  let dbp = null;
  function abrirDB() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      if (!('indexedDB' in window)) return rej(new Error('Navegador sem IndexedDB'));
      const r = indexedDB.open('medrim', 1);
      r.onupgradeneeded = () => {
        const db = r.result;
        if (!db.objectStoreNames.contains('lotes')) db.createObjectStore('lotes', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('arquivos')) db.createObjectStore('arquivos', { keyPath: 'id' });
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  async function op(store, modo, fn) {
    const db = await abrirDB();
    return new Promise((res, rej) => {
      const t = db.transaction(store, modo), req = fn(t.objectStore(store));
      t.oncomplete = () => res(req && 'result' in req ? req.result : undefined);
      t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
    });
  }
  const ordenar = () => R.lotes.sort((a, b) => b.competencia.localeCompare(a.competencia) || b.importadoEm.localeCompare(a.importadoEm));
  A.carregarResultados = async function () {
    try { R.lotes = (await op('lotes', 'readonly', s => s.getAll())) || []; ordenar(); }
    catch (e) { R.ok = false; console.warn('IndexedDB indisponível', e); }
  };

  // ================= leitura do TXT =================
  const MESES3 = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
  const dataISO = d => { const m = (d || '').match(/(\d{2})\/(\d{2})\/(\d{4})/); return m ? `${m[3]}-${m[2]}-${m[1]}` : ''; };
  const rotComp = c => { const [a, m] = c.split('-').map(Number); return `${M.MESES[m - 1]}/${a}`; };
  const tipoComp = c => M.BATERIAS[M.CALENDARIO[+c.split('-')[1]]];
  A.rotComp = rotComp;

  M.lerTxtResultados = function (buf) {
    const txt = new TextDecoder('windows-1252').decode(buf);
    const linhas = txt.split(/\r?\n/);
    const pacientes = {}, avisos = [], codigos = {}, datas = {};
    let atual = null, pAtual = null, esperado = 1, nRes = 0;
    const av = (tipo, texto, chave) => avisos.push({ tipo, texto, chave });
    linhas.forEach((l, i) => {
      if (!l.trim()) return;
      const c = l.split('|');
      const seq = parseInt(c[1], 10);
      if (seq !== esperado) av('seq', `Linha ${i + 1}: sequência esperada ${esperado}, veio ${c[1]}`);
      esperado = seq + 1;
      if (c[0] === '01') {
        const nome = (c[2] || '').trim(), cpf = M.soDigitos(c[5]), data = (c[6] || '').trim();
        const chave = cpf || 'N:' + M.norm(nome);
        const p = pacientes[chave] || (pacientes[chave] = { chave, nome, cpf, reg3: (c[3] || '').trim(), reg4: (c[4] || '').trim(), coletas: [] });
        atual = { data: dataISO(data), valores: {} }; pAtual = p;
        p.coletas.push(atual);
        datas[atual.data] = (datas[atual.data] || 0) + 1;
        if (!cpf) av('semcpf', `${nome}: registro sem CPF — o sistema da clínica pode não conseguir casar o paciente`, chave);
        else if (!cpfValido(cpf)) av('cpf', `${nome}: CPF ${cpf} com dígito verificador inválido`, chave);
        if (p.reg3 || p.reg4) av('campo', `${nome}: campos 3/4 preenchidos (“${p.reg3}”/“${p.reg4}”) — nos demais estão vazios`, chave);
      } else if (c[0] === '02') {
        if (!atual) return av('orfao', `Linha ${i + 1}: resultado antes de qualquer paciente`);
        const cod = (c[2] || '').trim(), v = M.numBr(c[3]);
        atual.valores[cod] = { t: (c[3] || '').trim(), n: v.n, op: v.op, abs: (c[4] || '').trim() || null };
        codigos[cod] = (codigos[cod] || 0) + 1; nRes++;
        if (v.op) av('texto', `${pAtual.nome}: ${M.defRes(cod).nome} = “${c[3].trim()}”`, pAtual.chave);
      } else av('tipo', `Linha ${i + 1}: registro “${c[0]}” desconhecido`);
    });
    for (const p of Object.values(pacientes)) {
      p.coletas.sort((a, b) => a.data.localeCompare(b.data));
      p.valores = {}; p.coletas.forEach(co => Object.assign(p.valores, co.valores));
      p.data = p.coletas[p.coletas.length - 1].data;
      if (p.coletas.length > 1) av('recoleta', `${p.nome}: ${p.coletas.length} coletas (${p.coletas.map(x => fmtData(x.data)).join(' e ')}) — valem os resultados mais recentes de cada exame`, p.chave);
      const d = M.derivados(p.valores);
      if (d.urr && d.urr.aviso) av('urr', `${p.nome}: ureia pós (${p.valores['002'].t}) ≥ pré (${p.valores['001'].t}) — conferir coleta`, p.chave);
    }
    Object.keys(codigos).filter(c => !M.RES[c]).forEach(c => av('codigo', `Código ${c} não interpretado (${codigos[c]} resultados)${M.NEPHRO_PDF[c] ? ' — no PDF: ' + M.NEPHRO_PDF[c] : ''}`));
    return { pacientes, avisos, codigos, datas, nResultados: nRes, nLinhas: linhas.filter(l => l.trim()).length };
  };

  function adivinharCompetencia(nome, datas) {
    const n = M.norm(nome).replace(/_/g, ' ');
    const m = n.match(/\b(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)[A-Z]*\s*(\d{4})\b/);
    if (m) return `${m[2]}-${String(MESES3.indexOf(m[1]) + 1).padStart(2, '0')}`;
    const top = Object.entries(datas).sort((a, b) => b[1] - a[1])[0];
    if (top && top[0]) { const d = new Date(top[0] + 'T12:00'); d.setDate(1); d.setMonth(d.getMonth() + 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
    const r = E() ? E().ref : { ano: new Date().getFullYear(), mes: new Date().getMonth() + 1 };
    return `${r.ano}-${String(r.mes).padStart(2, '0')}`;
  }

  // ================= vínculo resultado ↔ paciente da escala =================
  function pacienteDaEscala(chave, nome) {
    const P = E() ? E().pacientes : {};
    if (P[chave] && P[chave].vagaId) return P[chave];
    const nn = M.norm(nome);
    return Object.values(P).find(p => p.vagaId && M.norm(p.nome) === nn) || P[chave] || null;
  }
  function localDe(chave, nome) { const p = pacienteDaEscala(chave, nome); return p && p.vagaId ? A.vagaPor(p.vagaId) : null; }

  /** histórico de um paciente em todos os lotes (mais antigo → mais recente) */
  function historico(chave, nome) {
    const nn = M.norm(nome || '');
    return R.lotes.slice().sort((a, b) => a.competencia.localeCompare(b.competencia)).map(l => {
      const p = l.pacientes[chave] || (nn && Object.values(l.pacientes).find(x => M.norm(x.nome) === nn));
      return p ? { comp: l.competencia, lote: l, p, val: Object.assign({}, p.valores, M.derivados(p.valores)) } : null;
    }).filter(Boolean);
  }
  A.historicoResultados = historico;

  /** nomes da escala sem CSV que aparecem no TXT de resultados mais recente */
  A.sugestoesTxt = function () {
    if (!R.lotes.length || !E()) return {};
    const lote = R.lotes[0];
    const P = E().pacientes;
    const livres = Object.values(lote.pacientes).filter(p => !(p.cpf && P[p.cpf] && P[p.cpf].vagaId));
    const out = {};
    E().vagas.filter(v => v.nomeEscala && (!v.pacienteId || (P[v.pacienteId] && P[v.pacienteId].origem === 'escala'))).forEach(v => {
      const toks = v.variantes.length ? v.variantes.map(M.tokensAbrev) : [M.tokensAbrev(v.nomeEscala)];
      const c = livres.map(p => ({ p, s: Math.max(...toks.map(t => M.pontuar(t, p.nome))) })).sort((a, b) => b.s - a.s);
      if (c[0] && c[0].s >= 0.8 && (!c[1] || c[0].s - c[1].s >= 0.08)) out[v.id] = { chave: c[0].p.chave, nome: c[0].p.nome, cpf: c[0].p.cpf, score: c[0].s, comp: lote.competencia };
    });
    return out;
  };
  A.vincularTxt = function (vagaIds) {
    const sug = A.sugestoesTxt();
    A.marcar('vínculo pelo TXT de resultados');
    let n = 0;
    vagaIds.forEach(id => {
      const s = sug[id]; if (!s) return;
      const v = A.vagaPor(id);
      const ant = A.pacDe(v); if (ant && ant.origem === 'escala') delete E().pacientes[ant.id];
      const pid = s.cpf || s.chave;
      E().pacientes[pid] = Object.assign({ id: pid, cpf: s.cpf, nome: s.nome, nasc: '', codigo: '', origem: 'resultado', status: 'ativo', controles: { glic: false, cr: false, hbgl: false } }, E().pacientes[pid] || {}, { vagaId: v.id, grupo: v.grupo, turno: v.turno });
      v.pacienteId = pid; v.match = { conf: 'media', score: s.score, fonte: 'txt' };
      n++;
    });
    if (n) A.evento('vinculo', null, `${n} nome(s) da escala identificados pelo TXT de resultados (${rotComp(sug[vagaIds[0]].comp)})`);
    A.salvar(); A.render(); A.toast(`${n} vinculado(s) pelo TXT — continuam sem pedido no CSV`, 'link', true);
  };

  // ================= importação =================
  function escolherTxt(cb) {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.txt,text/plain';
    inp.onchange = () => inp.files[0] && cb(inp.files[0]);
    inp.click();
  }
  async function previaImportacao(arquivo) {
    const buf = await arquivo.arrayBuffer();
    let r;
    try { r = M.lerTxtResultados(buf); } catch (e) { return A.toast('Não consegui ler este TXT: ' + e.message, 'alert'); }
    const nPac = Object.keys(r.pacientes).length;
    if (!nPac) return A.toast('Nenhum registro 01 (paciente) encontrado — é o TXT de resultados?', 'alert');
    const comp = adivinharCompetencia(arquivo.name, r.datas);
    const P = E() ? E().pacientes : {};
    const naEscala = Object.values(r.pacientes).filter(p => (p.cpf && P[p.cpf]) || Object.values(P).some(x => M.norm(x.nome) === M.norm(p.nome))).length;
    const porTipo = {}; r.avisos.forEach(a => { porTipo[a.tipo] = (porTipo[a.tipo] || 0) + 1; });
    const rotAv = { semcpf: 'sem CPF', cpf: 'CPF inválido', recoleta: 'recoletas', urr: 'ureia pós ≥ pré', texto: 'valores “superior a”', codigo: 'códigos não interpretados', seq: 'sequência', campo: 'campos extras', tipo: 'registro desconhecido', orfao: 'linha órfã' };
    const opts = [];
    const d0 = new Date(); d0.setDate(1);
    for (let k = -14; k <= 2; k++) { const d = new Date(d0.getFullYear(), d0.getMonth() + k, 1); const c = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; opts.push(c); }
    if (!opts.includes(comp)) opts.push(comp);
    A.abrirModal({
      titulo: 'Importar resultados (TXT Nephrosys)', ic: 'upload', cor: 'var(--blue)',
      corpo: `<div class="arq"><span class="tipo" style="--cor:#475569">TXT</span><div><b>${esc(arquivo.name)}</b><div class="meta">${(buf.byteLength / 1024).toFixed(0)} KB · ${r.nLinhas.toLocaleString('pt-BR')} linhas</div></div></div>
        <div class="kpis" style="grid-template-columns:repeat(3,1fr);margin:0">
          <div class="kpi" style="--cor:var(--blue)"><span class="v mono">${nPac}</span><span class="l">pacientes</span></div>
          <div class="kpi" style="--cor:var(--teal)"><span class="v mono">${r.nResultados.toLocaleString('pt-BR')}</span><span class="l">resultados</span></div>
          <div class="kpi" style="--cor:var(--ok)"><span class="v mono">${naEscala}</span><span class="l">já conhecidos</span></div>
        </div>
        <div style="font-size:13px;color:var(--muted);font-weight:700">Coletas: ${Object.entries(r.datas).sort().map(([d, n]) => `${fmtData(d)} (${n})`).join(' · ')}</div>
        <label class="f">Competência (bateria a que estes resultados pertencem)<select name="comp">${opts.sort().reverse().map(c => `<option value="${c}" ${c === comp ? 'selected' : ''}>${rotComp(c)} · ${tipoComp(c).rotulo}</option>`).join('')}</select></label>
        ${R.lotes.some(l => l.competencia === comp) ? `<div class="alerta-box">${ic('alert')}<div>Já existe um lote de ${rotComp(comp)}. Importar de novo <b>substitui</b> esse lote (o histórico dos outros meses fica).</div></div>` : ''}
        ${r.avisos.length ? `<div class="alerta-box">${ic('alert')}<div><b>Checagem do arquivo:</b> ${Object.entries(porTipo).map(([t, n]) => `${n} ${rotAv[t] || t}`).join(' · ')}. Os detalhes ficam na aba Arquivos TXT.</div></div>` : `<div class="alerta-box ok">${ic('check')}<div>Arquivo consistente.</div></div>`}
        ${R.ok ? '' : `<div class="alerta-box">${ic('alert')}<div>Este navegador bloqueou o armazenamento local (IndexedDB): os resultados ficam só até fechar a página.</div></div>`}`,
      botoes: [{ rot: 'Cancelar' }, { rot: 'Importar', cls: 'pri', ic: 'check', acao: f => { salvarLote(arquivo, buf, r, f.comp.value); } }],
    });
  }
  async function salvarLote(arquivo, buf, r, comp) {
    const antigo = R.lotes.find(l => l.competencia === comp);
    const id = comp;
    const lote = {
      id, competencia: comp, arquivo: arquivo.name, tamanho: buf.byteLength, importadoEm: new Date().toISOString(),
      datas: r.datas, nResultados: r.nResultados, codigos: r.codigos, avisos: r.avisos, pacientes: r.pacientes,
    };
    try {
      await op('lotes', 'readwrite', s => s.put(lote));
      await op('arquivos', 'readwrite', s => s.put({ id, nome: arquivo.name, bytes: buf, tipo: arquivo.type || 'text/plain' }));
    } catch (e) { R.ok = false; lote._bytes = buf; }
    R.lotes = R.lotes.filter(l => l.competencia !== comp); R.lotes.push(lote); ordenar();
    if (E()) { A.evento('importacao', null, `Resultados ${rotComp(comp)}: ${arquivo.name} · ${Object.keys(r.pacientes).length} pacientes · ${r.nResultados} resultados${antigo ? ' (substituiu o lote anterior)' : ''}`); A.salvar(); }
    location.hash = '#/resultados/' + comp; A.render();
    const sug = Object.keys(A.sugestoesTxt()).length;
    A.toast(`Resultados de ${rotComp(comp)} importados${sug ? ` · ${sug} nomes da escala reconhecidos no TXT` : ''}`, 'check');
  }
  A.importarResultados = () => escolherTxt(previaImportacao);
  A.limparResultados = async function () {
    try { await op('lotes', 'readwrite', s => s.clear()); await op('arquivos', 'readwrite', s => s.clear()); } catch (e) { /* sem IndexedDB */ }
    R.lotes = [];
  };

  async function baixarArquivo(id, remapear) {
    let reg = null;
    try { reg = await op('arquivos', 'readonly', s => s.get(id)); } catch (e) { /* sem IndexedDB */ }
    const lote = R.lotes.find(l => l.id === id);
    const bytes = reg ? reg.bytes : lote && lote._bytes;
    if (!bytes) return A.toast('Arquivo original não encontrado neste navegador.', 'alert');
    let saida = bytes, nome = reg ? reg.nome : lote.arquivo;
    if (remapear) {
      const txt = new TextDecoder('windows-1252').decode(bytes);
      let seq = 0;
      const novo = txt.split('\r\n').map(l => {
        if (!l) return l;
        const c = l.split('|');
        if (c[0] === '02') { const r = M.RES[c[2].trim()]; if (!r || !r.pdf) return null; c[2] = r.pdf; }
        c[1] = String(++seq); return c.join('|');
      }).filter(l => l !== null).join('\r\n');
      const out = new Uint8Array(novo.length);
      for (let i = 0; i < novo.length; i++) { const ch = novo.charCodeAt(i); out[i] = ch < 256 ? ch : 63; }
      saida = out; nome = nome.replace(/(\.txt)?$/i, '_conforme-PDF_TESTE.txt');
    }
    const url = URL.createObjectURL(new Blob([saida], { type: 'text/plain' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: nome });
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
    A.toast(remapear ? 'TXT conforme o PDF (teste) baixado — confirmar com a Hiperrim antes de importar' : 'TXT original baixado (idêntico ao exportado)', 'download');
  }
  async function excluirLote(id) {
    const lote = R.lotes.find(l => l.id === id); if (!lote) return;
    A.abrirModal({
      titulo: 'Excluir resultados de ' + rotComp(lote.competencia), ic: 'x', cor: 'var(--crit)',
      corpo: `<p style="margin:0">Remove o lote <b>${esc(lote.arquivo)}</b> e o TXT guardado deste navegador. O histórico dos outros meses continua.</p>`,
      botoes: [{ rot: 'Cancelar' }, { rot: 'Excluir', cls: 'rim', ic: 'x', acao: async () => {
        try { await op('lotes', 'readwrite', s => s.delete(id)); await op('arquivos', 'readwrite', s => s.delete(id)); } catch (e) { /* memória */ }
        R.lotes = R.lotes.filter(l => l.id !== id); A.render(); A.toast('Lote excluído', 'x');
      } }],
    });
  }

  // ================= formatação =================
  function fmtValor(cod, v) {
    if (!v || v.n == null) return v && v.t ? esc(v.t) : '—';
    const d = M.defRes(cod);
    let s;
    if (d.un === '/mm³' && v.n >= 1000) s = v.n.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
    else s = v.n.toLocaleString('pt-BR', { maximumFractionDigits: v.n >= 100 ? 1 : 2 });
    return (v.op ? (v.op === '>' ? '>' : '<') : '') + s;
  }
  const CLS = { ok: '', baixo: 'r-baixo', alto: 'r-alto', 'crit-baixo': 'r-crit', 'crit-alto': 'r-crit' };
  function seta(cod, v, ant) {
    if (!ant || !v || v.n == null || ant.n == null || ant.n === 0) return '';
    const dif = (v.n - ant.n) / Math.abs(ant.n);
    if (Math.abs(dif) < 0.05) return '<span class="seta" title="estável">→</span>';
    return `<span class="seta" title="anterior: ${esc(fmtValor(cod, ant))}">${dif > 0 ? '↑' : '↓'}</span>`;
  }
  function refTxt(cod) {
    const d = M.defRes(cod); if (!d.ref) return '—';
    const f = x => x.toLocaleString('pt-BR');
    if (d.ref[0] != null && d.ref[1] != null) return `${f(d.ref[0])} – ${f(d.ref[1])}`;
    return d.ref[0] != null ? `≥ ${f(d.ref[0])}` : `≤ ${f(d.ref[1])}`;
  }
  function sparkline(serie, cod, w = 96, h = 26) {
    const pts = serie.filter(x => x.v && x.v.n != null);
    if (!pts.length) return '<span class="faint">—</span>';
    if (pts.length === 1) return `<span class="faint" style="font-size:11px">1º registro</span>`;
    const d = M.defRes(cod), xs = pts.map(p => p.v.n);
    let lo = Math.min(...xs), hi = Math.max(...xs);
    if (d.ref) { if (d.ref[0] != null) lo = Math.min(lo, d.ref[0]); if (d.ref[1] != null) hi = Math.max(hi, d.ref[1]); }
    if (hi === lo) { hi += 1; lo -= 1; }
    const X = i => 3 + i * (w - 6) / (pts.length - 1), Y = n => h - 3 - (n - lo) / (hi - lo) * (h - 6);
    const banda = d.ref ? `<rect x="0" width="${w}" y="${Y(d.ref[1] != null ? d.ref[1] : hi)}" height="${Math.max(1, Y(d.ref[0] != null ? d.ref[0] : lo) - Y(d.ref[1] != null ? d.ref[1] : hi))}" fill="var(--ok)" opacity=".12"/>` : '';
    const ult = pts[pts.length - 1];
    return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" class="spark" aria-label="tendência">${banda}<polyline fill="none" stroke="var(--blue)" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" points="${pts.map((p, i) => `${X(i)},${Y(p.v.n)}`).join(' ')}"/>${pts.map((p, i) => `<circle cx="${X(i)}" cy="${Y(p.v.n)}" r="${i === pts.length - 1 ? 2.8 : 1.8}" fill="${i === pts.length - 1 ? `var(--${(M.classificar(cod, ult.v) || 'ok').startsWith('crit') ? 'crit' : M.classificar(cod, ult.v) === 'ok' ? 'ok' : 'warn'})` : 'var(--blue)'}"><title>${rotComp(p.comp)}: ${fmtValor(cod, p.v)}</title></circle>`).join('')}</svg>`;
  }
  function regua(cod, v) {
    const d = M.defRes(cod); if (!d.ref || !v || v.n == null) return '';
    const lo0 = d.ref[0] != null ? d.ref[0] : 0, hi0 = d.ref[1] != null ? d.ref[1] : lo0 * 2 || 1;
    const span = hi0 - lo0 || 1;
    const min = Math.min(lo0 - span * 0.6, v.n), max = Math.max(hi0 + span * 0.6, v.n);
    const P = x => Math.max(0, Math.min(100, (x - min) / (max - min) * 100));
    const c = M.classificar(cod, v);
    return `<div class="regua"><span class="faixa-ok" style="left:${P(lo0)}%;width:${P(d.ref[1] != null ? hi0 : max) - P(lo0)}%"></span><span class="marca ${CLS[c] || ''}" style="left:${P(v.n)}%"></span></div>`;
  }

  // ================= dados do lote para telas =================
  function linhasLote(lote) {
    const idx = R.lotes.indexOf(lote), anterior = R.lotes.slice(idx + 1).find(l => l.competencia < lote.competencia) || null;
    return Object.values(lote.pacientes).map(p => {
      const v = localDe(p.chave, p.nome);
      const val = Object.assign({}, p.valores, M.derivados(p.valores));
      let ant = null;
      if (anterior) { const pa = anterior.pacientes[p.chave] || Object.values(anterior.pacientes).find(x => M.norm(x.nome) === M.norm(p.nome)); if (pa) ant = Object.assign({}, pa.valores, M.derivados(pa.valores)); }
      const crit = Object.keys(val).filter(c => (M.classificar(c, val[c]) || '').startsWith('crit'));
      const fora = M.RES_MAPA.filter(c => ['baixo', 'alto'].includes(M.classificar(c, val[c])) || (M.classificar(c, val[c]) || '').startsWith('crit'));
      return { p, v, val, ant, crit, fora, aviso: val.urr && val.urr.aviso };
    }).sort((a, b) => (a.v && b.v) ? A.ordemRelatorio(a.v, b.v) : a.v ? -1 : b.v ? 1 : a.p.nome.localeCompare(b.p.nome));
  }
  const pctNaMeta = (linhas, cod) => { const c = linhas.filter(l => l.val[cod] && l.val[cod].n != null); return c.length ? Math.round(c.filter(l => M.classificar(cod, l.val[cod]) === 'ok').length / c.length * 100) : null; };
  A.resumoUltimoLote = function () {
    if (!R.lotes.length) return null;
    const lote = R.lotes[0], ls = linhasLote(lote);
    const urr = ls.filter(l => l.val.urr && l.val.urr.n > 0).map(l => l.val.urr.n);
    return { lote, n: ls.length, crit: ls.filter(l => l.crit.length || l.aviso).length, urrMed: urr.length ? Math.round(urr.reduce((a, b) => a + b, 0) / urr.length * 10) / 10 : null, hb: pctNaMeta(ls, '016') };
  };

  // ================= TELA: RESULTADOS (visão do médico) =================
  const filtroR = { salao: '', turno: '', grupo: '', busca: '', alterados: false };
  function vazioResultados() {
    return `<div class="card" style="text-align:center;padding:40px 20px">
      <div style="width:72px;height:72px;border-radius:22px;display:grid;place-items:center;margin:0 auto 12px;background:var(--blue-50);color:var(--blue)">${ic('drop')}</div>
      <h2 style="font-size:22px">Suba o TXT de resultados</h2>
      <p class="desc" style="max-width:560px;margin:6px auto 18px">O mesmo arquivo que o sistema do laboratório exporta para o Nephrosys da Hiperrim (registros <code>01</code> paciente e <code>02</code> resultado). Cada mês importado vira histórico do paciente.</p>
      <button class="btn pri" data-res="importar">${ic('upload')} Escolher arquivo .txt</button>
    </div>`;
  }
  function vResultados(compParam) {
    if (!R.lotes.length) return vazioResultados();
    const lote = R.lotes.find(l => l.competencia === compParam) || R.lotes[0];
    const todas = linhasLote(lote);
    const anterior = R.lotes.find(l => l.competencia < lote.competencia);
    let ls = todas;
    if (filtroR.salao) ls = ls.filter(l => filtroR.salao === 'sem' ? !l.v : l.v && l.v.salao === +filtroR.salao);
    if (filtroR.turno) ls = ls.filter(l => l.v && l.v.turno === filtroR.turno);
    if (filtroR.grupo) ls = ls.filter(l => l.v && l.v.grupo === filtroR.grupo);
    if (filtroR.busca) { const q = M.norm(filtroR.busca); ls = ls.filter(l => M.norm(l.p.nome + ' ' + l.p.cpf).includes(q)); }
    if (filtroR.alterados) ls = ls.filter(l => l.fora.length || l.aviso);
    const urr = todas.filter(l => l.val.urr && l.val.urr.n > 0);
    const tile = (cor, v, l, s) => `<div class="kpi" style="--cor:${cor}"><span class="v mono">${v == null ? '—' : v}</span><span class="l">${l}</span>${s ? `<span class="s">${s}</span>` : ''}</div>`;
    const crit = todas.filter(l => l.crit.length || l.aviso);
    const cab = M.RES_MAPA.map(c => { const d = M.defRes(c); return `<th class="num" title="${esc(d.nome)} · ${esc(d.un)} · alvo ${esc(refTxt(c))}">${esc(d.curto)}<small>${esc(refTxt(c))}</small></th>`; }).join('');
    let grupo = null, corpo = '';
    for (const l of ls) {
      const g = l.v ? `Salão ${l.v.salao} · ${M.GRUPOS[l.v.grupo].rotulo} · ${A.rotTurno(l.v.turno)}` : 'Sem posição na escala atual';
      if (g !== grupo) { grupo = g; corpo += `<tr class="rel-grupo"><td colspan="${M.RES_MAPA.length + 2}">${esc(g)}</td></tr>`; }
      corpo += `<tr class="res-linha" data-pac="${esc(l.p.chave)}" tabindex="0">
        <td class="fixa"><b>${esc(nomeCurto(l.p.nome))}</b>${l.crit.length || l.aviso ? ` <span class="st" style="--cor:var(--crit)" title="${esc([...l.crit.map(c => M.defRes(c).nome), l.aviso].filter(Boolean).join(' · '))}">${ic('alert')}</span>` : ''}<br><small>${l.v ? 'Máq ' + esc(l.v.maq) : esc(mascCpf(l.p.cpf))}${l.p.coletas.length > 1 ? ' · recoleta' : ''}</small></td>
        <td class="mono" style="color:var(--muted);font-size:12px">${fmtData(l.p.data).slice(0, 5)}</td>
        ${M.RES_MAPA.map(c => { const cl = M.classificar(c, l.val[c]); return `<td class="num rv ${CLS[cl] || ''}">${fmtValor(c, l.val[c])}${seta(c, l.val[c], l.ant && l.ant[c])}</td>`; }).join('')}</tr>`;
    }
    const opSal = A.saloes ? (E() && E().vagas.length ? A.saloes() : []) : [];
    return `
      <div class="rel-cab no-print">
        <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
          <select class="btn" data-rf="comp" aria-label="Competência">${R.lotes.map(x => `<option value="${x.competencia}" ${x === lote ? 'selected' : ''}>${rotComp(x.competencia)} · ${tipoComp(x.competencia).rotulo}</option>`).join('')}</select>
          <span class="chip">${esc(lote.arquivo)}</span>
          ${anterior ? `<span class="chip b">comparando com ${rotComp(anterior.competencia)}</span>` : `<span class="chip">1º mês no histórico — as setas ↑↓ aparecem a partir do 2º</span>`}
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          <button class="btn sm" data-res="importar">${ic('upload')} Subir TXT</button>
          <button class="btn sm" data-res="csv">${ic('sheet')} Exportar mapa</button>
          <button class="btn sm pri" data-res="imprimir">${ic('printer')} Imprimir mapa</button>
        </div>
      </div>
      <div class="kpis" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr))">
        ${tile('var(--blue)', todas.length, 'Pacientes com laudo', `${Object.keys(lote.datas).length} data(s) de coleta`)}
        ${tile('var(--ok)', urr.length ? Math.round(urr.filter(l => l.val.urr.n >= 65).length / urr.length * 100) + '%' : null, 'URR ≥ 65%', urr.length ? `média ${(urr.reduce((s, l) => s + l.val.urr.n, 0) / urr.length).toFixed(1).replace('.', ',')}%` : '')}
        ${tile('var(--rim)', pctNaMeta(todas, '016') != null ? pctNaMeta(todas, '016') + '%' : null, 'Hb 10–12 g/dL', '')}
        ${tile('var(--b-sem)', pctNaMeta(todas, '006') != null ? pctNaMeta(todas, '006') + '%' : null, 'Fósforo 3,5–5,5', '')}
        ${tile('var(--c5)', pctNaMeta(todas, '034') != null ? pctNaMeta(todas, '034') + '%' : null, 'PTH 130–600', '')}
        ${tile('var(--teal)', pctNaMeta(todas, '030') != null ? pctNaMeta(todas, '030') + '%' : null, 'IST 20–50%', '')}
        ${tile('var(--crit)', crit.length, 'Com valor crítico', 'ou ureia pós ≥ pré')}
      </div>
      ${crit.length ? `<details class="card secao-sync" style="margin-bottom:14px" open><summary><span class="kpi" style="--cor:var(--crit);border:0;padding:0;background:none;box-shadow:none"><span class="ic" style="margin:0">${ic('bell')}</span></span><div><h2>Valores críticos <span class="chip b" style="--cor:var(--crit)">${crit.length}</span></h2><p class="desc" style="margin:0">Fora dos limites de alerta — avisar o nefrologista de plantão.</p></div><svg class="i chev"><use href="#i-chev"/></svg></summary>
        <div class="criticos" style="max-height:300px;overflow:auto">${crit.map(l => `<button class="crit-item" data-pac="${esc(l.p.chave)}"><b>${esc(nomeCurto(l.p.nome))}</b><small>${l.v ? esc(A.local(l.v, true)) : 'sem posição'}</small><span>${l.crit.map(c => `<span class="tag-exame r-crit">${esc(M.defRes(c).curto)} ${fmtValor(c, l.val[c])}</span>`).join('')}${l.aviso ? '<span class="tag-exame r-crit">Ur pós ≥ pré</span>' : ''}</span></button>`).join('')}</div></details>` : ''}
      <div class="card">
        <div class="no-print" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px;align-items:center">
          <div class="busca" style="width:240px"><svg class="i"><use href="#i-search"/></svg><input data-rf="busca" type="search" placeholder="Filtrar paciente…" value="${esc(filtroR.busca)}"></div>
          <select class="btn sm" data-rf="salao"><option value="">Todos os salões</option>${opSal.map(s => `<option value="${s}" ${filtroR.salao === String(s) ? 'selected' : ''}>Salão ${s}</option>`).join('')}<option value="sem" ${filtroR.salao === 'sem' ? 'selected' : ''}>Sem posição</option></select>
          <select class="btn sm" data-rf="grupo"><option value="">Todos os dias</option>${['SQS', 'TQS'].map(g => `<option value="${g}" ${filtroR.grupo === g ? 'selected' : ''}>${M.GRUPOS[g].rotulo}</option>`).join('')}</select>
          <select class="btn sm" data-rf="turno"><option value="">Todos os turnos</option>${['M', 'T', 'N'].map(t => `<option value="${t}" ${filtroR.turno === t ? 'selected' : ''}>${A.rotTurno(t)}</option>`).join('')}</select>
          <button class="btn sm ${filtroR.alterados ? 'pri' : ''}" data-rf="alterados">${ic('alert')} Só fora do alvo</button>
          <span class="esp" style="flex:1"></span>
          <span class="legenda" style="margin:0"><span><i class="dot" style="--cor:var(--blue)"></i>abaixo</span><span><i class="dot" style="--cor:var(--warn)"></i>acima</span><span><i class="dot" style="--cor:var(--crit)"></i>crítico</span></span>
        </div>
        <div class="print-only"><h2 style="margin:0">Resultados ${rotComp(lote.competencia)} · Hiperrim</h2><p>${ls.length} pacientes · alvos sugeridos KDIGO/KDOQI (validar)</p></div>
        <div class="mapa-wrap"><table class="tbl mapa"><thead><tr><th class="fixa">Paciente</th><th>Coleta</th>${cab}</tr></thead><tbody>${corpo || `<tr><td colspan="${M.RES_MAPA.length + 2}" class="vazio">Nenhum paciente com esse filtro.</td></tr>`}</tbody></table></div>
        <p class="desc" style="margin:10px 0 0">Clique no paciente para ver a ficha com o histórico. Alvos sugeridos (KDIGO/KDOQI) — validar com o nefrologista responsável. *Kt/V na ficha é estimado.</p>
      </div>`;
  }
  function ligarResultados(comp) {
    const c = $('#conteudo');
    c.onclick = e => {
      const b = e.target.closest('[data-res]');
      if (b) {
        if (b.dataset.res === 'importar') A.importarResultados();
        if (b.dataset.res === 'imprimir') window.print();
        if (b.dataset.res === 'csv') exportarMapa(comp);
        return;
      }
      const t = e.target.closest('[data-rf="alterados"]'); if (t) { filtroR.alterados = !filtroR.alterados; A.render(); return; }
      const lp = e.target.closest('[data-pac]'); if (lp) location.hash = '#/paciente/' + encodeURIComponent(lp.dataset.pac);
    };
    c.onkeydown = e => { const lp = e.target.closest('tr[data-pac]'); if (lp && e.key === 'Enter') location.hash = '#/paciente/' + encodeURIComponent(lp.dataset.pac); };
    c.onchange = e => {
      const f = e.target.dataset.rf; if (!f) return;
      if (f === 'comp') { location.hash = '#/resultados/' + e.target.value; return; }
      filtroR[f] = e.target.value; A.render();
    };
    let t0;
    c.oninput = e => { if (e.target.dataset.rf !== 'busca') return; clearTimeout(t0); t0 = setTimeout(() => { filtroR.busca = e.target.value; A.render(); const i = $('[data-rf="busca"]'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 250); };
  }
  function exportarMapa(comp) {
    const lote = R.lotes.find(l => l.competencia === comp) || R.lotes[0]; if (!lote) return;
    const cods = [...Object.keys(M.RES).filter(c => !M.RES[c].oculto), ...Object.keys(M.RES_DERIVADOS)];
    const cab = ['Salão', 'Dias', 'Turno', 'Máquina', 'Nome', 'CPF', 'Coleta', ...cods.map(c => `${M.defRes(c).nome} (${M.defRes(c).un})`)];
    const rows = linhasLote(lote).map(l => [l.v ? l.v.salao : '', l.v ? M.GRUPOS[l.v.grupo].rotulo : '', l.v ? A.rotTurno(l.v.turno) : '', l.v ? l.v.maq : '', l.p.nome, fmtCpf(l.p.cpf), fmtData(l.p.data), ...cods.map(c => l.val[c] ? (l.val[c].t || String(l.val[c].n).replace('.', ',')) : '')]);
    const q = s => { s = String(s == null ? '' : s); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const url = URL.createObjectURL(new Blob(['﻿' + [cab, ...rows].map(r => r.map(q).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `medrim-resultados-${lote.competencia}.csv` });
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
    A.toast('Mapa exportado para Excel', 'sheet');
  }

  // ================= TELA: FICHA DO PACIENTE (histórico) =================
  function vPaciente(chave) {
    chave = decodeURIComponent(chave || '');
    let base = null;
    for (const l of R.lotes) { if (l.pacientes[chave]) { base = l.pacientes[chave]; break; } }
    if (!base) return `<div class="card vazio">Paciente sem resultados importados. <a href="#/resultados">Voltar aos resultados</a></div>`;
    const hist = historico(chave, base.nome);
    const ult = hist[hist.length - 1], ant = hist.length > 1 ? hist[hist.length - 2] : null;
    const v = localDe(chave, base.nome), pe = pacienteDaEscala(chave, base.nome);
    const serie = cod => hist.map(h => ({ comp: h.comp, v: h.val[cod] }));
    const dest = ['urr', 'ktv', '016', '004', '006', 'cap', '034', '029', '030', '026'];
    const card = cod => {
      const d = M.defRes(cod), val = ult.val[cod]; if (!val) return '';
      const cl = M.classificar(cod, val);
      return `<div class="dest ${CLS[cl] || ''}" title="${esc(d.nota || d.nome)}"><small>${esc(d.nome)}</small><div class="dv"><b class="mono">${fmtValor(cod, val)}</b> <span>${esc(d.un)}</span>${seta(cod, val, ant && ant.val[cod])}</div>${regua(cod, val)}<div class="dref">alvo ${esc(refTxt(cod))}</div>${sparkline(serie(cod), cod, 120, 28)}</div>`;
    };
    const grupos = {};
    Object.keys(Object.assign({}, ...hist.map(h => h.val))).forEach(c => { const d = M.defRes(c); if (d.oculto) return; (grupos[d.grupo] = grupos[d.grupo] || []).push(c); });
    const ordemG = Object.keys(M.RES_GRUPOS).concat('outros');
    const ordemC = c => { const k = Object.keys(M.RES).indexOf(c); return k < 0 ? 1000 + Object.keys(M.RES_DERIVADOS).indexOf(c) : k; };
    const tabelas = ordemG.filter(g => grupos[g]).map(g => `<div class="card"><h3>${esc(M.RES_GRUPOS[g] || 'Outros')}</h3>
      <div style="overflow:auto"><table class="tbl"><thead><tr><th>Exame</th><th class="num">${rotComp(ult.comp).slice(0, 3)}/${ult.comp.slice(2, 4)}</th><th class="num">Anterior</th><th>Alvo</th><th>Tendência</th></tr></thead><tbody>
      ${grupos[g].sort((a, b) => ordemC(a) - ordemC(b)).map(c => { const d = M.defRes(c), x = ult.val[c], y = ant && ant.val[c], cl = M.classificar(c, x); return `<tr><td><b>${esc(d.nome)}</b> <small class="faint">${esc(d.un)}</small>${d.inferido ? ' <span class="faint" title="Código interpretado pelos valores — confirmar na interface">ⁱ</span>' : ''}</td>
        <td class="num rv ${CLS[cl] || ''}">${fmtValor(c, x)}${x && x.abs ? ` <small class="faint">(${esc(x.abs.trim())}/mm³)</small>` : ''}</td><td class="num faint">${y ? fmtValor(c, y) : '—'}</td><td class="faint" style="white-space:nowrap">${esc(refTxt(c))}</td><td>${sparkline(serie(c), c)}</td></tr>`; }).join('')}
      </tbody></table></div></div>`).join('');
    const todosCods = Object.keys(Object.assign({}, ...hist.map(h => h.val))).filter(c => !M.defRes(c).oculto).sort((a, b) => ordemC(a) - ordemC(b));
    const tabHist = `<div class="card"><h3>Histórico completo</h3><p class="desc">Cada TXT importado vira uma coluna.</p><div class="mapa-wrap"><table class="tbl mapa"><thead><tr><th class="fixa">Exame</th>${hist.slice().reverse().map(h => `<th class="num">${rotComp(h.comp).slice(0, 3)}/${h.comp.slice(2, 4)}<small>${fmtData(h.p.data)}</small></th>`).join('')}</tr></thead><tbody>
      ${todosCods.map(c => `<tr><td class="fixa">${esc(M.defRes(c).nome)}</td>${hist.slice().reverse().map(h => `<td class="num rv ${CLS[M.classificar(c, h.val[c])] || ''}">${fmtValor(c, h.val[c])}</td>`).join('')}</tr>`).join('')}
      </tbody></table></div></div>`;
    const notas = (E() && E().notas && E().notas[chave]) || [];
    const ehResultado = pe && pe.status ? M.STATUS[pe.status] : null;
    return `<div class="no-print" style="margin-bottom:10px"><a class="btn sm ghost" href="#/resultados/${ult.comp}">← Resultados de ${rotComp(ult.comp)}</a></div>
      <section class="ficha-top card">
        <span class="avatar" style="width:64px;height:64px;font-size:22px">${esc(iniciais(base.nome))}</span>
        <div style="flex:1;min-width:220px">
          <h2 style="font-size:24px;margin:0">${esc(titulo(base.nome))}</h2>
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">
            ${v ? `<a class="chip b" href="#/salao/${v.salao}/${v.turno}">${esc(A.local(v))}</a>` : '<span class="chip">sem posição na escala atual</span>'}
            ${pe && pe.nasc ? `<span class="chip">${esc(pe.nasc)} · ${idade(pe.nasc)} anos</span>` : ''}
            <span class="chip">CPF ${esc(mascCpf(base.cpf))}</span>
            ${ehResultado && pe.status !== 'ativo' ? `<span class="chip b" style="--cor:${ehResultado.cor}">${ehResultado.rotulo}</span>` : ''}
            <span class="chip b" style="--cor:var(--teal)">${hist.length} ${hist.length === 1 ? 'mês' : 'meses'} de histórico</span>
          </div>
        </div>
        <div class="no-print" style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn sm" data-fp="csv">${ic('sheet')} Histórico (Excel)</button>
          <button class="btn sm pri" data-fp="imprimir">${ic('printer')} Imprimir ficha</button>
        </div>
      </section>
      ${ult.val.urr && ult.val.urr.aviso ? `<div class="alerta-box" style="margin:12px 0">${ic('alert')}<div><b>${esc(ult.val.urr.aviso)}.</b> URR calculado: ${fmtValor('urr', ult.val.urr)}%.</div></div>` : ''}
      <div class="destaques">${dest.map(card).join('')}</div>
      <div class="grid g2" style="margin-top:16px;align-items:start">${tabelas}</div>
      <div style="margin-top:16px">${tabHist}</div>
      <div class="card no-print" style="margin-top:16px"><h3>Observações do médico</h3><p class="desc">Ficam no histórico do paciente (nesta versão, só neste navegador).</p>
        <form data-fp="nota" style="display:flex;gap:8px;flex-wrap:wrap"><input name="t" class="sel-cand" style="flex:1;min-width:240px;max-width:none" placeholder="Ex.: ajustar quelante de fósforo; repetir K na próxima sessão" maxlength="400"><button class="btn pri sm">${ic('plus')} Registrar</button></form>
        <div class="lista-mov" style="margin-top:10px">${notas.map(n => `<div class="mov" style="--cor:var(--blue)"><span class="ic">${ic('chat')}</span><div>${esc(n.texto)}<br><small>${new Date(n.ts).toLocaleString('pt-BR')} · ref. ${rotComp(n.comp)}</small></div></div>`).join('') || '<div class="faint" style="padding:6px">Sem observações.</div>'}</div>
      </div>
      <p class="desc" style="margin-top:12px">*Kt/V estimado por Daugirdas 2ª geração com sessão de 4 h e sem UF/peso — para o valor exato faltam tempo de sessão, UF e peso pós (dados da clínica). Alvos sugeridos KDIGO/KDOQI, a validar com o nefrologista responsável.</p>`;
  }
  function ligarPaciente(chave) {
    chave = decodeURIComponent(chave || '');
    const c = $('#conteudo');
    c.onclick = e => {
      const b = e.target.closest('[data-fp]'); if (!b || b.tagName === 'FORM') return;
      if (b.dataset.fp === 'imprimir') window.print();
      if (b.dataset.fp === 'csv') {
        let base = null; for (const l of R.lotes) { if (l.pacientes[chave]) { base = l.pacientes[chave]; break; } }
        const hist = historico(chave, base.nome);
        const cods = Object.keys(Object.assign({}, ...hist.map(h => h.val))).filter(x => !M.defRes(x).oculto);
        const linhas = [['Exame', 'Unidade', 'Alvo', ...hist.map(h => rotComp(h.comp))], ...cods.map(x => [M.defRes(x).nome, M.defRes(x).un, refTxt(x), ...hist.map(h => h.val[x] ? (h.val[x].t || String(h.val[x].n).replace('.', ',')) : '')])];
        const url = URL.createObjectURL(new Blob(['﻿' + linhas.map(l => l.join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
        const a = Object.assign(document.createElement('a'), { href: url, download: `historico-${M.norm(base.nome).replace(/ /g, '-').toLowerCase()}.csv` });
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
      }
    };
    const form = $('form[data-fp="nota"]');
    if (form) form.onsubmit = e => {
      e.preventDefault(); const t = form.t.value.trim(); if (!t || !E()) return;
      A.marcar('observação'); E().notas = E().notas || {};
      (E().notas[chave] = E().notas[chave] || []).unshift({ ts: new Date().toISOString(), texto: t, comp: R.lotes[0].competencia });
      A.salvar(); A.render(); A.toast('Observação registrada', 'chat', true);
    };
  }

  // ================= TELA: ARQUIVOS TXT (para a Hiperrim baixar) =================
  function vArquivos() {
    const cards = R.lotes.map(l => {
      const nPac = Object.keys(l.pacientes).length, t = tipoComp(l.competencia);
      const porTipo = {}; (l.avisos || []).forEach(a => { porTipo[a.tipo] = (porTipo[a.tipo] || 0) + 1; });
      return `<div class="card arq-card" style="--cor:${t.cor}">
        <div class="arq-ic">${ic('report')}<span>TXT</span></div>
        <div style="flex:1;min-width:220px">
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><h2 style="margin:0">${rotComp(l.competencia)}</h2><span class="chip b" style="--cor:${t.cor}">Bateria ${t.rotulo}</span></div>
          <div class="desc" style="margin:4px 0 0"><b>${esc(l.arquivo)}</b> · ${(l.tamanho / 1024).toFixed(0)} KB · ${nPac} pacientes · ${l.nResultados.toLocaleString('pt-BR')} resultados · coleta ${Object.keys(l.datas).sort().map(fmtData).join(', ')}</div>
          <div class="desc" style="margin:2px 0 0">Enviado em ${new Date(l.importadoEm).toLocaleString('pt-BR')}</div>
          ${(l.avisos || []).length ? `<details style="margin-top:8px"><summary class="chip b" style="--cor:var(--warn);cursor:pointer">${ic('alert')} Checagem: ${Object.entries(porTipo).map(([k, n]) => `${n} ${k}`).join(' · ')}</summary><ul class="avisos">${l.avisos.slice(0, 60).map(a => `<li>${esc(a.texto)}</li>`).join('')}${l.avisos.length > 60 ? `<li>… e mais ${l.avisos.length - 60}</li>` : ''}</ul></details>` : ''}
        </div>
        <div style="display:flex;flex-direction:column;gap:6px">
          <button class="btn pri sm" data-arq="baixar" data-id="${l.id}">${ic('download')} Baixar TXT</button>
          <a class="btn sm" href="#/resultados/${l.competencia}">${ic('eye')} Ver resultados</a>
          <button class="btn sm ghost" data-arq="excluir" data-id="${l.id}">${ic('x')} Excluir</button>
        </div></div>`;
    }).join('');
    return `<div class="alerta-box info" style="margin-bottom:14px">${ic('download')}<div><b>Arquivos para a Hiperrim.</b> Cada TXT fica guardado exatamente como o sistema do laboratório exportou (mesmos bytes, ISO-8859-1, quebra de linha CRLF), pronto para importar no Nephrosys. Na versão com login, a equipe da Hiperrim entra e baixa por aqui.</div></div>
      <div class="no-print" style="margin-bottom:14px"><button class="btn pri" data-arq="importar">${ic('upload')} Subir TXT de resultados</button></div>
      ${cards || vazioResultados()}`;
  }
  function ligarArquivos() {
    $('#conteudo').onclick = e => {
      const b = e.target.closest('[data-arq],[data-res]'); if (!b) return;
      const a = b.dataset.arq || b.dataset.res;
      if (a === 'importar') A.importarResultados();
      if (a === 'baixar') baixarArquivo(b.dataset.id, false);
      if (a === 'excluir') excluirLote(b.dataset.id);
    };
  }

  // ================= TELA: INTERFACE NEPHROSYS =================
  function vInterface() {
    const lote = R.lotes[0];
    const cods = [...new Set([...Object.keys(M.RES), ...(lote ? Object.keys(lote.codigos) : [])])].sort();
    const stCor = { confere: 'var(--ok)', diverge: 'var(--crit)', ausente: 'var(--warn)', desconhecido: 'var(--muted)' };
    const stRot = { confere: 'confere', diverge: 'diverge do PDF', ausente: 'fora do PDF', desconhecido: 'não interpretado' };
    const linhas = cods.map(c => {
      const d = M.defRes(c), s = M.statusInterface(c);
      return `<tr><td class="mono"><b>${c}</b></td><td>${esc(d.nome)}${d.inferido ? ' <span class="chip" title="Deduzido pelos valores do arquivo">inferido</span>' : ''}</td><td class="faint">${esc(d.un || '')}</td>
        <td class="mono">${lote ? (lote.codigos[c] || 0) : '—'}</td><td class="faint">${esc(refTxt(c))}</td><td class="mono">${d.pdf || '—'}</td>
        <td><span class="chip b" style="--cor:${stCor[s.st]}">${stRot[s.st]}</span><br><small class="faint">${esc(s.txt)}</small></td></tr>`;
    }).join('');
    const div = cods.filter(c => M.statusInterface(c).st === 'diverge');
    return `<div class="grid g2" style="margin-bottom:16px">
        <div class="card"><h2>Layout do TXT de resultados</h2><p class="desc">Lido do arquivo exportado pelo laboratório (separador <code>|</code>, ISO-8859-1, CRLF).</p>
          <table class="tbl"><thead><tr><th>Registro</th><th>Campos</th></tr></thead><tbody>
            <tr><td><code>01</code> paciente</td><td><code>01 | sequência | nome | (vazio) | (vazio) | CPF | data da coleta</code></td></tr>
            <tr><td><code>02</code> resultado</td><td><code>02 | sequência | código | valor | valor absoluto (diferencial) | (vazio) |</code></td></tr>
          </tbody></table>
          <p class="desc" style="margin-top:10px">A sequência é contínua no arquivo inteiro. Decimal com vírgula; valores fora da faixa do aparelho vêm como texto (“Superior a 3.500,0”).</p></div>
        <div class="card"><h2>O que encontrei comparando com o PDF</h2>
          ${div.length ? `<div class="alerta-box" style="margin-bottom:10px">${ic('alert')}<div>${div.length} códigos do TXT significam <b>outro exame</b> na tabela do PDF do Nephrosys. Se o Nephrosys da Hiperrim usa essa tabela para importar, esses resultados podem estar entrando no exame errado. Vale conferir com eles.</div></div>` : ''}
          <ul style="margin:0;padding-left:18px;line-height:1.7;font-size:14px">
            ${div.map(c => `<li><b>${c}</b> — no TXT é <b>${esc(M.RES[c].nome)}</b>; no PDF ${c} é <b>${esc(M.NEPHRO_PDF[c])}</b>${M.RES[c].pdf ? ` (${esc(M.RES[c].nome)} = ${M.RES[c].pdf})` : ' — sem equivalente no PDF'}.</li>`).join('')}
            <li><b>016 / 017 / 034</b> (Hb, Ht, PTH) não existem no PDF, que usa 010 / 011 / 042.</li>
            <li>Albumina, globulina e o diferencial do hemograma (046–062) não aparecem no PDF.</li>
          </ul>
          <div class="no-print" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
            ${lote ? `<button class="btn sm" data-int="remap">${ic('download')} Baixar TXT conforme o PDF (teste)</button>` : ''}
          </div></div>
      </div>
      <div class="card" style="margin-bottom:16px"><h2>Códigos do TXT → como o MedRim interpreta</h2><p class="desc">Base da visão do médico. “Inferido” = deduzido dos valores e conferido pela matemática do hemograma (VCM = Ht/Hemácias×10; HCM = Hb/Hemácias×10; CHCM = Hb/Ht×100; absoluto = % × leucócitos).</p>
        <div style="overflow:auto"><table class="tbl"><thead><tr><th>Código</th><th>Exame</th><th>Unidade</th><th>Qtd no último TXT</th><th>Alvo sugerido</th><th>Cód. PDF</th><th>Situação</th></tr></thead><tbody>${linhas}</tbody></table></div></div>
      <details class="card secao-sync"><summary><div><h2>Tabela completa do PDF Nephrosys</h2><p class="desc" style="margin:0">${Object.keys(M.NEPHRO_PDF).length} códigos de exames passíveis de importação.</p></div><svg class="i chev"><use href="#i-chev"/></svg></summary>
        <div class="tabela-pdf">${Object.entries(M.NEPHRO_PDF).map(([c, n]) => `<div><code>${c}</code> ${esc(n)}</div>`).join('')}</div></details>`;
  }
  function ligarInterface() {
    $('#conteudo').onclick = e => {
      const b = e.target.closest('[data-int]'); if (!b) return;
      A.abrirModal({
        titulo: 'TXT com os códigos do PDF', ic: 'alert', cor: 'var(--warn)',
        corpo: `<p style="margin:0">Gera uma cópia do último TXT <b>só com códigos que existem no PDF com o mesmo exame</b>: troca <code>043</code>→<code>068</code> Sódio, <code>034</code>→<code>042</code> PTH, <code>067</code>→<code>089</code> Hb glicada, <code>015</code>→<code>009</code> Hemácias, <code>016/017</code>→<code>010/011</code> Hb/Ht, <code>056</code>→<code>015</code> Plaquetas; remove o que não tem equivalente (albumina, globulina, diferencial, índices — inclusive <code>061</code>/<code>062</code>, que no PDF são Colesterol e HDL) e renumera a sequência.</p>
          <div class="alerta-box">${ic('alert')}<div>Serve para <b>teste com a Hiperrim</b>. Não envie para produção sem eles confirmarem qual tabela o Nephrosys usa na importação de resultados. O arquivo oficial continua sendo o original, na aba Arquivos TXT.</div></div>`,
        botoes: [{ rot: 'Cancelar' }, { rot: 'Baixar cópia de teste', cls: 'pri', ic: 'download', acao: () => { baixarArquivo(R.lotes[0].id, true); } }],
      });
    };
  }

  Object.assign(A.views, { vResultados, vPaciente, vArquivos, vInterface });
  Object.assign(A.ligar, { resultados: ligarResultados, paciente: ligarPaciente, arquivos: ligarArquivos, interface: ligarInterface });
})(window.MED = window.MED || {});
