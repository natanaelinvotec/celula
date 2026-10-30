/* MedRim · telas: importar, sincronização, relatório de cadastro, baterias & regras, proposta. */
(function (M) {
  'use strict';
  const A = M.app;
  const { $, $$, esc, ic, titulo, nomeCurto, fmtData, fmtCpf, mascCpf } = A;
  const E = () => A.E;

  // ================= IMPORTAR =================
  const selecionados = new Map();
  function vImportar() {
    const tem = E() && E().vagas.length;
    return `<div class="importar">
      <div>
        <span class="chip b" style="--cor:var(--rim)">Célula Diagnósticos × Hiperrim</span>
        <h2 style="margin-top:12px">Escala e bateria do mês,<br><em>sincronizadas</em> em segundos.</h2>
        <p class="lead">Solte aqui o Word da escala (salões, turnos e máquinas) e os CSVs da bateria. O MedRim casa os nomes abreviados com nome completo, CPF e nascimento. ${M.nuvem ? 'Os arquivos são lidos neste navegador; o resultado vai para a <b>nuvem do laboratório</b> (Firebase, com login e permissões) — nunca para o GitHub.' : 'Tudo <b>dentro do seu navegador</b>: nenhum dado de paciente é enviado para servidor ou para o GitHub.'}</p>
        <div class="drop" id="drop" tabindex="0" role="button" aria-label="Escolher arquivos">
          ${ic('upload')}<b>Arraste os arquivos aqui ou clique para escolher</b>
          <small>1 arquivo .docx da escala + os CSVs (ex.: “SEG QUA E SEX 1 TURNO.csv”, “TER QUI E SAB 3 TURNO.csv”). Se tiver a lista conferida (.xlsx), solte junto.</small>
        </div>
        <div class="lista-arq" id="lista-arq"></div>
        <div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:16px">
          <button class="btn pri" id="btn-importar" disabled>${ic('sync')} Importar e sincronizar</button>
          <button class="btn ghost" id="btn-restaurar">${ic('download')} Restaurar backup</button>
          ${tem ? `<a class="btn ghost" href="#/painel">Voltar ao painel</a>` : ''}
          ${!M.nuvem && (tem || (A.R && A.R.lotes.length)) ? `<button class="btn perigo" id="btn-zerar">${ic('undo')} Começar do zero</button>` : ''}
        </div>
        <div class="alerta-box info" style="margin-top:14px">${ic('drop')}<div>Resultados dos pacientes (TXT do Nephrosys) entram em <a href="#/resultados"><b>Resultados</b></a>.</div></div>
        ${tem ? `<div class="alerta-box info" style="margin-top:14px">${ic('info')}<div>Reimportar mantém o que vocês já decidiram: <b>vínculos confirmados</b>, internações, óbitos, admissões e o histórico. Sem o .docx, só os CSVs são atualizados.</div></div>` : ''}
        <ol class="passos">
          <li><span class="n">1</span><div><b>Leitura</b><br><small>Salões, turnos, máquinas, nomes riscados, extras e trânsito do Word.</small></div></li>
          <li><span class="n">2</span><div><b>Casamento</b><br><small>“MªJoséB.Sto” → MARIA JOSÉ BARBOSA DOS SANTOS, usando dias e turno do CSV.</small></div></li>
          <li><span class="n">3</span><div><b>Divergências no painel</b><br><small>O que não bateu aparece para alguém decidir — e a decisão é lembrada.</small></div></li>
        </ol>
      </div>
      ${ilusHero()}
    </div>`;
  }
  function ilusHero() {
    return `<svg class="ilus-hero" viewBox="0 0 520 420" aria-hidden="true">
      <defs><linearGradient id="gh" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2563eb"/><stop offset="1" stop-color="#1e3a8a"/></linearGradient></defs>
      <circle cx="270" cy="210" r="190" fill="var(--blue-50)"/>
      <circle cx="430" cy="90" r="46" fill="var(--red-50)"/>
      <g transform="translate(40,70)"><rect width="150" height="190" rx="16" fill="var(--surface)" stroke="var(--line)" stroke-width="2"/>
        <rect x="16" y="18" width="70" height="10" rx="5" fill="#2b579a"/><text x="100" y="27" font-size="11" font-weight="900" fill="#2b579a" font-family="Nunito">.docx</text>
        ${[0, 1, 2, 3, 4, 5, 6].map(i => `<rect x="16" y="${44 + i * 19}" width="28" height="9" rx="3" fill="var(--line)"/><rect x="50" y="${44 + i * 19}" width="${80 - (i % 3) * 14}" height="9" rx="3" fill="${i === 3 ? '#fde68a' : 'var(--surface-3)'}"/>`).join('')}
      </g>
      <g transform="translate(70,290)"><rect width="130" height="80" rx="14" fill="var(--surface)" stroke="var(--line)" stroke-width="2"/>
        <rect x="14" y="14" width="40" height="10" rx="5" fill="#15803d"/><text x="62" y="23" font-size="11" font-weight="900" fill="#15803d" font-family="Nunito">.csv</text>
        ${[0, 1, 2].map(i => `<rect x="14" y="${34 + i * 13}" width="100" height="7" rx="3" fill="var(--surface-3)"/>`).join('')}</g>
      <path d="M200 170 C 250 170, 250 210, 290 210" fill="none" stroke="var(--blue)" stroke-width="3" stroke-dasharray="6 7"><animate attributeName="stroke-dashoffset" from="26" to="0" dur="1.2s" repeatCount="indefinite"/></path>
      <path d="M200 330 C 260 330, 250 250, 290 240" fill="none" stroke="#15803d" stroke-width="3" stroke-dasharray="6 7"><animate attributeName="stroke-dashoffset" from="26" to="0" dur="1.2s" repeatCount="indefinite"/></path>
      <g transform="translate(290,120)"><rect width="190" height="210" rx="22" fill="url(#gh)"/>
        <text x="20" y="38" fill="#fff" font-size="16" font-weight="900" font-family="Nunito">Salão 1 · Manhã</text>
        ${[0, 1, 2, 3].map(i => `<g transform="translate(18,${58 + i * 36})"><rect width="154" height="28" rx="9" fill="rgba(255,255,255,.12)"/><circle cx="16" cy="14" r="7" fill="${['#7ee2a3', '#7ee2a3', '#fbbf24', '#7ee2a3'][i]}"/><rect x="30" y="9" width="${[90, 70, 84, 64][i]}" height="10" rx="5" fill="rgba(255,255,255,.75)"/></g>`).join('')}
      </g>
      <g transform="translate(404,300)"><circle r="26" fill="var(--ok)"/><path d="M-10 0l7 7 13-14" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></g>
      <g transform="translate(410,58)"><use href="#maq-hd" width="40" height="60"/></g>
    </svg>`;
  }
  function descreverArquivo(f) {
    if (/\.docx$/i.test(f.name)) return { tipo: 'DOCX', cor: '#2b579a', txt: 'Escala de pacientes (Word)', ok: true };
    if (/\.csv$/i.test(f.name)) {
      const { grupo, turno } = M.identificarCsv(f.name);
      if (grupo && turno) return { tipo: 'CSV', cor: '#15803d', txt: `${M.GRUPOS[grupo].rotulo} · ${M.TURNOS[turno].csv}º turno (${M.TURNOS[turno].rotulo})`, ok: true };
      return { tipo: 'CSV', cor: '#b45309', txt: 'Não reconheci dias/turno pelo nome — renomeie (ex.: “SEG QUA E SEX 1 TURNO.csv”)', ok: false };
    }
    if (/\.xlsx$/i.test(f.name)) return { tipo: 'XLSX', cor: '#107c41', txt: 'Lista conferida — aplica salão, dias, turno e equipamento e confirma os vínculos', ok: true };
    return { tipo: '?', cor: '#94a3b8', txt: 'Tipo não suportado', ok: false };
  }
  function ligarImportar() {
    const drop = $('#drop'), inp = $('#arquivos'), lista = $('#lista-arq'), btn = $('#btn-importar');
    const pintar = () => {
      lista.innerHTML = [...selecionados.values()].map(f => { const d = descreverArquivo(f); return `<div class="arq"><span class="tipo" style="--cor:${d.cor}">${d.tipo}</span><div><b>${esc(f.name)}</b><div class="meta">${esc(d.txt)} · ${(f.size / 1024).toFixed(0)} KB</div></div><span class="ok" style="${d.ok ? '' : 'color:var(--warn)'}">${ic(d.ok ? 'check' : 'alert')}</span></div>`; }).join('');
      const arr = [...selecionados.values()];
      const temEstado = !!(E() && E().vagas.length), tem = re => arr.some(f => re.test(f.name));
      btn.disabled = !((tem(/\.csv$/i) && (tem(/\.docx$/i) || temEstado)) || (tem(/\.xlsx$/i) && temEstado));
    };
    const adicionar = fs => { [...fs].forEach(f => selecionados.set(f.name, f)); pintar(); };
    drop.onclick = () => inp.click();
    drop.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inp.click(); } };
    inp.onchange = () => { adicionar(inp.files); inp.value = ''; };
    ['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('on'); }));
    ['dragleave', 'drop'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove('on'); }));
    drop.addEventListener('drop', e => adicionar(e.dataTransfer.files));
    btn.onclick = async () => {
      btn.disabled = true; btn.innerHTML = `${ic('sync')} Sincronizando…`;
      try {
        const r = await importar([...selecionados.values()]);
        selecionados.clear();
        location.hash = '#/painel';
        if (r.lista) {
          const l = r.lista, prob = l.problemas;
          if (l.pendentes) { location.hash = '#/sync'; A.toast(`Pendentes: ${l.cadastrados} cadastrados · ${l.excluidos} excluídos · ${l.outroLab} outro lab · ${l.aguardando} sem preencher${prob ? ` · ${prob} recusadas (ver Movimentações)` : ''}`, 'check'); }
          else A.toast(`Lista conferida: ${l.confirmados} confirmados${l.movidos ? ` · ${l.movidos} mudaram de máquina` : ''}${prob ? ` · ${prob} linhas com problema (ver Movimentações)` : ''}`, 'check');
        } else A.toast(`${r.alta} casados automaticamente · ${r.revisar.length + r.semCsv.length + r.foraDoBolsao.length + r.csvSemVaga.length} para conferir`, 'sync');
      } catch (err) {
        console.error(err); A.toast(err.message || 'Falha ao importar', 'alert'); btn.disabled = false; btn.innerHTML = `${ic('sync')} Importar e sincronizar`;
      }
    };
    $('#btn-restaurar').onclick = () => $('#arq-backup').click();
    const zerar = $('#btn-zerar');
    if (zerar) zerar.onclick = () => A.abrirModal({
      titulo: 'Começar do zero', ic: 'undo', cor: 'var(--crit)',
      corpo: `<p style="margin:0">Apaga <b>deste navegador</b> tudo o que o MedRim guardou: escala, sincronização, vínculos confirmados, internações/admissões/óbitos, histórico, observações e resultados de TXT. Seus arquivos (Word, CSVs, planilhas) não são tocados.</p>
        <label style="display:flex;gap:8px;align-items:center;font-weight:800"><input type="checkbox" name="bk" checked> Baixar um backup antes de apagar</label>
        <label style="display:flex;gap:8px;align-items:center;font-weight:800"><input type="checkbox" name="fixos" checked> Manter as travas de outro laboratório e os convênios (Unimed, Célula, IMPCG)</label>
        <div class="alerta-box">${ic('alert')}<div>Depois de apagar não dá para desfazer (só restaurando o backup).</div></div>`,
      botoes: [{ rot: 'Cancelar' }, { rot: 'Apagar tudo', cls: 'rim', ic: 'x', acao: async f => {
        if (f.bk.checked && E()) A.exportarBackup();
        try { localStorage.removeItem('medrim:v1'); if (!f.fixos.checked) localStorage.removeItem('medrim:fixos'); } catch (e) { /* ok */ }
        if (A.limparResultados) await A.limparResultados();
        A.E = null; selecionados.clear();
        location.hash = '#/importar'; A.render();
        A.toast('Tudo limpo — solte o .docx da escala e os 6 CSVs', 'check');
      } }],
    });
    pintar();
  }

  /** Aplica a planilha conferida: posiciona cada CPF no salão/dias/turno/equipamento indicado e confirma o vínculo. */
  async function aplicarLista(xlsx) {
    const linhas = await M.lerPlanilhaXlsx(xlsx);
    const st = E();
    A.marcar('lista conferida');
    const res = { confirmados: 0, movidos: 0, semPosicao: 0, naoEncontrados: [], vagaInexistente: [], repetidos: [],
      pendentes: 0, cadastrados: 0, excluidos: 0, outroLab: 0, aguardando: 0, recusados: [] };
    const usados = {};
    for (const l of linhas) {
      if (l.pendente) { aplicarPendente(l, res, usados); continue; }
      const p = st.pacientes[l.cpf];
      if (!p) { res.naoEncontrados.push(`${l.nome || l.cpf} (linha ${l.linha})`); continue; }
      if (!l.salao || !l.grupo || !l.turno || !l.maq) { res.semPosicao++; continue; }
      const alvo = st.vagas.find(v => v.salao === l.salao && v.grupo === l.grupo && v.turno === l.turno && v.maq === l.maq);
      if (!alvo) { res.vagaInexistente.push(`${l.nome}: Salão ${l.salao} · ${M.GRUPOS[l.grupo].curto} · ${A.rotTurno(l.turno)} · Máq ${l.maq} (linha ${l.linha})`); continue; }
      if (usados[alvo.id]) res.repetidos.push(`${l.nome} e ${usados[alvo.id]} na mesma máquina (${A.local(alvo, true)})`);
      usados[alvo.id] = l.nome;
      const atual = p.vagaId ? A.vagaPor(p.vagaId) : null;
      if (!atual || atual.id !== alvo.id) {
        if (atual) A.moverOcupante(atual, alvo);
        else {
          const outro = A.pacDe(alvo);
          if (outro && outro.origem === 'csv') outro.vagaId = null; else if (outro) delete st.pacientes[outro.id];
          if (!alvo.nomeEscala) Object.assign(alvo, { nomeEscala: A.nomeCurto(p.nome), variantes: [], dias: M.GRUPOS[alvo.grupo].dias.slice() });
          alvo.pacienteId = p.id; p.vagaId = alvo.id;
        }
        res.movidos++;
      }
      alvo.match = Object.assign({}, alvo.match, { conf: 'confirmado', riscoResolvido: true });
      delete alvo.match.foraDoBolsao;
      alvo.riscado = false;
      if (alvo.nomeEscala) st.apelidos[M.chaveApelido(alvo.nomeEscala, alvo.grupo, alvo.turno)] = p.id;
      res.confirmados++;
    }
    const prob = [...res.naoEncontrados.map(x => 'CPF não está nos CSVs: ' + x), ...res.vagaInexistente.map(x => 'Máquina não existe na escala: ' + x), ...res.repetidos.map(x => 'Repetido: ' + x), ...res.recusados];
    res.problemas = prob.length;
    prob.slice(0, 40).forEach(t => A.evento('vinculo', null, t));
    if (res.pendentes) A.evento('vinculo', null, `Planilha de pendentes aplicada (${xlsx.name}): ${res.cadastrados} cadastrados · ${res.excluidos} excluídos · ${res.outroLab} outro lab · ${res.aguardando} continuam pendentes${prob.length ? ` · ${prob.length} linhas recusadas` : ''}`);
    else A.evento('vinculo', null, `Lista conferida aplicada (${xlsx.name}): ${res.confirmados} confirmados${res.movidos ? ` · ${res.movidos} mudaram de máquina` : ''}${res.semPosicao ? ` · ${res.semPosicao} sem posição na planilha` : ''}${prob.length ? ` · ${prob.length} problemas` : ''}`);
    A.salvar();
    return res;
  }

  /** Uma linha da planilha de pendentes: a máquina é a chave; a coluna Ação decide (em branco + nome = cadastrar). */
  function aplicarPendente(l, res, usados) {
    res.pendentes++;
    const st = E(), ond = `${l.nomeEscala} (linha ${l.linha})`;
    const recusa = msg => res.recusados.push(`Linha ${l.linha} · ${l.nomeEscala}: ${msg}`);
    if (!l.salao || !l.grupo || !l.turno || !l.maq) return recusa('sem Salão/Dias/Turno/Equipamento');
    const v = st.vagas.find(x => x.salao === l.salao && x.grupo === l.grupo && x.turno === l.turno && x.maq === l.maq);
    if (!v) return res.vagaInexistente.push(`${ond}: Salão ${l.salao} · ${M.GRUPOS[l.grupo].curto} · ${A.rotTurno(l.turno)} · Máq ${l.maq}`);
    // a máquina precisa ter o mesmo nome da escala de quando a planilha foi gerada (protege contra escala reimportada/alterada)
    if (l.acao === 'excluir' && !v.nomeEscala && !v.pacienteId) return;   // já excluído numa importação anterior
    const chaveNome = s => M.norm(s).replace(/ /g, '');   // "DanielVicente" = "Daniel Vicente" (só espaçamento corrigido na planilha)
    if (chaveNome(v.nomeEscala) !== chaveNome(l.nomeEscala)) return recusa(`a máquina agora está com “${v.nomeEscala || 'vazia'}” — nada mudou`);
    const atual = A.pacDe(v);
    if (atual && !['escala', 'resultado'].includes(atual.origem)) { if (l.acao !== 'excluir') return; }   // já resolvido (CSV ou cadastrado antes)
    const acao = l.acao || (l.nome ? 'cadastrar' : '');
    if (!acao) { res.aguardando++; return; }
    if (acao === 'excluir') { A.liberarVaga(v); res.excluidos++; return; }
    if (acao === 'outrolab') { A.travar(v); res.outroLab++; return; }
    if (l.cpf) {
      if (usados['cpf:' + l.cpf]) return recusa(`CPF repetido (também na linha ${usados['cpf:' + l.cpf]})`);
      usados['cpf:' + l.cpf] = l.linha;
    }
    const dados = { nome: l.nome, cpf: l.cpf, nasc: l.nasc, bateria: l.bateria, origem: 'planilha de pendentes' };
    const erro = A.validarSemPedido(v, dados);
    if (erro) return recusa(erro.msg);
    A.criarSemPedido(v, dados);
    res.cadastrados++;
  }

  async function importar(files) {
    const docx = files.find(f => /\.docx$/i.test(f.name));
    const csvs = files.filter(f => /\.csv$/i.test(f.name));
    const xlsx = files.find(f => /\.xlsx$/i.test(f.name));
    const ant = E();
    if (!csvs.length && xlsx && ant && ant.vagas.length) {
      const lista = await aplicarLista(xlsx);
      return Object.assign(M.resumoDivergencias(E().vagas, E().pacientes), { lista });
    }
    if (!csvs.length) throw new Error('Inclua pelo menos um CSV da bateria.');
    if (!docx && !(ant && ant.vagas.length)) throw new Error('Inclua o .docx da escala.');
    const novo = A.estadoVazio(ant);
    if (docx) {
      const { linhas } = await M.lerEscalaDocx(docx);
      const { vagas, foraDaGrade } = M.montarVagas(linhas);
      novo.vagas = vagas; novo.foraDaGrade = foraDaGrade; novo.arquivos.docx = docx.name;
    } else {
      novo.vagas = A.clone(ant.vagas); novo.foraDaGrade = ant.foraDaGrade; novo.arquivos.docx = ant.arquivos.docx;
    }
    const pacs = {};
    const manter = ['status', 'internadoDesde', 'obitoEm', 'saiuEm', 'admissao', 'transito', 'ultimaVaga'];
    for (const f of csvs) {
      const { grupo, turno } = M.identificarCsv(f.name);
      if (!grupo || !turno) throw new Error(`Não reconheci dias/turno em “${f.name}”. Renomeie como “SEG QUA E SEX 1 TURNO.csv”.`);
      for (const p of await M.lerCsvBateria(f, grupo, turno)) {
        const velho = ant && ant.pacientes[p.cpf];
        pacs[p.cpf] = Object.assign(p, { id: p.cpf, origem: 'csv', status: 'ativo' });
        if (velho) manter.forEach(k => { if (velho[k] !== undefined) pacs[p.cpf][k] = velho[k]; });
      }
    }
    if (ant) Object.values(ant.pacientes).filter(p => (p.origem === 'manual' || p.origem === 'transito') && !pacs[p.id]).forEach(p => { pacs[p.id] = Object.assign({}, p, { vagaId: null }); });
    novo.pacientes = pacs;
    const r = M.sincronizar(novo.vagas, pacs, novo.apelidos);
    novo.importadoEm = new Date().toISOString();
    novo.arquivos.csv = csvs.map(f => f.name);
    A.E = novo;
    A.evento('importacao', null, `Importação: ${docx ? docx.name + ' + ' : ''}${csvs.length} CSV · ${Object.values(pacs).filter(p => p.origem === 'csv').length} pedidos · ${r.alta} casados automaticamente`);
    A.salvar();
    if (xlsx) { const lista = await aplicarLista(xlsx); return Object.assign(M.resumoDivergencias(E().vagas, E().pacientes), { lista }); }
    return r;
  }

  function baixar(nome, conteudo, tipo) {
    const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
    const a = Object.assign(document.createElement('a'), { href: url, download: nome });
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  A.exportarBackup = () => {
    if (!A.ehProgramador()) return A.toast('Só o laboratório (programador) baixa o backup.', 'shield');
    if (!E()) return A.toast('Nada para salvar ainda.', 'info');
    baixar(`medrim-backup-${A.hojeISO()}.json`, JSON.stringify(E(), null, 1), 'application/json');
    A.toast('Backup baixado — contém dados pessoais: guarde em local seguro.', 'shield');
  };
  function ligarRestaurar() {
    $('#arq-backup').onchange = async e => {
      const f = e.target.files[0]; e.target.value = ''; if (!f) return;
      try {
        const d = JSON.parse(await f.text());
        if (!d || d.versao !== 1 || !Array.isArray(d.vagas)) throw new Error('Arquivo não é um backup do MedRim.');
        if (!A.ehProgramador()) throw new Error('Só o laboratório (programador) restaura backup.');
        const aplicar = () => { A.marcar('restauração'); A.E = d; A.salvar(); location.hash = '#/painel'; A.render(); A.toast(M.nuvem ? 'Backup restaurado e enviado para a nuvem' : 'Backup restaurado', 'check', true); };
        if (!M.nuvem) return aplicar();
        A.abrirModal({ titulo: 'Restaurar backup na nuvem', ic: 'alert', cor: 'var(--crit)',
          corpo: `<p style="margin:0">Substitui a escala, os pacientes e as decisões <b>para todos os usuários</b> pelo conteúdo de <b>${esc(f.name)}</b> (${d.vagas.length} vagas · ${Object.keys(d.pacientes || {}).length} pacientes).</p>`,
          botoes: [{ rot: 'Cancelar' }, { rot: 'Substituir', cls: 'rim', ic: 'check', acao: () => { A.fechar(); aplicar(); } }] });
      } catch (err) { A.toast(err.message, 'alert'); }
    };
  }

  // ================= SINCRONIZAÇÃO =================
  function vSync() {
    const d = A.divergencias();
    const P = id => E().pacientes[id];
    const linhaLocal = v => `<td style="white-space:nowrap"><b>S${v.salao}</b> · ${A.rotTurno(v.turno)}<br><small style="color:var(--muted)">${M.GRUPOS[v.grupo].rotulo} · Máq ${esc(v.maq)}</small></td>`;
    const confBar = s => { const cor = s >= 0.85 ? 'var(--ok)' : s >= 0.7 ? 'var(--warn)' : 'var(--crit)'; return `<span class="conf"><span class="barra" style="--cor:${cor}"><i style="width:${Math.round(s * 100)}%"></i></span>${Math.round(s * 100)}%</span>`; };
    const pacCel = p => p ? `<b>${esc(p.nome)}</b><br><small style="color:var(--muted)">${esc(p.nasc)} · ${mascCpf(p.cpf)} · ${M.GRUPOS[p.grupo].curto} ${M.TURNOS[p.turno].csv}º turno</small>` : '<span style="color:var(--faint)">—</span>';
    const selAlt = v => `<select class="sel-cand" data-s="trocar" data-v="${v.id}" aria-label="Escolher outro paciente"><option value="">Outro paciente…</option>${(v.alternativas || []).filter(a => a.cpf !== v.pacienteId && P(a.cpf)).map(a => `<option value="${a.cpf}">${esc(P(a.cpf).nome)} · ${Math.round(a.score * 100)}%</option>`).join('')}<option value="*">Lista completa…</option></select>`;
    const abrir = v => `<button class="btn sm ghost" data-s="abrir" data-v="${v.id}" title="Abrir ficha">${ic('eye')}</button>`;

    const secao = (id, cor, icn, tit, desc, n, cab, linhas, aberto = true) => `
      <details class="card secao-sync" id="sec-${id}" ${aberto && n ? 'open' : ''}>
        <summary><span class="kpi" style="--cor:${cor};border:0;padding:0;box-shadow:none;background:none"><span class="ic" style="margin:0">${ic(icn)}</span></span>
          <div><h2>${tit} <span class="chip b" style="--cor:${cor}">${n}</span></h2><p class="desc" style="margin:0">${desc}</p></div>${ic('chev', 'i chev')}</summary>
        ${n ? `<div style="overflow:auto"><table class="tbl"><thead><tr>${cab.map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>${linhas}</tbody></table></div>` : `<div class="alerta-box ok" style="margin-top:12px">${ic('check')}<div>Nada aqui.</div></div>`}
      </details>`;

    const revisar = d.revisar.map(v => `<tr>${linhaLocal(v)}<td><span class="escala-nome">${esc(v.variantes.join(' / '))}</span></td><td>${pacCel(P(v.pacienteId))}</td><td>${confBar(v.match.score)}</td>
      <td><div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn sm pri" data-s="confirmar" data-v="${v.id}">${ic('check')} Confirmar</button>${selAlt(v)}${abrir(v)}</div></td></tr>`).join('');
    const fora = d.foraDoBolsao.map(v => { const p = P(v.pacienteId); return `<tr>${linhaLocal(v)}<td><span class="escala-nome">${esc(v.nomeEscala)}</span></td><td>${pacCel(p)}</td>
      <td><span class="chip b" style="--cor:var(--c5)">CSV: ${M.GRUPOS[v.match.foraDoBolsao.grupo].rotulo} · ${A.rotTurno(v.match.foraDoBolsao.turno)}</span></td>
      <td><div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn sm pri" data-s="confirmar" data-v="${v.id}">${ic('check')} É ele — vale a escala</button>${selAlt(v)}${abrir(v)}</div></td></tr>`; }).join('');
    const riscados = d.riscadosNoCsv.map(v => `<tr>${linhaLocal(v)}<td><span class="escala-nome" style="text-decoration:line-through">${esc(v.variantes.join(' / '))}</span></td><td>${pacCel(P(v.pacienteId))}</td>
      <td><div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn sm" data-s="continua" data-v="${v.id}">${ic('check')} Continua — coletar</button><button class="btn sm" data-s="saida" data-v="${v.id}">${ic('userx')} Óbito / saída</button>${abrir(v)}</div></td></tr>`).join('');
    const porSalao = {};
    const sugTxt = A.sugestoesTxt ? A.sugestoesTxt() : {};
    const nSugTxt = d.semCsv.filter(v => sugTxt[v.id]).length;
    d.semCsv.forEach(v => (porSalao[v.salao] = porSalao[v.salao] || []).push(v));
    const semCsv = (nSugTxt ? `<tr><td colspan="4"><div class="alerta-box info">${ic('drop')}<div style="flex:1"><b>${nSugTxt} destes nomes aparecem no TXT de resultados de ${A.rotComp(Object.values(sugTxt)[0].comp)}</b> com nome completo e CPF — fizeram a bateria passada, mas não estão no CSV atual. Vincular traz a identidade e o histórico; continuam fora do relatório até entrarem no CSV.</div><button class="btn sm pri" data-s="vinctxt-todos">${ic('link')} Vincular os ${nSugTxt}</button></div></td></tr>` : '') +
      Object.entries(porSalao).map(([s, vs]) => `<tr class="rel-grupo"><td colspan="4">Salão ${s} <span>· ${vs.length} nomes</span></td></tr>` + vs.sort(A.ordemRelatorio).map(v => {
      const alt = (v.alternativas || [])[0], st = sugTxt[v.id], pv = P(v.pacienteId);
      const palpite = pv && pv.origem === 'resultado' ? `<small style="color:var(--teal)">identificado pelo TXT</small><br>${esc(pv.nome)} · ${mascCpf(pv.cpf)}`
        : st ? `<small style="color:var(--teal)">no TXT de ${A.rotComp(st.comp)}</small><br><b>${esc(st.nome)}</b> · ${Math.round(st.score * 100)}% <button class="btn sm" data-s="vinctxt" data-v="${v.id}">${ic('link')} Vincular</button>`
        : alt && P(alt.cpf) ? `<small style="color:var(--muted)">melhor palpite no CSV</small><br>${esc(P(alt.cpf).nome)} · ${Math.round(alt.score * 100)}%` : '<small style="color:var(--faint)">nenhum parecido no CSV</small>';
      return `<tr>${linhaLocal(v)}<td><span class="escala-nome">${esc(v.nomeEscala)}</span>${v.riscado ? ' <span class="chip b" style="--cor:var(--crit)">riscado</span>' : ''}${v.notaTransito ? ' <span class="chip b" style="--cor:var(--c5)">' + esc(v.notaTransito) + '</span>' : ''}</td>
      <td>${palpite}</td>
      <td><div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn sm" data-s="vincular" data-v="${v.id}">${ic('link')} Vincular</button><button class="btn sm" data-s="cadastrar" data-v="${v.id}" title="Cadastrar com bateria (sem pedido no CSV)">${ic('userplus')} Cadastrar</button><button class="btn sm ghost" data-s="outrolab" data-v="${v.id}" title="Trava: todo mês faz em outro laboratório">${ic('lock')} Outro lab</button><button class="btn sm perigo" data-s="excluir" data-v="${v.id}" title="Remover este nome da escala">${ic('x')} Excluir</button></div></td></tr>`;
    }).join('')).join('');
    const semVaga = d.csvSemVaga.map(p => `<tr><td>${pacCel(p)}</td><td><span class="chip">${M.GRUPOS[p.grupo].rotulo} · ${A.rotTurno(p.turno)}</span></td><td><span class="mono">${esc(p.codigo)}</span></td>
      <td><button class="btn sm pri" data-s="alocar" data-p="${p.id}">${ic('plus')} Alocar em máquina</button></td></tr>`).join('');
    const dups = d.duplicadas.map(v => `<tr>${linhaLocal(v)}<td><span class="escala-nome">${esc(v.nomeEscala)}</span></td><td>${pacCel(P(v.pacienteId))}</td><td>Principal: <b>${esc(A.local(A.vagaPor(v.match.duplicadaDe), true))}</b><br><small style="color:var(--muted)">Só a principal entra no relatório</small></td></tr>`).join('');
    const notas = E().foraDaGrade.map(f => `<tr><td><b>S${f.salao}</b> · ${A.rotTurno(f.turno)} · Máq ${esc(f.maq)}</td><td>${f.textos.map(t => `<span class="escala-nome">${esc(t)}</span>`).join(' ')}</td><td><small style="color:var(--muted)">Escrito fora das colunas de dias no Word — lista de espera? anotação?</small></td></tr>`).join('');
    const outros = d.outroLab.sort(A.ordemRelatorio).map(v => { const p = P(v.pacienteId), t = A.travaDe(v);
      return `<tr>${linhaLocal(v)}<td><span class="escala-nome">${esc(v.nomeEscala)}</span>${p && p.origem === 'csv' ? `<br><small style="color:var(--muted)">veio no CSV: ${esc(p.nome)}</small>` : ''}</td>
      <td><button class="btn sm trava" data-s="destravar" data-v="${v.id}" title="Travado desde ${A.fmtData(t.desde)} — clique para liberar">${ic('lock')} Travado</button></td></tr>`; }).join('');
    const altas = E().vagas.filter(v => v.pacienteId && v.match && ['alta', 'confirmado'].includes(v.match.conf) && !v.match.foraDoBolsao && !v.match.duplicadaDe && P(v.pacienteId) && P(v.pacienteId).origem === 'csv').sort(A.ordemRelatorio);
    const altasHtml = altas.map(v => `<tr>${linhaLocal(v)}<td><span class="escala-nome">${esc(v.nomeEscala)}</span></td><td>${pacCel(P(v.pacienteId))}</td><td>${v.match.conf === 'confirmado' ? '<span class="chip b">confirmado</span>' : confBar(v.match.score)}</td></tr>`).join('');

    const lote = A.R && A.R.lotes[0];
    const foraCsv = lote ? Object.values(lote.pacientes).filter(p => !(p.cpf && P(p.cpf) && P(p.cpf).origem === 'csv')) : [];
    const foraCsvHtml = foraCsv.sort((a, b) => a.nome.localeCompare(b.nome)).map(p => {
      const pe = p.cpf && P(p.cpf), v = pe && pe.vagaId ? A.vagaPor(pe.vagaId) : null;
      const st = !v ? Object.entries(sugTxt).find(([, x]) => x.chave === p.chave) : null;
      return `<tr><td><b>${esc(p.nome)}</b><br><small style="color:var(--muted)">${mascCpf(p.cpf)} · coleta ${fmtData(p.data)}</small></td>
        <td>${v ? esc(A.local(v, true)) : st ? `<small style="color:var(--teal)">provável:</small> ${esc(A.local(A.vagaPor(st[0]), true))} <span class="escala-nome">${esc(A.vagaPor(st[0]).nomeEscala)}</span>` : '<small class="faint">não achei na escala</small>'}</td>
        <td><a class="btn sm ghost" href="#/paciente/${encodeURIComponent(p.chave)}">${ic('chart')} Resultados</a></td></tr>`;
    }).join('');
    const tile = (n, rot, cor, alvo) => `<button class="kpi" data-rolar="sec-${alvo}" style="--cor:${cor}"><span class="v mono" data-n="${n}">${n}</span><span class="l">${rot}</span></button>`;
    return `
      <div class="resumo-sync">
        ${tile(d.alta, 'Casados automaticamente', 'var(--ok)', 'altas')}
        ${tile(d.revisar.length, 'Para revisar', 'var(--warn)', 'revisar')}
        ${tile(d.foraDoBolsao.length, 'Dias/turno diferentes', 'var(--c5)', 'fora')}
        ${tile(d.riscadosNoCsv.length, 'Riscados mas no CSV', 'var(--crit)', 'riscados')}
        ${tile(d.semCsv.length, 'Na escala sem CSV', 'var(--blue)', 'semcsv')}
        ${tile(d.csvSemVaga.length, 'No CSV sem máquina', 'var(--rim)', 'semvaga')}
      </div>
      <div class="alerta-box info" style="margin-bottom:16px">${ic('sparkle')}<div><b>Como funciona:</b> cada CSV já diz os dias e o turno do paciente, então “Mª Apª Souza” no Salão 1, manhã, Seg/Qua/Sex só é comparada com quem está no CSV “SEG QUA E SEX 1 TURNO”. Ao <b>confirmar</b> um vínculo, o apelido vira dicionário e casa sozinho nos próximos meses.</div></div>
      ${secao('revisar', 'var(--warn)', 'alert', 'Casamentos para revisar', 'Parecidos, mas com abreviação forte ou erro de digitação na escala.', d.revisar.length, ['Local', 'Na escala', 'No CSV', 'Semelhança', ''], revisar)}
      ${secao('fora', 'var(--c5)', 'swap', 'Dias ou turno diferentes', 'O nome bate, mas escala e CSV discordam de dias/turno. Alguém mudou de horário?', d.foraDoBolsao.length, ['Local na escala', 'Na escala', 'No CSV', 'O CSV diz', ''], fora)}
      ${secao('riscados', 'var(--crit)', 'x', 'Riscados na escala, mas presentes no CSV', 'O Word mostra o nome riscado — confirme antes de cadastrar.', d.riscadosNoCsv.length, ['Local', 'Na escala', 'No CSV', ''], riscados)}
      ${secao('semvaga', 'var(--rim)', 'room', 'No CSV, sem máquina na escala', 'Tem pedido de exame, mas não achei na escala. Ficam no fim do relatório até serem alocados.', d.csvSemVaga.length, ['Paciente', 'CSV', 'Código', ''], semVaga)}
      ${secao('semcsv', 'var(--blue)', 'info', 'Na escala, sem pedido no CSV', 'Não entram no relatório. Outro laboratório/convênio, paciente novo ou nome muito diferente?', d.semCsv.length, ['Local', 'Na escala', 'Palpite', ''], semCsv, nSugTxt > 0)}
      ${lote ? secao('foracsv', 'var(--teal)', 'drop', `Fizeram a bateria de ${A.rotComp(lote.competencia)}, mas não estão no CSV atual`, 'Comparação entre o último TXT de resultados e o CSV do mês: saíram da clínica ou faltou no pedido da Hiperrim?', foraCsv.length, ['Paciente (TXT)', 'Na escala', ''], foraCsvHtml, false) : ''}
      ${secao('dups', 'var(--muted)', 'link', 'Mesmo paciente em duas máquinas', 'Ex.: sessão de sábado em outra máquina.', d.duplicadas.length, ['Local', 'Na escala', 'Paciente', 'Observação'], dups, false)}
      ${secao('outros', 'var(--muted)', 'lock', 'Travados · outro laboratório', 'Fazem os exames em outro laboratório todo mês: ficam fora do relatório e das pendências, mesmo que a Hiperrim mande no CSV. Clique no cadeado para liberar.', d.outroLab.length, ['Local', 'Na escala', ''], outros, false)}
      ${secao('notas', 'var(--muted)', 'report', 'Anotações fora da grade do Word', 'Textos em colunas extras da tabela.', E().foraDaGrade.length, ['Local', 'Texto', ''], notas, false)}
      ${secao('altas', 'var(--ok)', 'check', 'Casados automaticamente', 'Para auditoria — passe o olho, se quiser.', altas.length, ['Local', 'Na escala', 'No CSV', 'Semelhança'], altasHtml, false)}`;
  }
  function ligarSync() {
    const c = $('#conteudo');
    c.onclick = e => {
      const r = e.target.closest('[data-rolar]'); if (r) { const s = document.getElementById(r.dataset.rolar); if (s) { s.open = true; s.scrollIntoView({ behavior: 'smooth', block: 'start' }); } return; }
      const b = e.target.closest('[data-s]'); if (!b || b.tagName === 'SELECT') return;
      const v = b.dataset.v && A.vagaPor(b.dataset.v);
      const s = b.dataset.s;
      if (s === 'abrir') A.abrirFicha(v.id);
      if (s === 'confirmar') A.confirmarVinculo(v.id);
      if (s === 'continua') { A.marcar('riscado mantido'); v.riscado = false; v.match = Object.assign({}, v.match, { riscoResolvido: true }); A.salvar(); A.render(); A.toast('Mantido — entra na bateria', 'check', true); }
      if (s === 'saida') A.abrirFerramenta('obito', { origem: v.id });
      if (s === 'vincular') A.modalVincular(v.id);
      if (s === 'cadastrar') A.cadastrarSemPedido(v.id);
      if (s === 'excluir') A.removerDaEscala(v.id);
      if (s === 'outrolab') A.travarVaga(v.id);
      if (s === 'destravar') A.pedirDestravar(v.id);
      if (s === 'alocar') modalAlocar(b.dataset.p);
      if (s === 'vinctxt') A.vincularTxt([v.id]);
      if (s === 'vinctxt-todos') A.vincularTxt(Object.keys(A.sugestoesTxt()));
    };
    c.onchange = e => {
      const s = e.target; if (s.dataset.s !== 'trocar' || !s.value) return;
      if (s.value === '*') A.modalVincular(s.dataset.v); else A.trocarVinculo(s.dataset.v, s.value);
    };
  }
  function modalAlocar(pid) {
    const p = E().pacientes[pid];
    A.abrirModal({
      titulo: 'Alocar ' + nomeCurto(p.nome), ic: 'plus', cor: 'var(--rim)',
      corpo: `<div class="bloco" style="padding:10px 12px"><b>${esc(p.nome)}</b><br><small style="color:var(--muted)">No CSV: ${M.GRUPOS[p.grupo].rotulo} · ${A.rotTurno(p.turno)}</small></div>
        <div class="linha-f t3">
          <label class="f">Salão<select name="s">${A.saloes().map(s => `<option>${s}</option>`).join('')}</select></label>
          <label class="f">Turno<select name="t">${['M', 'T', 'N'].map(t => `<option value="${t}" ${t === p.turno ? 'selected' : ''}>${A.rotTurno(t)}</option>`).join('')}</select></label>
          <label class="f">Dias<select name="g">${['SQS', 'TQS'].map(g => `<option value="${g}" ${g === p.grupo ? 'selected' : ''}>${M.GRUPOS[g].rotulo}</option>`).join('')}</select></label></div>
        <label class="f">Máquina (livres ou só-escala)<select name="v"></select></label>`,
      botoes: [{ rot: 'Cancelar' }, { rot: 'Alocar', cls: 'pri', ic: 'check', acao: f => {
        const v = A.vagaPor(f.v.value); if (!v) return false;
        A.marcar('alocação');
        const ant = A.pacDe(v); if (ant && ant.origem === 'escala') delete E().pacientes[ant.id];
        if (!v.nomeEscala) Object.assign(v, { nomeEscala: nomeCurto(p.nome), variantes: [], dias: M.GRUPOS[v.grupo].dias.slice() });
        v.pacienteId = p.id; v.match = { conf: 'confirmado', score: M.pontuar(v.nomeEscala, p.nome) }; p.vagaId = v.id;
        E().apelidos[M.chaveApelido(v.nomeEscala, v.grupo, v.turno)] = p.id;
        A.evento('vinculo', p.id, `${nomeCurto(p.nome)} alocado em ${A.local(v, true)}`);
        A.salvar(); A.render(); A.toast('Alocado em ' + A.local(v, true), 'check', true);
      } }],
      aoAbrir: (m, f) => {
        const upd = () => {
          const vs = E().vagas.filter(v => v.salao === +f.s.value && v.turno === f.t.value && v.grupo === f.g.value && (!A.ocupada(v) || !v.pacienteId)).sort((a, b) => a.pos - b.pos);
          f.v.innerHTML = vs.map(v => `<option value="${v.id}">Máq ${v.maq} — ${v.nomeEscala ? 'escala: ' + esc(v.nomeEscala) : 'livre'}</option>`).join('') || '<option value="">Nada livre aqui</option>';
        };
        ['s', 't', 'g'].forEach(k => f[k].onchange = upd); upd();
      },
    });
  }

  // ================= RELATÓRIO DE CADASTRO =================
  function linhasRelatorio() {
    const vs = E().vagas.filter(v => v.pacienteId && !(v.match && v.match.duplicadaDe)).sort(A.ordemRelatorio);
    const linhas = vs.map(v => ({ v, p: A.pacDe(v) })).filter(x => x.p && x.p.origem !== 'escala').map(x => Object.assign(x, { st: A.situacao(x.p) }));
    const semVaga = Object.values(E().pacientes).filter(p => p.origem === 'csv' && !p.vagaId && !M.saiuDaClinica(p)).map(p => ({ v: null, p, st: A.situacao(p) }));
    let n = 0;
    [...linhas, ...semVaga].forEach(x => { x.n = x.st.coleta ? ++n : null; });
    return { linhas, semVaga, total: n };
  }
  function vRelatorio() {
    const { linhas, semVaga, total } = linhasRelatorio();
    const b = A.bateriaRef();
    const exames = [...linhas, ...semVaga].filter(x => x.st.coleta).reduce((s, x) => s + A.examesDo(x.p).length, 0);
    const naoColeta = [...linhas, ...semVaga].filter(x => !x.st.coleta).length;
    const semCsv = A.divergencias().semCsv.length;
    const cpf = c => A.ui.relCpf ? fmtCpf(c) : mascCpf(c);
    const exs = p => {
      const l = A.examesDo(p), tp = A.tipoDoPaciente(p);
      if (tp !== A.tipoRef()) { const bp = M.BATERIAS[tp]; return `<b class="mono">${l.length}</b> <span class="exs"><span class="tag-exame extra" style="--cor:${bp.cor}" title="${esc(l.join(', '))}">${esc(bp.rotulo)}</span>${l.filter(c => !bp.exames.includes(c)).map(c => `<span class="tag-exame extra" style="--cor:var(--blue)">+${c}</span>`).join('')}</span>`; }
      return `<b class="mono">${l.length}</b> <span class="exs">${l.filter(c => !b.exames.includes(c)).map(c => { const k = Object.values(M.CONTROLES).find(x => x.exame === c); return `<span class="tag-exame extra" style="--cor:${k ? k.cor : 'var(--blue)'}">+${c}</span>`; }).join('')}</span>`;
    };
    let grupo = '', html = '';
    const linha = x => `<tr class="${x.st.coleta ? '' : 'nao-coleta'}"><td class="mono">${x.n || '—'}</td><td class="mono">${x.v ? esc(x.v.maq) : '—'}</td>
      <td><b>${esc(x.p.nome)}</b>${A.convenioDe(x.p) ? ' ' + A.seloConvenio(A.convenioDe(x.p)) : ''}</td><td class="mono">${esc(x.p.nasc || '—')}</td><td class="cpf">${cpf(x.p.cpf)}</td><td class="mono">${esc(x.p.codigo || '—')}</td>
      <td>${x.st.coleta ? exs(x.p) : '<span style="color:var(--faint)">não cadastrar</span>'}</td><td><small>${esc(x.st.coleta ? [x.p.origem === 'transito' ? 'trânsito (incluído)' : A.convenioDe(x.p) ? 'convênio ' + M.CONVENIOS[A.convenioDe(x.p)].rotulo + (x.p.semPedido ? ' · sem pedido no CSV' : '') : x.p.semPedido ? 'sem pedido no CSV da Hiperrim' : x.st.adm ? 'admissional' : x.p.origem === 'manual' ? 'cadastro manual' : '', x.v && x.v.riscado ? '⚠ riscado na escala — confirmar' : '', x.v && x.v.match && x.v.match.conf === 'media' ? 'conferir nome' : ''].filter(Boolean).join(' · ') : x.st.motivo)}</small></td></tr>`;
    for (const x of linhas) {
      const g = `${x.v.salao}|${x.v.grupo}|${x.v.turno}`;
      if (g !== grupo) { grupo = g; html += `<tr class="rel-grupo"><td colspan="8">Salão ${x.v.salao} · ${M.GRUPOS[x.v.grupo].rotulo} · ${A.rotTurno(x.v.turno)} <span>(${M.TURNOS[x.v.turno].csv}º turno)</span></td></tr>`; }
      html += linha(x);
    }
    if (semVaga.length) { html += `<tr class="rel-grupo"><td colspan="8" style="color:var(--rim)">No CSV sem máquina na escala <span>(alocar ou cadastrar no fim)</span></td></tr>` + semVaga.map(linha).join(''); }
    return `
      <div class="rel-cab no-print">
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          <span class="chip b" style="--cor:${b.cor}">Bateria ${esc(b.rotulo)} · ${esc(A.nomeRef())}</span>
          <span class="chip b" style="--cor:var(--ok)">${total} pacientes para cadastrar</span>
          <span class="chip b">${exames} exames</span>
          ${naoColeta ? `<span class="chip b" style="--cor:var(--muted)">${naoColeta} não cadastrar</span>` : ''}
          ${semCsv ? `<a class="chip b" style="--cor:var(--warn)" href="#/sync">${semCsv} nomes da escala sem pedido no CSV</a>` : ''}
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          <button class="btn sm" data-r="cpf">${ic(A.ui.relCpf ? 'eyeoff' : 'eye')} ${A.ui.relCpf ? 'Mascarar CPF' : 'Mostrar CPF'}</button>
          <button class="btn sm" data-r="copiar">${ic('copy')} Copiar</button>
          <button class="btn sm" data-r="csv">${ic('sheet')} Exportar planilha</button>
          <button class="btn sm pri" data-r="imprimir">${ic('printer')} Imprimir / PDF</button>
        </div>
      </div>
      <div class="card">
        <div class="print-only"><h2 style="margin:0">Relatório de cadastro · Hiperrim · Bateria ${esc(b.rotulo)} ${esc(A.nomeRef())}</h2><p>${total} pacientes · ${exames} exames · gerado em ${new Date().toLocaleString('pt-BR')} · ordem das etiquetas: salão → Seg/Qua/Sex (manhã, tarde, noite) → Ter/Qui/Sáb → máquina</p></div>
        <p class="desc no-print">Na ordem das etiquetas: <b>Salão → Seg/Qua/Sex (manhã, tarde, noite) → Ter/Qui/Sáb (manhã, tarde, noite) → máquina</b>. Base do mês: ${b.exames.join(', ')}. Extras de controle aparecem coloridos.</p>
        <div style="overflow:auto"><table class="tbl"><thead><tr><th>Nº</th><th>Máq</th><th>Paciente</th><th>Nasc.</th><th>CPF</th><th>Cód.</th><th>Exames</th><th>Obs.</th></tr></thead><tbody>${html}</tbody></table></div>
      </div>`;
  }
  function ligarRelatorio() {
    $('#conteudo').onclick = e => {
      const b = e.target.closest('[data-r]'); if (!b) return;
      const r = b.dataset.r;
      if (r === 'cpf') { A.ui.relCpf = !A.ui.relCpf; A.render(); }
      if (r === 'imprimir') window.print();
      if (r === 'csv' || r === 'copiar') {
        const { linhas, semVaga } = linhasRelatorio();
        const cab = ['Ordem', 'Salão', 'Dias', 'Turno', 'Máquina', 'Nome', 'Nascimento', 'CPF', 'Código Hiperrim', 'Bateria', 'Qtd exames', 'Exames', 'Coleta', 'Convênio', 'Observação'];
        const rows = [...linhas, ...semVaga].map(x => {
          const ex = x.st.coleta ? A.examesDo(x.p) : [];
          return [x.n || '', x.v ? x.v.salao : '', x.v ? M.GRUPOS[x.v.grupo].rotulo : '', x.v ? A.rotTurno(x.v.turno) : '', x.v ? x.v.maq : '', x.p.nome, x.p.nasc, fmtCpf(x.p.cpf), x.p.codigo, M.BATERIAS[A.tipoDoPaciente(x.p)].rotulo, ex.length, ex.join(' '), x.st.coleta ? 'SIM' : 'NÃO', A.convenioDe(x.p) ? M.CONVENIOS[A.convenioDe(x.p)].rotulo : '', x.st.coleta ? (x.p.semPedido ? 'Sem pedido no CSV da Hiperrim' : x.st.adm ? x.st.motivo : '') : x.st.motivo];
        });
        if (r === 'csv') {
          const q = s => { s = String(s == null ? '' : s); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
          baixar(`medrim-cadastro-${E().ref.ano}-${String(E().ref.mes).padStart(2, '0')}.csv`, '﻿' + [cab, ...rows].map(l => l.map(q).join(';')).join('\r\n'), 'text/csv;charset=utf-8');
          A.toast('Planilha exportada (abre no Excel)', 'sheet');
        } else {
          const txt = [cab, ...rows].map(l => l.join('\t')).join('\n');
          (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => A.toast('Copiado — cole no Excel ou no sistema', 'copy'), () => A.toast('Não consegui copiar neste navegador', 'alert'));
        }
      }
    };
  }

  // ================= BATERIAS & REGRAS =================
  function vBaterias() {
    const regras = E() ? E().regras : M.REGRAS_PADRAO;
    const meses = t => Object.entries(M.CALENDARIO).filter(([, x]) => x === t).map(([m]) => M.MESES[m - 1].slice(0, 3)).join(', ');
    const cards = Object.entries(M.BATERIAS).map(([t, b]) => `<div class="card bateria-card" style="--cor:${b.cor}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start"><div><h2>${b.rotulo}</h2><div class="meses">${meses(t) || 'Na admissão · anual sem ureia pós'}</div></div><div class="qtd mono">${b.qtd}</div></div>
      <div class="lista-ex">${b.exames.map(c => `<div><code>${c}</code><span>${esc(M.EXAMES[c].nome)}${(b.aConfirmar || []).includes(c) ? ' <span class="chip b" style="--cor:var(--warn);padding:1px 6px">a confirmar</span>' : ''}</span></div>`).join('')}</div>
      ${b.semControle ? `<div class="alerta-box info" style="margin-top:12px">${ic('info')}<div>Todos fazem os mesmos ${b.qtd} — sem controle extra.</div></div>` : ''}
    </div>`).join('');
    const tipos = Object.keys(M.BATERIAS);
    const matriz = `<table class="matriz"><thead><tr><th></th>${tipos.map(t => `<th>${M.BATERIAS[t].rotulo}</th>`).join('')}</tr></thead><tbody>
      ${Object.entries(M.CONTROLES).map(([k, c]) => `<tr><td><span class="k" style="--cor:${c.cor}">${c.sigla}</span> ${c.rotulo} <small style="color:var(--muted)">(${c.exame})</small></td>
        ${tipos.map(t => { const inclui = M.BATERIAS[t].exames.includes(c.exame); return `<td>${inclui ? '<small style="color:var(--muted);font-weight:800">já incluso</small>' : `<button class="chk" style="--cor:${c.cor}" data-regra="${k}|${t}" aria-pressed="${!!regras[k][t]}" ${E() ? '' : 'disabled'} aria-label="${c.rotulo} na ${M.BATERIAS[t].rotulo}">${ic('check')}</button>`}</td>`; }).join('')}</tr>`).join('')}
    </tbody></table>`;
    return `<div class="grid g2" style="grid-template-columns:repeat(auto-fit,minmax(250px,1fr));margin-bottom:16px">${cards}</div>
      <div class="grid g2">
        <div class="card"><h2>Controles por paciente</h2><p class="desc">Marcados no CSV (colunas Glic, CR, HB-Gli). Aqui você define em qual bateria cada controle acrescenta exame. A matriz vale para o relatório na hora.</p>${matriz}</div>
        <div class="card"><h2>Regras de exceção</h2>
          <ul style="margin:0;padding-left:18px;line-height:1.7">
            <li><b>Admissional:</b> 28 exames (a anual sem ureia pós), sem glicose/creatinina/Hb glicada extras. Entra na lista do mês da admissão no lugar da bateria do mês; no mês seguinte volta ao normal. Em janeiro faz a anual completa. Se o admissional já foi coletado, marque na admissão e ele não entra na lista.</li>
            <li><b>Sem pedido no CSV:</b> quem está na escala sem pedido pode ser cadastrado com a bateria escolhida (mensal, trimestral ou semestral) e entra na sequência normal do relatório.</li>
            <li><b>Internado:</b> fora das baterias até o retorno; a máquina fica reservada.</li>
            <li><b>Trânsito:</b> fora da bateria por padrão (opção de incluir por paciente).</li>
            <li><b>Óbito / saída:</b> libera a máquina; o registro fica no histórico.</li>
            <li><b>Cadastro:</b> ${M.DIAS_ANTES_CADASTRO} dias antes do mês → resultados nos dias 1 e 2.</li>
          </ul>
          <h3 style="margin:16px 0 6px;font-size:14px">Colunas do CSV → código do sistema</h3>
          <div style="display:flex;flex-wrap:wrap;gap:5px">${Object.entries(M.EXAMES).map(([c, e]) => `<span class="tag-exame" title="${esc(e.nome)}">${esc(e.csv)} → ${c}</span>`).join('')}</div>
        </div>
      </div>`;
  }
  function ligarBaterias() {
    $('#conteudo').onclick = e => {
      const b = e.target.closest('[data-regra]'); if (!b || !E()) return;
      if (!A.ehProgramador()) return A.toast('Só o laboratório altera as regras das baterias.', 'shield');
      const [k, t] = b.dataset.regra.split('|');
      A.marcar('regra de controle'); E().regras[k][t] = !E().regras[k][t]; A.salvar(); A.render();
      A.toast(`${M.CONTROLES[k].rotulo} ${E().regras[k][t] ? 'entra' : 'não entra'} na ${M.BATERIAS[t].rotulo.toLowerCase()}`, 'flask', true);
    };
  }

  // ================= PROPOSTA =================
  function vProposta() {
    const temDados = E() && E().vagas.length;
    const m = temDados ? A.metricas() : null;
    const s4 = temDados ? (() => { const vs = E().vagas.filter(v => v.salao === 4 && v.nomeEscala && !(v.match && v.match.duplicadaDe)); return { tot: vs.length, sem: vs.filter(v => !v.pacienteId).length }; })() : null;
    const sug = (cor, icn, fase, t, txt) => `<div class="sug" style="--cor:${cor}"><span class="ic">${ic(icn)}</span><span class="fase">${fase}</span><b>${t}</b><p>${txt}</p></div>`;
    return `<article class="prosa">
      <span class="chip b" style="--cor:var(--rim)">Para alinharmos</span>
      <h2>MedRim — gestor das baterias da Hiperrim</h2>
      <p class="muted">Um lugar só para a escala de hemodiálise (salões, turnos, máquinas) e as baterias mensais de exames. Hoje o trabalho é cruzar à mão o Word da escala, com nomes abreviados, e os CSVs da Hiperrim, com nome completo, CPF e nascimento. A proposta é o sistema fazer o cruzamento, mostrar só o que precisa de decisão humana e entregar a lista pronta para cadastro, na ordem das etiquetas.</p>
      ${temDados ? `<div class="alerta-box ok">${ic('check')}<div>Com os arquivos de outubro: <b>${m.sincronizados}</b> pacientes casaram sozinhos com o CSV, <b>${m.d.revisar.length + m.d.foraDoBolsao.length + m.d.riscadosNoCsv.length}</b> pedem revisão e <b>${m.d.semCsv.length}</b> nomes da escala não têm pedido no CSV${s4 ? ` (${s4.sem} deles no Salão 4, de ${s4.tot})` : ''}.</div></div>` : ''}

      <h3>Como fica o mês</h3>
      <div class="fluxo">
        <div><span class="n">PASSO 1</span>${ic('upload')}<b>Importar</b><small>CSVs da Hiperrim (e a escala, enquanto ela estiver no Word).</small></div>
        <div><span class="n">PASSO 2</span>${ic('sync')}<b>Sincronizar</b><small>Casamento automático; o painel lista só as divergências.</small></div>
        <div><span class="n">PASSO 3</span>${ic('bed')}<b>Ajustar</b><small>Internados, admissionais, trânsito, óbitos, transferências.</small></div>
        <div><span class="n">PASSO 4</span>${ic('report')}<b>Relatório</b><small>Lista na ordem das etiquetas, com os exames de cada um.</small></div>
        <div><span class="n">PASSO 5</span>${ic('tag')}<b>Cadastrar</b><small>Até ~10 dias antes do mês → resultados nos dias 1 e 2.</small></div>
      </div>

      <h3>O que este mockup já faz</h3>
      <ul>
        <li>Lê o <b>.docx da escala no navegador</b>: 4 salões × 3 turnos, máquinas 01–20 e HDF, nomes <b>riscados</b>, sessões <b>extra</b>, “trans 24/10/26”, anotações fora da grade e o caso de tabela dentro de célula.</li>
        <li><b>Casa nome abreviado com o CSV</b> (Mª, Apª, Antº, iniciais, nomes colados como “MªJoséB.Sto”, erros de digitação como “Olivelira”), usando dias e turno do CSV para não confundir homônimos.</li>
        <li><b>Painel gerencial</b>, <b>salões com as máquinas</b> (arrastar e soltar para transferir/trocar), ficha do paciente e ferramentas: transferência, trânsito, admissão, internação/retorno, óbito/saída — tudo com histórico e <b>desfazer</b>.</li>
        <li><b>Relatório de cadastro</b> na ordem das etiquetas, com exportação para Excel e impressão/PDF.</li>
        <li><b>Regras das baterias</b> (9/14/19/29) e matriz de controles editável.</li>
        <li><b>Resultados pelo TXT do laboratório</b> (o mesmo que vai para o Nephrosys): visão do médico por salão/turno com os valores de referência do laudo e valores críticos, ficha de cada paciente com histórico mês a mês, URR, Ca×P, cálcio corrigido e observações do médico.</li>
        <li><b>Arquivos TXT</b> guardados byte a byte para a Hiperrim baixar, com checagem do arquivo (sem CPF, recoleta, ureia pós ≥ pré).</li>
        <li><b>Interface Nephrosys</b>: os códigos do TXT comparados com a tabela do PDF, apontando o que diverge.</li>
      </ul>

      <h3>Regras que assumi — preciso que você confirme</h3>
      <ol>
        <li><b>Trimestral (14)</b> — <span style="color:var(--ok);font-weight:800">confirmado pelo TXT de outubro</span>: além dos 12 do print, todos têm cálcio (CA-DB) e capacidade de ligação/saturação do ferro (CAPAT-DB).</li>
        <li><b>Controles:</b> glicose entra na mensal, trimestral e semestral; creatinina na mensal e trimestral; Hb glicada na trimestral e semestral. <span style="color:var(--ok);font-weight:800">O TXT de outubro bate</span>: 124 com glicose, 123 com Hb glicada, 58 com creatinina. Falta confirmar a semestral.</li>
        <li><b>Creatinina:</b> no CSV de novembro, 54 dos 62 pacientes com CR têm os códigos mais recentes (≥ 4583000). Parece acompanhamento de pacientes novos (função renal residual). É isso? Por quantos meses?</li>
        <li><b>Admissional:</b> 28 exames (anual sem ureia pós), entra na lista do mês da admissão no lugar da bateria do mês; janeiro faz a anual completa.</li>
        <li><b>Trânsito:</b> fora da bateria por padrão, com opção de incluir.</li>
        <li><b>Ordem do relatório:</b> Salão → Seg/Qua/Sex (manhã, tarde, noite) → Ter/Qui/Sáb (manhã, tarde, noite) → máquina, com HDF logo após a máquina anterior.</li>
        <li><b>Nomes sem CSV</b>${s4 ? ` (principalmente no Salão 4: ${s4.sem} de ${s4.tot})` : ''}: são de outro laboratório ou convênio? Se forem, marco “outro lab” e eles saem das pendências. Alguns fizeram a bateria de outubro (estão no TXT) e sumiram do CSV de novembro — faltou no pedido?</li>
        <li><b>Códigos do TXT × PDF Nephrosys:</b> sódio sai como 043 (no PDF, Transferrina), Hb glicada como 067 (Anti-HIV), hemácias como 015 (Plaquetas), CHCM como 061 (Colesterol) e o total do diferencial como 062 (HDL). Se a Hiperrim importa pela tabela do PDF, esses valores podem estar caindo no exame errado — vale conferir com eles.</li>
        <li><b>Referências e valores críticos</b> da tela de resultados: as referências seguem o laudo do Laboratório Célula (ex.: K 3,5–5,1, P 2,7–4,5, PTH 18,5–88,0, Ca 8,6–10,3); URR ≥ 65% e Ca×P ≤ 55 são metas da diálise; crítico K &gt; 6,5, Hb &lt; 7, Na &lt; 125. Os valores críticos precisam do aval do nefrologista responsável.</li>
      </ol>

      <h3>Segurança e LGPD</h3>
      <div class="alerta-box info">${ic('shield')}<div>Exame de paciente é <b>dado pessoal sensível</b> (LGPD, art. 11), e o repositório <b>celula</b> é público. Por isso a pasta <code>/medrim</code> não leva nenhum dado de paciente: o mockup lê os arquivos e guarda tudo <b>só no navegador</b> de quem importou. Na versão final os dados vão para o <b>Firestore do projeto celulams</b>, atrás do mesmo login do app de atendimento, com regras por papel, CPF mascarado na tela, histórico de quem mudou o quê e página fora dos buscadores (já está com <code>noindex</code>).</div></div>

      <h3>Ferramentas que sugiro integrar</h3>
      <div class="sugestoes">
        ${sug('var(--blue)', 'sheet', 'Fase 2', 'Arquivo pronto para o seu sistema', 'Em vez de digitar: exportar o cadastro no layout de importação do sistema do laboratório (preciso de um modelo do layout).')}
        ${sug('var(--rim)', 'tag', 'Fase 2', 'Etiquetas em lote', 'Etiquetas na ordem do salão (PDF ou impressora térmica/ZPL), com código de barras e “Salão · Turno · Máq” impresso para achar o tubo certo na cadeira.')}
        ${sug('var(--teal)', 'scan', 'Fase 2', 'Checklist de coleta no celular', 'O coletor marca coletado / faltou / internado por máquina, lendo o código da etiqueta. Fecha o mês com a lista do que precisa recoletar.')}
        ${sug('var(--c5)', 'room', 'Fase 2', 'Escala viva (adeus Word)', 'A Hiperrim edita a escala direto no MedRim, com histórico. Acaba o retrabalho de abreviações, riscos e “extra” escritos à mão.')}
        ${sug('var(--warn)', 'bell', 'Fase 2', 'Lembretes do prazo', 'Aviso D-3 e D-1 do cadastro e resumo das pendências por e-mail/WhatsApp (o repositório já tem um wa-worker).')}
        ${sug('var(--ok)', 'chart', 'Fase 2', 'Kt/V exato', 'O URR já sai do TXT. Para o Kt/V exato (Daugirdas) faltam tempo de sessão, UF e peso pós — dá para receber do Nephrosys ou digitar por sessão.')}
        ${sug('var(--blue)', 'swap', 'Fase 2', 'Alertas automáticos ao médico', 'Ao subir o TXT, os valores críticos e as quedas fortes em relação ao mês anterior (Hb, albumina, URR) viram lista de pendências para o nefrologista de cada turno.')}
        ${sug('var(--rim)', 'report', 'Fase 2', 'Conferência de faturamento', 'Total de exames por código e por mês, pronto para bater com a fatura da Hiperrim.')}
        ${sug('var(--c5)', 'shield', 'Fase 3', 'Portal Hiperrim (só leitura)', 'Login separado para a clínica acompanhar a bateria, a escala e os resultados, sem acesso ao resto do sistema.')}
      </div>

      <h3>Próximos passos</h3>
      <ol>
        <li><b>Agora:</b> você navega no mockup, testa as ferramentas e me responde as regras acima.</li>
        <li><b>Fase 1:</b> ligar no Firestore do celulams com login, regras de acesso e a pasta <code>/medrim</code> publicada.</li>
        <li><b>Fase 2:</b> arquivo de importação para o seu sistema, etiquetas, checklist de coleta e escala viva.</li>
        <li><b>Fase 3:</b> portal Hiperrim com login para médicos (resultados e arquivos TXT), Kt/V exato e avisos.</li>
      </ol>
    </article>`;
  }

  Object.assign(A.views, { vImportar, vSync, vRelatorio, vBaterias, vProposta });
  Object.assign(A.ligar, { importar: ligarImportar, sync: ligarSync, relatorio: ligarRelatorio, baterias: ligarBaterias });
  ligarRestaurar();
  if (!M.nuvem) A.iniciar();   // versão online: js/nuvem.js chama A.iniciar() depois do login
})(window.MED = window.MED || {});
