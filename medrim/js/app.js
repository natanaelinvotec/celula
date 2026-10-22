/* MedRim · aplicação. Versão online (window.MED.nuvem = true): login e dados no Firestore do projeto celulams
   (js/nuvem.js). Sem a nuvem, o estado fica só neste navegador (localStorage) — modo de teste/desenvolvimento. */
(function (M) {
  'use strict';

  // ================= utilitários =================
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ic = (id, cls = 'i') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${id}"/></svg>`;
  const clone = o => JSON.parse(JSON.stringify(o));
  const MINUSC = new Set(['da', 'de', 'do', 'dos', 'das', 'e']);
  const titulo = s => (s || '').toLowerCase().replace(/\S+/g, (w, i) => (i && MINUSC.has(w)) ? w : w.charAt(0).toUpperCase() + w.slice(1));
  const iniciais = n => (n || '?').split(/\s+/).filter(w => !MINUSC.has(w.toLowerCase())).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  function nomeCurto(nome) {
    const t = titulo(nome).split(/\s+/).filter(w => w && !MINUSC.has(w));
    if (t.length <= 3) return t.join(' ');
    return [t[0], ...t.slice(1, -1).slice(0, 2).map(w => w[0] + '.'), t[t.length - 1]].join(' ');
  }
  const hojeISO = () => { const d = new Date(), z = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`; };   // data local (Brasil), não UTC
  const fmtData = iso => { if (!iso) return '—'; const [a, m, d] = iso.slice(0, 10).split('-'); return `${d}/${m}/${a}`; };
  const fmtDataHora = iso => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  function idade(nasc) {
    const m = (nasc || '').match(/(\d{2})\/(\d{2})\/(\d{4})/); if (!m) return null;
    const h = new Date(), n = new Date(+m[3], +m[2] - 1, +m[1]);
    let a = h.getFullYear() - n.getFullYear(); if (h < new Date(h.getFullYear(), n.getMonth(), n.getDate())) a--;
    return a;
  }
  const fmtCpf = c => c && c.length === 11 ? `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}` : (c || '—');
  const mascCpf = c => c && c.length === 11 ? `***.${c.slice(3, 6)}.${c.slice(6, 9)}-**` : '—';
  function cpfValido(c) {
    c = M.soDigitos(c); if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
    for (let t = 9; t < 11; t++) { let s = 0; for (let i = 0; i < t; i++) s += +c[i] * (t + 1 - i); if (((s * 10) % 11) % 10 !== +c[t]) return false; }
    return true;
  }
  const uid = () => 'm-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  // ================= estado =================
  const CHAVE = 'medrim:v1';
  let E = null;
  const historico = [];
  let nomesCurtos = false; try { nomesCurtos = localStorage.getItem('medrim:nomes') === 'curtos'; } catch (e) { /* sem storage */ }
  const ui = { revelarCpf: false, turno: {}, soDivergencias: false, relCpf: true, nomesCurtos };
  try { E = M.nuvem ? null : JSON.parse(localStorage.getItem(CHAVE)); } catch (e) { E = null; }
  function salvar() {
    if (M.nuvem) { if (M.nuvemApi) M.nuvemApi.salvar(); return; }   // grava na nuvem só o que mudou
    guardarFixos(); try { localStorage.setItem(CHAVE, JSON.stringify(E)); } catch (e) { toast('Não consegui salvar neste navegador (armazenamento bloqueado).', 'alert'); } }
  function proximaRef() { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + 1); return { ano: d.getFullYear(), mes: d.getMonth() + 1 }; }
  function estadoVazio(anterior) {
    return {
      versao: 1, importadoEm: null, arquivos: {}, ref: (anterior && anterior.ref) || proximaRef(),
      regras: (anterior && anterior.regras) || clone(M.REGRAS_PADRAO),
      vagas: [], foraDaGrade: [], pacientes: {}, apelidos: (anterior && anterior.apelidos) || {},
      eventos: (anterior && anterior.eventos) || [], outroLab: {},
      travas: (anterior && anterior.travas) || fixos().travas || {},
      convenios: (anterior && anterior.convenios) || fixos().convenios || {},
      etiquetas: (anterior && anterior.etiquetas) || null,
    };
  }
  /** Regras que valem todos os meses e sobrevivem ao "Começar do zero" (guardadas à parte). */
  function fixos() { if (M.nuvem) return {}; try { return JSON.parse(localStorage.getItem('medrim:fixos')) || {}; } catch (e) { return {}; } }
  function guardarFixos() { try { if (E) localStorage.setItem('medrim:fixos', JSON.stringify({ travas: E.travas || {}, convenios: E.convenios || {} })); } catch (e) { /* sem storage */ } }
  function marcar(rotulo) { historico.push({ rotulo, json: JSON.stringify(E) }); if (historico.length > 20) historico.shift(); }
  function desfazer() {
    const h = historico.pop(); if (!h) return;
    E = JSON.parse(h.json); salvar(); render(); toast('Desfeito: ' + h.rotulo);
  }
  function evento(tipo, pid, texto) {
    const u = M.sessao && M.sessao.perfil;
    E.eventos.unshift(Object.assign({ ts: new Date().toISOString(), tipo, pid, texto }, u ? { por: u.nome || u.email } : {}));
    E.eventos = E.eventos.slice(0, 300);
  }

  // ================= papéis (versão online) =================
  // programador: tudo · enfermaria: edita pacientes/escala · faturamento: só visualiza (salões, resultados, TXT).
  const papel = () => (M.nuvem ? (M.sessao && M.sessao.papel) || null : 'programador');
  const podeEditar = () => ['programador', 'enfermaria'].includes(papel());
  const ehProgramador = () => papel() === 'programador';
  const ROTAS_PAPEL = {
    enfermaria: ['painel', 'salao', 'sync', 'relatorio', 'etiquetas', 'baterias', 'resultados', 'paciente', 'arquivos', 'interface'],
    faturamento: ['painel', 'salao', 'relatorio', 'etiquetas', 'baterias', 'resultados', 'paciente', 'arquivos', 'interface'],
  };
  const rotaPermitida = r => ehProgramador() || (ROTAS_PAPEL[papel()] || []).includes(r);

  // ================= regras de negócio =================
  const tipoRef = () => M.CALENDARIO[E.ref.mes];
  const bateriaRef = () => M.BATERIAS[tipoRef()];
  const nomeRef = () => `${M.MESES[E.ref.mes - 1]}/${E.ref.ano}`;
  const dataCadastro = () => new Date(E.ref.ano, E.ref.mes - 1, 1 - M.DIAS_ANTES_CADASTRO);

  /** Admissão × lista do mês: 'atual' = entra nesta lista com a admissional (28); 'futura' = só na lista seguinte. */
  function janelaAdm(p) {
    if (!p || !p.admissao) return null;
    const d = new Date(p.admissao + 'T12:00');
    const cad = new Date(E.ref.ano, E.ref.mes - 1, 1 - M.DIAS_ANTES_CADASTRO, 23, 59);
    const cadAnt = new Date(E.ref.ano, E.ref.mes - 2, 1 - M.DIAS_ANTES_CADASTRO, 23, 59);
    if (d > cad) return 'futura';
    if (d > cadAnt) return 'atual';
    return null;
  }
  /** Tipo de bateria do paciente nesta lista: admissional, a escolhida no cadastro sem pedido, ou a do mês. */
  function tipoDoPaciente(p) {
    if (p && janelaAdm(p) === 'atual' && !p.admColetado && tipoRef() !== 'anual') return 'admissional';
    if (p && p.bateriaManual && M.BATERIAS[p.bateriaManual]) return p.bateriaManual;
    return tipoRef();
  }
  /** Exames do paciente: base da bateria dele + controles aplicáveis (matriz em E.regras). */
  function examesDo(p) {
    const tipo = tipoDoPaciente(p), b = M.BATERIAS[tipo];
    const lista = b.exames.slice();
    if (!b.semControle && p && p.controles) {
      for (const [k, c] of Object.entries(M.CONTROLES)) {
        if (p.controles[k] && E.regras[k] && E.regras[k][tipo] && !lista.includes(c.exame)) lista.push(c.exame);
      }
    }
    return lista;
  }
  /** Coleta ou não neste mês, e por quê. */
  function situacao(p) {
    if (!p) return { coleta: false, motivo: 'Sem pedido no CSV da Hiperrim' };
    const tv = travaPorCpf(p.cpf);
    if (tv) return { coleta: false, motivo: `Outro laboratório — travado desde ${fmtData(tv.desde)}`, cor: 'var(--muted)', ic: 'lock', travado: true };
    if (p.status === 'obito') return { coleta: false, motivo: `Óbito em ${fmtData(p.obitoEm)}`, cor: 'var(--muted)', ic: 'userx' };
    if (p.status === 'saiu') return { coleta: false, motivo: `Saiu da clínica em ${fmtData(p.saiuEm)}`, cor: 'var(--muted)', ic: 'userx' };
    if (p.status === 'internado') return { coleta: false, motivo: `Internado desde ${fmtData(p.internadoDesde)} — coleta só no retorno`, cor: 'var(--warn)', ic: 'bed' };
    if (p.status === 'transito' && !(p.transito && p.transito.incluir)) return { coleta: false, motivo: `Em trânsito${p.transito && p.transito.origem ? ' (' + p.transito.origem + ')' : ''} — fora da bateria`, cor: 'var(--c5)', ic: 'route' };
    const ja = janelaAdm(p);
    if (ja === 'futura') return { coleta: false, motivo: `Admissão em ${fmtData(p.admissao)} — entra na lista do mês seguinte`, cor: 'var(--teal)', ic: 'userplus', adm: true };
    if (ja === 'atual' && tipoRef() !== 'anual') {
      if (p.admColetado) return { coleta: false, motivo: `Admissional já coletado (${fmtData(p.admissao)}) — não faz a bateria deste mês`, cor: 'var(--teal)', ic: 'userplus', adm: true };
      return { coleta: true, adm: true, motivo: `Admissional (${fmtData(p.admissao)}) — 28 exames` };
    }
    if (p.origem === 'resultado') return { coleta: false, motivo: 'Sem pedido no CSV — identificado pelo TXT de resultados' };
    if (p.origem !== 'csv' && p.origem !== 'manual' && p.origem !== 'transito') return { coleta: false, motivo: 'Sem pedido no CSV da Hiperrim' };
    return { coleta: true };
  }
  const pacDe = v => v && v.pacienteId ? E.pacientes[v.pacienteId] : null;
  const vagaPor = id => E.vagas.find(v => v.id === id);
  const ocupada = v => !!(v.nomeEscala || v.pacienteId);
  const rotTurno = t => M.TURNOS[t].rotulo;
  const local = (v, curto) => curto
    ? `S${v.salao} · ${rotTurno(v.turno)} · ${v.grupo} · Máq ${v.maq}`
    : `Salão ${v.salao} · ${rotTurno(v.turno)} · ${M.GRUPOS[v.grupo].rotulo} · Máq ${v.maq}`;
  const nomeExibicao = v => { const p = pacDe(v); return p ? nomeCurto(p.nome) : (v.nomeEscala || ''); };
  /** Nome para a faixa da máquina: 1º nome + inicial do 2º + último sobrenome ("Sabina F. Lima"). */
  function nomeFaixa(v) {
    const p = pacDe(v); if (!p || p.origem === 'escala') return v.nomeEscala || '';
    const t = titulo(p.nome).split(/\s+/).filter(w => w && !MINUSC.has(w));
    return t.length <= 2 ? t.join(' ') : `${t[0]} ${t[1][0]}. ${t[t.length - 1]}`;
  }
  const saloes = () => [...new Set(E.vagas.map(v => v.salao))].sort((a, b) => a - b);
  const ordemRelatorio = (a, b) => (a.salao - b.salao) || (a.grupo === b.grupo ? 0 : a.grupo === 'SQS' ? -1 : 1) || ('MTN'.indexOf(a.turno) - 'MTN'.indexOf(b.turno)) || (a.pos - b.pos);
  function divergencias() {
    const d = M.resumoDivergencias(E.vagas, E.pacientes);
    const livre = v => !travaDe(v);
    d.outroLab = E.vagas.filter(v => ocupada(v) && travaDe(v));
    ['semCsv', 'revisar', 'foraDoBolsao', 'riscadosNoCsv', 'duplicadas'].forEach(k => { d[k] = d[k].filter(livre); });
    d.csvSemVaga = d.csvSemVaga.filter(p => !travaPorCpf(p.cpf));
    return d;
  }

  // ================= travas (outro laboratório) e convênios =================
  // A trava é da PESSOA, não da máquina: vale pelo CPF (quando conhecido) ou pelo nome da escala + dias + turno.
  // Assim continua valendo no mês seguinte, mesmo que a Hiperrim mande o paciente de novo no CSV ou ele mude de máquina.
  const chaveTrava = v => M.chaveApelido(v.nomeEscala || '', v.grupo, v.turno);
  const travaPorCpf = cpf => cpf ? Object.values(E.travas || {}).find(t => t.cpf === cpf) || null : null;
  function travaDe(v) {
    if (!v || !ocupada(v)) return null;
    const p = pacDe(v), cpf = p && p.cpf;
    const porCpf = travaPorCpf(cpf); if (porCpf) return porCpf;
    if (!v.nomeEscala) return null;
    const ch = chaveTrava(v);
    return Object.values(E.travas || {}).find(t => t.chave === ch && (!t.cpf || !cpf || t.cpf === cpf)) || null;
  }
  function travar(v, motivo) {
    const ja = travaDe(v); if (ja) return ja;
    const p = pacDe(v), id = uid();
    const t = { id, chave: chaveTrava(v), nomeEscala: v.nomeEscala || '', grupo: v.grupo, turno: v.turno,
      cpf: (p && p.cpf) || '', nome: p && p.origem !== 'escala' ? p.nome : '', desde: hojeISO(), motivo: motivo || 'outro laboratório' };
    E.travas[id] = t;
    evento('trava', p ? p.id : null, `Travado (outro laboratório): ${nomeExibicao(v)} (${local(v, true)})`);
    return t;
  }
  function destravar(t) {
    if (!t || !E.travas[t.id]) return;
    delete E.travas[t.id];
    evento('trava', null, `Destravado: ${t.nome ? titulo(t.nome) : t.nomeEscala} — volta para pendências/relatório`);
  }
  /** Normaliza o estado (backup antigo, migração) e ensina às travas o CPF de quem casou com o CSV. */
  function normalizar() {
    if (!E) return;
    let mudou = false;
    if (!E.travas) { E.travas = fixos().travas || {}; mudou = true; }
    if (!E.convenios) { E.convenios = fixos().convenios || {}; mudou = true; }
    if (E.outroLab && Object.keys(E.outroLab).length) {          // formato antigo: marcado por máquina
      Object.keys(E.outroLab).forEach(id => { const v = vagaPor(id); if (v && ocupada(v) && !travaDe(v)) { const p = pacDe(v);
        const t = { id: uid(), chave: chaveTrava(v), nomeEscala: v.nomeEscala || '', grupo: v.grupo, turno: v.turno, cpf: (p && p.cpf) || '', nome: '', desde: hojeISO(), motivo: 'outro laboratório' };
        E.travas[t.id] = t; } });
      E.outroLab = {}; mudou = true;
    }
    for (const v of E.vagas) {
      if (!v.nomeEscala) continue;
      const p = pacDe(v); if (!p || !p.cpf || p.origem === 'escala') continue;
      const t = Object.values(E.travas).find(x => !x.cpf && x.chave === chaveTrava(v));
      if (t) { t.cpf = p.cpf; t.nome = p.nome; mudou = true; }
    }
    if (mudou) salvar();
  }
  const convenioDe = p => (p && p.cpf && E.convenios && E.convenios[p.cpf]) || null;
  function definirConvenio(cpf, conv) {
    cpf = M.soDigitos(cpf || ''); if (!cpf) return false;
    if (conv) E.convenios[cpf] = conv; else delete E.convenios[cpf];
    const p = E.pacientes[cpf] || Object.values(E.pacientes).find(x => x.cpf === cpf);
    evento('convenio', p ? p.id : null, `${p ? titulo(p.nome) : 'CPF ' + mascCpf(cpf)}: ${conv ? 'convênio ' + (M.CONVENIOS[conv] || {}).rotulo : 'sem convênio marcado'}`);
    return true;
  }

  // ================= navegação =================
  const rotas = {
    painel: { t: 'Painel gerencial', ic: 'grid' },
    salao: { t: 'Salão', ic: 'room' },
    sync: { t: 'Sincronização escala × CSV', ic: 'sync' },
    relatorio: { t: 'Relatório de cadastro', ic: 'report' },
    etiquetas: { t: 'Etiquetas & mapa de coleta', ic: 'tag' },
    baterias: { t: 'Baterias & regras', ic: 'flask' },
    proposta: { t: 'Proposta & próximos passos', ic: 'bulb' },
    usuarios: { t: 'Usuários e acessos', ic: 'shield' },
    integracao: { t: 'Integração com o sistema do laboratório', ic: 'link' },
    migrar: { t: 'Enviar dados para a nuvem', ic: 'upload' },
    importar: { t: 'Importar arquivos', ic: 'upload' },
    resultados: { t: 'Resultados', ic: 'drop' },
    paciente: { t: 'Ficha de resultados', ic: 'chart' },
    arquivos: { t: 'Arquivos TXT', ic: 'download' },
    interface: { t: 'Interface Nephrosys', ic: 'link' },
  };
  const SEM_ESCALA = ['proposta', 'baterias', 'resultados', 'paciente', 'arquivos', 'interface', 'usuarios', 'integracao', 'migrar'];
  function rotaAtual() {
    let [r, a, b] = location.hash.replace(/^#\/?/, '').split('/');
    if (!E || !E.vagas.length) {
      if (!SEM_ESCALA.includes(r)) r = 'importar';
      if (!rotaPermitida(r)) r = ehProgramador() ? 'importar' : 'resultados';
      return { r, a, b };
    }
    if (!rotas[r] || !rotaPermitida(r)) r = 'painel';
    return { r, a, b };
  }
  const ir = h => { if (location.hash === h) render(); else location.hash = h; };

  function renderNav() {
    const { r, a } = rotaAtual();
    const d = E && E.vagas.length ? divergencias() : null;
    const nDiv = d ? d.revisar.length + d.semCsv.length + d.foraDoBolsao.length + d.riscadosNoCsv.length + d.csvSemVaga.length : 0;
    const item = (h, rot, icn, extra = '', ativo = false) => `<a class="nav" href="${h}" ${ativo ? 'aria-current="page"' : ''}>${ic(icn)}<span>${rot}</span>${extra}</a>`;
    let html = '';
    if (d) {
      html += `<div class="nav-t">Gestão</div>` + item('#/painel', 'Painel gerencial', 'grid', '', r === 'painel');
      html += `<div class="nav-t">Salões</div>`;
      for (const s of saloes()) {
        const vs = E.vagas.filter(v => v.salao === s), oc = vs.filter(ocupada).length;
        html += item('#/salao/' + s, 'Salão ' + s, 'room', `<span class="mini" title="${oc}/${vs.length} ocupadas"><i style="width:${Math.round(oc / vs.length * 100)}%"></i></span>`, r === 'salao' && +a === s);
      }
      html += `<div class="nav-t">Bateria do mês</div>`;
      if (rotaPermitida('sync')) html += item('#/sync', 'Sincronização', 'sync', nDiv ? `<span class="cnt alerta">${nDiv}</span>` : `<span class="cnt">✓</span>`, r === 'sync');
      html += item('#/relatorio', 'Relatório de cadastro', 'report', '', r === 'relatorio');
      const re = M.app.resumoEtiquetas && M.app.resumoEtiquetas();
      html += item('#/etiquetas', 'Etiquetas & mapa', 'tag', re && re.itens.length ? (re.semEtiqueta.length ? `<span class="cnt alerta" title="coletam sem etiqueta">${re.semEtiqueta.length}</span>` : `<span class="cnt">✓</span>`) : '', r === 'etiquetas');
    }
    const nLotes = M.app.R ? M.app.R.lotes.length : 0;
    html += `<div class="nav-t">Resultados</div>`;
    html += item('#/resultados', 'Resultados', 'drop', nLotes ? `<span class="cnt">${nLotes} ${nLotes === 1 ? 'mês' : 'meses'}</span>` : '', r === 'resultados' || r === 'paciente');
    html += item('#/arquivos', 'Arquivos TXT', 'download', '', r === 'arquivos');
    html += item('#/interface', 'Interface Nephrosys', 'link', '', r === 'interface');
    html += `<div class="nav-t">Referência</div>`;
    html += item('#/baterias', 'Baterias & regras', 'flask', '', r === 'baterias');
    if (rotaPermitida('proposta')) html += item('#/proposta', 'Proposta & roadmap', 'bulb', '', r === 'proposta');
    if (M.nuvem && ehProgramador()) {
      html += `<div class="nav-t">Administração</div>`;
      html += item('#/usuarios', 'Usuários e acessos', 'shield', M.sessao && M.sessao.pedidos ? `<span class="cnt alerta" title="pedidos de acesso">${M.sessao.pedidos}</span>` : '', r === 'usuarios');
      html += item('#/integracao', 'Integração (API)', 'link', '', r === 'integracao');
    }
    $('#nav').innerHTML = html;
    const u = $('#usuario');
    if (u) {
      const s = M.sessao;
      u.hidden = !(M.nuvem && s && s.perfil);
      if (!u.hidden) u.innerHTML = `<span class="av">${esc(iniciais(s.perfil.nome || s.perfil.email))}</span><span class="nm"><b>${esc(s.perfil.nome || s.perfil.email)}</b><small>${esc(({ programador: 'Programador · acesso total', enfermaria: 'Enfermaria · edita pacientes', faturamento: 'Faturamento · visualização' })[s.papel] || s.papel)}</small></span>`;
    }
  }

  function renderTopo() {
    const { r, a } = rotaAtual();
    $('#titulo').textContent = r === 'salao' ? 'Salão ' + a : rotas[r].t;
    const sel = $('#ref');
    if (E) {
      const d0 = new Date(); d0.setDate(1);
      let opts = '';
      for (let k = -1; k < 13; k++) {
        const d = new Date(d0.getFullYear(), d0.getMonth() + k, 1), mes = d.getMonth() + 1, tipo = M.CALENDARIO[mes];
        const sel2 = mes === E.ref.mes && d.getFullYear() === E.ref.ano ? 'selected' : '';
        opts += `<option value="${d.getFullYear()}-${mes}" ${sel2}>${M.MESES[mes - 1].slice(0, 3)}/${d.getFullYear()} · ${M.BATERIAS[tipo].rotulo} (${M.BATERIAS[tipo].qtd})</option>`;
      }
      sel.innerHTML = opts; sel.hidden = false;
      const dc = dataCadastro();
      $('#subtitulo').innerHTML = `Bateria <b>${bateriaRef().rotulo}</b> de ${nomeRef()} · cadastro até ${dc.toLocaleDateString('pt-BR')} · resultados 01–02/${String(E.ref.mes).padStart(2, '0')}`;
    } else { sel.hidden = true; $('#subtitulo').textContent = 'Baterias de exames da hemodiálise'; }
  }

  function render() {
    normalizar();
    renderNav(); renderTopo();
    const { r, a } = rotaAtual();
    const V = M.app.views;
    const views = { usuarios: V.vUsuarios, integracao: V.vIntegracao, migrar: V.vMigrar, painel: V.vPainel, salao: () => V.vSalao(+a || 1, M.app.rotaAtual().b), sync: V.vSync, relatorio: V.vRelatorio, etiquetas: V.vEtiquetas, baterias: V.vBaterias, proposta: V.vProposta, importar: V.vImportar,
      resultados: () => V.vResultados(a), paciente: () => V.vPaciente(a), arquivos: V.vArquivos, interface: V.vInterface };
    const alvo = $('#conteudo');
    alvo.onclick = alvo.onchange = alvo.onkeydown = null;
    alvo.innerHTML = `<div class="view">${views[r]()}</div>`;
    const lig = M.app.ligar[r]; if (lig) lig(r === 'salao' ? (+a || 1) : a);
    animarNumeros();
    requestAnimationFrame(() => requestAnimationFrame(() => $$('[data-anel]').forEach(c => { c.style.strokeDashoffset = c.dataset.anel; })));
  }

  function animarNumeros() {
    $$('[data-n]').forEach(el => {
      const fim = +el.dataset.n, t0 = performance.now(), dur = 700;
      if (matchMedia('(prefers-reduced-motion: reduce)').matches || fim < 2) { el.textContent = fim.toLocaleString('pt-BR'); return; }
      const passo = t => { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); el.textContent = Math.round(fim * e).toLocaleString('pt-BR'); if (k < 1) requestAnimationFrame(passo); };
      requestAnimationFrame(passo);
    });
  }

  // ================= PAINEL =================
  function metricas() {
    const ocup = E.vagas.filter(ocupada);
    const principais = ocup.filter(v => !(v.match && v.match.duplicadaDe));
    const pacs = principais.map(pacDe).filter(Boolean);
    const coletam = pacs.filter(p => situacao(p).coleta);
    const exames = coletam.reduce((s, p) => s + examesDo(p).length, 0);
    const d = divergencias();
    const nDiv = d.revisar.length + d.semCsv.length + d.foraDoBolsao.length + d.riscadosNoCsv.length + d.csvSemVaga.length;
    const todos = Object.values(E.pacientes);
    return {
      vagas: E.vagas.length, ocupadas: ocup.length, livres: E.vagas.length - ocup.length,
      maquinas: new Set(E.vagas.map(v => v.salao + v.turno + v.maq)).size,
      pacientesEscala: principais.length, coletam, exames, d, nDiv,
      csvTotal: todos.filter(p => p.origem === 'csv').length,
      sincronizados: d.alta,
      internados: todos.filter(p => p.status === 'internado').length,
      transito: todos.filter(p => p.status === 'transito').length,
      adm: pacs.filter(p => situacao(p).adm).length,
      obitos: todos.filter(p => p.status === 'obito').length,
    };
  }

  function vPainel() {
    const m = metricas(), b = bateriaRef(), tipo = tipoRef();
    const dc = dataCadastro(), hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const dias = Math.round((dc - hoje) / 864e5);
    const prazo = dias > 1 ? `faltam ${dias} dias` : dias === 1 ? 'amanhã' : dias === 0 ? 'hoje' : `há ${-dias} dias`;
    // anel do topo: máquinas cheias × vazias (todas as vagas da escala: salão × dias × turno × máquina)
    const pct = m.vagas ? Math.round(m.ocupadas / m.vagas * 100) : 0;
    const C = 2 * Math.PI * 62;
    const kpi = (icn, cor, v, l, s, h) => `<a class="kpi" href="${h || '#/painel'}" style="--cor:${cor}"><span class="ic">${ic(icn)}</span><span class="v mono" data-n="${v}">${v}</span><span class="l">${l}</span>${s ? `<span class="s">${s}</span>` : ''}</a>`;

    // perfil de controle dos pacientes que coletam
    const perfis = {};
    m.coletam.forEach(p => {
      const tp = tipoDoPaciente(p);
      let chave;
      if (tp !== tipo) chave = 'bat:' + tp;
      else chave = Object.keys(M.CONTROLES).filter(k => p.controles && p.controles[k] && E.regras[k][tipo] && !M.BATERIAS[tipo].exames.includes(M.CONTROLES[k].exame)).join('+') || 'normal';
      perfis[chave] = (perfis[chave] || 0) + 1;
    });
    const maxP = Math.max(1, ...Object.values(perfis));
    const batDe = k => M.BATERIAS[k.slice(4)];
    const rotPerfil = k => k === 'normal' ? `Bateria ${b.rotulo.toLowerCase()} (${b.qtd})` : k.startsWith('bat:') ? `Bateria ${batDe(k).rotulo.toLowerCase()} (${batDe(k).qtd})` : `+ ${k.split('+').map(x => M.CONTROLES[x].rotulo).join(' + ')} (${b.qtd + k.split('+').length})`;
    const corPerfil = k => k === 'normal' ? b.cor : k.startsWith('bat:') ? batDe(k).cor : M.CONTROLES[k.split('+')[0]].cor;
    const perfisHtml = Object.entries(perfis).sort((a, b) => b[1] - a[1]).map(([k, n]) => `
      <div class="linha"><span class="ks">${k === 'normal' || k.startsWith('bat:') ? `<span class="k" style="--cor:${corPerfil(k)}">${k === 'normal' ? b.qtd : batDe(k).qtd}</span>` : k.split('+').map(x => `<span class="k" style="--cor:${M.CONTROLES[x].cor}">${M.CONTROLES[x].sigla}</span>`).join('')}&nbsp;${esc(rotPerfil(k))}</span>
      <span class="barra" style="--cor:${corPerfil(k)}"><i style="width:${n / maxP * 100}%"></i></span><span class="mono" style="text-align:right">${n}</span></div>`).join('');

    // mapa de ocupação
    const cols = [['SQS', 'M'], ['SQS', 'T'], ['SQS', 'N'], ['TQS', 'M'], ['TQS', 'T'], ['TQS', 'N']];
    let heat = `<div class="heat"><span></span>${cols.map(([g, t]) => `<span class="h">${g === 'SQS' ? 'S·Q·S' : 'T·Q·S'}<br>${rotTurno(t)}</span>`).join('')}`;
    for (const s of saloes()) {
      heat += `<span class="r">Salão ${s}</span>`;
      for (const [g, t] of cols) {
        const vs = E.vagas.filter(v => v.salao === s && v.grupo === g && v.turno === t), oc = vs.filter(ocupada).length;
        const p = vs.length ? Math.round(oc / vs.length * 100) : 0;
        heat += `<button style="--p:${Math.round(p * 0.85)};--t:${p > 60 ? '#fff' : 'var(--text)'}" onclick="location.hash='#/salao/${s}/${t}'" title="Salão ${s} · ${g} · ${rotTurno(t)}: ${oc} de ${vs.length} ocupadas">${oc}/${vs.length}</button>`;
      }
    }
    heat += '</div>';

    // cobertura do CSV por salão
    const cobertura = saloes().map(s => {
      const vs = E.vagas.filter(v => v.salao === s && v.nomeEscala && !(v.match && v.match.duplicadaDe));
      const com = vs.filter(v => { const p = pacDe(v); return p && p.origem === 'csv'; }).length;
      return { s, com, tot: vs.length };
    });

    // calendário
    const cal = M.MESES.map((nm, i) => {
      const t = M.CALENDARIO[i + 1], bt = M.BATERIAS[t];
      return `<div class="mes ${i + 1 === E.ref.mes ? 'atual' : ''}" style="--cor:${bt.cor}" title="${bt.rotulo}: ${bt.qtd} exames"><b>${nm.slice(0, 3)}</b><em>${bt.qtd}</em><span>${({ mensal: 'mens.', trimestral: 'trim.', semestral: 'sem.', anual: 'anual' })[t]}</span></div>`;
    }).join('');

    const pend = [
      ['var(--warn)', m.d.revisar.length, 'Casamentos para revisar', 'Nome da escala parecido, mas com dúvida'],
      ['var(--crit)', m.d.riscadosNoCsv.length, 'Riscados na escala, mas no CSV', 'Confirmar se saíram (óbito/alta/transferência)'],
      ['var(--c5)', m.d.foraDoBolsao.length, 'Dias/turno diferentes', 'Escala e CSV discordam do turno ou dos dias'],
      ['var(--blue)', m.d.semCsv.length, 'Na escala sem pedido no CSV', 'Outro laboratório, convênio ou paciente novo?'],
      ['var(--rim)', m.d.csvSemVaga.length, 'No CSV sem máquina', 'Paciente com pedido mas fora da escala'],
    ].filter(p => p[1]).map(([cor, n, t, s]) => `<a class="pend" href="#/sync" style="--cor:${cor}"><span class="n mono">${n}</span><span style="flex:1"><span class="t">${t}</span><small>${s}</small></span><svg class="i" style="transform:rotate(-90deg);color:var(--faint)"><use href="#i-chev"/></svg></a>`).join('') || `<div class="alerta-box ok">${ic('check')}<div><b>Tudo sincronizado.</b><br>Nenhuma pendência para a bateria de ${nomeRef()}.</div></div>`;

    const rr = M.app.resumoUltimoLote && M.app.resumoUltimoLote();
    const pendCrit = rr && rr.crit ? `<a class="pend" href="#/resultados/${rr.lote.competencia}" style="--cor:var(--crit)"><span class="n mono">${rr.crit}</span><span style="flex:1"><span class="t">Valores críticos nos resultados</span><small>Laudo de ${esc(M.app.rotComp(rr.lote.competencia))} — avisar o nefrologista</small></span><svg class="i" style="transform:rotate(-90deg);color:var(--faint)"><use href="#i-chev"/></svg></a>` : '';
    const movs = E.eventos.slice(0, 8).map(movHtml).join('') || `<div class="vazio" style="padding:18px">Sem movimentações ainda. Transferências, internações, admissões e óbitos aparecem aqui.</div>`;

    return `
    <section class="hero">
      <div style="position:relative;z-index:1">
        <div class="eyebrow">Próxima bateria · ${esc(nomeRef())}</div>
        <h2>Bateria ${esc(b.rotulo)} — ${b.qtd} exames por paciente</h2>
        <div class="linhas">
          <span>${ic('calendar')} Cadastro até ${dc.toLocaleDateString('pt-BR')} (${prazo})</span>
          <span>${ic('drop')} Resultados 01–02/${String(E.ref.mes).padStart(2, '0')}</span>
          <span>${ic('flask')} <b class="mono" data-n="${m.coletam.length}">${m.coletam.length}</b>&nbsp;pacientes · <b class="mono" data-n="${m.exames}">${m.exames}</b>&nbsp;exames</span>
        </div>
        <div class="acoes">
          <a class="btn pri" href="#/relatorio">${ic('report')} Gerar relatório de cadastro</a>
          <a class="btn" href="#/sync">${ic('sync')} Resolver ${m.nDiv} divergências</a>
        </div>
      </div>
      <div class="anel" title="Máquinas da escala: ${m.ocupadas} cheias e ${m.livres} vazias, de ${m.vagas} vagas">
        <svg viewBox="0 0 150 150"><circle cx="75" cy="75" r="62" fill="none" stroke="rgba(255,255,255,.14)" stroke-width="12"/>
        <circle cx="75" cy="75" r="62" fill="none" stroke="#7ee2a3" stroke-width="12" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C}" style="transition:stroke-dashoffset 1.2s cubic-bezier(.2,.8,.2,1)" data-anel="${C * (1 - pct / 100)}"/></svg>
        <div class="v"><div>${pct}%<small>OCUPADAS</small><em><b class="mono" data-n="${m.ocupadas}">${m.ocupadas}</b> cheias<br><b class="mono" data-n="${m.livres}">${m.livres}</b> vazias</em></div></div>
      </div>
    </section>

    <div class="kpis">
      ${kpi('room', 'var(--blue)', m.pacientesEscala, 'Pacientes na escala', `${m.maquinas} máquinas · ${m.vagas} vagas`, '#/salao/1')}
      ${kpi('check', 'var(--ok)', m.sincronizados, 'Casados com o CSV', `de ${m.csvTotal} pedidos no CSV`, '#/sync')}
      ${kpi('alert', 'var(--warn)', m.nDiv, 'Divergências', 'para conferir', '#/sync')}
      ${kpi('plus', 'var(--teal)', m.livres, 'Vagas livres', 'máquina × dias × turno', '#/salao/1')}
      ${kpi('bed', 'var(--warn)', m.internados, 'Internados', 'fora da bateria', '#/painel')}
      ${kpi('route', 'var(--c5)', m.transito, 'Em trânsito', 'vindos de outra unidade', '#/painel')}
      ${kpi('userplus', 'var(--teal)', m.adm, 'Admissionais', 'bateria de 28 exames', '#/relatorio')}
      ${kpi('userx', 'var(--muted)', m.obitos, 'Óbitos', 'registrados', '#/painel')}
    </div>

    <div class="grid g-dash">
      <div class="grid">
        <div class="card"><h2>Ocupação por salão</h2><p class="desc">Máquinas ocupadas por grupo de dias e turno — clique para abrir o salão.</p>${heat}
          <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:14px">${cobertura.map(c => `<span class="chip ${c.com < c.tot * 0.6 ? 'b' : ''}" style="--cor:var(--warn)">Salão ${c.s}: ${c.com}/${c.tot} com pedido no CSV</span>`).join('')}</div>
        </div>
        <div class="card"><h2>Perfil da bateria de ${esc(nomeRef())}</h2><p class="desc">Pacientes que coletam, por controle extra (glicose, creatinina, Hb glicada).</p><div class="perfil">${perfisHtml || '<div class="vazio">Sem pacientes para coletar.</div>'}</div></div>
        <div class="card"><h2>Calendário de baterias</h2><p class="desc">Mensal (9) · Trimestral (14) em abril e outubro · Semestral (19) em julho · Anual (29) em janeiro. Cadastro ${M.DIAS_ANTES_CADASTRO} dias antes do mês.</p><div class="calendario">${cal}</div></div>
      </div>
      <div class="grid" style="align-content:start">
        <div class="card"><h2>Pendências</h2><p class="desc">O que precisa de olho humano antes de cadastrar.</p>${pendCrit}${pend}</div>
        ${(() => { const r = M.app.resumoUltimoLote && M.app.resumoUltimoLote(); return r ? `<a class="card card-link" href="#/resultados/${r.lote.competencia}"><h2>Últimos resultados · ${esc(M.app.rotComp(r.lote.competencia))}</h2><p class="desc">${r.n} pacientes com laudo importado do TXT.</p>
          <div style="display:flex;flex-wrap:wrap;gap:8px"><span class="chip b" style="--cor:var(--ok)">URR médio ${r.urrMed != null ? String(r.urrMed).replace('.', ',') + '%' : '—'}</span><span class="chip b" style="--cor:var(--rim)">Hb na meta ${r.hb != null ? r.hb + '%' : '—'}</span>${r.crit ? `<span class="chip b" style="--cor:var(--crit)">${ic('bell')} ${r.crit} com valor crítico</span>` : ''}</div></a>`
          : `<a class="card card-link" href="#/resultados"><h2>Resultados dos pacientes</h2><p class="desc" style="margin:0">Suba o TXT que o sistema do laboratório exporta para o Nephrosys e acompanhe o histórico de cada paciente.</p></a>`; })()}
        <div class="card"><h2>Movimentações recentes</h2><p class="desc">Histórico de transferências, internações, admissões, trânsito e óbitos.</p><div class="lista-mov">${movs}</div></div>
      </div>
    </div>`;
  }

  const EVT = {
    transferencia: ['swap', 'var(--blue)'], internacao: ['bed', 'var(--warn)'], retorno: ['check', 'var(--ok)'],
    obito: ['userx', 'var(--muted)'], admissao: ['userplus', 'var(--teal)'], transito: ['route', 'var(--c5)'],
    vinculo: ['link', 'var(--blue)'], importacao: ['upload', 'var(--rim)'], controle: ['flask', 'var(--k-glic)'], remocao: ['x', 'var(--crit)'], cadastro: ['userplus', 'var(--blue)'],
  };
  const movHtml = e => { const [icn, cor] = EVT[e.tipo] || ['info', 'var(--muted)']; return `<div class="mov" style="--cor:${cor}"><span class="ic">${ic(icn)}</span><div>${esc(e.texto)}<br><small>${fmtDataHora(e.ts)}</small></div></div>`; };

  // ================= avisos =================
  function toast(msg, tipo = 'check', desfazivel = false) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `${ic(tipo)}<span>${esc(msg)}</span>${desfazivel ? '<button type="button">Desfazer</button>' : ''}`;
    if (desfazivel) el.querySelector('button').onclick = () => { el.remove(); desfazer(); };
    $('#toasts').appendChild(el);
    setTimeout(() => el.remove(), desfazivel ? 6500 : 3800);
  }

  // ================= busca global =================
  function indiceBusca() {
    const itens = [];
    E.vagas.filter(ocupada).forEach(v => {
      const p = pacDe(v);
      itens.push({ v, p, txt: M.norm([p && p.nome, v.nomeEscala, p && p.cpf, 'MAQ ' + v.maq, 'SALAO ' + v.salao].join(' ')) });
    });
    Object.values(E.pacientes).filter(p => !p.vagaId).forEach(p => itens.push({ v: null, p, txt: M.norm(p.nome + ' ' + p.cpf) }));
    return itens;
  }
  function ligarBusca() {
    const inp = $('#busca'), res = $('#resultados');
    let sel = 0, achados = [];
    const pintar = () => {
      res.innerHTML = achados.length ? achados.map((x, i) => `<button type="button" role="option" class="${i === sel ? 'sel' : ''}" data-i="${i}">
        <span class="avatar" style="width:30px;height:30px;border-radius:10px;font-size:12px">${esc(iniciais(x.p ? x.p.nome : x.v.nomeEscala))}</span>
        <span><b>${esc(x.p ? nomeCurto(x.p.nome) : x.v.nomeEscala)}</b>${x.p && x.v && x.v.nomeEscala ? `<br><small style="color:var(--muted)">escala: ${esc(x.v.nomeEscala)}</small>` : ''}</span>
        <span class="loc">${x.v ? esc(local(x.v, true)) : (x.p && x.p.status === 'obito' ? 'óbito' : 'sem máquina')}</span></button>`).join('')
        : `<div class="vazio" style="padding:14px">Nada encontrado.</div>`;
      res.classList.add('on');
    };
    inp.addEventListener('input', () => {
      if (!E || !E.vagas.length) return;
      const q = M.norm(inp.value); if (!q) { res.classList.remove('on'); return; }
      const termos = q.split(' ');
      achados = indiceBusca().filter(x => termos.every(t => x.txt.includes(t))).slice(0, 12); sel = 0; pintar();
    });
    inp.addEventListener('keydown', e => {
      if (!res.classList.contains('on')) return;
      if (e.key === 'ArrowDown') { sel = Math.min(achados.length - 1, sel + 1); pintar(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); pintar(); e.preventDefault(); }
      else if (e.key === 'Enter' && achados[sel]) { abrirAchado(achados[sel]); }
      else if (e.key === 'Escape') { res.classList.remove('on'); inp.blur(); }
    });
    res.addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (b) abrirAchado(achados[+b.dataset.i]); });
    document.addEventListener('click', e => { if (!e.target.closest('.busca')) res.classList.remove('on'); });
    function abrirAchado(x) {
      res.classList.remove('on'); inp.value = '';
      if (x.v) { location.hash = `#/salao/${x.v.salao}/${x.v.turno}`; setTimeout(() => M.app.abrirFicha(x.v.id), 120); }
      else M.app.abrirFicha(null, x.p.id);
    }
  }

  // ================= início =================
  function aplicarTema(t) {
    if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
    const escuro = t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    $('#rot-tema').textContent = escuro ? 'Tema claro' : 'Tema escuro';
  }
  function iniciar() {
    let tema = null; try { tema = localStorage.getItem('medrim:tema'); } catch (e) {}
    aplicarTema(tema);
    document.addEventListener('click', e => {
      const b = e.target.closest('[data-acao]'); if (!b) return;
      const ac = b.dataset.acao;
      if (ac === 'importar') ir('#/importar');
      if (ac === 'tema') {
        const escuro = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
        const novo = escuro ? 'light' : 'dark'; aplicarTema(novo); try { localStorage.setItem('medrim:tema', novo); } catch (e2) {}
      }
      if (ac === 'backup') M.app.exportarBackup();
      if (ac === 'sair' && M.nuvemApi) M.nuvemApi.sair();
    });
    $('#ref').addEventListener('change', e => {
      const [a, m] = e.target.value.split('-').map(Number); E.ref = { ano: a, mes: m };
      if (M.nuvem && !ehProgramador()) { render(); return toast(`Visualizando ${bateriaRef().rotulo} de ${nomeRef()} (só nesta tela)`, 'calendar'); }
      salvar(); render(); toast(`Bateria de referência: ${bateriaRef().rotulo} de ${nomeRef()}`, 'calendar');
    });
    document.body.dataset.papel = papel() || '';
    document.body.classList.toggle('nuvem', !!M.nuvem);
    if (!M.nuvem) { document.body.classList.remove('bloqueado'); const l = $('#login'); if (l) l.hidden = true; }   // modo só-navegador: sem login
    document.addEventListener('keydown', e => {
      if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); $('#busca').focus(); }
      if (e.key === 'Escape') M.app.fechar();
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); desfazer(); }
    });
    window.addEventListener('scroll', () => $('#top').classList.toggle('sombra', scrollY > 8), { passive: true });
    window.addEventListener('hashchange', () => { M.app.fechar(); render(); window.scrollTo({ top: 0 }); });
    ligarBusca();
    Promise.resolve(M.app.carregarResultados ? M.app.carregarResultados() : null).catch(() => {}).then(render);
  }

  M.app = { $, $$, esc, ic, clone, titulo, nomeCurto, iniciais, fmtData, idade, fmtCpf, mascCpf, cpfValido, uid, hojeISO };
  Object.assign(M.app, {
    ui, salvar, toast, iniciar, marcar, desfazer, evento, estadoVazio, render, ir, rotaAtual,
    tipoRef, bateriaRef, nomeRef, dataCadastro, examesDo, situacao, tipoDoPaciente, pacDe, vagaPor, ocupada, rotTurno, local, nomeExibicao, nomeFaixa,
    saloes, ordemRelatorio, divergencias, metricas, movHtml,
    travaDe, travaPorCpf, travar, destravar, normalizar, convenioDe, definirConvenio,
    papel, podeEditar, ehProgramador, rotaPermitida,
  });
  Object.defineProperty(M.app, 'E', { get: () => E, set: v => { E = v; }, configurable: true });
  M.app.views = { vPainel };
  M.app.ligar = {};
})(window.MED = window.MED || {});
