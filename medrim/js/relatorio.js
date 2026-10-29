/* MedRim · Relatório do período (gerencial).
   - Números atuais das máquinas: físicas, vagas da escala (máquina × turno × dias), ocupadas, vazias, por salão e por turno.
   - Movimentações no período escolhido: transferências, internações, retornos, admissões, trânsito, cadastros, travas,
     remoções (pelas movimentações registradas) e saídas da clínica — óbito, abandono, transplante, alta — pelo status
     atual de cada paciente com a data da saída (correções de tipo de saída não contam duas vezes).
   - Na versão online as movimentações do período vêm direto da nuvem (todos os meses do intervalo). */
(function (M) {
  'use strict';
  const A = M.app;
  const { $, $$, esc, ic, titulo, fmtData } = A;
  const E = () => A.E;
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const fmtDH = s => new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  const n = x => Number(x || 0).toLocaleString('pt-BR');

  const PRESETS = [['hoje', 'Hoje'], ['7d', '7 dias'], ['30d', '30 dias'], ['mes', 'Este mês'], ['mesant', 'Mês anterior'], ['90d', '90 dias'], ['ano', 'Este ano'], ['custom', 'Personalizado']];
  const RP = { preset: 'mes', de: '', ate: '', eventos: null, chave: '', carregando: false, erro: null };
  try { const s = JSON.parse(localStorage.getItem('medrim:rp') || 'null'); if (s && s.preset) Object.assign(RP, { preset: s.preset, de: s.de || '', ate: s.ate || '' }); } catch (e) { /* sem armazenamento */ }
  const guardar = () => { try { localStorage.setItem('medrim:rp', JSON.stringify({ preset: RP.preset, de: RP.de, ate: RP.ate })); } catch (e) { /* ok */ } };

  // tipos de movimentação: ordem dos cartões e das listas
  const TIPOS = {
    transferencia: { um: 'transferência', rot: 'Transferências', ic: 'swap', cor: 'var(--blue)', s: 'trocas de máquina, turno ou salão' },
    obito: { um: 'óbito', rot: 'Óbitos', ic: 'userx', cor: 'var(--muted)', s: 'saída da clínica', saida: true },
    abandono: { um: 'abandono', rot: 'Abandonos', ic: 'userx', cor: 'var(--warn)', s: 'abandonaram o tratamento', saida: true },
    transplante: { um: 'transplante', rot: 'Transplantes', ic: 'sparkle', cor: 'var(--ok)', s: 'não fazem mais diálise', saida: true },
    saiu: { um: 'alta / transf. externa', rot: 'Altas / transf. externas', ic: 'userx', cor: 'var(--c5)', s: 'saíram da clínica', saida: true },
    internacao: { um: 'internação', rot: 'Internações', ic: 'bed', cor: 'var(--warn)', s: 'saíram da bateria até o retorno' },
    retorno: { um: 'retorno', rot: 'Retornos', ic: 'check', cor: 'var(--ok)', s: 'voltaram da internação' },
    admissao: { um: 'admissão', rot: 'Admissões', ic: 'userplus', cor: 'var(--teal)', s: 'novos pacientes' },
    transito: { um: 'em trânsito', rot: 'Em trânsito', ic: 'route', cor: 'var(--c5)', s: 'pacientes de passagem' },
    cadastro: { um: 'cadastro sem pedido', rot: 'Cadastros sem pedido', ic: 'userplus', cor: 'var(--blue)', s: 'incluídos fora do CSV' },
    trava: { um: 'outro laboratório', rot: 'Outro laboratório', ic: 'lock', cor: 'var(--muted)', s: 'travados (cadeado)' },
    remocao: { um: 'removido da escala', rot: 'Removidos da escala', ic: 'x', cor: 'var(--crit)', s: 'máquina liberada' },
  };

  function periodo() {
    const h = new Date(); h.setHours(0, 0, 0, 0);
    let ini = new Date(h), fim = new Date(h);
    if (RP.preset === '7d') ini.setDate(h.getDate() - 6);
    else if (RP.preset === '30d') ini.setDate(h.getDate() - 29);
    else if (RP.preset === '90d') ini.setDate(h.getDate() - 89);
    else if (RP.preset === 'mes') ini = new Date(h.getFullYear(), h.getMonth(), 1);
    else if (RP.preset === 'mesant') { ini = new Date(h.getFullYear(), h.getMonth() - 1, 1); fim = new Date(h.getFullYear(), h.getMonth(), 0); }
    else if (RP.preset === 'ano') ini = new Date(h.getFullYear(), 0, 1);
    else if (RP.preset === 'custom') {
      if (RP.de) ini = new Date(RP.de + 'T00:00'); if (RP.ate) fim = new Date(RP.ate + 'T00:00');
      if (fim < ini) [ini, fim] = [fim, ini];
    }
    const fimDia = new Date(fim); fimDia.setHours(23, 59, 59, 999);
    const de = iso(ini), ate = iso(fim), dias = Math.round((fim - ini) / 864e5) + 1;
    const rot = PRESETS.find(p => p[0] === RP.preset);
    return { ini, fim: fimDia, de, ate, dias, chave: de + '_' + ate, rotulo: de === ate ? fmtData(de) : `${fmtData(de)} a ${fmtData(ate)}`, nome: rot ? rot[1] : '' };
  }

  async function carregarEventos(p) {
    if (RP.carregando) return;
    RP.carregando = true; RP.erro = null;
    try {
      RP.eventos = M.nuvemApi && M.nuvemApi.eventosPeriodo ? await M.nuvemApi.eventosPeriodo(p.de, p.ate) : (E().eventos || []).slice();
    } catch (e) { RP.erro = (e && e.message) || String(e); RP.eventos = (E().eventos || []).slice(); }
    RP.chave = p.chave; RP.carregando = false;
    if (/^#\/gerencial/.test(location.hash)) A.render();
  }

  // ================= números =================
  function atual() {
    const ev = E(), vagas = ev.vagas, oc = vagas.filter(A.ocupada);
    const saloes = A.saloes();
    const porSalao = saloes.map(s => { const vs = vagas.filter(v => v.salao === s); return { s, total: vs.length, oc: vs.filter(A.ocupada).length, maqs: new Set(vs.map(v => v.maq)).size }; });
    const grade = saloes.map(s => ({ s, cel: ['SQS', 'TQS'].flatMap(g => ['M', 'T', 'N'].map(t => { const vs = vagas.filter(v => v.salao === s && v.grupo === g && v.turno === t); return { g, t, total: vs.length, oc: vs.filter(A.ocupada).length }; })) }));
    const principais = oc.filter(v => !(v.match && v.match.duplicadaDe));
    const pacs = principais.map(A.pacDe).filter(Boolean);
    const P = Object.values(ev.pacientes || {});
    return {
      maquinas: new Set(vagas.map(v => v.salao + '-' + v.maq)).size, vagas: vagas.length, ocupadas: oc.length, vazias: vagas.length - oc.length,
      pct: vagas.length ? Math.round(oc.length / vagas.length * 1000) / 10 : 0,
      naEscala: principais.length, coletam: pacs.filter(p => A.situacao(p).coleta).length,
      internados: P.filter(p => p.status === 'internado'), transito: P.filter(p => p.status === 'transito'),
      travados: Object.keys(ev.travas || {}).length, unimed: Object.keys(ev.convenios || {}).length,
      porSalao, grade,
    };
  }

  const chaveEv = e => `${e.ts}|${e.tipo}|${e.texto}`;
  function movimentos(p) {
    const vistos = new Set(), evs = [];
    [...(RP.eventos || []), ...(E().eventos || [])].forEach(e => { const k = chaveEv(e); if (!vistos.has(k)) { vistos.add(k); evs.push(e); } });
    const dentro = s => { const d = new Date(s); return d >= p.ini && d <= p.fim; };
    const grupos = {}; Object.keys(TIPOS).forEach(k => { grupos[k] = []; });
    let outros = 0;
    for (const e of evs) {
      if (!e || !e.ts || !dentro(e.ts)) continue;
      let t = e.tipo;
      if (['obito', 'abandono', 'transplante', 'saida'].includes(t) || (t === 'retorno' && /saiu da clínica|saída corrigida/i.test(e.texto || ''))) continue;   // saídas: pelo status
      if (t === 'trava' && !/^Travado/.test(e.texto || '')) continue;
      if (!grupos[t]) { outros++; continue; }
      grupos[t].push({ tipo: t, ts: e.ts, dia: iso(new Date(e.ts)), texto: e.texto || '', por: e.por || '', pid: e.pid });
    }
    // saídas da clínica: status atual + data da saída dentro do período
    Object.values(E().pacientes || {}).forEach(pc => {
      if (!M.saiuDaClinica(pc)) return;
      const d = M.dataSaida(pc); if (!d || d < p.de || d > p.ate) return;
      grupos[pc.status].push({ tipo: pc.status, ts: d + 'T12:00:00', dia: d, data: d, paciente: pc, onde: pc.ultimaVaga || '' });
    });
    Object.values(grupos).forEach(l => l.sort((a, b) => b.ts.localeCompare(a.ts)));
    const total = Object.values(grupos).reduce((s, l) => s + l.length, 0);
    const saidas = ['obito', 'abandono', 'transplante', 'saiu'].reduce((s, k) => s + grupos[k].length, 0);
    return { grupos, total, saidas, outros };
  }

  // ================= peças visuais =================
  function ondaHero(w = 1200, h = 160) {
    const linha = (amp, lam, y0, fase) => { const pts = []; for (let x = -lam; x <= w + lam; x += 8) pts.push(`${x},${(y0 + amp * Math.sin(2 * Math.PI * x / lam + fase)).toFixed(1)}`); return 'M' + pts.join(' L'); };
    return `<svg class="rp-onda" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
      <g class="o a"><path d="${linha(16, 300, 96, 0)}"/></g><g class="o b"><path d="${linha(10, 300, 112, Math.PI / 2)}"/></g><g class="o c"><path d="${linha(22, 300, 70, Math.PI)}"/></g></svg>`;
  }
  const medidor = (oc, total) => `<div class="rp-medidor" role="img" aria-label="${oc} de ${total} ocupadas"><i data-w="${total ? (oc / total * 100).toFixed(1) : 0}"></i></div>`;

  function grafico(p, mv) {
    const passo = p.dias <= 31 ? 'dia' : p.dias <= 120 ? 'semana' : 'mes';
    const baldes = [];
    const d = new Date(p.ini);
    if (passo === 'semana') d.setDate(d.getDate() - ((d.getDay() + 6) % 7));        // semana começa na segunda
    if (passo === 'mes') d.setDate(1);
    while (d <= p.fim) {
      const ini = new Date(d), fim = new Date(d);
      if (passo === 'dia') fim.setDate(fim.getDate() + 1); else if (passo === 'semana') fim.setDate(fim.getDate() + 7); else fim.setMonth(fim.getMonth() + 1);
      baldes.push({ ini, fim, itens: [] });
      d.setTime(fim.getTime());
    }
    Object.values(mv.grupos).flat().forEach(it => { const t = new Date(it.ts); const b = baldes.find(x => t >= x.ini && t < x.fim); if (b) b.itens.push(it); });
    const max = Math.max(1, ...baldes.map(b => b.itens.length));
    const topo = max <= 4 ? 4 : Math.ceil(max / (max > 40 ? 10 : 2)) * (max > 40 ? 10 : 2);
    const rotB = b => passo === 'mes' ? M.MESES[b.ini.getMonth()].slice(0, 3) + '/' + String(b.ini.getFullYear()).slice(2)
      : `${String(b.ini.getDate()).padStart(2, '0')}/${String(b.ini.getMonth() + 1).padStart(2, '0')}`;
    const cada = Math.max(1, Math.ceil(baldes.length / 12));
    const iMax = baldes.findIndex(b => b.itens.length === max && max > 0);
    const col = (b, i) => {
      const cont = {}; b.itens.forEach(x => { cont[x.tipo] = (cont[x.tipo] || 0) + 1; });
      const det = Object.entries(cont).sort((a, c) => c[1] - a[1]).map(([k, v]) => `${v}\u00a0${v === 1 ? TIPOS[k].um : TIPOS[k].rot.toLowerCase()}`).join(' · ');
      const rot = passo === 'semana' ? `Semana de ${rotB(b)}` : passo === 'mes' ? M.MESES[b.ini.getMonth()] + '/' + b.ini.getFullYear() : rotB(b);
      const h = b.itens.length / topo * 100;
      return `<div class="rp-col" tabindex="0" data-dica="${esc(`${rot}: ${b.itens.length} ${b.itens.length === 1 ? 'movimentação' : 'movimentações'}${det ? ' — ' + det : ''}`)}">
        <span class="area"><span class="barra" style="--h:${h.toFixed(2)}%;--i:${i}">${i === iMax ? `<b>${b.itens.length}</b>` : ''}</span></span>
        <small${(i / cada) % 2 === 1 ? ' class="alt"' : ''}>${i % cada === 0 ? rotB(b) : ''}</small></div>`;
    };
    const rotPasso = { dia: 'por dia', semana: 'por semana', mes: 'por mês' }[passo];
    return `<div class="rp-grafico" role="img" aria-label="Movimentações ${rotPasso} no período: ${mv.total} no total; pico de ${max} em ${iMax >= 0 ? rotB(baldes[iMax]) : '—'}">
      <div class="rp-eixo"><span style="bottom:202px">${n(topo)}</span><span style="bottom:112px">${n(topo / 2)}</span><span style="bottom:22px">0</span></div>
      <div class="rp-plot"><i class="g" style="bottom:202px"></i><i class="g" style="bottom:112px"></i><i class="g base" style="bottom:22px"></i>
        <div class="rp-cols">${baldes.map(col).join('')}</div><div class="rp-dica" hidden></div></div>
    </div><p class="desc" style="margin:6px 0 0">Movimentações ${rotPasso} (todas as categorias acima).<span class="rp-so-tela"> Passe o mouse ou use Tab nas colunas para ver o detalhe.</span></p>`;
  }

  // ================= tela =================
  function vGerencial() {
    if (!E() || !E().vagas.length) return '<div class="card vazio">Importe a escala para gerar o relatório.</div>';
    const p = periodo(), a = atual();
    const pronto = RP.chave === p.chave && RP.eventos;
    const mv = pronto ? movimentos(p) : null;
    const quem = M.sessao && M.sessao.perfil ? (M.sessao.perfil.nome || M.sessao.perfil.email) : '';
    const agora = new Date().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const filtros = `<div class="rp-filtros no-print">
      <div class="seg rp-seg" role="group" aria-label="Período">${PRESETS.map(([k, r]) => `<button type="button" data-rp="${k}" aria-pressed="${RP.preset === k}">${r}</button>`).join('')}</div>
      ${RP.preset === 'custom' ? `<div class="rp-datas"><label>De <input type="date" data-rpd="de" value="${esc(RP.de || p.de)}"></label><label>até <input type="date" data-rpd="ate" value="${esc(RP.ate || p.ate)}"></label></div>` : ''}
      <span style="flex:1"></span>
      <button class="btn sm" data-rpa="csv" ${pronto ? '' : 'disabled'}>${ic('sheet')} Excel</button>
      <button class="btn sm pri" data-rpa="imprimir" ${pronto ? '' : 'disabled'}>${ic('printer')} Imprimir / PDF</button>
    </div>`;
    const kpi = (icn, cor, v, l, s) => `<div class="rp-kpi" style="--cor:${cor}"><span class="ic">${ic(icn)}</span><b data-n="${v}">${n(v)}</b><span class="l">${l}</span>${s ? `<small>${s}</small>` : ''}</div>`;
    const hero = `<section class="rp-hero">
      ${ondaHero()}
      <div class="rp-hero-txt">
        <div class="rp-eyebrow">Relatório do período · Hemodiálise Hiperrim</div>
        <h2>${esc(p.nome === 'Personalizado' ? 'Período personalizado' : p.nome)} <span>${esc(p.rotulo)}</span></h2>
        <div class="rp-meta"><span>${ic('calendar')} Bateria ${esc(A.bateriaRef().rotulo)} de ${esc(A.nomeRef())}</span><span>${ic('clock')} Gerado em ${agora}${quem ? ' por ' + esc(quem) : ''}</span></div>
        ${mv ? `<div class="rp-resumo"><span><b data-n="${mv.total}">${n(mv.total)}</b> movimentações</span><span><b data-n="${mv.grupos.transferencia.length}">${n(mv.grupos.transferencia.length)}</b> transferências</span><span><b data-n="${mv.saidas}">${n(mv.saidas)}</b> saídas da clínica</span></div>` : `<div class="rp-resumo"><span class="rp-carregando">${ic('sync')} Buscando as movimentações do período…</span></div>`}
      </div>
      <div class="rp-hero-num">
        <small>Ocupação agora</small>
        <div class="rp-pct"><span data-n="${Math.round(a.pct)}">${Math.round(a.pct)}</span>%</div>
        <div class="rp-hero-medidor"><i data-w="${a.pct}"></i></div>
        <div class="rp-hero-leg"><b>${n(a.ocupadas)}</b> ocupadas · <b>${n(a.vazias)}</b> vazias · ${n(a.vagas)} vagas</div>
      </div>
    </section>`;
    const kpis = `<div class="rp-kpis">
      ${kpi('room', 'var(--blue)', a.maquinas, 'Máquinas', 'equipamentos físicos')}
      ${kpi('grid', 'var(--blue)', a.vagas, 'Vagas na escala', 'máquina × turno × dias')}
      ${kpi('check', 'var(--ok)', a.ocupadas, 'Ocupadas', `${String(a.pct).replace('.', ',')}% da escala`)}
      ${kpi('plus', 'var(--muted)', a.vazias, 'Vazias', 'disponíveis')}
      ${kpi('userplus', 'var(--teal)', a.naEscala, 'Pacientes na escala', `${n(a.coletam)} coletam na bateria`)}
      ${kpi('bed', 'var(--warn)', a.internados.length, 'Internados agora', '')}
      ${kpi('route', 'var(--c5)', a.transito.length, 'Em trânsito', '')}
      ${kpi('lock', 'var(--muted)', a.travados, 'Outro laboratório', `${n(a.unimed)} Unimed`)}
    </div>`;
    const salas = `<div class="rp-grid2">
      <section class="rp-card"><h3>${ic('room')} Ocupação por salão</h3><p class="desc">Vagas ocupadas de cada salão (todas as máquinas × turnos × dias).</p>
        ${a.porSalao.map(x => `<div class="rp-salao"><div class="rp-salao-cab"><b>Salão ${x.s}</b><span>${n(x.maqs)} máquinas</span><em><b>${n(x.oc)}</b> / ${n(x.total)} · ${x.total ? Math.round(x.oc / x.total * 100) : 0}%</em></div>${medidor(x.oc, x.total)}</div>`).join('')}
      </section>
      <section class="rp-card"><h3>${ic('grid')} Por dias e turno</h3><p class="desc">Ocupadas / vagas — quanto mais escuro, mais cheio.</p>
        <div class="rp-heat" role="table" aria-label="Ocupação por salão, dias e turno">
          <div class="cab" role="row"><span role="columnheader"></span>${['SQS', 'TQS'].map(g => ['M', 'T', 'N'].map(t => `<span role="columnheader">${g === 'SQS' ? 'S·Q·S' : 'T·Q·S'}<br>${A.rotTurno(t)}</span>`).join('')).join('')}</div>
          ${a.grade.map(l => `<div role="row"><b role="rowheader">Salão ${l.s}</b>${l.cel.map(c => { const pc = c.total ? c.oc / c.total : 0; return `<span role="cell" style="--p:${Math.round(pc * 88)}%;--t:${pc > 0.58 ? '#fff' : 'var(--text)'}" title="Salão ${l.s} · ${M.GRUPOS[c.g].rotulo} · ${A.rotTurno(c.t)}: ${c.oc} de ${c.total} ocupadas">${c.total ? `${c.oc}/${c.total}` : '—'}</span>`; }).join('')}</div>`).join('')}
        </div>
      </section>
    </div>`;
    if (!mv) return `<div class="rp">${filtros}${hero}${kpis}${salas}<div class="rp-card rp-esqueleto">${ic('sync')} Montando as movimentações de ${esc(p.rotulo)}…</div></div>`;

    const tile = k => { const t = TIPOS[k], q = mv.grupos[k].length; return `<a class="rp-mov${q ? '' : ' zero'}" href="#rp-l-${k}" style="--cor:${t.cor}" data-rpir="${k}"><span class="ic">${ic(t.ic)}</span><b data-n="${q}">${n(q)}</b><span class="l">${t.rot}</span><small>${t.s}</small></a>`; };
    const linhaSaida = it => `<tr><td><span class="rp-tag" style="--cor:${TIPOS[it.tipo].cor}">${esc(M.STATUS[it.tipo].rotulo)}</span></td><td><b>${esc(titulo(it.paciente.nome))}</b></td><td class="mono">${fmtData(it.data)}</td><td>${esc(it.onde || '—')}</td></tr>`;
    const linhaEv = it => `<tr><td class="mono">${fmtDH(it.ts)}</td><td>${esc(it.texto)}</td><td class="faint">${esc(it.por || '—')}</td></tr>`;
    const saidas = ['obito', 'abandono', 'transplante', 'saiu'].flatMap(k => mv.grupos[k]).sort((x, y) => y.ts.localeCompare(x.ts));
    const listas = Object.keys(TIPOS).filter(k => !TIPOS[k].saida && mv.grupos[k].length).map(k => `<section class="rp-card rp-lista" id="rp-l-${k}"><h3><span class="rp-tag" style="--cor:${TIPOS[k].cor}">${ic(TIPOS[k].ic)}</span>${TIPOS[k].rot} <small>${mv.grupos[k].length}</small></h3>
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Quando</th><th>Movimentação</th><th>Registrado por</th></tr></thead><tbody>${mv.grupos[k].map(linhaEv).join('')}</tbody></table></div></section>`).join('');
    const zerados = Object.keys(TIPOS).filter(k => !mv.grupos[k].length).map(k => TIPOS[k].rot.toLowerCase());
    const sit = `<div class="rp-grid2">
      <section class="rp-card"><h3>${ic('bed')} Internados agora <small>${a.internados.length}</small></h3>${a.internados.length ? `<ul class="rp-nomes">${a.internados.map(pc => `<li><b>${esc(titulo(pc.nome))}</b><span>desde ${fmtData(pc.internadoDesde)}</span></li>`).join('')}</ul>` : '<p class="faint">Nenhum paciente internado.</p>'}</section>
      <section class="rp-card"><h3>${ic('route')} Em trânsito agora <small>${a.transito.length}</small></h3>${a.transito.length ? `<ul class="rp-nomes">${a.transito.map(pc => `<li><b>${esc(titulo(pc.nome))}</b><span>${esc((pc.transito && pc.transito.origem) || '')}</span></li>`).join('')}</ul>` : '<p class="faint">Nenhum paciente em trânsito.</p>'}</section>
    </div>`;
    return `<div class="rp">${filtros}${hero}${kpis}${salas}
      <section class="rp-card"><div class="rp-sec-cab"><h3>${ic('chart')} Movimentações no período</h3><span class="chip">${esc(p.rotulo)}</span></div>
        <div class="rp-movs">${Object.keys(TIPOS).map(tile).join('')}</div>
        ${grafico(p, mv)}
        ${RP.erro ? `<div class="alerta-box" style="margin-top:10px">${ic('alert')}<div>Não consegui buscar todos os meses na nuvem (${esc(RP.erro)}); mostrando as movimentações carregadas nesta sessão.</div></div>` : ''}
      </section>
      <section class="rp-card" id="rp-l-saidas"><h3>${ic('userx')} Saídas da clínica no período <small>${saidas.length}</small></h3>
        ${saidas.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Tipo</th><th>Paciente</th><th>Data</th><th>Última posição</th></tr></thead><tbody>${saidas.map(linhaSaida).join('')}</tbody></table></div>` : '<p class="faint">Nenhuma saída da clínica registrada no período.</p>'}
      </section>
      <div class="rp-listas">${listas}</div>
      ${zerados.length ? `<p class="desc rp-zero">Sem registros no período: ${esc(zerados.join(', '))}.</p>` : ''}
      ${sit}
      <p class="rp-rodape">MedRim · Laboratório Célula × Hiperrim · ${esc(p.rotulo)} · gerado em ${agora}${quem ? ' por ' + esc(quem) : ''}${mv.outros ? ` · ${mv.outros} outras atualizações (vínculos, controles, importações) não listadas` : ''}</p>
    </div>`;
  }

  function exportarCsv() {
    const p = periodo(), a = atual(), mv = movimentos(p);
    const L = [['Relatório do período', p.rotulo], ['Gerado em', new Date().toLocaleString('pt-BR')], [],
      ['Números atuais'], ['Máquinas', a.maquinas], ['Vagas na escala', a.vagas], ['Ocupadas', a.ocupadas], ['Vazias', a.vazias], ['Ocupação (%)', String(a.pct).replace('.', ',')],
      ['Pacientes na escala', a.naEscala], ['Coletam na bateria', a.coletam], ['Internados agora', a.internados.length], ['Em trânsito', a.transito.length], ['Outro laboratório', a.travados], [],
      ['Ocupação por salão'], ['Salão', 'Máquinas', 'Ocupadas', 'Vagas', '%'], ...a.porSalao.map(x => [x.s, x.maqs, x.oc, x.total, x.total ? Math.round(x.oc / x.total * 100) : 0]), [],
      ['Movimentações no período'], ...Object.keys(TIPOS).map(k => [TIPOS[k].rot, mv.grupos[k].length]), [],
      ['Detalhe'], ['Tipo', 'Data', 'Paciente / movimentação', 'Local', 'Registrado por'],
      ...Object.keys(TIPOS).flatMap(k => mv.grupos[k].map(it => it.paciente
        ? [TIPOS[k].rot, fmtData(it.data), titulo(it.paciente.nome), it.onde || '', '']
        : [TIPOS[k].rot, fmtDH(it.ts), it.texto, '', it.por || '']))];
    const q = s => { s = String(s == null ? '' : s); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const url = URL.createObjectURL(new Blob(['﻿' + L.map(r => r.map(q).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    const el = Object.assign(document.createElement('a'), { href: url, download: `medrim-relatorio-${p.de}_${p.ate}.csv` });
    document.body.appendChild(el); el.click(); el.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
    A.toast('Relatório exportado (abre no Excel)', 'sheet');
  }

  function ligarGerencial() {
    const p = periodo(), c = $('#conteudo');
    if (RP.chave !== p.chave || !RP.eventos) carregarEventos(p);
    // entrada animada dos medidores e colunas
    requestAnimationFrame(() => requestAnimationFrame(() => { $$('.rp [data-w]').forEach(el => { el.style.width = el.dataset.w + '%'; }); $$('.rp-cols').forEach(el => el.classList.add('on')); }));
    c.onclick = e => {
      const b = e.target.closest('[data-rp]');
      if (b) { RP.preset = b.dataset.rp; if (RP.preset === 'custom' && !RP.de) { const q = periodo(); RP.de = q.de; RP.ate = q.ate; } guardar(); A.render(); return; }
      const ac = e.target.closest('[data-rpa]');
      if (ac && !ac.disabled) { if (ac.dataset.rpa === 'csv') exportarCsv(); if (ac.dataset.rpa === 'imprimir') window.print(); return; }
      const ir = e.target.closest('[data-rpir]');
      if (ir) { e.preventDefault(); const k = ir.dataset.rpir, alvo = document.getElementById(TIPOS[k].saida ? 'rp-l-saidas' : 'rp-l-' + k); if (alvo) alvo.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); }
    };
    c.onchange = e => { const d = e.target.dataset.rpd; if (!d) return; RP[d] = e.target.value; guardar(); A.render(); };
    // dica do gráfico (mouse e teclado)
    const plot = $('.rp-plot'), dica = plot && plot.querySelector('.rp-dica');
    if (plot && dica) {
      const mostrar = col => {
        if (!col) { dica.hidden = true; return; }
        dica.textContent = col.dataset.dica; dica.hidden = false;
        // limita pela largura real da dica, para não vazar nas bordas do gráfico
        const r = plot.getBoundingClientRect(), cr = col.getBoundingClientRect(), meia = dica.offsetWidth / 2 + 4;
        const x = Math.min(Math.max(cr.left - r.left + cr.width / 2, meia), Math.max(meia, r.width - meia));
        dica.style.left = x + 'px';
      };
      plot.addEventListener('mouseover', e => mostrar(e.target.closest('.rp-col')));
      plot.addEventListener('mouseleave', () => mostrar(null));
      plot.addEventListener('focusin', e => mostrar(e.target.closest('.rp-col')));
      plot.addEventListener('focusout', () => mostrar(null));
    }
  }

  A.views.vGerencial = vGerencial;
  A.ligar.gerencial = ligarGerencial;
})(window.MED = window.MED || {});
