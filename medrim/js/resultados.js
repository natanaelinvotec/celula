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
  /** Armazém padrão: IndexedDB deste navegador. Na versão online, js/nuvem.js põe o Firestore em A.armazem. */
  A.armazemLocal = {
    carregar: async () => (await op('lotes', 'readonly', s => s.getAll())) || [],
    salvar: async (lote, arq) => { await op('lotes', 'readwrite', s => s.put(lote)); await op('arquivos', 'readwrite', s => s.put(arq)); },
    arquivo: async id => op('arquivos', 'readonly', s => s.get(id)),
    excluir: async id => { await op('lotes', 'readwrite', s => s.delete(id)); await op('arquivos', 'readwrite', s => s.delete(id)); },
    limpar: async () => { await op('lotes', 'readwrite', s => s.clear()); await op('arquivos', 'readwrite', s => s.clear()); },
  };
  const arm = () => A.armazem || A.armazemLocal;
  const ordenar = () => R.lotes.sort((a, b) => b.competencia.localeCompare(a.competencia) || b.importadoEm.localeCompare(a.importadoEm));
  A.carregarResultados = async function () {
    try {
      R.lotes = (await arm().carregar()) || [];
      R.lotes.forEach(l => Object.values(l.pacientes || {}).forEach(p => { M.aliasarValores(p.valores); (p.coletas || []).forEach(co => M.aliasarValores(co.valores)); }));
      ordenar();
    }
    catch (e) { R.ok = false; console.warn('Armazenamento de resultados indisponível', e); }
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
        const dest = M.canonico(cod);
        atual.valores[dest] = Object.assign({ t: (c[3] || '').trim(), n: v.n, op: v.op, abs: (c[4] || '').trim() || null }, dest !== cod ? { orig: cod } : {});
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
    Object.keys(codigos).filter(c => !M.RES[c]).forEach(c => av('codigo', `Código ${c} não interpretado (${codigos[c]} resultados) — vai igual para a Hiperrim; só não aparece na visão do médico`));
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

  // ================= pacientes do TXT que não estão no sistema atual =================
  // Ao subir TXT antigos, só entra o histórico de quem está no MedRim hoje; os demais ficam agrupados para excluir.
  function indiceSistema() {
    const P = E() ? E().pacientes : {}, cpfs = new Set(), nomes = new Set();
    Object.entries(P).forEach(([id, x]) => { if (x.cpf) cpfs.add(x.cpf); if (/^\d{11}$/.test(id)) cpfs.add(id); if (x.nome) nomes.add(M.norm(x.nome)); });
    return { vazio: !Object.keys(P).length, tem: p => !!((p.cpf && cpfs.has(p.cpf)) || nomes.has(M.norm(p.nome))) };
  }
  function foraDoSistema(r, idx) {
    if (!r || idx.vazio) return [];
    return Object.values(r.pacientes).filter(p => !idx.tem(p)).map(p => ({ chave: p.chave, nome: p.nome, cpf: p.cpf }));
  }
  const refAtual = () => (E() && E().ref ? `${E().ref.ano}-${String(E().ref.mes).padStart(2, '0')}` : compDe(new Date()));
  /** Tira do TXT os pacientes (registro 01 + seus 02) e renumera a sequência; o resto dos bytes fica igual (ISO-8859-1, CRLF). */
  function filtrarTxt(buf, tirar) {
    const b = new Uint8Array(buf), dec = new TextDecoder('windows-1252'), enc = new TextEncoder();
    const linhas = []; let ini = 0;
    for (let i = 0; i < b.length; i++) if (b[i] === 10) { linhas.push(b.subarray(ini, i + 1)); ini = i + 1; }
    if (ini < b.length) linhas.push(b.subarray(ini));
    const partes = []; let pular = false, seq = 0;
    for (const l of linhas) {
      let fim = l.length; while (fim && (l[fim - 1] === 10 || l[fim - 1] === 13)) fim--;
      const corpo = l.subarray(0, fim), eol = l.subarray(fim);
      if (!corpo.length) { if (!pular) partes.push(l); continue; }
      const c = dec.decode(corpo).split('|');
      if (c[0] === '01') { const cpf = M.soDigitos(c[5]); pular = tirar.has(cpf || 'N:' + M.norm((c[2] || '').trim())); }
      if (pular) continue;
      const p1 = corpo.indexOf(124), p2 = p1 < 0 ? -1 : corpo.indexOf(124, p1 + 1);
      if (p2 < 0) { partes.push(l); continue; }
      partes.push(corpo.subarray(0, p1 + 1), enc.encode(String(++seq)), corpo.subarray(p2), eol);
    }
    const out = new Uint8Array(partes.reduce((s, x) => s + x.length, 0)); let o = 0;
    partes.forEach(x => { out.set(x, o); o += x.length; });
    return out.buffer;
  }
  /** grava o lote sem os pacientes marcados para excluir */
  function gravarSemExcluidos(arquivo, buf, r, comp, excluir, silencioso) {
    const tirar = Object.keys(r.pacientes).filter(ch => excluir.has(ch));
    if (!tirar.length) return salvarLote(arquivo, buf, r, comp, silencioso);
    const novo = filtrarTxt(buf, new Set(tirar)), r2 = M.lerTxtResultados(novo);
    return salvarLote({ name: arquivo.name, type: 'text/plain' }, novo, r2, comp, silencioso, { filtrado: { removidos: tirar.length, tamanhoOriginal: buf.byteLength } });
  }
  /** bloco agrupado (com marcar/desmarcar) — lista: [{ chave, nome, cpf, meses? }] */
  function htmlForaSistema(lista, excluir) {
    if (!lista.length) return '';
    const mc = c => `${MES_CURTO[+c.slice(5) - 1]}/${c.slice(2, 4)}`;
    return `<details class="fora-sis" open><summary><b>${lista.length} ${lista.length === 1 ? 'paciente' : 'pacientes'} fora do sistema atual</b> <span class="faint">— não estão no MedRim hoje (saíram antes ou não são da escala)</span></summary>
      <div class="fora-acoes"><button type="button" class="btn sm ghost" data-fs="todos">${ic('check')} Excluir todos</button><button type="button" class="btn sm ghost" data-fs="nenhum">${ic('undo')} Manter todos</button><span class="faint" data-fs="conta"></span></div>
      <div class="fora-lista">${lista.map((x, i) => `<label class="fora-item"><input type="checkbox" data-fs-i="${i}" ${excluir.has(x.chave) ? 'checked' : ''}><span><b>${esc(titulo(x.nome))}</b><small>${x.cpf ? esc(mascCpf(x.cpf)) : 'sem CPF'}${x.meses && x.meses.length ? ' · ' + x.meses.map(mc).join(', ') : ''}</small></span></label>`).join('')}</div>
      <p class="desc" style="margin:8px 0 0">Marcado = <b>excluir</b>: não entra no histórico e sai também do TXT guardado no MedRim (a cópia fica filtrada e renumerada). Para meses antigos, que a Hiperrim já recebeu, é o recomendado.</p></details>`;
  }
  /** liga o bloco: atualiza o conjunto `excluir` e o contador */
  function ligarForaSistema(raiz, lista, excluir, aoMudar) {
    const conta = () => { const el = raiz.querySelector('[data-fs="conta"]'); if (el) el.textContent = `${lista.filter(x => excluir.has(x.chave)).length} de ${lista.length} serão excluídos`; };
    raiz.addEventListener('change', e => {
      const i = e.target.dataset && e.target.dataset.fsI; if (i == null) return;
      e.stopPropagation();
      if (e.target.checked) excluir.add(lista[+i].chave); else excluir.delete(lista[+i].chave);
      conta(); if (aoMudar) aoMudar();
    });
    raiz.addEventListener('click', e => {
      const b = e.target.closest('[data-fs="todos"],[data-fs="nenhum"]'); if (!b) return;
      const marcar = b.dataset.fs === 'todos';
      lista.forEach(x => (marcar ? excluir.add(x.chave) : excluir.delete(x.chave)));
      raiz.querySelectorAll('[data-fs-i]').forEach(ch => { ch.checked = marcar; });
      conta(); if (aoMudar) aoMudar();
    });
    conta();
  }

  // ================= importação =================
  function escolherTxt(cb) {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.txt,text/plain';
    inp.onchange = () => inp.files[0] && cb(inp.files[0]);
    inp.click();
  }
  async function previaImportacao(arquivo, compForcada) {
    const buf = await arquivo.arrayBuffer();
    let r;
    try { r = M.lerTxtResultados(buf); } catch (e) { return A.toast('Não consegui ler este TXT: ' + e.message, 'alert'); }
    const nPac = Object.keys(r.pacientes).length;
    if (!nPac) return A.toast('Nenhum registro 01 (paciente) encontrado — é o TXT de resultados?', 'alert');
    const palpite = adivinharCompetencia(arquivo.name, r.datas), comp = compForcada || palpite;
    const idx = indiceSistema(), fora = foraDoSistema(r, idx);
    const naEscala = Object.keys(r.pacientes).length - (idx.vazio ? Object.keys(r.pacientes).length : fora.length);
    const excluir = new Set(comp < refAtual() ? fora.map(x => x.chave) : []);
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
          <div class="kpi" style="--cor:var(--ok)"><span class="v mono">${naEscala}</span><span class="l">no sistema</span></div>
        </div>
        <div style="font-size:13px;color:var(--muted);font-weight:700">Coletas: ${Object.entries(r.datas).sort().map(([d, n]) => `${fmtData(d)} (${n})`).join(' · ')}</div>
        <label class="f">Competência (bateria a que estes resultados pertencem)<select name="comp">${opts.sort().reverse().map(c => `<option value="${c}" ${c === comp ? 'selected' : ''}>${rotComp(c)} · ${tipoComp(c).rotulo}</option>`).join('')}</select></label>
        ${compForcada && palpite !== compForcada ? `<div class="alerta-box">${ic('alert')}<div>Você escolheu ${rotComp(compForcada)} na régua, mas pelo ${/[A-Z]{3}[^0-9]*\d{4}/i.test(arquivo.name) ? 'nome do arquivo' : 'dia da coleta'} ele parece ser de <b>${rotComp(palpite)}</b>. Confira a competência acima.</div></div>` : ''}
        ${R.lotes.some(l => l.competencia === comp) ? `<div class="alerta-box">${ic('alert')}<div>Já existe um lote de ${rotComp(comp)}. Importar de novo <b>substitui</b> esse lote (o histórico dos outros meses fica).</div></div>` : ''}
        ${r.avisos.length ? `<div class="alerta-box">${ic('alert')}<div><b>Checagem do arquivo:</b> ${Object.entries(porTipo).map(([t, n]) => `${n} ${rotAv[t] || t}`).join(' · ')}. Os detalhes ficam na aba Arquivos TXT.</div></div>` : `<div class="alerta-box ok">${ic('check')}<div>Arquivo consistente.</div></div>`}
        ${htmlForaSistema(fora, excluir)}
        ${R.ok ? '' : `<div class="alerta-box">${ic('alert')}<div>Este navegador bloqueou o armazenamento local (IndexedDB): os resultados ficam só até fechar a página.</div></div>`}`,
      botoes: [{ rot: 'Cancelar' }, { rot: 'Importar', cls: 'pri', ic: 'check', acao: f => { gravarSemExcluidos(arquivo, buf, r, f.comp.value, excluir); } }],
      aoAbrir: (m, form) => { const bl = form.querySelector('.fora-sis'); if (bl) ligarForaSistema(bl, fora, excluir); },
    });
  }
  async function salvarLote(arquivo, buf, r, comp, silencioso, extra) {
    const antigo = R.lotes.find(l => l.competencia === comp);
    const id = comp;
    const lote = {
      id, competencia: comp, arquivo: arquivo.name, tamanho: buf.byteLength, importadoEm: new Date().toISOString(),
      datas: r.datas, nResultados: r.nResultados, codigos: r.codigos, avisos: r.avisos, pacientes: r.pacientes,
    };
    Object.assign(lote, extra || {});
    try { await arm().salvar(lote, { id, nome: arquivo.name, bytes: buf, tipo: arquivo.type || 'text/plain' }); }
    catch (e) {
      if (A.armazem) { A.toast('Não consegui gravar os resultados na nuvem: ' + (e.message || e), 'alert'); throw e; }
      R.ok = false; lote._bytes = buf;
    }
    R.lotes = R.lotes.filter(l => l.competencia !== comp); R.lotes.push(lote); ordenar();
    if (E()) { A.evento('importacao', null, `Resultados ${rotComp(comp)}: ${arquivo.name} · ${Object.keys(r.pacientes).length} pacientes · ${r.nResultados} resultados${lote.filtrado ? ` · ${lote.filtrado.removidos} fora do sistema não entraram` : ''}${antigo ? ' (substituiu o lote anterior)' : ''}`); A.salvar(); }
    if (silencioso) return lote;
    location.hash = '#/resultados/' + comp; A.render();
    const sug = Object.keys(A.sugestoesTxt()).length;
    A.toast(`Resultados de ${rotComp(comp)} importados${sug ? ` · ${sug} nomes da escala reconhecidos no TXT` : ''}`, 'check');
  }
  A.importarResultados = () => escolherTxt(previaImportacao);
  A.salvarLoteResultados = salvarLote;
  A.adivinharCompetencia = (nome, datas) => adivinharCompetencia(nome, datas);
  A.limparResultados = async function () {
    try { await arm().limpar(); } catch (e) { /* sem armazenamento */ }
    R.lotes = [];
  };

  async function baixarArquivo(id) {
    let reg = null;
    try { reg = await arm().arquivo(id); } catch (e) { /* sem armazenamento */ }
    const lote = R.lotes.find(l => l.id === id);
    const bytes = reg ? reg.bytes : lote && lote._bytes;
    if (!bytes) return A.toast('Arquivo original não encontrado.', 'alert');
    const nome = reg ? reg.nome : lote.arquivo;
    const url = URL.createObjectURL(new Blob([bytes], { type: 'text/plain' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: nome });
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
    A.toast('TXT original baixado (idêntico ao exportado)', 'download');
  }
  async function excluirLote(id) {
    const lote = R.lotes.find(l => l.id === id); if (!lote) return;
    A.abrirModal({
      titulo: 'Excluir resultados de ' + rotComp(lote.competencia), ic: 'x', cor: 'var(--crit)',
      corpo: `<p style="margin:0">Remove o lote <b>${esc(lote.arquivo)}</b> e o TXT guardado deste navegador. O histórico dos outros meses continua.</p>`,
      botoes: [{ rot: 'Cancelar' }, { rot: 'Excluir', cls: 'rim', ic: 'x', acao: async () => {
        try { await arm().excluir(id); } catch (e) { return A.toast('Não consegui excluir: ' + (e.message || e), 'alert'); }
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
  /** Valor de referência do laudo em texto. curto = versão para o cabeçalho do mapa. */
  function refTxt(cod, curto) {
    const d = M.defRes(cod);
    if (d.quali) return d.quali === 'protecao' ? 'Reagente (protegido)' : 'Não reagente';
    if (curto && d.rotCurto) return d.rotCurto;
    if (d.rotRef) return d.rotRef;
    if (!d.ref) return '—';
    const f = x => x.toLocaleString('pt-BR');
    if (d.ref[0] != null && d.ref[1] != null) return `${f(d.ref[0])} – ${f(d.ref[1])}`;
    return d.ref[0] != null ? `≥ ${f(d.ref[0])}` : `${d.lt ? '<' : '≤'} ${f(d.ref[1])}`;
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

  // ================= RÉGUA DO HISTÓRICO (onda senoidal) =================
  // Cada mês é um ponto que "surfa" uma onda y = A·sen(2πx/λ − 2πt/T). Cheio = TXT carregado; vazio = falta.
  // Os números abaixo precisam bater com o CSS (.regua .onda e @keyframes regua-sen).
  const RG = { slot: 66, pad: 40, y0: 44, amp: 9, lambda: 264, periodo: 7 };
  const compDe = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const somaMes = (c, k) => { const [a, m] = c.split('-').map(Number); return compDe(new Date(a, m - 1 + k, 1)); };
  const MES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  function fimRegua() {
    const comps = R.lotes.map(l => l.competencia).sort();
    const ref = E() && E().ref ? `${E().ref.ano}-${String(E().ref.mes).padStart(2, '0')}` : compDe(new Date());
    return [compDe(new Date()), ref, comps[comps.length - 1] || ''].sort().pop();
  }
  function mesesRegua() {
    const fim = fimRegua(), comps = R.lotes.map(l => l.competencia).sort();
    let ini = somaMes(fim, -23);
    if (comps.length && comps[0] < ini) ini = comps[0];
    const out = []; for (let c = ini; c <= fim; c = somaMes(c, 1)) out.push(c);
    return out;
  }
  function caminhoOnda(w, fase) {
    const p = []; for (let x = -RG.lambda; x <= w + RG.lambda; x += 6) p.push(`${x},${(RG.y0 + RG.amp * Math.sin(2 * Math.PI * x / RG.lambda + fase)).toFixed(1)}`);
    return 'M' + p.join(' L');
  }
  const atrasoOnda = x => { const fr = ((x / RG.lambda) % 1 + 1) % 1; return -((RG.periodo * (1 - fr)) % RG.periodo); };
  const rotMes = (c, i) => { const [a, m] = c.split('-').map(Number); return `<span class="rot">${MES_CURTO[m - 1]}</span>${m === 1 || i === 0 ? `<span class="ano">${a}</span>` : ''}`; };
  /** trilho com a onda e um elemento por mês: ponto(c, i, x, atraso) devolve o HTML do mês */
  function trilhoOnda(meses, ponto) {
    const w = RG.pad * 2 + RG.slot * (meses.length - 1);
    const anos = meses.map((c, i) => (c.endsWith('-01') && i ? `<line x1="${RG.pad + i * RG.slot - RG.slot / 2}" x2="${RG.pad + i * RG.slot - RG.slot / 2}" y1="8" y2="96" class="rg-ano"/>` : '')).join('');
    const marcas = meses.map((c, i) => `<line x1="${RG.pad + i * RG.slot}" x2="${RG.pad + i * RG.slot}" y1="${RG.y0 + RG.amp + 9}" y2="${RG.y0 + RG.amp + 14}" class="rg-marca"/>`).join('');
    return `<div class="regua-scroll"><div class="rh-trilho" style="width:${w}px">
        <svg width="${w}" height="104" viewBox="0 0 ${w} 104" aria-hidden="true">${anos}${marcas}
          <g class="onda"><path class="o2" d="${caminhoOnda(w, Math.PI / 2)}"/><path class="o1" d="${caminhoOnda(w, 0)}"/></g></svg>
        ${meses.map((c, i) => { const x = RG.pad + i * RG.slot; return ponto(c, i, x, atrasoOnda(x).toFixed(3)); }).join('')}
      </div></div>`;
  }
  /** onda e pontos começam juntos (senão os pontos saem de cima da onda) e a régua abre no mês certo */
  function prepararOnda(el, foco) {
    const sc = el.querySelector('.regua-scroll');
    if (sc) sc.scrollLeft = foco ? Math.max(0, foco.offsetLeft - sc.clientWidth + 120) : sc.scrollWidth;
    try {
      const anims = el.getAnimations({ subtree: true });
      Promise.all(anims.map(a => a.ready)).then(() => { const t0 = anims[0] && anims[0].startTime; if (t0 != null) anims.forEach(a => { a.startTime = t0; }); }).catch(() => {});
    } catch (e) { /* navegador sem Web Animations: segue sem sincronizar */ }
  }
  function htmlRegua(compAtual) {
    const meses = mesesRegua(), prog = A.ehProgramador();
    const porComp = Object.fromEntries(R.lotes.map(l => [l.competencia, l]));
    const cheios = meses.filter(c => porComp[c]).length;
    const trilho = trilhoOnda(meses, (c, i, x, atraso) => {
      const l = porComp[c], t = tipoComp(c);
      const tit = l ? `${rotComp(c)} · bateria ${t.rotulo} · ${Object.keys(l.pacientes).length} pacientes · ${l.arquivo}` : `${rotComp(c)} · bateria ${t.rotulo} · sem TXT${prog ? ' — clique para subir' : ''}`;
      return `<button type="button" class="rg-mes ${l ? 'rg-cheio' : 'rg-vazio'}${c === compAtual ? ' atual' : ''}" style="left:${x}px;--cor:${t.cor}" data-rg="${l ? 'ver' : 'subir'}" data-comp="${c}" title="${esc(tit)}" aria-label="${esc(tit)}" ${!l && !prog ? 'disabled' : ''}>
        <span class="pt" style="animation-delay:${atraso}s">${l ? '' : '<i>+</i>'}</span>${rotMes(c, i)}</button>`;
    });
    return `<section class="card regua-card no-print" id="regua">
      <div class="regua-cab">
        <div><h2>${ic('chart')} Régua do histórico</h2>
          <p class="desc" style="margin:2px 0 0">${cheios} de ${meses.length} meses com resultados. Ponto cheio = TXT carregado (clique para ver); ponto vazio = falta${prog ? ' — clique para subir o TXT daquele mês, ou <b>arraste vários TXT</b> para a régua de uma vez.' : '.'}</p></div>
        ${prog ? `<button class="btn sm pri" data-rg="varios">${ic('upload')} Subir TXT anteriores</button>` : ''}
      </div>
      ${trilho}
      <div class="legenda" style="margin:6px 0 0">${['mensal', 'trimestral', 'semestral', 'anual'].map(k => `<span><i class="dot" style="--cor:${M.BATERIAS[k].cor}"></i>${M.BATERIAS[k].rotulo}</span>`).join('')}<span><i class="dot sem-txt"></i>sem TXT</span></div>
    </section>`;
  }

  // régua de um exame na ficha do paciente: valor de cada mês, colorido pela referência do laudo
  const fichaAberta = { chave: null, cod: null };
  const COR_CL = { ok: 'var(--ok)', baixo: 'var(--blue)', alto: 'var(--warn)', 'crit-baixo': 'var(--crit)', 'crit-alto': 'var(--crit)' };
  const ROT_CL = { ok: 'dentro da referência', baixo: 'abaixo da referência', alto: 'acima da referência', 'crit-baixo': 'crítico (baixo)', 'crit-alto': 'crítico (alto)' };
  function htmlReguaExame(hist, cod) {
    const d = M.defRes(cod), porComp = Object.fromEntries(hist.map(h => [h.comp, h]));
    const lotes = new Set(R.lotes.map(l => l.competencia));
    const meses = mesesRegua(), comVal = hist.filter(h => h.val[cod] && h.val[cod].n != null);
    const ult = comVal[comVal.length - 1], ns = comVal.map(h => h.val[cod].n);
    const min = comVal.length ? comVal[ns.indexOf(Math.min(...ns))] : null, max = comVal.length ? comVal[ns.indexOf(Math.max(...ns))] : null;
    const mesCurto = c => `${MES_CURTO[+c.slice(5) - 1]}/${c.slice(2, 4)}`;
    const trilho = trilhoOnda(meses, (c, i, x, atraso) => {
      const h = porComp[c], v = h && h.val[cod];
      if (v) {
        const cl = M.classificar(cod, v) || 'ok', tit = `${rotComp(c)}: ${fmtValor(cod, v)} ${d.un} — ${ROT_CL[cl]}${h.p && h.p.data ? ' · coleta ' + fmtData(h.p.data) : ''}`;
        return `<span class="rg-mes rg-cheio rg-val${ult && c === ult.comp ? ' atual' : ''}" style="left:${x}px;--cor:${COR_CL[cl]}" title="${esc(tit)}"><span class="pt" style="animation-delay:${atraso}s"><b class="val">${fmtValor(cod, v)}</b></span>${rotMes(c, i)}</span>`;
      }
      const tit = lotes.has(c) ? `${rotComp(c)}: sem resultado de ${d.nome} neste mês` : `${rotComp(c)}: sem TXT importado`;
      return `<span class="rg-mes ${lotes.has(c) ? 'rg-sem' : 'rg-vazio'}" style="left:${x}px" title="${esc(tit)}"><span class="pt" style="animation-delay:${atraso}s"></span>${rotMes(c, i)}</span>`;
    });
    const resumo = comVal.length
      ? `${comVal.length} ${comVal.length === 1 ? 'mês' : 'meses'} com resultado · último <b>${fmtValor(cod, ult.val[cod])}</b> (${mesCurto(ult.comp)})${comVal.length > 1 ? ` · mín. ${fmtValor(cod, min.val[cod])} (${mesCurto(min.comp)}) · máx. ${fmtValor(cod, max.val[cod])} (${mesCurto(max.comp)})` : ''}`
      : 'Sem resultado numérico nos TXT importados.';
    return `<section class="card regua-card regua-exame no-print" id="regua-exame" role="region" aria-label="Régua do histórico de ${esc(d.nome)}">
      <div class="regua-cab">
        <div><h2>${ic('chart')} ${esc(d.nome)} <small class="faint" style="font-size:13px;font-weight:700">${esc(d.un)} · referência ${esc(refTxt(cod))}</small></h2>
          <p class="desc" style="margin:2px 0 0">${resumo}. ${A.ehProgramador() ? 'Para completar o histórico, suba os TXT dos meses vazios na régua de Resultados.' : ''}</p></div>
        <button class="btn sm ghost" data-fp="fechar-hist" aria-label="Fechar a régua">${ic('x')}</button>
      </div>
      ${trilho}
      <div class="legenda" style="margin:6px 0 0">${['ok', 'baixo', 'alto', 'crit-alto'].map(k => `<span><i class="dot" style="--cor:${COR_CL[k]}"></i>${k === 'crit-alto' ? 'crítico' : ROT_CL[k]}</span>`).join('')}<span><i class="dot sem-res"></i>sem resultado no mês</span><span><i class="dot sem-txt"></i>sem TXT</span></div>
    </section>`;
  }
  function ligarRegua() {
    const el = document.getElementById('regua'); if (!el) return;
    prepararOnda(el, el.querySelector('.rg-mes.atual') || [...el.querySelectorAll('.rg-mes.rg-cheio')].pop());
    el.onclick = e => {
      const b = e.target.closest('[data-rg]'); if (!b) return;
      e.stopPropagation();
      if (b.dataset.rg === 'ver') { location.hash = '#/resultados/' + b.dataset.comp; return; }
      if (!A.ehProgramador()) return A.toast('Só o laboratório sobe resultados.', 'shield');
      if (b.dataset.rg === 'subir') { const comp = b.dataset.comp; return escolherTxt(f => previaImportacao(f, comp)); }
      if (b.dataset.rg === 'varios') escolherVarios();
    };
    if (A.ehProgramador()) {
      ['dragenter', 'dragover'].forEach(t => el.addEventListener(t, e => { e.preventDefault(); el.classList.add('soltando'); }));
      ['dragleave', 'drop'].forEach(t => el.addEventListener(t, e => { e.preventDefault(); if (t === 'drop' || !el.contains(e.relatedTarget)) el.classList.remove('soltando'); }));
      el.addEventListener('drop', e => importarVarios(e.dataTransfer.files));
    }
  }
  function escolherVarios() {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.txt,text/plain'; inp.multiple = true;
    inp.onchange = () => inp.files.length && importarVarios(inp.files);
    inp.click();
  }
  async function importarVarios(files) {
    if (!A.ehProgramador()) return A.toast('Só o laboratório sobe resultados.', 'shield');
    const txts = [...files].filter(f => /\.txt$/i.test(f.name) || f.type === 'text/plain');
    if (!txts.length) return A.toast('Solte arquivos .txt de resultados.', 'alert');
    const itens = [];
    for (const f of txts) {
      const buf = await f.arrayBuffer(); let r = null, erro = null;
      try { r = M.lerTxtResultados(buf); if (!Object.keys(r.pacientes).length) erro = 'sem registro 01 (paciente)'; } catch (e) { erro = e.message || String(e); }
      itens.push({ f, buf, r, erro, comp: r && !erro ? adivinharCompetencia(f.name, r.datas) : '' });
    }
    itens.sort((a, b) => String(a.comp).localeCompare(String(b.comp)));
    itens.forEach(it => { it.marcado = !it.erro && !R.lotes.some(l => l.competencia === it.comp); });
    const idx = indiceSistema(), porChave = {};
    itens.forEach(it => { it.fora = foraDoSistema(it.r, idx); it.fora.forEach(x => { (porChave[x.chave] = porChave[x.chave] || Object.assign({ meses: [] }, x)).meses.push(it.comp); }); });
    const fora = Object.values(porChave).sort((a, b) => a.nome.localeCompare(b.nome));
    const excluir = new Set(fora.map(x => x.chave));
    const fim = somaMes(fimRegua(), 1), opts = [];
    for (let k = 0; k < 48; k++) opts.push(somaMes(fim, -k));
    itens.forEach(it => { if (it.comp && !opts.includes(it.comp)) opts.push(it.comp); });
    opts.sort().reverse();
    const situacao = () => {
      const marc = itens.filter(it => it.marcado), conta = {}; marc.forEach(it => { conta[it.comp] = (conta[it.comp] || 0) + 1; });
      return itens.map(it => it.erro ? ['erro', 'Não é um TXT de resultados: ' + it.erro]
        : !it.marcado ? ['fora', R.lotes.some(l => l.competencia === it.comp) ? `${rotComp(it.comp)} já tem TXT — marque para substituir` : 'Não será importado']
          : conta[it.comp] > 1 ? ['dup', `Dois arquivos para ${rotComp(it.comp)} — troque a competência de um deles`]
            : R.lotes.some(l => l.competencia === it.comp) ? ['subst', `Substitui o TXT de ${rotComp(it.comp)}`] : ['novo', 'Novo mês no histórico']);
    };
    const corSit = { erro: 'var(--crit)', fora: 'var(--muted)', dup: 'var(--crit)', subst: 'var(--warn)', novo: 'var(--ok)' };
    const linhas = () => { const st = situacao(); return itens.map((it, i) => `<tr>
        <td><input type="checkbox" data-lt="marca" data-i="${i}" ${it.marcado ? 'checked' : ''} ${it.erro ? 'disabled' : ''} aria-label="Importar ${esc(it.f.name)}"></td>
        <td><b>${esc(it.f.name)}</b><br><small class="faint">${it.r ? `${Object.keys(it.r.pacientes).length} pacientes${it.fora && it.fora.length ? (n => (n ? ` · ${n} fora do sistema excluídos` : ` · ${it.fora.length} fora do sistema vão entrar`))(it.fora.filter(x => excluir.has(x.chave)).length) : ''} · coleta ${Object.keys(it.r.datas).sort().map(fmtData).join(', ')}` : ''}</small></td>
        <td>${it.erro ? '—' : `<select class="sel-cand" data-lt="comp" data-i="${i}">${opts.map(c => `<option value="${c}" ${c === it.comp ? 'selected' : ''}>${rotComp(c)} · ${tipoComp(c).rotulo}</option>`).join('')}</select>`}</td>
        <td><span class="chip b" style="--cor:${corSit[st[i][0]]}">${st[i][0] === 'novo' ? 'novo' : st[i][0] === 'subst' ? 'substitui' : st[i][0] === 'dup' ? 'repetido' : st[i][0] === 'erro' ? 'erro' : 'não importa'}</span><br><small class="faint">${esc(st[i][1])}</small></td></tr>`).join(''); };
    A.abrirModal({
      titulo: `Subir ${itens.length} TXT de resultados`, ic: 'upload', cor: 'var(--blue)',
      corpo: `<p style="margin:0 0 8px">Cada arquivo vai para o mês indicado (pelo nome do arquivo ou pela data da coleta + 1 mês). Confira e ajuste antes de importar.</p>
        <div class="tbl-wrap" style="max-height:52vh;overflow:auto"><table class="tbl lote-txt"><thead><tr><th></th><th>Arquivo</th><th>Competência</th><th>Situação</th></tr></thead><tbody data-lt="corpo">${linhas()}</tbody></table></div>
        ${htmlForaSistema(fora, excluir)}
        <div class="login-msg" data-lt="msg"></div>`,
      botoes: [{ rot: 'Cancelar' }, { rot: 'Importar marcados', cls: 'pri', ic: 'check', acao: form => { importarMarcados(form); return false; } }],
      aoAbrir: (m, form) => {
        const repintar = () => { form.querySelector('[data-lt=corpo]').innerHTML = linhas(); };
        const bl = form.querySelector('.fora-sis'); if (bl) ligarForaSistema(bl, fora, excluir, repintar);
        form.addEventListener('change', e => {
          const t = e.target, it = itens[+t.dataset.i]; if (!it) return;
          if (t.dataset.lt === 'marca') it.marcado = t.checked;
          if (t.dataset.lt === 'comp') it.comp = t.value;
          repintar();
        });
      },
    });
    async function importarMarcados(form) {
      const msg = t => { form.querySelector('[data-lt=msg]').textContent = t; };
      const st = situacao(), vai = itens.filter((it, i) => it.marcado && ['novo', 'subst'].includes(st[i][0]));
      if (st.some(s => s[0] === 'dup')) return msg('Há dois arquivos marcados para o mesmo mês. Troque a competência de um deles.');
      if (!vai.length) return msg('Nenhum arquivo marcado para importar.');
      const b = form.querySelector('button[type=submit]'); b.disabled = true;
      let ok = 0;
      for (const it of vai) {
        msg(`Importando ${rotComp(it.comp)} (${ok + 1}/${vai.length})…`);
        try { await gravarSemExcluidos(it.f, it.buf, it.r, it.comp, excluir, true); ok++; }
        catch (e) { b.disabled = false; return msg(`Parou em ${it.f.name}: ${e.message || e}. Os ${ok} anteriores ficaram salvos.`); }
      }
      A.fechar(); A.render();
      const nEx = fora.filter(x => excluir.has(x.chave)).length;
      A.toast(`${ok} ${ok === 1 ? 'mês importado' : 'meses importados'} para o histórico${nEx ? ` · ${nEx} pacientes fora do sistema não entraram` : ''}`, 'check');
    }
  }

  // ================= TELA: RESULTADOS (visão do médico) =================
  const filtroR = { salao: '', turno: '', grupo: '', busca: '', alterados: false };
  function vazioResultados() {
    return `<div class="card" style="text-align:center;padding:40px 20px">
      <div style="width:72px;height:72px;border-radius:22px;display:grid;place-items:center;margin:0 auto 12px;background:var(--blue-50);color:var(--blue)">${ic('drop')}</div>
      <h2 style="font-size:22px">Suba o TXT de resultados</h2>
      <p class="desc" style="max-width:560px;margin:6px auto 18px">O mesmo arquivo que o sistema do laboratório exporta para o Nephrosys da Hiperrim (registros <code>01</code> paciente e <code>02</code> resultado). Cada mês importado vira histórico do paciente.</p>
      <button class="btn pri so-prog" data-res="importar">${ic('upload')} Escolher arquivo .txt</button>
    </div>`;
  }
  function vResultados(compParam) {
    if (!R.lotes.length) return htmlRegua(null) + vazioResultados();
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
    const cab = M.RES_MAPA.map(c => { const d = M.defRes(c); return `<th class="num" title="${esc(d.nome)} · ${esc(d.un)} · referência do laudo ${esc(refTxt(c))}">${esc(d.curto)}<small>${esc(refTxt(c, true)).split(' · ').join('<br>')}</small></th>`; }).join('');
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
    return htmlRegua(lote.competencia) + `
      <div class="rel-cab no-print">
        <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
          <select class="btn" data-rf="comp" aria-label="Competência">${R.lotes.map(x => `<option value="${x.competencia}" ${x === lote ? 'selected' : ''}>${rotComp(x.competencia)} · ${tipoComp(x.competencia).rotulo}</option>`).join('')}</select>
          <span class="chip">${esc(lote.arquivo)}</span>
          ${anterior ? `<span class="chip b">comparando com ${rotComp(anterior.competencia)}</span>` : `<span class="chip">1º mês no histórico — as setas ↑↓ aparecem a partir do 2º</span>`}
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          <button class="btn sm so-prog" data-res="importar">${ic('upload')} Subir TXT</button>
          <button class="btn sm" data-res="csv">${ic('sheet')} Exportar mapa</button>
          <button class="btn sm pri" data-res="imprimir">${ic('printer')} Imprimir mapa</button>
        </div>
      </div>
      <div class="kpis" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr))">
        ${tile('var(--blue)', todas.length, 'Pacientes com laudo', `${Object.keys(lote.datas).length} data(s) de coleta`)}
        ${tile('var(--ok)', urr.length ? Math.round(urr.filter(l => l.val.urr.n >= 65).length / urr.length * 100) + '%' : null, 'URR ≥ 65%', urr.length ? `média ${(urr.reduce((s, l) => s + l.val.urr.n, 0) / urr.length).toFixed(1).replace('.', ',')}%` : '')}
        ${tile('var(--rim)', pctNaMeta(todas, '016') != null ? pctNaMeta(todas, '016') + '%' : null, `Hb na referência (${refTxt('016')} g/dL)`, '')}
        ${tile('var(--b-sem)', pctNaMeta(todas, '006') != null ? pctNaMeta(todas, '006') + '%' : null, `Fósforo ${refTxt('006')}`, '')}
        ${tile('var(--c5)', pctNaMeta(todas, '034') != null ? pctNaMeta(todas, '034') + '%' : null, `PTH ${refTxt('034')}`, '')}
        ${tile('var(--teal)', pctNaMeta(todas, '030') != null ? pctNaMeta(todas, '030') + '%' : null, `IST ${refTxt('030')} %`, '')}
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
          <button class="btn sm ${filtroR.alterados ? 'pri' : ''}" data-rf="alterados">${ic('alert')} Só fora da referência</button>
          <span class="esp" style="flex:1"></span>
          <span class="legenda" style="margin:0"><span><i class="dot" style="--cor:var(--blue)"></i>abaixo</span><span><i class="dot" style="--cor:var(--warn)"></i>acima</span><span><i class="dot" style="--cor:var(--crit)"></i>crítico</span></span>
        </div>
        <div class="print-only"><h2 style="margin:0">Resultados ${rotComp(lote.competencia)} · Hiperrim</h2><p>${ls.length} pacientes · valores de referência do laudo do Laboratório Célula</p></div>
        <div class="mapa-wrap"><table class="tbl mapa"><thead><tr><th class="fixa">Paciente</th><th>Coleta</th>${cab}</tr></thead><tbody>${corpo || `<tr><td colspan="${M.RES_MAPA.length + 2}" class="vazio">Nenhum paciente com esse filtro.</td></tr>`}</tbody></table></div>
        <p class="desc" style="margin:10px 0 0">Clique no paciente para ver a ficha com o histórico. Valores de referência do laudo do Laboratório Célula (quando o laudo separa por sexo, aparecem os dois: H e M). URR e Ca×P são metas da diálise. *Kt/V na ficha é estimado.</p>
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
    ligarRegua();
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
    const cods = [...Object.keys(M.RES).filter(c => !M.RES[c].oculto && (!lote.codigos || lote.codigos[c])), ...Object.keys(M.RES_DERIVADOS)];
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
    const dest = ['urr', 'ktv', '016', '017', '004', '006', 'cap', '034', '029', '030', '026'];
    const aberto = fichaAberta.chave === chave && ult.val[fichaAberta.cod] ? fichaAberta.cod : null;
    const card = cod => {
      const d = M.defRes(cod), val = ult.val[cod]; if (!val) return '';
      const cl = M.classificar(cod, val);
      return `<div class="dest ${CLS[cl] || ''}${aberto === cod ? ' aberto' : ''}" role="button" tabindex="0" data-fp="hist" data-cod="${cod}" aria-expanded="${aberto === cod}" title="${esc(d.nota || d.nome)} — clique para ver a régua do histórico"><small>${esc(d.nome)}</small><div class="dv"><b class="mono">${fmtValor(cod, val)}</b> <span>${esc(d.un)}</span>${seta(cod, val, ant && ant.val[cod])}</div>${regua(cod, val)}<div class="dref">ref. ${esc(refTxt(cod))}</div>${sparkline(serie(cod), cod, 120, 28)}</div>`;
    };
    const grupos = {};
    Object.keys(Object.assign({}, ...hist.map(h => h.val))).forEach(c => { const d = M.defRes(c); if (d.oculto) return; (grupos[d.grupo] = grupos[d.grupo] || []).push(c); });
    const ordemG = Object.keys(M.RES_GRUPOS).concat('outros');
    const ordemC = c => { const k = Object.keys(M.RES).indexOf(c); return k < 0 ? 1000 + Object.keys(M.RES_DERIVADOS).indexOf(c) : k; };
    const tabelas = ordemG.filter(g => grupos[g]).map(g => `<div class="card"><h3>${esc(M.RES_GRUPOS[g] || 'Outros')}</h3>
      <div style="overflow:auto"><table class="tbl"><thead><tr><th>Exame</th><th class="num">${rotComp(ult.comp).slice(0, 3)}/${ult.comp.slice(2, 4)}</th><th class="num">Anterior</th><th>Referência</th><th>Tendência</th></tr></thead><tbody>
      ${grupos[g].sort((a, b) => ordemC(a) - ordemC(b)).map(c => { const d = M.defRes(c), x = ult.val[c], y = ant && ant.val[c], cl = M.classificar(c, x); return `<tr><td><b>${esc(d.nome)}</b> <small class="faint">${esc(d.un)}</small>${d.inferido ? ' <span class="faint" title="Código interpretado pelos valores — confirmar na interface">ⁱ</span>' : ''}</td>
        <td class="num rv ${CLS[cl] || ''}">${fmtValor(c, x)}${x && x.abs ? ` <small class="faint">(${esc(x.abs.trim())}/mm³)</small>` : ''}</td><td class="num faint">${y ? fmtValor(c, y) : '—'}</td><td class="faint" style="white-space:nowrap"${M.defRes(c).nota ? ` title="${esc(M.defRes(c).nota)}"` : ''}>${esc(refTxt(c))}${M.defRes(c).nota ? ' <span title="' + esc(M.defRes(c).nota) + '">ⓘ</span>' : ''}</td><td>${sparkline(serie(c), c)}</td></tr>`; }).join('')}
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
      ${aberto ? htmlReguaExame(hist, aberto) : ''}
      <div class="grid g2" style="margin-top:16px;align-items:start">${tabelas}</div>
      <div style="margin-top:16px">${tabHist}</div>
      <div class="card no-print" style="margin-top:16px"><h3>Observações do médico</h3><p class="desc">Ficam no histórico do paciente${M.nuvem ? ', com o nome de quem registrou.' : ' (nesta versão, só neste navegador).'}</p>
        <form data-fp="nota" class="so-edicao" style="display:flex;gap:8px;flex-wrap:wrap"><input name="t" class="sel-cand" style="flex:1;min-width:240px;max-width:none" placeholder="Ex.: ajustar quelante de fósforo; repetir K na próxima sessão" maxlength="400"><button class="btn pri sm">${ic('plus')} Registrar</button></form>
        <div class="lista-mov" style="margin-top:10px">${notas.map(n => `<div class="mov" style="--cor:var(--blue)"><span class="ic">${ic('chat')}</span><div>${esc(n.texto)}<br><small>${new Date(n.ts).toLocaleString('pt-BR')} · ref. ${rotComp(n.comp)}${n.por ? ' · ' + esc(n.por) : ''}</small></div></div>`).join('') || '<div class="faint" style="padding:6px">Sem observações.</div>'}</div>
      </div>
      <p class="desc" style="margin-top:12px">*Kt/V estimado por Daugirdas 2ª geração com sessão de 4 h e sem UF/peso — para o valor exato faltam tempo de sessão, UF e peso pós (dados da clínica). Referências do laudo do Laboratório Célula; URR, Kt/V e Ca×P são metas da diálise.</p>`;
  }
  function ligarPaciente(chave) {
    chave = decodeURIComponent(chave || '');
    const c = $('#conteudo');
    const reg = document.getElementById('regua-exame');
    if (reg) prepararOnda(reg, reg.querySelector('.rg-mes.atual'));
    const alternar = cod => {
      const abrir = !(fichaAberta.chave === chave && fichaAberta.cod === cod);
      Object.assign(fichaAberta, { chave, cod: abrir ? cod : null });
      const y = window.scrollY; A.render(); window.scrollTo(0, y);
      const card = abrir && document.querySelector(`.dest[data-cod="${cod}"]`); if (card) card.focus({ preventScroll: true });
    };
    c.onkeydown = e => { const d = e.target.closest('.dest[data-fp="hist"]'); if (d && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); alternar(d.dataset.cod); } };
    c.onclick = e => {
      const b = e.target.closest('[data-fp]'); if (!b || b.tagName === 'FORM') return;
      if (b.dataset.fp === 'hist') return alternar(b.dataset.cod);
      if (b.dataset.fp === 'fechar-hist') { Object.assign(fichaAberta, { cod: null }); const y = window.scrollY; A.render(); window.scrollTo(0, y); return; }
      if (b.dataset.fp === 'imprimir') window.print();
      if (b.dataset.fp === 'csv') {
        let base = null; for (const l of R.lotes) { if (l.pacientes[chave]) { base = l.pacientes[chave]; break; } }
        const hist = historico(chave, base.nome);
        const cods = Object.keys(Object.assign({}, ...hist.map(h => h.val))).filter(x => !M.defRes(x).oculto);
        const linhas = [['Exame', 'Unidade', 'Referência', ...hist.map(h => rotComp(h.comp))], ...cods.map(x => [M.defRes(x).nome, M.defRes(x).un, refTxt(x), ...hist.map(h => h.val[x] ? (h.val[x].t || String(h.val[x].n).replace('.', ',')) : '')])];
        const url = URL.createObjectURL(new Blob(['﻿' + linhas.map(l => l.join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
        const a = Object.assign(document.createElement('a'), { href: url, download: `historico-${M.norm(base.nome).replace(/ /g, '-').toLowerCase()}.csv` });
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
      }
    };
    const form = $('form[data-fp="nota"]');
    if (form) form.onsubmit = e => {
      e.preventDefault(); const t = form.t.value.trim(); if (!t || !E()) return;
      A.marcar('observação'); E().notas = E().notas || {};
      const quem = M.sessao && M.sessao.perfil ? (M.sessao.perfil.nome || M.sessao.perfil.email) : null;
      (E().notas[chave] = E().notas[chave] || []).unshift(Object.assign({ ts: new Date().toISOString(), texto: t, comp: R.lotes[0].competencia }, quem ? { por: quem } : {}));
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
          ${l.filtrado ? `<div style="margin-top:6px"><span class="chip b" style="--cor:var(--warn)" title="Cópia filtrada e renumerada: não é o arquivo original do laboratório">${ic('alert')} Cópia filtrada: ${l.filtrado.removidos} ${l.filtrado.removidos === 1 ? 'paciente fora do sistema removido' : 'pacientes fora do sistema removidos'}</span></div>` : ''}
          ${(l.avisos || []).length ? `<details style="margin-top:8px"><summary class="chip b" style="--cor:var(--warn);cursor:pointer">${ic('alert')} Checagem: ${Object.entries(porTipo).map(([k, n]) => `${n} ${k}`).join(' · ')}</summary><ul class="avisos">${l.avisos.slice(0, 60).map(a => `<li>${esc(a.texto)}</li>`).join('')}${l.avisos.length > 60 ? `<li>… e mais ${l.avisos.length - 60}</li>` : ''}</ul></details>` : ''}
        </div>
        <div style="display:flex;flex-direction:column;gap:6px">
          <button class="btn pri sm" data-arq="baixar" data-id="${l.id}">${ic('download')} Baixar TXT</button>
          <a class="btn sm" href="#/resultados/${l.competencia}">${ic('eye')} Ver resultados</a>
          <button class="btn sm ghost" data-arq="excluir" data-id="${l.id}">${ic('x')} Excluir</button>
        </div></div>`;
    }).join('');
    return `<div class="alerta-box info" style="margin-bottom:14px">${ic('download')}<div><b>Arquivos para a Hiperrim.</b> Cada TXT fica guardado exatamente como o sistema do laboratório exportou (mesmos bytes, ISO-8859-1, quebra de linha CRLF), pronto para importar no Nephrosys. Na versão com login, a equipe da Hiperrim entra e baixa por aqui.</div></div>
      ${htmlRegua(null)}
      <div class="no-print so-prog" style="margin-bottom:14px"><button class="btn pri" data-arq="importar">${ic('upload')} Subir TXT de resultados</button></div>
      ${cards || vazioResultados()}`;
  }
  function ligarArquivos() {
    $('#conteudo').onclick = e => {
      const b = e.target.closest('[data-arq],[data-res]'); if (!b) return;
      const a = b.dataset.arq || b.dataset.res;
      if (a === 'importar') A.importarResultados();
      if (a === 'baixar') baixarArquivo(b.dataset.id);
      if (a === 'excluir') excluirLote(b.dataset.id);
    };
    ligarRegua();
  }

  // ================= TELA: INTERFACE NEPHROSYS =================
  // Os códigos do TXT do laboratório são os da integração com o Nephrosys da Hiperrim (em produção).
  function vInterface() {
    const lote = R.lotes[0];
    const cods = [...new Set([...Object.keys(M.RES), ...(lote ? Object.keys(lote.codigos) : [])])].sort();
    const stCor = { conferido: 'var(--ok)', inferido: 'var(--warn)', desconhecido: 'var(--muted)' };
    const stRot = { conferido: 'conferido', inferido: 'inferido', desconhecido: 'não interpretado' };
    const exames = c => ((M.RES[c] && M.RES[c].ex) || []).join(' · ');
    const linhas = cods.map(c => {
      const d = M.defRes(c), s = M.conferencia(c);
      return `<tr><td class="mono"><b>${c}</b></td><td>${esc(d.nome)}</td><td class="faint">${esc(d.un || '')}</td>
        <td class="mono">${lote ? (lote.codigos[c] || 0) : '—'}</td><td class="faint">${esc(refTxt(c))}</td><td class="mono" style="font-size:12px">${esc(exames(c)) || '—'}</td>
        <td><span class="chip b" style="--cor:${stCor[s.st]}">${stRot[s.st]}</span><br><small class="faint">${esc(s.txt)}</small></td></tr>`;
    }).join('');
    const porExame = Object.keys(M.EXAMES).map(ex => ({ ex, cods: Object.keys(M.RES).filter(c => (M.RES[c].ex || []).includes(ex)) }));
    const nConf = Object.keys(M.RES).filter(c => M.conferencia(c).st === 'conferido').length;
    const novos = lote ? Object.keys(lote.codigos).filter(c => !M.RES[c]) : [];
    const chipCod = c => { const r = M.RES[c]; return `<code class="cod${r.inferido ? ' inf' : ''}" title="${esc(r.nome)}${r.inferido ? ' — inferido: ' + esc(r.motivo || '') : ''}">${c}</code>`; };
    return `<div class="grid g2" style="margin-bottom:16px;align-items:start">
        <div class="card"><h2>Layout do TXT de resultados</h2><p class="desc">Lido do arquivo exportado pelo laboratório (separador <code>|</code>, ISO-8859-1, CRLF).</p>
          <table class="tbl"><thead><tr><th>Registro</th><th>Campos</th></tr></thead><tbody>
            <tr><td><code>01</code> paciente</td><td><code>01 | sequência | nome | (vazio) | (vazio) | CPF | data da coleta</code></td></tr>
            <tr><td><code>02</code> resultado</td><td><code>02 | sequência | código | valor | valor absoluto (diferencial) | (vazio) |</code></td></tr>
          </tbody></table>
          <p class="desc" style="margin-top:10px">A sequência é contínua no arquivo inteiro. Decimal com vírgula; valores fora da faixa do aparelho vêm como texto (“Superior a 3.500,0”).</p>
          <div class="alerta-box ok" style="margin-top:12px">${ic('check')}<div><b>Integração em produção.</b> Estes são os códigos que o Nephrosys da Hiperrim já importa. O TXT vai exatamente como o laboratório exporta (aba <b>Arquivos TXT</b>) — o MedRim não altera nada no arquivo.</div></div>
          ${novos.length ? `<div class="alerta-box" style="margin-top:10px">${ic('alert')}<div>O último TXT trouxe ${novos.length === 1 ? 'um código novo' : novos.length + ' códigos novos'} que o MedRim ainda não interpreta: <b>${novos.map(esc).join(', ')}</b>. O arquivo segue igual para a Hiperrim; só a visão do médico não mostra esses valores.</div></div>` : ''}</div>
        <div class="card"><h2>Exames da bateria → códigos do TXT</h2>
          <p class="desc">Conferido valor a valor: laudo completo de uma bateria anual (dez/2025) × o TXT do mesmo paciente. <b>${nConf} códigos conferidos, nenhuma divergência.</b></p>
          <div class="tbl-wrap"><table class="tbl tbl-cruz"><thead><tr><th>Exame da bateria</th><th>Código(s) no TXT</th></tr></thead><tbody>
            ${porExame.map(({ ex, cods: cs }) => `<tr><td>${esc(M.EXAMES[ex].nome)} <small class="faint mono">${esc(ex)}</small></td><td>${cs.length ? cs.map(chipCod).join(' ') : '<span class="faint">—</span>'}</td></tr>`).join('')}
          </tbody></table></div>
          <p class="desc" style="margin:8px 0 0"><code class="cod">001</code> conferido no laudo · <code class="cod inf">067</code> inferido (passe o mouse para ver o motivo).</p></div>
      </div>
      <div class="card" style="margin-bottom:16px"><h2>Códigos do TXT → como o MedRim interpreta</h2><p class="desc">Base da visão do médico. “Conferido” = valor do TXT igual ao do laudo; “inferido” = não dava para conferir no laudo de exemplo (motivo abaixo do status).</p>
        <div style="overflow:auto"><table class="tbl"><thead><tr><th>Código</th><th>Exame</th><th>Unidade</th><th>Qtd no último TXT</th><th>Referência (laudo)</th><th>Exame da bateria</th><th>Situação</th></tr></thead><tbody>${linhas}</tbody></table></div></div>`;
  }

  Object.assign(A.views, { vResultados, vPaciente, vArquivos, vInterface });
  Object.assign(A.ligar, { resultados: ligarResultados, paciente: ligarPaciente, arquivos: ligarArquivos });
})(window.MED = window.MED || {});
