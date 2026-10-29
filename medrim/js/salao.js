/* MedRim · salões (máquinas), ficha do paciente, ferramentas e ações. */
(function (M) {
  'use strict';
  const A = M.app;
  const { $, $$, esc, ic, titulo, nomeCurto, iniciais, fmtData, idade, fmtCpf, mascCpf, cpfValido, uid, hojeISO } = A;
  const E = () => A.E;

  // campos que "andam" com o paciente quando ele muda de máquina
  const OCUPANTE = ['nomeEscala', 'variantes', 'dias', 'riscado', 'notaTransito', 'pacienteId', 'match', 'alternativas'];
  const VAZIO = { nomeEscala: '', variantes: [], dias: [], riscado: false, notaTransito: null, pacienteId: null, match: null, alternativas: [] };

  // ================= SALÃO =================
  function vSalao(n, turnoParam) {
    const ui = A.ui;
    const turno = M.TURNOS[turnoParam] ? turnoParam : (ui.turno[n] || 'M');
    ui.turno[n] = turno;
    const doSalao = E().vagas.filter(v => v.salao === n);
    if (!doSalao.length) return `<div class="vazio">Salão ${n} não encontrado na escala.</div>`;
    const doTurno = doSalao.filter(v => v.turno === turno);
    const maqs = [...new Map(doTurno.slice().sort((a, b) => a.pos - b.pos).map(v => [v.maq, v.pos])).keys()];
    const oc = g => doTurno.filter(v => v.grupo === g && A.ocupada(v)).length;
    const tot = g => doTurno.filter(v => v.grupo === g).length;
    const coletam = doSalao.filter(v => A.ocupada(v) && !(v.match && v.match.duplicadaDe) && A.situacao(A.pacDe(v)).coleta).length;
    const d = A.divergencias();
    const ids = new Set(doSalao.map(v => v.id));
    const nDiv = [...d.revisar, ...d.semCsv, ...d.foraDoBolsao, ...d.riscadosNoCsv].filter(v => ids.has(v.id)).length;
    const turnos = ['M', 'T', 'N'].map(t => `<a href="#/salao/${n}/${t}" role="button" aria-pressed="${t === turno}" class="seg-b">${ic(M.TURNOS[t].ic)}${M.TURNOS[t].rotulo}</a>`).join('');

    const cards = maqs.map((maq, i) => {
      const sqs = doTurno.find(v => v.maq === maq && v.grupo === 'SQS');
      const tqs = doTurno.find(v => v.maq === maq && v.grupo === 'TQS');
      const vazia = !(sqs && A.ocupada(sqs)) && !(tqs && A.ocupada(tqs));
      const extras = [sqs, tqs].filter(Boolean).flatMap(v => v.extras.map(x => `${M.DIAS[x.dia]}: ${x.nome}${x.extra ? ' (extra)' : ''}`));
      const nota = E().foraDaGrade.find(f => f.salao === n && f.turno === turno && f.maq === maq);
      if (nota) extras.push('Anotação: ' + nota.textos.join(', '));
      const hdf = /HDF/.test(maq);
      return `<div class="maq ${vazia ? 'vazia' : ''}" style="--i:${i}">
        <span class="num ${hdf ? 'hdf' : ''}">${hdf ? 'HDF · ' + maq.slice(3) : 'MÁQ ' + esc(maq)}</span>
        <svg class="ilus-maq" style="--anim:${vazia ? 'paused' : 'running'};--ecg-op:${vazia ? '.25' : '1'}" aria-hidden="true"><use href="#maq-hd"/></svg>
        <div class="faixas">${faixa(sqs)}${faixa(tqs)}
          ${extras.length ? `<div style="font-size:11px;color:var(--muted);font-weight:700;display:flex;gap:5px;align-items:flex-start">${ic('info')}<span>${extras.map(esc).join('<br>')}</span></div>` : ''}
        </div></div>`;
    }).join('');

    return `
    <div class="salao-top">
      <div>
        <div class="chip b" style="--cor:var(--rim)">Hiperrim · Salão ${n}</div>
        <h2 style="margin-top:6px">Salão ${n} <span style="color:var(--muted);font-weight:800">· ${M.TURNOS[turno].rotulo}</span></h2>
        <div class="salao-stats">
          <span class="chip">${maqs.length} máquinas</span>
          <span class="chip b">Seg·Qua·Sex: ${oc('SQS')}/${tot('SQS')}</span>
          <span class="chip b" style="--cor:var(--teal)">Ter·Qui·Sáb: ${oc('TQS')}/${tot('TQS')}</span>
          <span class="chip b" style="--cor:var(--ok)">${coletam} coletam em ${esc(A.nomeRef())} (salão todo)</span>
          ${nDiv ? `<a class="chip b" style="--cor:var(--warn)" href="#/sync">${ic('alert')} ${nDiv} divergências</a>` : ''}
        </div>
      </div>
      ${ilusSalao()}
    </div>
    <div class="ferramentas no-print">
      <div class="seg" role="group" aria-label="Turno">${turnos}</div>
      <span class="esp"></span>
      <button class="btn sm" data-ferr="transferir">${ic('swap')} Transferir</button>
      <button class="btn sm" data-ferr="transito">${ic('route')} Trânsito</button>
      <button class="btn sm" data-ferr="admissao">${ic('userplus')} Admissão / novo</button>
      <button class="btn sm" data-ferr="internar">${ic('bed')} Internação</button>
      <button class="btn sm" data-ferr="obito">${ic('userx')} Óbito</button>
      <button class="btn sm" data-ferr="nomes" aria-pressed="${!A.ui.nomesCurtos}" title="Alternar entre nome completo do CSV e nome abreviado">${ic('userplus')} ${A.ui.nomesCurtos ? 'Nomes completos' : 'Nomes curtos'}</button>
      <button class="btn sm ${A.ui.soDivergencias ? 'pri' : ''}" data-ferr="filtro" aria-pressed="${A.ui.soDivergencias}">${ic('alert')} Só divergências</button>
    </div>
    <div class="legenda">
      <span><span class="k" style="--cor:var(--k-glic)">G</span>glicose</span>
      <span><span class="k" style="--cor:var(--k-cr)">C</span>creatinina</span>
      <span><span class="k" style="--cor:var(--k-hbgl)">H</span>Hb glicada</span>
      <span><i class="dot" style="--cor:var(--warn)"></i>revisar casamento</span>
      <span><i class="dot" style="--cor:var(--c5)"></i>trânsito</span>
      <span><i class="dot" style="--cor:var(--teal)"></i>admissional</span>
      <span>${ic('swap')} arraste um paciente para outra máquina (solte sobre ocupada = troca)</span>
    </div>
    <div class="piso" id="piso">${cards}</div>`;
  }

  function faixa(v) {
    if (!v) return '';
    const p = A.pacDe(v), occ = A.ocupada(v), st = A.situacao(p);
    const cls = ['faixa'];
    const dup = v.match && v.match.duplicadaDe;
    let sub = '', badges = '';
    const tv = occ ? A.travaDe(v) : null, conv = A.convenioDe(p);
    const temDiv = occ && !tv && (!v.pacienteId || (v.match && (v.match.conf === 'media' || v.match.foraDoBolsao)) || v.riscado || (p && ['escala', 'resultado'].includes(p.origem)));
    if (!occ) { cls.push('vaga'); sub = 'Vago — clique para alocar'; }
    else {
      if (v.riscado) cls.push('risc');
      if (tv) { cls.push('travado'); sub = 'outro laboratório · travado'; }
      else if (v.notaTransito && (!p || ['escala', 'resultado'].includes(p.origem))) { cls.push('transito'); sub = v.notaTransito.replace(/[()]/g, '').replace(/^trans/i, 'trânsito'); }
      else if (!v.pacienteId || (p && ['escala', 'resultado'].includes(p.origem))) { cls.push('sem-csv'); sub = p && p.origem === 'resultado' ? 'sem pedido no CSV · achado no TXT' : 'sem pedido no CSV'; }
      else if (v.match && v.match.conf === 'media') cls.push('revisar');
      if (p && p.status === 'internado') cls.push('internado');
      if (p && p.status === 'transito') cls.push('transito');
      if (st.adm) cls.push('adm');
      if (!sub) {
        if (dup) sub = 'mesmo paciente da ' + A.vagaPor(dup).maq.replace(/^/, 'máq ');
        else if (p && !st.coleta) sub = st.motivo.split(' — ')[0];
        else if (v.dias.length && v.dias.length < 3) sub = 'só ' + v.dias.map(d => M.DIAS[d]).join('/');
        else if (p) sub = `${idade(p.nasc) != null ? idade(p.nasc) + ' anos · ' : ''}${A.examesDo(p).length} exames`;
      }
      if (p && p.controles) badges += Object.entries(M.CONTROLES).filter(([k]) => p.controles[k]).map(([, c]) => `<span class="k" style="--cor:${c.cor}" title="${c.rotulo}">${c.sigla}</span>`).join('');
      if (tv) badges += `<span class="st trava" style="--cor:var(--muted)" data-destravar="${v.id}" role="button" tabindex="0" title="Travado: outro laboratório desde ${fmtData(tv.desde)} — clique no cadeado para liberar" aria-label="Destravar">${ic('lock')}</span>`;
      if (st.ic && p && !st.travado) badges += `<span class="st" style="--cor:${st.cor}" title="${esc(st.motivo)}">${ic(st.ic)}</span>`;
      else if (st.adm && p) badges += `<span class="st" style="--cor:var(--teal)" title="${esc(st.motivo)}">${ic('userplus')}</span>`;
      if (conv) badges += seloConvenio(conv);
      if (p && p.semPedido && !conv) badges += `<span class="st" style="--cor:var(--blue)" title="Sem pedido no CSV da Hiperrim · bateria ${esc(M.BATERIAS[p.bateriaManual].rotulo)}">${ic('info')}</span>`;
      if (v.riscado) badges += `<span class="st" style="--cor:var(--crit)" title="Riscado na escala">${ic('x')}</span>`;
    }
    const filtrar = A.ui.soDivergencias && !temDiv;
    const g = v.grupo === 'SQS' ? 'SEG<br>QUA<br>SEX' : 'TER<br>QUI<br>SÁB';
    const completo = occ && !A.ui.nomesCurtos && p && !['escala', 'resultado'].includes(p.origem);
    if (completo) cls.push('completo');
    const nome = occ ? (completo ? titulo(p.nome) : A.nomeFaixa(v)) : 'Livre';
    return `<div class="${cls.join(' ')}" role="button" tabindex="0" data-vaga="${v.id}" ${occ && A.podeEditar() ? 'draggable="true"' : ''} style="${filtrar ? 'opacity:.28' : ''}"
      title="${esc(occ ? (p ? titulo(p.nome) : v.nomeEscala) + (v.nomeEscala ? ' · escala: ' + v.nomeEscala : '') : 'Vaga livre')}">
      <span class="g">${g}</span>
      <span class="nm"><span>${esc(nome)}</span><small>${esc(sub)}</small></span>
      <span class="badges">${badges}</span></div>`;
  }

  function ilusSalao() {
    const maq = x => `<g transform="translate(${x},14)"><use href="#maq-hd" width="40" height="60"/></g>`;
    const cadeira = x => `<g transform="translate(${x},40)" fill="none" stroke="var(--line-2)" stroke-width="2"><path d="M0 30h34l6-16" stroke="var(--blue)" stroke-width="5" stroke-linecap="round" opacity=".35"/><path d="M6 30v10M32 30v10" stroke-linecap="round"/></g>`;
    return `<svg class="ilus" viewBox="0 0 330 112" aria-hidden="true"><rect x="0" y="92" width="330" height="4" rx="2" fill="var(--line)"/>
      ${maq(6)}${cadeira(50)}${maq(110)}${cadeira(154)}${maq(214)}${cadeira(258)}
      <circle cx="306" cy="22" r="14" fill="var(--red-50)"/><path d="M306 14v16M298 22h16" stroke="var(--rim)" stroke-width="3" stroke-linecap="round"/></svg>`;
  }

  function ligarSalao(n) {
    const piso = $('#piso'); if (!piso) return;
    const conteudo = $('#conteudo');
    conteudo.onclick = e => {
      const f = e.target.closest('[data-ferr]');
      if (f) {
        const t = f.dataset.ferr;
        if (t === 'filtro') { A.ui.soDivergencias = !A.ui.soDivergencias; A.render(); return; }
        if (t === 'nomes') { A.ui.nomesCurtos = !A.ui.nomesCurtos; try { localStorage.setItem('medrim:nomes', A.ui.nomesCurtos ? 'curtos' : 'completos'); } catch (e2) { /* ok */ } A.render(); return; }
        abrirFerramenta(t, { salao: n, turno: A.ui.turno[n] });
        return;
      }
      const tr = e.target.closest('[data-destravar]');
      if (tr) { e.stopPropagation(); return pedirDestravar(tr.dataset.destravar); }
      const fx = e.target.closest('[data-vaga]');
      if (fx) clicarVaga(fx.dataset.vaga);
    };
    conteudo.onkeydown = e => {
      const tr = e.target.closest('[data-destravar]');
      if (tr && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.stopPropagation(); return pedirDestravar(tr.dataset.destravar); }
      const fx = e.target.closest('[data-vaga]'); if (fx && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); clicarVaga(fx.dataset.vaga); } };
    let origem = null;
    piso.addEventListener('dragstart', e => {
      const fx = e.target.closest('[data-vaga]'); if (!fx) return;
      origem = fx.dataset.vaga; fx.classList.add('arrastando');
      e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', origem);
    });
    piso.addEventListener('dragend', () => { $$('.arrastando,.alvo', piso).forEach(x => x.classList.remove('arrastando', 'alvo')); origem = null; });
    piso.addEventListener('dragover', e => {
      const fx = e.target.closest('[data-vaga]'); if (!fx || !origem || fx.dataset.vaga === origem) return;
      e.preventDefault(); e.dataTransfer.dropEffect = 'move';
      $$('.alvo', piso).forEach(x => x !== fx && x.classList.remove('alvo')); fx.classList.add('alvo');
    });
    piso.addEventListener('dragleave', e => { const fx = e.target.closest('[data-vaga]'); if (fx && !fx.contains(e.relatedTarget)) fx.classList.remove('alvo'); });
    piso.addEventListener('drop', e => {
      const fx = e.target.closest('[data-vaga]'); if (!fx || !origem) return;
      e.preventDefault(); const destino = fx.dataset.vaga, o = origem; origem = null;
      if (destino !== o) transferir(o, destino, 'arrastar e soltar');
    });
  }

  function clicarVaga(id) {
    const v = A.vagaPor(id);
    if (A.ocupada(v)) return abrirFicha(id);
    if (!A.podeEditar()) return;
    abrirModal({
      titulo: 'Vaga livre · ' + A.local(v, true), ic: 'plus', cor: 'var(--teal)',
      corpo: `<p style="margin:0;color:var(--muted)">O que fazer com esta vaga (${esc(M.GRUPOS[v.grupo].rotulo)}, ${esc(A.rotTurno(v.turno))})?</p>
        <div class="grid" style="grid-template-columns:repeat(3,1fr);gap:10px">
          <button class="sug" style="--cor:var(--teal);text-align:left" data-op="admissao"><span class="ic">${ic('userplus')}</span><b>Admissão</b><p>Paciente novo na clínica</p></button>
          <button class="sug" style="--cor:var(--c5);text-align:left" data-op="transito"><span class="ic">${ic('route')}</span><b>Trânsito</b><p>Vindo de outra unidade</p></button>
          <button class="sug" style="--cor:var(--blue);text-align:left" data-op="transferir"><span class="ic">${ic('swap')}</span><b>Transferir</b><p>Trazer alguém para cá</p></button>
        </div>`,
      botoes: [{ rot: 'Fechar' }],
      aoAbrir: m => m.addEventListener('click', e => { const b = e.target.closest('[data-op]'); if (b) abrirFerramenta(b.dataset.op, { destino: id }); }),
    });
  }

  // ================= FICHA DO PACIENTE =================
  function abrirFicha(vagaId, pid) {
    let v = vagaId ? A.vagaPor(vagaId) : null;
    const p = pid ? E().pacientes[pid] : A.pacDe(v);
    if (!v && p && p.vagaId) v = A.vagaPor(p.vagaId);
    const g = $('#gaveta');
    const st = A.situacao(p), tipo = p ? A.tipoDoPaciente(p) : A.tipoRef(), b = M.BATERIAS[tipo];
    const nome = p ? titulo(p.nome) : v.nomeEscala;
    const conf = v && v.match;
    const rotConf = conf ? ({ alta: 'Casamento automático', media: 'Revisar casamento', confirmado: 'Vínculo confirmado', manual: 'Cadastro manual' })[conf.conf] : 'Sem vínculo';
    const corConf = conf ? ({ alta: 'var(--ok)', media: 'var(--warn)', confirmado: 'var(--blue)', manual: 'var(--teal)' })[conf.conf] : 'var(--crit)';
    const statusP = p ? M.STATUS[p.status] || M.STATUS.ativo : null;
    const exames = p ? A.examesDo(p) : [];
    const doCsv = p && p.origem === 'csv';
    const tv = v ? A.travaDe(v) : null, conv = A.convenioDe(p);
    const evs = E().eventos.filter(e => p && e.pid === p.id).slice(0, 10);

    let vinculo = '';
    if (v && v.nomeEscala) {
      const alts = (v.alternativas || []).filter(a => E().pacientes[a.cpf]);
      vinculo = `<div class="bloco"><h4>${ic('link')} Escala × CSV</h4>
        <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center"><span class="escala-nome">${esc(v.variantes.join('  /  ') || v.nomeEscala)}</span><svg class="i" style="transform:rotate(-90deg);color:var(--faint)" aria-hidden="true"><use href="#i-chev"/></svg>
        <b>${p && p.origem === 'csv' ? esc(p.nome) : p && p.semPedido ? `${esc(p.nome)} <span class="chip b" style="--cor:var(--blue)">sem pedido no CSV · ${esc(M.BATERIAS[p.bateriaManual].rotulo)}</span>` : '<span style="color:var(--crit)">sem correspondente no CSV</span>'}</b></div>
        ${conf && conf.score != null && conf.conf !== 'manual' ? `<div class="conf" style="margin-top:8px">Semelhança <span class="barra" style="--cor:${corConf}"><i style="width:${Math.round(conf.score * 100)}%"></i></span> ${Math.round(conf.score * 100)}%</div>` : ''}
        ${conf && conf.foraDoBolsao ? `<div class="alerta-box" style="margin-top:10px">${ic('alert')}<div>No CSV este paciente está em <b>${M.GRUPOS[conf.foraDoBolsao.grupo].rotulo} · ${A.rotTurno(conf.foraDoBolsao.turno)}</b>; na escala, em ${M.GRUPOS[v.grupo].rotulo} · ${A.rotTurno(v.turno)}.</div></div>` : ''}
        ${v.riscado ? `<div class="alerta-box" style="margin-top:10px">${ic('x')}<div>Nome <b>riscado</b> na escala do Word. Confirme se saiu (óbito, alta, transferência) ou se continua.</div></div>` : ''}
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px">
          ${p && doCsv && conf.conf !== 'confirmado' ? `<button class="btn sm pri" data-f="confirmar">${ic('check')} Confirmar vínculo</button>` : ''}
          <select class="sel-cand" data-f="trocar" aria-label="Vincular a outro paciente do CSV">
            <option value="">${doCsv ? 'Trocar por outro paciente…' : 'Vincular a paciente do CSV…'}</option>
            ${alts.filter(a => !p || a.cpf !== p.id).map(a => `<option value="${a.cpf}">${esc(E().pacientes[a.cpf].nome)} · ${Math.round(a.score * 100)}%</option>`).join('')}
            <option value="*">Buscar na lista completa…</option>
          </select>
          ${doCsv ? `<button class="btn sm ghost" data-f="desvincular">${ic('x')} Desvincular</button>` : ''}
          ${tv ? `<button class="btn sm trava" data-f="destravar" title="Clique no cadeado para liberar">${ic('lock')} Travado: outro laboratório</button>`
               : `<button class="btn sm" data-f="travar" title="Todo mês faz em outro laboratório: fica fora do relatório mesmo se vier no CSV">${ic('unlock')} Travar: outro laboratório</button>`}
        </div>
        ${tv ? `<div class="alerta-box" style="margin-top:10px">${ic('lock')}<div><b>Travado desde ${fmtData(tv.desde)}.</b> Faz os exames em outro laboratório todo mês: não entra no relatório nem nas pendências, mesmo que a Hiperrim mande no CSV. Clique no cadeado para liberar.</div></div>` : ''}
        ${!tv && (!p || ['escala', 'resultado'].includes(p.origem)) ? `<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;padding-top:10px;border-top:1px dashed var(--line)">
          <button class="btn sm pri" data-f="cadsem">${ic('userplus')} Cadastrar com bateria</button>
          <button class="btn sm perigo" data-f="remover">${ic('x')} Remover da escala</button>
          <small class="faint" style="flex-basis:100%">Cadastrar: entra no relatório como “sem pedido no CSV da Hiperrim”, com a bateria que você escolher.</small></div>` : ''}
        </div>`;
    }

    g.innerHTML = `
      <header>
        <span class="avatar" style="${p && p.status !== 'ativo' ? `background:${statusP.cor}` : ''}">${esc(iniciais(nome))}</span>
        <div style="flex:1;min-width:0"><h3>${esc(nome)}</h3>
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">
            ${statusP ? `<span class="chip b" style="--cor:${statusP.cor}">${statusP.rotulo}</span>` : ''}
            <span class="chip b" style="--cor:${corConf}">${rotConf}</span>
            ${p && p.origem === 'transito' ? `<span class="chip b" style="--cor:var(--c5)">Trânsito</span>` : ''}
            ${st.adm ? `<span class="chip b" style="--cor:var(--teal)">Admissional</span>` : ''}
            ${tv ? `<span class="chip b" style="--cor:var(--muted)">${ic('lock')} Outro laboratório</span>` : ''}
            ${conv ? `<span class="chip b conv" style="--cor:${M.CONVENIOS[conv].cor}">${seloConvenio(conv)} ${esc(M.CONVENIOS[conv].rotulo)}</span>` : ''}
          </div></div>
        <button class="btn ghost sm" data-f="fechar" aria-label="Fechar">${ic('x')}</button>
      </header>
      <div class="corpo">
        ${p ? `<div class="campos">
          <div class="campo"><small>CPF</small><b class="cpf">${p.cpf ? (A.ui.revelarCpf ? fmtCpf(p.cpf) : mascCpf(p.cpf)) : '—'}</b> ${p.cpf ? `<button class="btn ghost sm" data-f="cpf" style="padding:2px 6px" aria-label="Mostrar CPF">${ic(A.ui.revelarCpf ? 'eyeoff' : 'eye')}</button>` : ''}</div>
          <div class="campo"><small>Nascimento</small><b>${esc(p.nasc || '—')}</b>${idade(p.nasc) != null ? ` <span style="color:var(--muted)">· ${idade(p.nasc)} anos</span>` : ''}</div>
          <div class="campo"><small>Código Hiperrim</small><b class="mono">${esc(p.codigo || '—')}</b></div>
          <div class="campo"><small>Origem</small><b>${p.origem === 'csv' ? 'CSV · ' + esc((p.arquivo || '').replace(/\.csv$/i, '')) : p.origem === 'escala' ? 'Só na escala' : p.origem === 'resultado' ? 'TXT de resultados (sem pedido no CSV)' : p.origem === 'transito' ? 'Trânsito' : 'Cadastro manual'}</b></div>
          ${p.lab ? `<div class="campo"><small>Lab. cliente (CSV)</small><b>${esc(p.lab)}</b></div>` : ''}
          ${p.admissao ? `<div class="campo"><small>Admissão</small><b>${fmtData(p.admissao)}</b></div>` : ''}
          ${A.etiquetaDe && A.etiquetaDe(p) ? `<div class="campo"><small>Protocolo (etiqueta)</small><b class="mono">${esc(A.etiquetaDe(p).protocolo)}</b></div>` : ''}
          ${p.cpf ? `<div class="campo"><small>Convênio</small><button class="toggle" data-f="unimed" aria-pressed="${conv === 'unimed'}" title="Marca pelo CPF — vale todos os meses">${seloConvenio('unimed')} Unimed</button></div>` : ''}
        </div>` : ''}
        ${v ? `<div class="bloco"><h4>${ic('room')} Posição</h4><b>${esc(A.local(v))}</b>
          <div style="color:var(--muted);font-weight:700;font-size:13px;margin-top:2px">Dialisa: ${(v.dias.length ? v.dias : M.GRUPOS[v.grupo].dias).map(d => M.DIAS[d]).join(' · ')}${v.notaTransito ? ' · ' + esc(v.notaTransito) : ''}</div></div>`
        : `<div class="alerta-box">${ic('alert')}<div>${M.saiuDaClinica(p) ? esc(A.situacao(p).motivo) + (p.ultimaVaga ? ' — última posição: ' + esc(p.ultimaVaga) : '') : 'Paciente sem máquina na escala.'}</div></div>
          ${M.saiuDaClinica(p) && A.podeEditar() ? `<label class="f so-edicao" style="margin-top:10px">Tipo de saída (corrigir)<select data-f="tiposaida">${Object.entries(M.SAIDAS).map(([k, sd]) => `<option value="${k}" ${p.status === k ? 'selected' : ''}>${esc(sd.opcao)}</option>`).join('')}</select></label>` : ''}`}
        ${vinculo}
        ${p ? `<div class="bloco"><h4>${ic('flask')} Controles</h4><div style="display:flex;flex-wrap:wrap;gap:8px">
          ${Object.entries(M.CONTROLES).map(([k, c]) => `<button class="toggle" style="--cor:${c.cor}" data-f="controle" data-k="${k}" aria-pressed="${!!(p.controles && p.controles[k])}"><span class="k" style="--cor:${c.cor}">${c.sigla}</span>${c.rotulo}</button>`).join('')}
        </div></div>` : ''}
        <div class="bloco"><h4>${ic('drop')} Bateria ${esc(b.rotulo)} · ${esc(A.nomeRef())}</h4>
          ${st.coleta ? `<div style="font-weight:900;margin-bottom:8px"><span class="mono" style="font-size:22px;color:${b.cor}">${exames.length}</span> exames</div>
            <div class="exames">${exames.map(cod => { const extra = !b.exames.includes(cod); const k = Object.values(M.CONTROLES).find(c => c.exame === cod); return `<span class="tag-exame ${extra ? 'extra' : ''} ${(b.aConfirmar || []).includes(cod) ? 'conf' : ''}" style="${k ? '--cor:' + k.cor : ''}" title="${esc(M.EXAMES[cod].nome)}">${cod}</span>`; }).join('')}</div>`
          : `<div class="alerta-box">${ic(st.ic || 'info')}<div><b>Não cadastrar neste mês.</b><br>${esc(st.motivo)}</div></div>`}
        </div>
        ${p && p.status === 'transito' && p.transito ? `<div class="bloco"><h4>${ic('route')} Trânsito</h4>Origem: <b>${esc(p.transito.origem || '—')}</b><br>Período: ${fmtData(p.transito.de)} a ${fmtData(p.transito.ate)}<br>${p.transito.incluir ? 'Incluído na bateria' : 'Fora da bateria'}</div>` : ''}
        ${blocoResultados(p)}
        ${evs.length ? `<div class="bloco"><h4>${ic('clock')} Histórico</h4>${evs.map(A.movHtml).join('')}</div>` : ''}
      </div>
      <div class="pe">
        ${v ? `<button class="btn sm" data-f="transferir">${ic('swap')} Transferir</button>` : ''}
        ${p && p.status === 'internado' ? `<button class="btn sm pri" data-f="retorno">${ic('check')} Registrar retorno</button>` : (v ? `<button class="btn sm" data-f="internar">${ic('bed')} Internar</button>` : '')}
        ${v && (!p || p.status !== 'obito') ? `<button class="btn sm" data-f="obito">${ic('userx')} Óbito / saída</button>` : ''}
        ${p && !p.admissao && v ? `<button class="btn sm ghost" data-f="admissao">${ic('userplus')} Marcar admissão</button>` : ''}
      </div>`;
    g.dataset.vaga = v ? v.id : ''; g.dataset.pid = p ? p.id : '';
    g.onclick = e => {
      const b2 = e.target.closest('[data-f]'); if (!b2 || b2.tagName === 'SELECT') return;
      acaoFicha(b2.dataset.f, b2, v, p);
    };
    g.onchange = e => {
      if (e.target.dataset.f === 'trocar' && e.target.value) acaoFicha('trocar', e.target, v, p);
      if (e.target.dataset.f === 'tiposaida') acaoFicha('tiposaida', e.target, v, p);
    };
    abrirCamada(g);
  }

  function blocoResultados(p) {
    if (!p || !A.historicoResultados || !A.R || !A.R.lotes.length) return '';
    const hist = A.historicoResultados(p.cpf || p.id, p.nome);
    if (!hist.length) return `<div class="bloco"><h4>${ic('drop')} Resultados</h4><span class="faint">Sem resultados no TXT importado.</span></div>`;
    const u = hist[hist.length - 1], cods = ['urr', '016', '004', '006', '034', '029'];
    const cor = c => { const k = M.classificar(c, u.val[c]); return !k || k === 'ok' ? 'var(--text)' : k.startsWith('crit') ? 'var(--crit)' : k === 'baixo' ? 'var(--blue)' : 'var(--warn)'; };
    return `<div class="bloco"><h4>${ic('drop')} Resultados · ${esc(A.rotComp(u.comp))}</h4>
      <div class="mini-res">${cods.filter(c => u.val[c]).map(c => `<div><small>${esc(M.defRes(c).curto)}</small><b style="color:${cor(c)}">${u.val[c].n != null ? u.val[c].n.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : esc(u.val[c].t)}</b></div>`).join('')}</div>
      <a class="btn sm" style="margin-top:10px" href="#/paciente/${encodeURIComponent(hist[hist.length - 1].p.chave)}">${ic('chart')} Ficha completa e histórico (${hist.length} ${hist.length === 1 ? 'mês' : 'meses'})</a></div>`;
  }

  function acaoFicha(f, el, v, p) {
    const reabrir = () => abrirFicha(v ? v.id : null, v ? null : p && p.id);
    if (f === 'fechar') return fechar();
    if (f === 'cpf') { A.ui.revelarCpf = !A.ui.revelarCpf; return reabrir(); }
    if (f === 'tiposaida') {
      if (!A.podeEditar()) return A.toast('Seu usuário só visualiza.', 'shield');
      const novo = el.value; if (!p || !M.SAIDAS[novo] || novo === p.status) return;
      const antes = p.status, data = M.dataSaida(p);
      A.marcar('tipo de saída');
      p.status = novo;
      if (novo === 'obito') { p.obitoEm = data; delete p.saiuEm; } else { p.saiuEm = data; delete p.obitoEm; }
      A.evento(novo === 'saiu' ? 'retorno' : novo, p.id, `${nomeCurto(p.nome)}: saída corrigida de “${M.STATUS[antes].rotulo}” para “${M.STATUS[novo].rotulo}” (${fmtData(data)})`);
      A.salvar(); A.render(); A.toast(`Saída de ${nomeCurto(p.nome)}: ${M.STATUS[novo].rotulo}`, 'userx', true);
      return reabrir();
    }
    if (!A.podeEditar()) return A.toast('Seu usuário só visualiza.', 'shield');
    if (f === 'confirmar') { confirmarVinculo(v.id); return reabrir(); }
    if (f === 'desvincular') { trocarVinculo(v.id, ''); return reabrir(); }
    if (f === 'cadsem') return cadastrarSemPedido(v.id);
    if (f === 'remover') { fechar(); return removerDaEscala(v.id); }
    if (f === 'travar') { travarVaga(v.id); return reabrir(); }
    if (f === 'destravar') return pedirDestravar(v.id, reabrir);
    if (f === 'unimed') {
      A.marcar('convênio'); A.definirConvenio(p.cpf, A.convenioDe(p) === 'unimed' ? null : 'unimed'); A.salvar(); A.render();
      A.toast(A.convenioDe(p) ? `${nomeCurto(p.nome)}: convênio Unimed` : `${nomeCurto(p.nome)}: sem convênio marcado`, 'tag', true);
      return reabrir();
    }
    if (f === 'trocar') { if (el.value === '*') return modalVincular(v.id); trocarVinculo(v.id, el.value); return reabrir(); }
    if (f === 'controle') {
      A.marcar('controle'); const k = el.dataset.k; p.controles = p.controles || {}; p.controles[k] = !p.controles[k];
      A.evento('controle', p.id, `${nomeCurto(p.nome)}: ${M.CONTROLES[k].rotulo} ${p.controles[k] ? 'ativado' : 'desativado'}`);
      A.salvar(); A.render(); return reabrir();
    }
    if (f === 'retorno') { A.marcar('retorno'); p.status = 'ativo'; A.evento('retorno', p.id, `${nomeCurto(p.nome)} retornou da internação — volta a coletar`); A.salvar(); A.render(); A.toast('Retorno registrado', 'check', true); return reabrir(); }
    if (['transferir', 'internar', 'obito', 'admissao'].includes(f)) return abrirFerramenta(f, { origem: v && v.id });
  }

  // ================= camadas (gaveta / modal) =================
  function abrirCamada(el) {
    $('#veu').classList.add('on'); el.classList.add('on'); el.setAttribute('aria-hidden', 'false');
    $('#veu').onclick = fechar;
    setTimeout(() => { const f = el.querySelector('input,select,button:not([data-f="fechar"])'); if (f && el.id === 'modal') f.focus(); }, 60);
  }
  function fechar() {
    ['#gaveta', '#modal'].forEach(s => { const el = $(s); el.classList.remove('on'); el.setAttribute('aria-hidden', 'true'); });
    $('#veu').classList.remove('on');
  }
  function fecharModal() {
    const m = $('#modal'); m.classList.remove('on'); m.setAttribute('aria-hidden', 'true');
    if (!$('#gaveta').classList.contains('on')) $('#veu').classList.remove('on');
  }

  /** Modal genérico: botões com acao(form) → true fecha. */
  function abrirModal({ titulo: t, ic: icn, cor, corpo, botoes, aoAbrir }) {
    const m = $('#modal');
    m.innerHTML = `<form novalidate><header><span class="ic" style="--cor:${cor}">${ic(icn)}</span><h3>${esc(t)}</h3></header>
      <div class="corpo">${corpo}</div>
      <footer>${botoes.map((b, i) => `<button type="${b.acao ? 'submit' : 'button'}" class="btn ${b.cls || ''}" data-b="${i}">${b.ic ? ic(b.ic) : ''}${esc(b.rot)}</button>`).join('')}</footer></form>`;
    const form = m.querySelector('form');
    let acionado = null;
    m.querySelectorAll('[data-b]').forEach(el => el.onclick = () => { acionado = botoes[+el.dataset.b]; if (!acionado.acao) fecharModal(); });
    form.onsubmit = e => {
      e.preventDefault();
      const b = acionado || botoes.find(x => x.acao); acionado = null;
      if (b && b.acao) { const ok = b.acao(form); if (ok !== false) fecharModal(); }
    };
    if (aoAbrir) aoAbrir(m, form);
    abrirCamada(m);
  }
  function erroCampo(form, nome, msg) {
    const el = form.querySelector(`[name="${nome}"]`);
    let e = el.parentElement.querySelector('.erro'); if (!e) { e = document.createElement('span'); e.className = 'erro'; el.parentElement.appendChild(e); }
    e.textContent = msg; el.focus(); return false;
  }

  // seletor de destino (salão → turno → dias → máquina)
  function htmlDestino(pref, padrao = {}) {
    return `<div class="linha-f t3">
      <label class="f">Salão<select name="${pref}salao">${A.saloes().map(s => `<option value="${s}" ${padrao.salao === s ? 'selected' : ''}>Salão ${s}</option>`).join('')}</select></label>
      <label class="f">Turno<select name="${pref}turno">${['M', 'T', 'N'].map(t => `<option value="${t}" ${padrao.turno === t ? 'selected' : ''}>${A.rotTurno(t)}</option>`).join('')}</select></label>
      <label class="f">Dias<select name="${pref}grupo">${['SQS', 'TQS'].map(g => `<option value="${g}" ${padrao.grupo === g ? 'selected' : ''}>${M.GRUPOS[g].rotulo}</option>`).join('')}</select></label>
    </div><label class="f">Máquina<select name="${pref}vaga"></select></label>`;
  }
  function ligarDestino(form, pref, { soLivres, excluir, padraoVaga } = {}) {
    const atualizar = () => {
      const s = +form[pref + 'salao'].value, t = form[pref + 'turno'].value, g = form[pref + 'grupo'].value;
      const vs = E().vagas.filter(v => v.salao === s && v.turno === t && v.grupo === g && v.id !== excluir).sort((a, b) => a.pos - b.pos);
      const ops = vs.map(v => {
        const oc = A.ocupada(v), podeEscala = soLivres === 'escala' && oc && (!v.pacienteId || ['escala', 'resultado'].includes((A.pacDe(v) || {}).origem));
        if (soLivres && oc && !podeEscala) return '';
        return `<option value="${v.id}" ${v.id === padraoVaga ? 'selected' : ''}>Máq ${v.maq} — ${oc ? esc(A.nomeExibicao(v)) + (soLivres ? ' (só na escala)' : ' · troca de lugar') : 'livre'}</option>`;
      }).join('');
      form[pref + 'vaga'].innerHTML = ops || '<option value="">Nenhuma vaga livre aqui</option>';
    };
    ['salao', 'turno', 'grupo'].forEach(k => form[pref + k].addEventListener('change', atualizar));
    atualizar();
  }
  function htmlPacientes(nome, filtro) {
    const vs = E().vagas.filter(v => A.ocupada(v) && !(v.match && v.match.duplicadaDe) && (!filtro || filtro(v))).sort(A.ordemRelatorio);
    return `<label class="f">Paciente<input name="${nome}" list="dl-${nome}" placeholder="Digite o nome ou a máquina…" autocomplete="off">
      <datalist id="dl-${nome}">${vs.map(v => `<option value="${esc(A.nomeExibicao(v) + ' — ' + A.local(v, true))}" data-id="${v.id}"></option>`).join('')}</datalist></label>`;
  }
  const lerPaciente = (form, nome) => { const val = form[nome].value; const o = Array.from(form.querySelectorAll(`#dl-${nome} option`)).find(op => op.value === val); return o ? o.dataset.id : null; };
  const padraoDe = ctx => { const v = ctx.origem ? A.vagaPor(ctx.origem) : ctx.destino ? A.vagaPor(ctx.destino) : null; return v ? { salao: v.salao, turno: v.turno, grupo: v.grupo } : { salao: ctx.salao, turno: ctx.turno, grupo: 'SQS' }; };

  // ================= FERRAMENTAS =================
  function abrirFerramenta(tipo, ctx = {}) {
    const pad = padraoDe(ctx);
    const campoPac = (nome, filtro) => ctx.origem
      ? `<div class="bloco" style="padding:10px 12px"><small style="color:var(--faint);font-weight:800">PACIENTE</small><br><b>${esc(A.nomeExibicao(A.vagaPor(ctx.origem)))}</b> <span style="color:var(--muted)">· ${esc(A.local(A.vagaPor(ctx.origem), true))}</span></div>`
      : htmlPacientes(nome, filtro);
    const pegar = (form, nome) => ctx.origem || lerPaciente(form, nome);

    if (tipo === 'transferir') {
      abrirModal({
        titulo: 'Transferir paciente', ic: 'swap', cor: 'var(--blue)',
        corpo: `${campoPac('pac')}
          <div class="alerta-box info">${ic('info')}<div>Se a máquina de destino estiver ocupada, os dois <b>trocam de lugar</b>. Dá para desfazer.</div></div>
          ${htmlDestino('d', pad)}
          <div class="linha-f"><label class="f">Data<input type="date" name="data" value="${hojeISO()}"></label><label class="f">Motivo (opcional)<input name="motivo" placeholder="ex.: troca de turno a pedido"></label></div>`,
        botoes: [{ rot: 'Cancelar' }, { rot: 'Transferir', cls: 'pri', ic: 'swap', acao: f => {
          const o = pegar(f, 'pac'); if (!o) return erroCampo(f, 'pac', 'Escolha um paciente da lista.');
          if (!f.dvaga.value) return erroCampo(f, 'dvaga', 'Escolha a máquina de destino.');
          if (f.dvaga.value === o) return erroCampo(f, 'dvaga', 'Destino igual à origem.');
          fechar(); transferir(o, f.dvaga.value, f.motivo.value.trim());
        } }],
        aoAbrir: (m, f) => ligarDestino(f, 'd', { excluir: ctx.origem, padraoVaga: ctx.destino }),
      });
    }

    if (tipo === 'internar') {
      abrirModal({
        titulo: 'Registrar internação', ic: 'bed', cor: 'var(--warn)',
        corpo: `${campoPac('pac', v => { const p = A.pacDe(v); return !p || p.status === 'ativo'; })}
          <label class="f">Internado desde<input type="date" name="data" value="${hojeISO()}"></label>
          <div class="alerta-box">${ic('info')}<div>Internados <b>não entram nas baterias</b> até o retorno. A máquina continua reservada para ele.</div></div>`,
        botoes: [{ rot: 'Cancelar' }, { rot: 'Internar', cls: 'pri', ic: 'bed', acao: f => {
          const id = pegar(f, 'pac'); if (!id) return erroCampo(f, 'pac', 'Escolha um paciente da lista.');
          const v = A.vagaPor(id); A.marcar('internação'); const p = garantirPaciente(v);
          p.status = 'internado'; p.internadoDesde = f.data.value || hojeISO();
          A.evento('internacao', p.id, `${nomeCurto(p.nome)} internado em ${fmtData(p.internadoDesde)} (${A.local(v, true)})`);
          fechar(); A.salvar(); A.render(); flash([v.id]); A.toast(`${nomeCurto(p.nome)} marcado como internado`, 'bed', true);
        } }],
      });
    }

    if (tipo === 'obito') {
      abrirModal({
        titulo: 'Óbito ou saída da clínica', ic: 'userx', cor: 'var(--muted)',
        corpo: `${campoPac('pac')}
          <div class="linha-f"><label class="f">Tipo<select name="tipo">${Object.entries(M.SAIDAS).map(([k, s]) => `<option value="${k}">${esc(s.opcao)}</option>`).join('')}</select></label>
          <label class="f">Data<input type="date" name="data" value="${hojeISO()}"></label></div>
          <div class="alerta-box">${ic('alert')}<div>A máquina fica <b>livre</b> e o paciente sai das baterias. O registro fica no histórico. Dá para desfazer logo em seguida.</div></div>`,
        botoes: [{ rot: 'Cancelar' }, { rot: 'Registrar', cls: 'rim', ic: 'check', acao: f => {
          const id = pegar(f, 'pac'); if (!id) return erroCampo(f, 'pac', 'Escolha um paciente da lista.');
          fechar(); registrarSaida(id, f.tipo.value, f.data.value || hojeISO());
        } }],
      });
    }

    if (tipo === 'admissao' && ctx.origem) {          // marcar admissão de quem já está na máquina
      const v = A.vagaPor(ctx.origem);
      abrirModal({
        titulo: 'Marcar admissão', ic: 'userplus', cor: 'var(--teal)',
        corpo: `<div class="bloco" style="padding:10px 12px"><b>${esc(A.nomeExibicao(v))}</b> · ${esc(A.local(v, true))}</div>
          <label class="f">Data da admissão<input type="date" name="data" value="${hojeISO()}"></label>
          ${textoAdmissional()}
          <label style="display:flex;gap:8px;align-items:center;font-weight:800"><input type="checkbox" name="jaColetado"> Admissional já foi coletado (não entra nesta lista)</label>`,
        botoes: [{ rot: 'Cancelar' }, { rot: 'Salvar', cls: 'pri', ic: 'check', acao: f => {
          A.marcar('admissão'); const p = garantirPaciente(v); p.admissao = f.data.value || hojeISO(); p.admColetado = f.jaColetado.checked;
          A.evento('admissao', p.id, `${nomeCurto(p.nome)}: admissão em ${fmtData(p.admissao)}`);
          fechar(); A.salvar(); A.render(); flash([v.id]); A.toast('Admissão registrada', 'userplus', true);
        } }],
      });
      return;
    }

    if (tipo === 'admissao' || tipo === 'transito') {
      const tr = tipo === 'transito';
      const vEsc = ctx.destino && A.vagaPor(ctx.destino);
      abrirModal({
        titulo: tr ? 'Paciente em trânsito' : 'Admissão de paciente novo', ic: tr ? 'route' : 'userplus', cor: tr ? 'var(--c5)' : 'var(--teal)',
        corpo: `<label class="f">Nome completo<input name="nome" required value="${esc(ctx.nome || '')}" placeholder="Como está no documento"></label>
          <div class="linha-f"><label class="f">CPF${tr ? ' (opcional)' : ''}<input name="cpf" inputmode="numeric" placeholder="000.000.000-00"></label><label class="f">Nascimento<input type="date" name="nasc"></label></div>
          ${tr ? `<label class="f">Vem de (clínica / cidade)<input name="origem" placeholder="ex.: Clínica do Rim — Dourados"></label>
            <div class="linha-f"><label class="f">De<input type="date" name="de" value="${hojeISO()}"></label><label class="f">Até<input type="date" name="ate"></label></div>
            <label style="display:flex;gap:8px;align-items:center;font-weight:800"><input type="checkbox" name="incluir"> Incluir na bateria do mês</label>`
          : `<label class="f">Data da admissão<input type="date" name="adm" value="${hojeISO()}"></label>
            ${textoAdmissional()}
            <label style="display:flex;gap:8px;align-items:center;font-weight:800"><input type="checkbox" name="jaColetado"> Admissional já foi coletado (não entra nesta lista)</label>`}
          ${htmlDestino('d', pad)}`,
        botoes: [{ rot: 'Cancelar' }, { rot: tr ? 'Colocar em trânsito' : 'Admitir', cls: 'pri', ic: 'check', acao: f => {
          const nome = f.nome.value.trim().replace(/\s+/g, ' ');
          if (nome.split(' ').length < 2) return erroCampo(f, 'nome', 'Informe nome e sobrenome.');
          const cpf = M.soDigitos(f.cpf.value);
          if ((cpf || !tr) && !cpfValido(cpf)) return erroCampo(f, 'cpf', 'CPF inválido (confira os dígitos).');
          if (cpf && E().pacientes[cpf] && E().pacientes[cpf].vagaId) return erroCampo(f, 'cpf', 'Este CPF já está na escala: ' + A.local(A.vagaPor(E().pacientes[cpf].vagaId), true));
          if (!f.dvaga.value) return erroCampo(f, 'dvaga', 'Escolha uma máquina livre.');
          const nasc = f.nasc.value ? f.nasc.value.split('-').reverse().join('/') : '';
          const dados = { nome: nome.toUpperCase(), cpf, nasc };
          if (tr) Object.assign(dados, { status: 'transito', origem: 'transito', transito: { origem: f.origem.value.trim(), de: f.de.value, ate: f.ate.value, incluir: f.incluir.checked } });
          else Object.assign(dados, { origem: 'manual', admissao: f.adm.value || hojeISO(), admColetado: f.jaColetado.checked, controles: { glic: false, cr: false, hbgl: false } });
          fechar(); alocarNovo(dados, f.dvaga.value, tr);
        } }],
        aoAbrir: (m, f) => ligarDestino(f, 'd', { soLivres: 'escala', padraoVaga: ctx.destino || (vEsc && vEsc.id) }),
      });
    }
  }

  function modalVincular(vagaId) {
    const v = A.vagaPor(vagaId);
    const lista = Object.values(E().pacientes).filter(p => p.origem === 'csv').map(p => ({ p, s: M.pontuar(v.nomeEscala, p.nome) })).sort((a, b) => b.s - a.s);
    abrirModal({
      titulo: 'Vincular a paciente do CSV', ic: 'link', cor: 'var(--blue)',
      corpo: `<div>Na escala: <span class="escala-nome">${esc(v.nomeEscala)}</span> · ${esc(A.local(v, true))}</div>
        <label class="f">Paciente do CSV<input name="p" list="dl-vinc" placeholder="Digite parte do nome ou CPF…" autocomplete="off">
        <datalist id="dl-vinc">${lista.map(({ p, s }) => `<option value="${esc(p.nome)} · ${mascCpf(p.cpf)}" data-id="${p.id}">${Math.round(s * 100)}% · ${M.GRUPOS[p.grupo].curto} ${A.rotTurno(p.turno)}${p.vagaId ? ' · já em ' + A.local(A.vagaPor(p.vagaId), true) : ''}</option>`).join('')}</datalist></label>`,
      botoes: [{ rot: 'Cancelar' }, { rot: 'Vincular', cls: 'pri', ic: 'link', acao: f => {
        const o = Array.from(f.querySelectorAll('#dl-vinc option')).find(op => op.value === f.p.value);
        if (!o) return erroCampo(f, 'p', 'Escolha um paciente da lista.');
        trocarVinculo(vagaId, o.dataset.id); abrirFicha(vagaId);
      } }],
    });
  }

  // ================= AÇÕES =================
  function textoAdmissional() {
    const b = M.BATERIAS.admissional;
    return `<div class="alerta-box info">${ic('info')}<div><b>Bateria admissional: ${b.qtd} exames</b> — a anual sem a ureia pós-diálise (glicose, creatinina e Hb glicada já estão dentro).
      Entra <b>nesta lista</b> no lugar da bateria do mês; no mês seguinte volta ao normal. Em janeiro faz a anual completa.
      <details style="margin-top:6px"><summary style="cursor:pointer;font-weight:800">Ver os ${b.qtd} exames</summary><div class="exames" style="margin-top:6px">${b.exames.map(c => `<span class="tag-exame" title="${esc(M.EXAMES[c].nome)}">${c}</span>`).join('')}</div></details></div></div>`;
  }

  /** Quem está na escala sem pedido no CSV: cadastra com nome/CPF/nascimento e a bateria escolhida, entra na sequência normal. */
  function cadastrarSemPedido(vagaId) {
    const v = A.vagaPor(vagaId), ant = A.pacDe(v);
    const sugerido = ant && ant.origem === 'resultado' ? ant.nome : M.tokensAbrev(v.nomeEscala).join(' ');
    const padrao = M.BATERIAS_MANUAIS.includes(A.tipoRef()) ? A.tipoRef() : 'mensal';
    abrirModal({
      titulo: 'Cadastrar sem pedido no CSV', ic: 'userplus', cor: 'var(--blue)',
      corpo: `<div>Na escala: <span class="escala-nome">${esc(v.nomeEscala)}</span> · ${esc(A.local(v, true))}</div>
        <label class="f">Nome completo<input name="nome" value="${esc(sugerido)}" placeholder="Como está no documento"></label>
        <div class="linha-f"><label class="f">CPF (opcional)<input name="cpf" inputmode="numeric" placeholder="000.000.000-00" value="${esc(ant && ant.cpf ? ant.cpf : '')}"></label><label class="f">Nascimento (opcional)<input type="date" name="nasc"></label></div>
        <label class="f">Bateria<select name="bat">${M.BATERIAS_MANUAIS.map(t => `<option value="${t}" ${t === padrao ? 'selected' : ''}>${M.BATERIAS[t].rotulo} (${M.BATERIAS[t].qtd} exames)</option>`).join('')}</select></label>
        <div style="display:flex;flex-wrap:wrap;gap:8px">${Object.entries(M.CONTROLES).map(([k, c]) => `<label class="toggle" style="--cor:${c.cor}"><input type="checkbox" name="k_${k}" style="accent-color:${c.cor}"> ${c.rotulo}</label>`).join('')}</div>
        <div class="alerta-box info">${ic('info')}<div>Entra no <b>relatório de cadastro na posição desta máquina</b>, marcado como “sem pedido no CSV da Hiperrim”.${v.riscado ? ' O nome estava <b>riscado</b> no Word — cadastrar indica que o paciente continua.' : ''}</div></div>`,
      botoes: [{ rot: 'Cancelar' }, { rot: 'Cadastrar', cls: 'pri', ic: 'check', acao: f => {
        const dados = { nome: f.nome.value, cpf: f.cpf.value, nasc: f.nasc.value ? f.nasc.value.split('-').reverse().join('/') : '',
          bateria: f.bat.value, controles: Object.fromEntries(Object.keys(M.CONTROLES).map(k => [k, f['k_' + k].checked])) };
        const erro = validarSemPedido(v, dados);
        if (erro) return erroCampo(f, erro.campo, erro.msg);
        A.marcar('cadastro sem pedido');
        const p = criarSemPedido(v, dados);
        fechar(); A.salvar(); A.render(); flash([v.id]);
        A.toast(`${nomeCurto(p.nome)} entra no relatório · bateria ${M.BATERIAS[p.bateriaManual].rotulo}`, 'userplus', true);
      } }],
    });
  }

  /** Confere os dados de um cadastro sem pedido. Devolve {campo, msg} ou null. Usado pelo modal e pela planilha de pendentes. */
  function validarSemPedido(v, d) {
    const nome = String(d.nome || '').trim().replace(/\s+/g, ' ');
    if (nome.split(' ').length < 2) return { campo: 'nome', msg: 'Informe nome e sobrenome.' };
    const cpf = M.soDigitos(d.cpf || '');
    if (cpf && !cpfValido(cpf)) return { campo: 'cpf', msg: 'CPF inválido (confira os dígitos).' };
    const existe = cpf && E().pacientes[cpf];
    if (existe && existe.origem === 'csv') return { campo: 'cpf', msg: 'Este CPF já veio no CSV — use “Vincular”.' };
    if (existe && existe.vagaId && existe.vagaId !== v.id) return { campo: 'cpf', msg: 'Este CPF já está em ' + A.local(A.vagaPor(existe.vagaId), true) };
    if (d.bateria && !M.BATERIAS_MANUAIS.includes(d.bateria)) return { campo: 'bat', msg: 'Bateria inválida.' };
    return null;
  }

  /** Grava o cadastro sem pedido na máquina v (sem desfazer/render: quem chama cuida disso). Dados já validados. */
  function criarSemPedido(v, d) {
    const ant = A.pacDe(v);
    if (ant && ['escala', 'resultado'].includes(ant.origem)) delete E().pacientes[ant.id];
    const cpf = M.soDigitos(d.cpf || ''), id = cpf || uid();
    const padrao = M.BATERIAS_MANUAIS.includes(A.tipoRef()) ? A.tipoRef() : 'mensal';
    const p = { id, cpf, nome: String(d.nome).trim().replace(/\s+/g, ' ').toUpperCase(), nasc: d.nasc || '', codigo: '', origem: 'manual', semPedido: true,
      bateriaManual: d.bateria || padrao, status: 'ativo', controles: d.controles || { glic: false, cr: false, hbgl: false }, vagaId: v.id, grupo: v.grupo, turno: v.turno };
    E().pacientes[id] = p;
    v.pacienteId = id; v.match = { conf: 'manual', score: null }; v.riscado = false;
    const tvAnt = A.travaDe(v); if (tvAnt) A.destravar(tvAnt);   // cadastrar = decidiu que coleta aqui
    E().apelidos[M.chaveApelido(v.nomeEscala, v.grupo, v.turno)] = id;
    A.evento('cadastro', id, `Cadastrado sem pedido no CSV: ${p.nome} (${A.local(v, true)}) — bateria ${M.BATERIAS[p.bateriaManual].rotulo}${d.origem ? ' · ' + d.origem : ''}`);
    return p;
  }

  /** Esvazia a máquina (sem desfazer/render). */
  function liberarVaga(v) {
    const p = A.pacDe(v), nome = A.nomeExibicao(v), onde = A.local(v, true);
    if (p && ['escala', 'resultado'].includes(p.origem)) delete E().pacientes[p.id]; else if (p) p.vagaId = null;
    Object.assign(v, JSON.parse(JSON.stringify(VAZIO)));
    A.evento('remocao', null, `Removido da escala: ${nome} (${onde}) — máquina livre`);
    return { nome, onde };
  }

  /** Selo pequeno do convênio (mesmo formato dos selos da máquina). */
  function seloConvenio(conv) {
    const c = M.CONVENIOS[conv]; if (!c) return '';
    return `<span class="st conv" style="--cor:${c.cor}" title="Convênio ${esc(c.rotulo)}"><img src="${c.logo}" alt="${esc(c.rotulo)}" width="14" height="14"></span>`;
  }

  /** Trava a pessoa como "outro laboratório" (vale nos próximos meses). */
  function travarVaga(vagaId) {
    const v = A.vagaPor(vagaId); if (!v || !A.ocupada(v)) return;
    A.marcar('travar ' + A.nomeExibicao(v));
    A.travar(v); A.salvar(); A.render();
    A.toast(`${A.nomeExibicao(v)} travado: outro laboratório`, 'lock', true);
  }

  /** Cadeado: confirma antes de liberar. */
  function pedirDestravar(vagaId, depois) {
    const v = A.vagaPor(vagaId), t = v && A.travaDe(v); if (!t) return;
    if (!A.podeEditar()) return A.toast('Seu usuário só visualiza.', 'shield');
    abrirModal({
      titulo: 'Destravar paciente', ic: 'unlock', cor: 'var(--warn)',
      corpo: `<div><b>${esc(A.nomeExibicao(v))}</b> · ${esc(A.local(v, true))}</div>
        <div class="alerta-box">${ic('lock')}<div>Travado como <b>outro laboratório</b> desde ${fmtData(t.desde)}.
        Ao destravar, volta para as pendências e, se estiver no CSV da Hiperrim, entra no relatório de cadastro.</div></div>`,
      botoes: [{ rot: 'Manter travado' }, { rot: 'Destravar', cls: 'pri', ic: 'unlock', acao: () => {
        A.marcar('destravar ' + A.nomeExibicao(v)); A.destravar(t); fecharModal(); A.salvar(); A.render();
        if (depois) depois();
        A.toast(`${A.nomeExibicao(v)} destravado`, 'unlock', true);
      } }],
    });
  }

  /** Tira o nome da escala (libera a máquina). Usado para limpar quem não deveria estar lá. */
  function removerDaEscala(vagaId) {
    const v = A.vagaPor(vagaId);
    A.marcar('remoção de ' + A.nomeExibicao(v));
    const { nome, onde } = liberarVaga(v);
    A.salvar(); A.render();
    A.toast(`${nome} removido · ${onde} livre`, 'x', true);
  }

  function garantirPaciente(v) {
    if (v.pacienteId && E().pacientes[v.pacienteId]) return E().pacientes[v.pacienteId];
    const id = uid();
    E().pacientes[id] = { id, cpf: '', nome: (v.nomeEscala || '').toUpperCase(), nasc: '', codigo: '', origem: 'escala', status: 'ativo', controles: { glic: false, cr: false, hbgl: false }, vagaId: v.id, grupo: v.grupo, turno: v.turno };
    v.pacienteId = id; v.match = { conf: 'manual', score: null, soEscala: true };
    return E().pacientes[id];
  }

  function mover(o, d) {
    const tmp = {};
    OCUPANTE.forEach(k => { tmp[k] = d[k]; d[k] = o[k]; o[k] = tmp[k]; });
    [o, d].forEach(v => {
      if (v.dias && v.dias.length && !v.dias.every(x => M.GRUPOS[v.grupo].dias.includes(x))) v.dias = M.GRUPOS[v.grupo].dias.slice();
      const p = A.pacDe(v); if (p && !(v.match && v.match.duplicadaDe)) { p.vagaId = v.id; p.grupo = v.grupo; p.turno = v.turno; }
    });
  }

  function transferir(oId, dId, motivo) {
    const o = A.vagaPor(oId), d = A.vagaPor(dId);
    const nO = A.nomeExibicao(o), nD = A.ocupada(d) ? A.nomeExibicao(d) : null;
    const lo = A.local(o, true), ld = A.local(d, true);
    A.marcar('transferência de ' + nO);
    mover(o, d);
    if (o.grupo !== d.grupo) d.dias = M.GRUPOS[d.grupo].dias.slice();
    A.evento('transferencia', d.pacienteId, `${nO}: ${lo} → ${ld}${nD ? ` (trocou com ${nD})` : ''}${motivo ? ' · ' + motivo : ''}`);
    A.salvar(); A.render(); flash([o.id, d.id]);
    A.toast(nD ? `${nO} ⇄ ${nD} trocaram de lugar` : `${nO} → ${ld}`, 'swap', true);
  }

  function registrarSaida(vagaId, tipo, data) {
    const v = A.vagaPor(vagaId);
    A.marcar(tipo === 'obito' ? 'óbito' : M.STATUS[tipo] ? M.STATUS[tipo].rotulo.toLowerCase() : 'saída');
    const p = garantirPaciente(v);
    const nome = nomeCurto(p.nome), onde = A.local(v, true);
    p.status = tipo; if (tipo === 'obito') p.obitoEm = data; else p.saiuEm = data;
    p.ultimaVaga = onde; p.vagaId = null;
    E().vagas.filter(x => x.pacienteId === p.id).forEach(x => Object.assign(x, JSON.parse(JSON.stringify(VAZIO))));
    const txtSaida = {
      obito: `Óbito: ${nome} em ${fmtData(data)}`, saiu: `${nome} saiu da clínica em ${fmtData(data)}`,
      abandono: `${nome} abandonou o tratamento em ${fmtData(data)}`, transplante: `${nome} foi transplantado(a) em ${fmtData(data)} — não faz mais diálise`,
    }[tipo] || `${nome}: saída em ${fmtData(data)}`;
    A.evento(tipo === 'saiu' ? 'retorno' : tipo, p.id, `${txtSaida} — ${onde} liberada`);
    A.salvar(); A.render(); flash([v.id]);
    A.toast(`${onde} liberada`, 'userx', true);
  }

  function alocarNovo(dados, vagaId, tr) {
    const v = A.vagaPor(vagaId);
    A.marcar(tr ? 'trânsito' : 'admissão');
    const anterior = A.pacDe(v);
    if (anterior && ['escala', 'resultado'].includes(anterior.origem)) delete E().pacientes[anterior.id];
    const id = dados.cpf && !E().pacientes[dados.cpf] ? dados.cpf : uid();
    const p = Object.assign({ id, codigo: '', status: 'ativo', controles: { glic: false, cr: false, hbgl: false }, grupo: v.grupo, turno: v.turno, vagaId: v.id }, E().pacientes[id] || {}, dados);
    p.vagaId = v.id; E().pacientes[id] = p;
    const nomeEsc = v.nomeEscala;
    Object.assign(v, JSON.parse(JSON.stringify(VAZIO)), { nomeEscala: nomeEsc || nomeCurto(p.nome), variantes: nomeEsc ? [nomeEsc] : [], dias: M.GRUPOS[v.grupo].dias.slice(), pacienteId: id, match: { conf: 'manual', score: null } });
    if (nomeEsc) E().apelidos[M.chaveApelido(nomeEsc, v.grupo, v.turno)] = id;
    A.evento(tr ? 'transito' : 'admissao', id, tr ? `${nomeCurto(p.nome)} em trânsito${p.transito.origem ? ' (de ' + p.transito.origem + ')' : ''} → ${A.local(v, true)}` : `Admissão: ${nomeCurto(p.nome)} em ${fmtData(p.admissao)} → ${A.local(v, true)}`);
    A.salvar();
    if (A.rotaAtual().r !== 'salao') location.hash = `#/salao/${v.salao}/${v.turno}`; else A.render();
    setTimeout(() => flash([v.id]), 80);
    A.toast(tr ? 'Paciente em trânsito alocado' : 'Paciente admitido', tr ? 'route' : 'userplus', true);
  }

  function confirmarVinculo(vagaId) {
    const v = A.vagaPor(vagaId), p = A.pacDe(v);
    A.marcar('confirmação de vínculo');
    E().apelidos[M.chaveApelido(v.nomeEscala, v.grupo, v.turno)] = v.pacienteId;
    v.match = Object.assign({}, v.match, { conf: 'confirmado' });
    if (v.riscado) v.match.riscoResolvido = true;
    A.evento('vinculo', p.id, `Vínculo confirmado: “${v.nomeEscala}” = ${p.nome}`);
    A.salvar(); A.render();
    A.toast('Vínculo confirmado — nos próximos meses casa sozinho', 'link', true);
  }

  function trocarVinculo(vagaId, pid) {
    const v = A.vagaPor(vagaId);
    A.marcar('troca de vínculo');
    const antigo = A.pacDe(v);
    if (antigo) { if (['escala', 'resultado'].includes(antigo.origem)) delete E().pacientes[antigo.id]; else antigo.vagaId = null; }
    if (!pid) {
      v.pacienteId = null; v.match = null;
      delete E().apelidos[M.chaveApelido(v.nomeEscala, v.grupo, v.turno)];
      A.salvar(); A.render(); A.toast('Vínculo removido', 'x', true); return;
    }
    const p = E().pacientes[pid];
    let aviso = '';
    if (p.vagaId && p.vagaId !== v.id) { const outra = A.vagaPor(p.vagaId); outra.pacienteId = null; outra.match = null; aviso = ` (saiu de ${A.local(outra, true)})`; }
    const alt = (v.alternativas || []).find(a => a.cpf === pid);
    v.pacienteId = pid; p.vagaId = v.id;
    v.match = { conf: 'confirmado', score: alt ? alt.score : M.pontuar(v.nomeEscala, p.nome) };
    E().apelidos[M.chaveApelido(v.nomeEscala, v.grupo, v.turno)] = pid;
    A.evento('vinculo', pid, `“${v.nomeEscala}” vinculado a ${p.nome}${aviso}`);
    A.salvar(); A.render(); A.toast('Vinculado a ' + nomeCurto(p.nome) + aviso, 'link', true);
  }

  function flash(ids) {
    setTimeout(() => ids.forEach(id => { const el = document.querySelector(`[data-vaga="${id}"]`); if (el) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); } }), 30);
  }

  Object.assign(A, { abrirFicha, fechar, abrirModal, abrirFerramenta, confirmarVinculo, trocarVinculo, registrarSaida, transferir, modalVincular, garantirPaciente, moverOcupante: mover, cadastrarSemPedido, removerDaEscala, validarSemPedido, criarSemPedido, liberarVaga, travarVaga, pedirDestravar, seloConvenio });
  A.views.vSalao = vSalao;
  A.ligar.salao = ligarSalao;
})(window.MED = window.MED || {});
