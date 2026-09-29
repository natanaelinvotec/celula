// atendimento.js — tela de Atendimento WhatsApp (3 colunas: conversas · chat · contexto do paciente).
// Módulo isolado: só lê orçamentos/catálogo; grava apenas em wa_conversas (via wa.js).
import { brl, toast, escapeHtml, iniciais, comprimirImagem, primeiroNome } from './firebase.js';
import * as D from './dados.js';
import * as W from './wa.js';
import { numOrc, UNIDADES, CENTRAL, PERFIS_PADRAO, maiorJejum, modal, fecharModal, telaCheia, rotuloQtd } from './ui.js';

const tipoArq = (mime = '') => mime.includes('pdf') ? { ic: '📄', rt: 'PDF' } : mime.startsWith('audio/') ? { ic: '🎤', rt: 'Áudio' } : mime.startsWith('video/') ? { ic: '🎬', rt: 'Vídeo' } : mime.startsWith('image/') ? { ic: '🖼️', rt: 'Imagem' } : { ic: '📎', rt: 'Arquivo' };
const MOTIVOS = ['Orçamento enviado — aguardando paciente', 'Agendou / vai coletar', 'Achou caro', 'Convênio não cobre', 'Só dúvida / informação', 'Resultado de exames', 'Engano / spam'];
const CORES = ['#7c4dbf', '#2563eb', '#1f9e9c', '#b8730f', '#d31a21', '#563085', '#0f766e', '#9d174d'];
const corDe = s => CORES[[...String(s)].reduce((a, c) => a + c.charCodeAt(0), 0) % CORES.length];
const hora = t => { const m = W.ms(t); if (!m) return ''; const d = new Date(m), h = new Date(); return d.toDateString() === h.toDateString() ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }); };
const restante = c => { const f = W.ms(c.janelaAte) - Date.now(); if (f <= 0) return null; const h = Math.floor(f / 3600e3), m = Math.floor(f % 3600e3 / 60e3); return h ? `${h}h${String(m).padStart(2, '0')}` : `${m} min`; };
const fmtTxt = t => escapeHtml(t || '').replace(/\*([^*\n]+)\*/g, '<b>$1</b>').replace(/_([^_\n]+)_/g, '<i>$1</i>').replace(/\n/g, '<br>');

export async function montarAtendimento(el, { perfil }) {
  const admin = perfil.papel === 'admin';
  const st = { convs: [], enc: [], lemb: [], aba: 'meus', busca: '', sel: null, conv: null, msgs: [], orc: null, hist: [], users: [], cfg: {}, cat: null, notaModo: false, editando: false, fixo: false };
  el.innerHTML = `
  <div class="at-top"><div class="kp" id="kp"></div><div class="sp"></div>
    <button class="btn ghost sm" id="bLem" title="Seus lembretes de acompanhamento">🔔 Lembretes <b id="nLem">0</b></button>
    ${admin ? '<button class="btn ghost sm" id="bEq" title="Equipe ao vivo">👥 Equipe</button><button class="btn ghost sm" id="bCfg" title="Horário, boas-vindas, distribuição, respostas rápidas e etiquetas">⚙ Configurar</button><button class="btn ghost sm" id="bSim" title="Grava mensagens de teste como se viessem do WhatsApp">🧪 Simulador</button>' : ''}</div>
  <div class="at">
    <div class="at-list">
      <div class="at-tabs" id="tabs"></div>
      <input class="in at-srch" id="busca" placeholder="Buscar nome, tel. ou nº" title="Buscar por nome, telefone ou nº do orçamento">
      <div class="at-convs" id="lista"></div>
    </div>
    <div class="at-chat" id="chat"><div class="at-vazio">💬<br>Escolha uma conversa à esquerda.</div></div>
    <aside class="at-ctx" id="ctx"></aside>
  </div>`;
  const $ = id => el.querySelector('#' + id);
  D.config().then(c => st.cfg = c || {}).catch(() => {});
  D.usuarios().then(u => st.users = u).catch(() => {});
  const offA = W.ouvirConversas(l => { st.convs = l; lista(); kpis(); badge(); });
  const offE = W.ouvirConversas(l => { st.enc = l; if (st.aba === 'enc') lista(); }, { encerradas: true });
  let lembAvisado = false;
  const offL = W.ouvirLembretes(perfil.uid, l => { st.lemb = l; kpis(); lista();
    const venc = l.filter(c => W.ms(c.lembreteEm) <= Date.now()).length; if (venc && !lembAvisado) { lembAvisado = true; toast(`🔔 Você tem ${venc} lembrete(s) de acompanhamento para hoje.`); } });
  let offC = null, offM = null, offO = null;
  addEventListener('pagehide', () => { offA(); offE(); offL(); offC?.(); offM?.(); offO?.(); });
  setInterval(() => { lista(); kpis(); if (st.conv) rodape(); }, 30000); // atualiza contadores de tempo

  // ---------- topo ----------
  function kpis() {
    const agora = Date.now(); const fila = st.convs.filter(c => c.status === 'fila');
    const esperando = st.convs.filter(c => c.ultimaDirecao === 'entrada' && agora - W.ms(c.ultimaEm) > 10 * 60e3).length;
    const meus = st.convs.filter(c => c.atendenteUid === perfil.uid).length;
    const hoje = new Date().toDateString(); const tr = [...st.convs, ...st.enc].filter(c => c.primeiraRespostaEm && new Date(W.ms(c.primeiraEntradaEm)).toDateString() === hoje).map(c => (W.ms(c.primeiraRespostaEm) - W.ms(c.primeiraEntradaEm)) / 60e3).filter(x => x >= 0);
    const encHoje = st.enc.filter(c => new Date(W.ms(c.encerradaEm)).toDateString() === hoje).length;
    const n = npsDe([...st.convs, ...st.enc].filter(c => c.nps != null && agora - W.ms(c.npsEm) < 7 * 864e5));
    $('kp').innerHTML = `<span>Na fila <b>${fila.length}</b></span><span class="${esperando ? 'w' : ''}">Esperando &gt;10 min <b>${esperando}</b></span><span>Meus abertos <b>${meus}</b></span><span>1ª resposta hoje <b>${tr.length ? Math.round(tr.reduce((a, b) => a + b, 0) / tr.length) + ' min' : '—'}</b></span><span>Encerrados hoje <b>${encHoje}</b></span><span title="NPS = % notas 9–10 menos % notas 0–6${n ? ` · ${n.total} resposta(s)` : ''}">NPS 7 dias <b>${n ? n.nps : '—'}</b></span>`;
    const venc = st.lemb.filter(c => W.ms(c.lembreteEm) <= agora).length; const bl = $('nLem'); if (bl) { bl.textContent = venc || st.lemb.length; bl.style.color = venc ? 'var(--red)' : ''; }
  }
  /** NPS clássico: % promotores (9–10) − % detratores (0–6). */
  const npsDe = l => l.length ? { total: l.length, nps: Math.round((l.filter(c => c.nps >= 9).length - l.filter(c => c.nps <= 6).length) / l.length * 100), media: l.reduce((a, c) => a + c.nps, 0) / l.length } : null;
  function badge() { const b = document.getElementById('badgeWa'); if (b) { const n = st.convs.filter(c => c.status === 'fila').length; b.textContent = n; b.hidden = !n; } }

  // ---------- lista ----------
  const ABAS = [['fila', 'Fila'], ['meus', 'Meus'], ['aguardando', 'Aguardando'], ['enc', 'Encerrados']];
  function filtradas() {
    const q = st.busca.trim().toLowerCase(), qd = W.soDig(q);
    let l = st.aba === 'enc' ? [...st.enc].sort((a, b) => W.ms(b.ultimaEm) - W.ms(a.ultimaEm))
      : st.aba === 'fila' ? st.convs.filter(c => c.status === 'fila')
      : st.aba === 'aguardando' ? st.convs.filter(c => c.status === 'aguardando' && (admin || c.atendenteUid === perfil.uid))
      : st.convs.filter(c => c.atendenteUid === perfil.uid && c.status === 'aberta');
    if (q) l = [...st.convs, ...st.enc].filter(c => (c.nome || '').toLowerCase().includes(q) || (c.etiquetas || []).some(t => t.toLowerCase().includes(q)) || (qd && (c.id.includes(qd) || String(c.protocolo || '').replace(/\D/g, '').includes(qd) || String(c.orcamentoNumero || '').includes(qd.replace(/^0+/, '')))));
    return l;
  }
  /** Solta a conversa aberta: volta a tela para o estado inicial (chat e painel do paciente vazios). */
  function fechar() {
    fecharEditor(true); offC?.(); offM?.(); offO?.(); offC = offM = offO = null;
    st.sel = null; st.conv = null; st.fixo = false; st.naLista = false; st.msgs = []; st.orc = null; st.hist = []; st.notaModo = false;
    $('chat').innerHTML = '<div class="at-vazio">💬<br>Escolha uma conversa à esquerda.</div>'; $('ctx').innerHTML = '';
  }
  function lista({ manual = false } = {}) {
    const cont = { fila: st.convs.filter(c => c.status === 'fila').length, meus: st.convs.filter(c => c.atendenteUid === perfil.uid && c.status === 'aberta').length, aguardando: st.convs.filter(c => c.status === 'aguardando' && (admin || c.atendenteUid === perfil.uid)).length };
    let l = filtradas();
    if (st.sel && l.some(c => c.id === st.sel)) st.naLista = true; // só "some da tela" o que já esteve nesta lista
    // A conversa aberta saiu da aba: se ainda é minha/visível (ex.: assumi da fila), a aba acompanha;
    // se encerrou ou foi para outra atendente, a tela limpa. Com busca digitada ou editor aberto, não mexe.
    if (st.sel && !st.busca.trim() && !st.editando && !st.fixo && (st.naLista || manual) && !l.some(c => c.id === st.sel)) {
      const c = st.convs.find(x => x.id === st.sel) || (st.conv?.id === st.sel ? st.conv : null), mine = c && c.atendenteUid === perfil.uid;
      const destino = !c ? null : c.status === 'fila' ? 'fila' : c.status === 'aberta' && mine ? 'meus' : c.status === 'aguardando' && (mine || admin) ? 'aguardando' : null;
      if (manual || (c && !destino)) fechar(); // trocou de aba na mão, encerrou ou foi para outra atendente
      else if (destino) { st.aba = destino; l = filtradas(); } // ainda ativa: a aba acompanha (c ausente = ainda carregando)
    }
    $('tabs').innerHTML = ABAS.map(([k, n]) => `<button class="at-tab ${st.aba === k ? 'on' : ''}" data-aba="${k}">${n}${cont[k] != null ? ` <em>${cont[k]}</em>` : ''}</button>`).join('');
    $('lista').innerHTML = l.map(c => { const j = c.status !== 'encerrada' ? restante(c) : null; return `<div class="at-cv ${st.sel === c.id ? 'on' : ''}" data-tel="${c.id}">
      <span class="av" style="background:${corDe(c.id)}">${escapeHtml(iniciais(c.nome || '?'))}</span>
      <div style="min-width:0"><div class="nm">${escapeHtml(c.nome || W.fmtTelWa(c.id))}</div><div class="pv">${c.ultimaDirecao === 'saida' ? 'Você: ' : ''}${escapeHtml(c.ultimaMsg || '')}</div>
        <div class="chips">${j ? `<span class="ch jan">⏱ ${j}</span>` : c.status !== 'encerrada' ? '<span class="ch fech">janela fechada</span>' : ''}${c.orcamentoNumero ? `<span class="ch orc">#${numOrc(c.orcamentoNumero)}</span>` : ''}${c.status === 'fila' ? '<span class="ch">na fila</span>' : ''}${c.atendenteNome && st.aba !== 'meus' && c.status !== 'fila' ? `<span class="ch">${escapeHtml(primeiroNome(c.atendenteNome))}</span>` : ''}${c.status === 'encerrada' && c.motivo ? `<span class="ch">${escapeHtml(c.motivo.split(' — ')[0])}</span>` : ''}${(c.etiquetas || []).slice(0, 2).map(t => `<span class="ch tag">${escapeHtml(t)}</span>`).join('')}${c.lembreteEm && c.lembreteUid === perfil.uid && W.ms(c.lembreteEm) <= Date.now() ? '<span class="ch fech">🔔 lembrete</span>' : ''}${c.simulado ? '<span class="ch sim">teste</span>' : ''}</div></div>
      <div class="rt">${hora(c.ultimaEm)}${c.naoLidas ? `<span class="un">${c.naoLidas}</span>` : ''}</div></div>`; }).join('') || `<div class="at-vazio" style="padding:30px 10px">${st.aba === 'fila' ? 'Fila vazia 🎉' : 'Nada aqui.'}</div>`;
  }
  $('tabs').addEventListener('click', e => { const b = e.target.closest('[data-aba]'); if (!b) return; st.aba = b.dataset.aba; st.fixo = false; lista({ manual: true }); });
  $('busca').addEventListener('input', e => { st.busca = e.target.value; lista(); });
  $('lista').addEventListener('click', e => { const d = e.target.closest('[data-tel]'); if (d) abrir(d.dataset.tel, { fixo: !!st.busca.trim() }); });

  // ---------- conversa ----------
  /** fixo: aberta pela busca ou pelos lembretes — não some da tela só porque não pertence à aba atual. */
  function abrir(tel, { fixo = false } = {}) {
    fecharEditor(true); st.sel = tel; st.conv = null; st.fixo = fixo; st.naLista = false; st.msgs = []; st.orc = null; st.hist = []; st.notaModo = false; offC?.(); offM?.(); offO?.(); offO = null; lista();
    offC = W.ouvirConversa(tel, c => { const antes = st.conv?.orcamentoId, mudou = st.conv && c && (st.conv.status !== c.status || st.conv.atendenteUid !== c.atendenteUid); st.conv = c; if (!c) return; if (mudou) { lista(); if (st.sel !== tel) return; } cabecalho(); rodape(); contexto(); if (c.orcamentoId !== antes) ligarOrc(); if (c.naoLidas && (c.atendenteUid === perfil.uid)) W.marcarLida(tel); });
    offM = W.ouvirMensagens(tel, m => { st.msgs = m; mensagens(); });
    W.orcamentosDoTelefone(tel).then(h => { st.hist = h; contexto(); }).catch(() => {});
    $('chat').innerHTML = `<div class="at-h" id="cH"></div><div class="at-msgs" id="msgs"></div><div class="at-pop" id="pop" hidden></div><div class="at-comp" id="comp"></div>`;
  }
  function ligarOrc() { offO?.(); offO = null; st.orc = null; if (st.conv?.orcamentoId) offO = W.ouvirOrcamento(st.conv.orcamentoId, o => { st.orc = o; contexto(); }); else contexto(); }
  const minha = () => st.conv && st.conv.atendenteUid === perfil.uid && st.conv.status !== 'encerrada';
  function cabecalho() {
    const c = st.conv; const dono = c.atendenteNome ? `com ${escapeHtml(primeiroNome(c.atendenteNome))}` : 'na fila';
    $('cH').innerHTML = `<span class="av" style="background:${corDe(c.id)}">${escapeHtml(iniciais(c.nome || '?'))}</span>
      <div style="min-width:0"><div class="nm">${escapeHtml(c.nome || W.fmtTelWa(c.id))}</div><small>${W.fmtTelWa(c.id)} · ${c.status === 'encerrada' ? 'encerrada' + (c.motivo ? ' — ' + escapeHtml(c.motivo) : '') : dono}${c.protocolo ? ` · prot. ${escapeHtml(c.protocolo)}` : ''}</small></div><div class="sp"></div>
      <button class="btn ghost sm" data-ac="exportar" title="Exportar a conversa (imprimir / salvar em PDF)">⬇</button>
      ${c.status === 'encerrada' ? '' : c.status === 'fila' || !c.atendenteUid ? '<button class="btn blue sm" data-ac="assumir">Assumir</button>' : !minha() ? (admin ? '<button class="btn ghost sm" data-ac="assumir">Assumir</button>' : '') : '<button class="btn ghost sm" data-ac="fila" title="Devolver para a fila">↩ Fila</button>'}
      ${c.status !== 'encerrada' && (minha() || admin) ? '<button class="btn ghost sm" data-ac="transf">↔ Transferir</button><button class="btn ghost sm" data-ac="encerrar" style="color:var(--red);border-color:var(--red-50)">✓ Encerrar</button>' : ''}`;
  }
  function mensagens() {
    const box = $('msgs'); if (!box) return; const fim = box.scrollHeight - box.scrollTop - box.clientHeight < 80; let dia = '';
    box.innerHTML = st.msgs.map(m => {
      const d = new Date(W.ms(m.em) || Date.now()).toLocaleDateString('pt-BR'); const sep = d !== dia ? `<span class="at-day">${d === new Date().toLocaleDateString('pt-BR') ? 'Hoje' : d}</span>` : ''; dia = d;
      if (m.direcao === 'sistema') return sep + `<div class="at-sys">— ${escapeHtml(m.texto)} · ${hora(m.em)} —</div>`;
      if (m.direcao === 'nota') return sep + `<div class="at-m nota">📝 <b>Nota interna</b> · ${escapeHtml(primeiroNome(m.autorNome))}<br>${fmtTxt(m.texto)}<div class="t">${hora(m.em)}</div></div>`;
      const cls = m.direcao === 'entrada' ? '' : m.autor === 'bot' ? 'bot' : 'out';
      const quem = m.direcao === 'entrada' ? 'Paciente' : m.autor === 'bot' ? '🤖 Assistente Célula' : escapeHtml(primeiroNome(m.autorNome));
      const img = m.imagem || m.midiaUrl; const arq = m.arquivo ? `<button class="at-doc" data-doc="${m.id}" title="Abrir o anexo">${tipoArq(m.arquivo.mime).ic} <b>${escapeHtml(m.arquivo.nome || 'arquivo')}</b><small>${tipoArq(m.arquivo.mime).rt}${m.arquivo.tamanho ? ' · ' + Math.round(m.arquivo.tamanho / 1024) + ' KB' : ''} · clique para abrir</small></button>` : '';
      const tick = m.direcao === 'saida' ? (m.status === 'erro' ? ' ⚠ não enviada' : m.status === 'simulado' ? ' · teste' : m.status === 'read' ? ' ✓✓' : m.status === 'delivered' ? ' ✓✓' : m.status === 'sent' ? ' ✓' : ' …') : '';
      return sep + `<div class="at-m ${cls}"><div class="who">${quem}</div>${img ? `<img class="at-img" src="${img}" data-zoom alt="imagem enviada">` : ''}${arq}${m.texto ? `<div>${fmtTxt(m.texto)}</div>` : ''}
        ${img && m.direcao === 'entrada' ? `<div class="at-ia"><button class="btn blue sm" data-ler="${m.id}">✨ Ler pedido com IA</button></div>` : ''}<div class="t">${hora(m.em)}${tick}</div></div>`;
    }).join('') || '<div class="at-vazio">Sem mensagens.</div>';
    if (fim || !box.dataset.ok) { box.scrollTop = box.scrollHeight; box.dataset.ok = 1; }
  }
  function rodape() {
    const c = st.conv; const comp = $('comp'); if (!comp || !c) return;
    if (c.status === 'encerrada') { comp.innerHTML = '<div class="at-aviso">Conversa encerrada. Se o paciente escrever de novo, ela volta para a fila.</div>'; return; }
    if (!minha() && !admin) { comp.innerHTML = `<div class="at-aviso">Esta conversa está ${c.atendenteNome ? 'com ' + escapeHtml(primeiroNome(c.atendenteNome)) : 'na fila'}. ${c.status === 'fila' ? 'Clique em <b>Assumir</b> para responder.' : ''}</div>`; return; }
    const j = restante(c); const pct = j ? Math.max(3, (W.ms(c.janelaAte) - Date.now()) / W.JANELA_MS * 100) : 0;
    comp.innerHTML = `<div class="at-jan">⏱ Janela de 24h: ${j ? `<b style="color:var(--ok)">${j} restantes</b><span class="bar"><i style="width:${pct}%"></i></span><span>respostas grátis</span>` : '<b style="color:var(--red)">fechada</b><span class="bar"></span><span>só modelo aprovado (em breve)</span>'}</div>
      <div class="at-qr"><button data-q="/orcamento">/orcamento</button><button data-q="/preparo">/preparo</button><button data-q="/prelink">/prelink</button><button data-q="/unidades">/unidades</button><button data-q="/perfil">/perfil</button><button data-nota class="${st.notaModo ? 'on' : ''}">📝 Nota interna</button></div>
      <div class="at-row"><label class="at-ib" title="Anexar imagem (em breve pela API)">📎</label>
        <textarea class="in" id="txt" rows="2" placeholder="${st.notaModo ? 'Nota interna — o paciente NÃO vê' : j ? 'Digite / para respostas rápidas (preços vêm do catálogo)…' : 'Janela fechada: aguarde o paciente escrever ou use um modelo aprovado'}" ${!j && !st.notaModo ? 'disabled' : ''}></textarea>
        <button class="btn blue" id="bEnv" ${!j && !st.notaModo ? 'disabled' : ''}>${st.notaModo ? 'Salvar nota' : 'Enviar ➤'}</button></div>`;
  }

  // ---------- respostas rápidas (geradas do catálogo/orçamento na hora) ----------
  async function rapida(k) {
    const o = st.orc; const nome = primeiroNome(st.conv?.nome) || '';
    if (k === '/unidades') return `*Nossas unidades* (coleta em qualquer uma):\n` + UNIDADES.map(u => `• *${u.nome}* — ${u.end}\n  Atend.: ${u.atend} · Coleta: ${u.coleta} · Sáb.: ${u.sab}`).join('\n') + `\nCentral: ${CENTRAL.fone}`;
    if (k === '/orcamento') { if (!o) throw new Error('Nenhum orçamento ligado a esta conversa ainda. Use “✨ Ler pedido com IA” na foto.'); return textoOrcamento(o); }
    if (k === '/prelink') { if (!o?.preToken) throw new Error('O orçamento ainda não tem link de pré-cadastro (grave o orçamento primeiro).'); return `${nome ? nome + ', p' : 'P'}ara agilizar seu atendimento na recepção, preencha seu pré-cadastro (leva 1 minuto):\n${linkPre(o)}`; }
    if (k === '/preparo') {
      if (!o) throw new Error('Ligue um orçamento à conversa para gerar o preparo dos exames.');
      st.cat ??= await D.catalogoMap(); const j = maiorJejum((o.itens || []).map(i => st.cat[i.mnemonico] || {}));
      return `*Preparo para os seus exames* (orçamento #${numOrc(o.numero)}):\n${j ? `• Jejum de *${j.horas} horas* (é o maior entre os exames; os demais podem ser coletados junto).` : '• *Não é necessário jejum* para estes exames, salvo orientação médica.'}\n• Traga documento com foto e o pedido médico original.`;
    }
    if (k === '/perfil') {
      st.cat ??= await D.catalogoMap(); const perfis = (Array.isArray(st.cfg.perfis) && st.cfg.perfis.length ? st.cfg.perfis : PERFIS_PADRAO).filter(p => p.ativo !== false && p.convenio);
      const preco = slug => Object.values(st.cat).filter(e => e.precos?.[slug] != null).reduce((a, e) => a + e.precos[slug], 0);
      return `*Perfis de check-up Célula* 🩺\n` + perfis.map(p => `• *${p.nome}* — ${brl(preco(p.convenio))}\n  ${p.descricao}`).join('\n') + `\nQuer que eu monte o orçamento de algum?`;
    }
    const r = respostas().find(x => x.atalho === k);
    if (r) { if (/R\$\s*\d/.test(r.texto)) toast('⚠ Esta resposta tem preço fixo no texto — confira se está atualizado.'); return r.texto.replace(/\{nome\}/g, nome || ''); }
    return '';
  }
  /** Respostas rápidas cadastradas pela gestão (⚙ Configurar), além das automáticas. */
  const respostas = () => (st.cfg.wa?.respostas || []).filter(r => r?.atalho && r?.texto);
  const linkPre = o => `https://celulams.com.br/app/pre.html?o=${o.id}&t=${o.preToken}&n=${o.numero}`;
  function textoOrcamento(o) {
    const itens = (o.itens || []).filter(i => i.status !== 'recusado'); const prazo = Math.max(0, ...itens.map(i => i.prazoDias || 0));
    return `Segue seu orçamento *#${numOrc(o.numero)}* 👇\n${itens.map(i => `• ${i.nome}${rotuloQtd(i.nome, i.qtd)}`).join('\n')}\n\n*Total: ${brl(o.total)}* (${o.convenioNome || o.convenio || ''}${o.duplo && o.convenio2Nome ? ' + ' + o.convenio2Nome : ''})${prazo ? `\nResultado em até ${prazo} dias úteis.` : ''}${o.preToken ? `\n\n📝 Pré-cadastro (agiliza sua recepção): ${linkPre(o)}` : ''}\nOrçamento válido por 7 dias. Qualquer dúvida é só chamar! 😊`;
  }

  // ---------- contexto ----------
  function contexto() {
    if (st.editando) return; // editor de orçamento aberto na coluna
    const c = st.conv; if (!c) { $('ctx').innerHTML = ''; return; } const o = st.orc;
    const itens = (o?.itens || []).filter(i => i.status !== 'recusado'); const pend = itens.filter(i => i.status !== 'ok').length;
    $('ctx').innerHTML = `<div class="at-card"><h3>👤 Paciente</h3><div class="kv"><span>Nome</span><b>${escapeHtml(c.nome || '—')}</b><span>WhatsApp</span><b>${W.fmtTelWa(c.id)}</b>${o ? `<span>Convênio</span><b>${escapeHtml(o.convenioNome || o.convenio || '')}</b>` : ''}${c.protocolo ? `<span>Protocolo</span><b>${escapeHtml(c.protocolo)}</b>` : ''}${c.nps != null ? `<span>Última nota</span><b>${c.nps >= 9 ? '😀' : c.nps >= 7 ? '🙂' : '😟'} ${c.nps}/10${c.npsAtendenteNome ? ` <small class="note">(${escapeHtml(primeiroNome(c.npsAtendenteNome))})</small>` : ''}</b>` : ''}</div></div>
    ${cardEtiquetas(c)}${cardLembrete(c)}
    <div class="at-card"><h3>🧾 Orçamento desta conversa</h3>${o ? `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><b>#${numOrc(o.numero)}</b><span class="pill ${o.status === 'convertido' ? 'ok' : o.status === 'aguardando_conferencia' ? 'warn' : ''}">${escapeHtml({ rascunho: 'rascunho', gravado: 'gravado', enviado: 'enviado', aguardando_conferencia: 'aguardando conferência', convertido: 'convertido', perdido: 'perdido' }[o.status] || o.status)}</span></div>
      ${itens.map(i => `<div class="ex"><span class="mn">${escapeHtml(i.mnemonico || '?')}</span><span>${escapeHtml(i.nome)}${escapeHtml(rotuloQtd(i.nome, i.qtd))}</span><b>${i.valor != null ? brl(i.valorTotal ?? i.valor) : '—'}</b></div>`).join('')}
      ${pend ? `<div class="at-flag">⚠ ${pend} exame(s) aguardando conferência/valor da gestão.</div>` : ''}
      <div class="tot"><span>Total</span><span>${brl(o.total)}</span></div>
      <div class="acts"><button class="btn ok sm full" data-ac="envOrc" ${minha() && restante(c) ? '' : 'disabled'}>📤 Enviar orçamento no WhatsApp</button><button class="btn ghost sm" data-ac="editEd">✏️ Editar / PDF</button><button class="btn ghost sm" data-ac="desv">Trocar</button></div>`
      : `<div class="at-empty">Nenhum orçamento ligado.<br>Use <b>✨ Ler pedido com IA</b> na foto do pedido ou ligue um existente abaixo.</div>
      <div style="display:flex;gap:6px;margin-top:8px"><input class="in" id="vNum" placeholder="nº do orçamento" style="flex:1;padding:7px 10px"><button class="btn ghost sm" data-ac="vinc">Ligar</button></div>
      <button class="btn ghost sm" data-ac="novoEd" style="margin-top:8px;justify-content:center;width:100%">＋ Novo orçamento para este paciente</button>`}</div>
    <div class="at-card"><h3>🕘 Histórico deste telefone</h3>${st.hist.length ? `<div class="hist">${st.hist.slice(0, 6).map(h => `<div><span>#${numOrc(h.numero)} · ${h.criadoEm?.toDate ? h.criadoEm.toDate().toLocaleDateString('pt-BR') : ''} · ${brl(h.total)}</span><span class="pill ${h.status === 'convertido' ? 'ok' : ''}">${h.status === 'convertido' ? 'veio coletar' : escapeHtml(h.status || '')}</span></div>`).join('')}</div>` : '<div class="note">Nenhum orçamento anterior com este telefone.</div>'}</div>`;
  }
  const etiquetasCfg = () => (st.cfg.wa?.etiquetas?.length ? st.cfg.wa.etiquetas : W.ETIQUETAS_PADRAO);
  const podeMexer = () => minha() || admin || st.conv?.status === 'fila';
  function cardEtiquetas(c) {
    const tem = new Set(c.etiquetas || []);
    return `<div class="at-card"><h3>🏷 Etiquetas</h3><div class="at-tags">${[...new Set([...etiquetasCfg(), ...tem])].map(t => `<button class="at-tag ${tem.has(t) ? 'on' : ''}" data-tag="${escapeHtml(t)}" ${podeMexer() ? '' : 'disabled'}>${escapeHtml(t)}</button>`).join('')}</div></div>`;
  }
  const fmtData = t => new Date(W.ms(t)).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  function cardLembrete(c) {
    if (c.lembreteEm) { const venc = W.ms(c.lembreteEm) <= Date.now();
      return `<div class="at-card"><h3>🔔 Acompanhamento</h3><div class="${venc ? 'at-flag' : 'note'}" style="margin:0">${venc ? 'Venceu' : 'Lembrar'} em <b>${fmtData(c.lembreteEm)}</b>${c.lembreteNome ? ` · ${escapeHtml(primeiroNome(c.lembreteNome))}` : ''}${c.lembreteTexto ? `<br>${escapeHtml(c.lembreteTexto)}` : ''}</div>
        <div class="acts"><button class="btn ok sm" data-ac="lemOk">✓ Concluir</button><button class="btn ghost sm" data-ac="lemAdiar">Adiar 1 dia</button></div></div>`; }
    return `<div class="at-card"><h3>🔔 Acompanhamento</h3><input class="in" id="lemTxt" placeholder="O que fazer? (ex.: ver se agendou a coleta)" style="padding:7px 10px;margin-bottom:6px">
      <div class="acts" style="margin-top:0"><button class="btn ghost sm" data-lem="amanha">Amanhã 09:00</button><button class="btn ghost sm" data-lem="2d">Em 2 dias</button><button class="btn ghost sm" data-lem="7d">Em 1 semana</button><input class="in" type="datetime-local" id="lemQuando" title="Outra data" style="padding:5px 6px;font-size:.75rem"></div></div>`;
  }
  /** 09:00 do dia (hoje + n) no horário local. */
  const diaAs9 = n => { const d = new Date(); d.setDate(d.getDate() + n); d.setHours(9, 0, 0, 0); return d; };
  const urlNovoOrc = (msgId) => `orcamento.html?wa=${encodeURIComponent(st.sel)}&nome=${encodeURIComponent(st.conv?.nome || '')}${msgId ? '&msg=' + msgId : ''}`;

  // ---------- ações ----------
  el.addEventListener('click', async e => {
    const zoom = e.target.closest('[data-zoom]'); if (zoom) { telaCheia(zoom.src); return; }
    const q = e.target.closest('[data-q]');
    if (q) { try { const t = await rapida(q.dataset.q); if (t) { $('txt').value = t; $('txt').focus(); $('pop').hidden = true; } } catch (err) { toast(err.message); } return; }
    if (e.target.closest('[data-nota]')) { st.notaModo = !st.notaModo; rodape(); $('txt')?.focus(); return; }
    const ler = e.target.closest('[data-ler]');
    if (ler) { // guarda a foto para a página de orçamento (mesma aba do navegador) e abre com o paciente preenchido
      const m = st.msgs.find(x => x.id === ler.dataset.ler); try { localStorage.setItem('waPedido', JSON.stringify({ tel: st.sel, nome: st.conv?.nome || '', fotos: [m.imagem || m.midiaUrl] })); } catch { toast('Imagem grande demais para passar ao orçamento.'); return; }
      abrirEditor(urlNovoOrc(m.id) + '&embed=1'); return;
    }
    const dc = e.target.closest('[data-doc]'); if (dc) { const m = st.msgs.find(x => x.id === dc.dataset.doc); const aba = window.open('', '_blank');
      try { let blob; if (m?.arquivo?.dataUrl) { const b64 = m.arquivo.dataUrl.split(',')[1]; blob = new Blob([Uint8Array.from(atob(b64), ch => ch.charCodeAt(0))], { type: m.arquivo.mime || 'application/pdf' }); }
        else if (m?.midiaKey) { dc.disabled = true; blob = await W.baixarMidia(m.midiaKey, st.cfg); }
        if (blob) aba.location = URL.createObjectURL(blob); else aba.close(); } catch (er) { aba.close(); toast('Não foi possível abrir o anexo: ' + er.message); } finally { dc.disabled = false; } return; }
    const tg = e.target.closest('[data-tag]');
    if (tg) { const set = new Set(st.conv.etiquetas || []); set.has(tg.dataset.tag) ? set.delete(tg.dataset.tag) : set.add(tg.dataset.tag); try { await W.etiquetar(st.sel, [...set]); } catch (err) { toast('Erro: ' + err.message); } return; }
    const lm = e.target.closest('[data-lem]');
    if (lm) { const q = { amanha: diaAs9(1), '2d': diaAs9(2), '7d': diaAs9(7) }[lm.dataset.lem]; try { await W.definirLembrete(st.sel, q, $('lemTxt')?.value.trim(), perfil); toast(`🔔 Lembrete para ${fmtData(q)}`, true); } catch (err) { toast('Erro: ' + err.message); } return; }
    const b = e.target.closest('[data-ac]'); if (!b) { if (e.target.id === 'bEnv') enviarTxt(); return; }
    const tel = st.sel; const ac = b.dataset.ac;
    try {
      if (ac === 'assumir') { await W.assumir(tel, perfil); st.aba = 'meus'; lista(); }
      if (ac === 'fila') await W.devolverFila(tel, perfil);
      if (ac === 'transf') transferirModal();
      if (ac === 'encerrar') encerrarModal();
      if (ac === 'envOrc') { await W.enviar(tel, textoOrcamento(st.orc), perfil, st.cfg); D.mudarStatus(st.orc.id, 'enviado').catch(() => {}); toast('Orçamento enviado na conversa', true); }
      if (ac === 'vinc') { const n = Number(W.soDig($('vNum').value)); if (!n) return; const o = [...st.hist].find(h => h.numero === n) || (await D.orcamentosRecentes({ dias: 90, max: 2000 })).find(h => h.numero === n); if (!o) { toast('Orçamento não encontrado nos últimos 90 dias.'); return; } await W.vincularOrcamento(tel, o.id, o.numero); toast(`Orçamento #${numOrc(n)} ligado à conversa`, true); }
      if (ac === 'desv') await W.vincularOrcamento(tel, null, null);
      if (ac === 'novoEd') abrirEditor(urlNovoOrc() + '&embed=1');
      if (ac === 'editEd') abrirEditor(`orcamento.html?id=${st.orc.id}&wa=${encodeURIComponent(tel)}&embed=1`);
      if (ac === 'fecharEd') fecharEditor();
      if (ac === 'lemOk') { await W.concluirLembrete(tel); toast('Lembrete concluído', true); }
      if (ac === 'lemAdiar') { const d = new Date(Math.max(Date.now(), W.ms(st.conv.lembreteEm)) + 864e5); await W.definirLembrete(tel, d, st.conv.lembreteTexto, perfil); toast(`Adiado para ${fmtData(d)}`, true); }
      if (ac === 'exportar') exportarConversa();
    } catch (err) { toast('Erro: ' + err.message); }
  });
  async function enviarTxt() {
    const t = $('txt'); const v = t.value.trim(); if (!v) return; t.disabled = true;
    try { if (st.notaModo) { await W.nota(st.sel, v, perfil); st.notaModo = false; } else await W.enviar(st.sel, v, perfil, st.cfg); t.value = ''; rodape(); }
    catch (err) { toast('Não enviou: ' + err.message); } finally { const n = $('txt'); if (n) { n.disabled = false; n.focus(); } }
  }
  el.addEventListener('change', async e => { if (e.target.id !== 'lemQuando' || !e.target.value) return; const d = new Date(e.target.value); if (d <= new Date()) { toast('Escolha uma data futura.'); return; }
    try { await W.definirLembrete(st.sel, d, $('lemTxt')?.value.trim(), perfil); toast(`🔔 Lembrete para ${fmtData(d)}`, true); } catch (err) { toast('Erro: ' + err.message); } });
  el.addEventListener('keydown', e => { if (e.target.id === 'txt' && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviarTxt(); } });
  el.addEventListener('input', e => { if (e.target.id !== 'txt') return; const v = e.target.value; const pop = $('pop');
    if (v.startsWith('/') && !v.includes(' ') && !v.includes('\n')) { const ops = [['/orcamento', 'Resumo do orçamento ligado'], ['/preparo', 'Jejum/preparo dos exames do orçamento'], ['/prelink', 'Link do pré-cadastro'], ['/unidades', 'Endereços e horários das 8 unidades'], ['/perfil', 'Perfis de check-up com preço atual'], ...respostas().map(r => [r.atalho, r.texto.replace(/\s+/g, ' ').slice(0, 60)])].filter(o => o[0].startsWith(v.toLowerCase()));
      pop.innerHTML = ops.map(o => `<div data-q="${escapeHtml(o[0])}"><b>${escapeHtml(o[0])}</b> <span>${escapeHtml(o[1])}</span></div>`).join(''); pop.hidden = !ops.length; } else pop.hidden = true; });

  function transferirModal() {
    const us = st.users.filter(u => u.ativo !== false && u.id !== st.conv.atendenteUid);
    modal(`<div class="modal-b"><h2 style="margin:0 0 10px">Transferir conversa</h2><div style="display:flex;flex-direction:column;gap:6px">${us.map(u => `<button class="btn ghost" data-para="${u.id}" style="justify-content:space-between">${escapeHtml(u.nome)} <small>${escapeHtml(u.status || 'offline')}</small></button>`).join('')}</div></div>`, { largura: 420 });
    document.getElementById('modalBg').addEventListener('click', async ev => { const p = ev.target.closest('[data-para]'); if (!p) return; const u = us.find(x => x.id === p.dataset.para); try { await W.transferir(st.sel, u, perfil); fecharModal(); toast(`Transferida para ${u.nome}`, true); } catch (err) { toast('Erro: ' + err.message); } });
  }
  function encerrarModal() {
    const c = st.conv, o = st.orc, podeNps = !!restante(c);
    const orcAberto = o && !['convertido', 'perdido'].includes(o.status);
    modal(`<div class="modal-b"><h2 style="margin:0 0 4px">Encerrar atendimento</h2><p class="note" style="margin:0 0 10px">O motivo alimenta o CRM (por que converteu ou não).</p>${MOTIVOS.map((m, i) => `<label class="at-mot"><input type="radio" name="mot" value="${escapeHtml(m)}" ${i === 0 && o ? 'checked' : ''}> ${escapeHtml(m)}</label>`).join('')}
      ${orcAberto ? `<label class="at-mot" id="mPerdL" hidden style="border-style:dashed"><input type="checkbox" id="mPerd" checked> Marcar o orçamento #${numOrc(o.numero)} como <b>perdido</b> no CRM</label>` : ''}
      ${podeNps ? '<label class="at-mot" style="border-style:dashed"><input type="checkbox" id="mNps" checked> Enviar pesquisa de satisfação (nota de 0 a 10)</label>' : ''}
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px"><button class="btn ghost sm" id="mCanc">Cancelar</button><button class="btn blue sm" id="mOk">Encerrar</button></div></div>`, { largura: 460 });
    const perdas = ['Achou caro', 'Convênio não cobre'];
    const sync = () => { const l = document.getElementById('mPerdL'); if (l) l.hidden = !perdas.includes(document.querySelector('[name=mot]:checked')?.value); };
    document.querySelectorAll('[name=mot]').forEach(r => r.onchange = sync); sync();
    document.getElementById('mCanc').onclick = fecharModal;
    document.getElementById('mOk').onclick = async ev => { const v = document.querySelector('[name=mot]:checked')?.value; if (!v) { toast('Escolha o motivo.'); return; }
      const nps = document.getElementById('mNps')?.checked && !['Engano / spam'].includes(v); ev.target.disabled = true;
      try {
        if (nps) await W.enviar(st.sel, W.NPS_TEXTO, perfil, st.cfg);
        await W.encerrar(st.sel, v, perfil, { nps });
        if (orcAberto && perdas.includes(v) && document.getElementById('mPerd')?.checked) await W.marcarPerdido(o.id, v);
        fecharModal(); toast('Atendimento encerrado' + (nps ? ' · pesquisa enviada' : ''), true);
      } catch (err) { ev.target.disabled = false; toast('Erro: ' + err.message); } };
  }

  // ---------- editor de orçamento na coluna do paciente (orcamento.html em modo compacto) ----------
  function abrirEditor(src) {
    st.editando = true; el.querySelector('.at').classList.add('editando');
    $('ctx').innerHTML = `<div class="at-ed-h"><b>🧾 Orçamento de ${escapeHtml(primeiroNome(st.conv?.nome) || 'paciente')}</b><div class="sp"></div><button class="btn ghost sm" data-ac="fecharEd">✕ Fechar</button></div><iframe class="at-ed" src="${src}" title="Editor de orçamento"></iframe>`;
  }
  function fecharEditor(silencioso) {
    if (!st.editando) return; st.editando = false; el.querySelector('.at').classList.remove('editando'); if (!silencioso) contexto();
  }
  // o editor avisa quando o orçamento foi gravado: anexa o PDF + resumo na conversa
  addEventListener('message', async ev => {
    if (ev.origin !== location.origin || ev.data?.tipo !== 'waOrcamentoPronto') return;
    const d = ev.data; if (d.tel !== st.sel) { toast('Orçamento gravado, mas a conversa aberta mudou — envie pelo painel da conversa certa.'); return; }
    try {
      const c = st.conv;
      if (c.atendenteUid && c.atendenteUid !== perfil.uid && c.status !== 'fila') { toast(`Orçamento gravado. A conversa está com ${primeiroNome(c.atendenteNome)} — o PDF não foi enviado.`); return; }
      if (!restante(c)) { toast('Orçamento gravado, mas a janela de 24h está fechada — o PDF não pode ser enviado agora.'); return; }
      if (c.status === 'fila' || !c.atendenteUid) await W.assumir(st.sel, perfil);
      await W.enviar(st.sel, textoOrcamento(d.orc), perfil, st.cfg, { tipo: 'document', arquivo: { nome: d.nome, mime: 'application/pdf', dataUrl: d.pdf } });
      D.mudarStatus(d.id, 'enviado').catch(() => {});
      fecharEditor(); toast(`Orçamento #${numOrc(d.numero)} enviado em PDF na conversa`, true);
    } catch (err) { toast('Orçamento gravado, mas o PDF não foi enviado: ' + err.message); }
  });

  // ---------- exportar conversa (imprimir / salvar em PDF) ----------
  function exportarConversa() {
    const c = st.conv; const w = window.open('', '_blank'); if (!w) { toast('Libere pop-ups para exportar.'); return; }
    const linhas = st.msgs.map(m => {
      const quando = new Date(W.ms(m.em) || Date.now()).toLocaleString('pt-BR');
      if (m.direcao === 'sistema') return `<p class="sys">— ${escapeHtml(m.texto)} · ${quando} —</p>`;
      const quem = m.direcao === 'entrada' ? escapeHtml(c.nome || 'Paciente') : m.direcao === 'nota' ? `📝 Nota interna · ${escapeHtml(m.autorNome || '')}` : m.autor === 'bot' ? 'Assistente Célula' : escapeHtml(m.autorNome || 'Atendente');
      return `<div class="m ${m.direcao}"><b>${quem}</b> <small>${quando}</small>${m.imagem ? `<br><img src="${m.imagem}">` : ''}${m.arquivo ? `<br>📎 ${escapeHtml(m.arquivo.nome || 'arquivo')}` : ''}<div>${fmtTxt(m.texto)}</div></div>`;
    }).join('');
    w.document.write(`<!doctype html><meta charset="utf-8"><title>Atendimento ${escapeHtml(c.protocolo || c.id)}</title><style>body{font:13px system-ui,sans-serif;max-width:760px;margin:24px auto;color:#111}h1{font-size:18px;margin:0}.cab{border-bottom:2px solid #1d4ed8;padding-bottom:8px;margin-bottom:12px}.m{border:1px solid #ddd;border-radius:8px;padding:6px 10px;margin:6px 0;break-inside:avoid}.m.entrada{background:#f8fafc}.m.saida{background:#eff6ff;margin-left:40px}.m.nota{background:#fff7d6}.sys{text-align:center;color:#666;font-size:11px}img{max-width:260px;max-height:300px;border-radius:6px;margin-top:4px}small{color:#666}</style>
      <div class="cab"><h1>Célula Diagnósticos — Atendimento WhatsApp</h1>Paciente: <b>${escapeHtml(c.nome || '—')}</b> · ${W.fmtTelWa(c.id)}${c.protocolo ? ` · Protocolo <b>${escapeHtml(c.protocolo)}</b>` : ''}${c.orcamentoNumero ? ` · Orçamento #${numOrc(c.orcamentoNumero)}` : ''}<br><small>Exportado por ${escapeHtml(perfil.nome)} em ${new Date().toLocaleString('pt-BR')} · documento com dados pessoais de saúde (LGPD) — não compartilhe fora da Célula.</small></div>${linhas}<script>onload=()=>print()<\/script>`);
    w.document.close();
  }

  // ---------- lembretes (todas as conversas com lembrete meu) ----------
  $('bLem').addEventListener('click', () => {
    const agora = Date.now();
    modal(`<h2 style="margin:0 0 4px">🔔 Meus lembretes</h2><p class="note" style="margin:0 0 10px">Marque um lembrete no painel da conversa (🔔 Acompanhamento). Clique para abrir.</p>
      ${st.lemb.length ? st.lemb.map(c => `<button class="at-mot" data-abre="${c.id}" style="width:100%;justify-content:space-between;background:none;${W.ms(c.lembreteEm) <= agora ? 'border-color:var(--red)' : ''}"><span style="text-align:left"><b>${escapeHtml(c.nome || W.fmtTelWa(c.id))}</b><br><small class="note">${escapeHtml(c.lembreteTexto || 'sem descrição')} · conversa ${escapeHtml(c.status)}</small></span><span style="white-space:nowrap;${W.ms(c.lembreteEm) <= agora ? 'color:var(--red)' : ''}">${fmtData(c.lembreteEm)}</span></button>`).join('') : '<div class="at-empty">Nenhum lembrete. 🎉</div>'}`, { largura: 520 });
    document.getElementById('modalBg').addEventListener('click', ev => { const b = ev.target.closest('[data-abre]'); if (!b) return; fecharModal(); abrir(b.dataset.abre, { fixo: true }); });
  });

  // ---------- equipe ao vivo (admin) ----------
  $('bEq')?.addEventListener('click', async () => {
    st.users = await D.usuarios().catch(() => st.users); const hoje = new Date().toDateString(), agora = Date.now();
    const todas = [...st.convs, ...st.enc];
    const linhas = st.users.filter(u => u.ativo !== false).map(u => { const sEf = D.statusEfetivo(u);
      const n = npsDe(todas.filter(c => c.npsAtendenteUid === u.id && c.nps != null && agora - W.ms(c.npsEm) < 7 * 864e5));
      return `<tr><td><b>${escapeHtml(u.nome || u.email)}</b></td><td>${{ online: '🟢', ocupado: '🔴', pausa: '🟠', almoco: '🍽️', finalizado: '⚪', offline: '⚫' }[sEf] || ''} ${escapeHtml(D.STATUS_LABEL[sEf] || sEf)}</td>
        <td class="num">${st.convs.filter(c => c.atendenteUid === u.id && c.status === 'aberta').length}</td><td class="num">${st.convs.filter(c => c.atendenteUid === u.id && c.status === 'aguardando').length}</td>
        <td class="num">${st.enc.filter(c => c.atendenteUid === u.id && new Date(W.ms(c.encerradaEm)).toDateString() === hoje).length}</td><td class="num">${n ? `${n.media.toFixed(1)} <small class="note">(${n.total})</small>` : '—'}</td>
        <td style="text-align:center"><input type="checkbox" data-recebe="${u.id}" ${u.recebeWa !== false ? 'checked' : ''} title="Entra na distribuição automática"></td></tr>`; }).join('');
    modal(`<h2 style="margin:0 0 4px">👥 Equipe ao vivo</h2><p class="note" style="margin:0 0 10px">Distribuição automática: <b>${st.cfg.wa?.distribuicao ? 'ligada' : 'desligada'}</b> (⚙ Configurar). Só recebe quem está 🟢 Online e marcado em “Distribuição”.</p>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Atendente</th><th>Status</th><th class="num">Abertos</th><th class="num">Aguard.</th><th class="num">Encerr. hoje</th><th class="num">Nota média 7d</th><th>Distribuição</th></tr></thead><tbody>${linhas}</tbody></table></div>`, { largura: 820 });
    document.getElementById('modalBg').addEventListener('change', async ev => { const cb = ev.target.closest('[data-recebe]'); if (!cb) return;
      try { await D.editarUsuario(cb.dataset.recebe, { recebeWa: cb.checked }); const u = st.users.find(x => x.id === cb.dataset.recebe); if (u) u.recebeWa = cb.checked; toast('Salvo', true); } catch (err) { cb.checked = !cb.checked; toast('Erro: ' + err.message); } });
  });

  // ---------- configurar atendimento (admin) ----------
  $('bCfg')?.addEventListener('click', async () => {
    st.cfg = await D.config(true).catch(() => st.cfg) || {}; const wa = st.cfg.wa || {}, h = wa.horario || W.HORARIO_PADRAO;
    const linhaResp = (r = {}) => `<div class="at-resp"><input class="in" data-r="atalho" placeholder="/atalho" value="${escapeHtml(r.atalho || '')}"><textarea class="in" data-r="texto" rows="2" placeholder="Texto (use {nome} para o primeiro nome do paciente)">${escapeHtml(r.texto || '')}</textarea><button class="btn ghost sm" data-rm title="Remover">✕</button></div>`;
    modal(`<h2 style="margin:0 0 12px">⚙ Configurar atendimento</h2>
      <label class="at-mot"><input type="checkbox" id="cDist" ${wa.distribuicao ? 'checked' : ''}> <span><b>Distribuição automática</b><br><small class="note">Nova conversa (no horário) vai direto para a atendente 🟢 Online com menos conversas abertas. Desligada: tudo cai na Fila.</small></span></label>
      <h3 class="at-sec">Horário de atendimento <small class="note">(fuso de Campo Grande)</small></h3>
      <div class="form" style="grid-template-columns:repeat(4,1fr)"><label class="f">Seg–sex início<input class="in" type="time" id="cSemI" value="${h.semana?.[0] || ''}"></label><label class="f">Seg–sex fim<input class="in" type="time" id="cSemF" value="${h.semana?.[1] || ''}"></label><label class="f">Sábado início<input class="in" type="time" id="cSabI" value="${h.sabado?.[0] || ''}"></label><label class="f">Sábado fim<input class="in" type="time" id="cSabF" value="${h.sabado?.[1] || ''}"></label></div>
      <p class="note" style="margin:4px 0 0">Domingo e feriados: fechado. Sábado em branco = fechado. Agora está <b>${W.dentroDoHorario(h) ? 'dentro' : 'fora'}</b> do horário.</p>
      <h3 class="at-sec">Mensagens automáticas</h3>
      <label class="f">Boas-vindas (1ª mensagem no horário)<textarea class="in" id="cBv" rows="3" placeholder="${escapeHtml(W.BOAS_VINDAS)}">${escapeHtml(wa.boasVindas || '')}</textarea></label>
      <label style="display:flex;gap:6px;align-items:center;margin:4px 0 8px;font-size:.84rem"><input type="checkbox" id="cBvOff" ${wa.boasVindas === '' ? 'checked' : ''}> Não enviar boas-vindas</label>
      <label class="f">Fora do horário<textarea class="in" id="cFora" rows="3" placeholder="${escapeHtml(W.textoForaHorario(h))}">${escapeHtml(wa.foraHorario || '')}</textarea></label>
      <p class="note" style="margin:4px 0 0">Em branco = texto padrão (mostrado em cinza).</p>
      <h3 class="at-sec">Etiquetas</h3><input class="in" id="cEtq" value="${escapeHtml((wa.etiquetas?.length ? wa.etiquetas : W.ETIQUETAS_PADRAO).join(', '))}">
      <h3 class="at-sec">Respostas rápidas da equipe <small class="note">(além de /orcamento, /preparo, /prelink, /unidades e /perfil, que são automáticas)</small></h3>
      <div id="cResp">${(wa.respostas || []).map(linhaResp).join('')}</div><button class="btn ghost sm" id="cAdd">＋ Adicionar resposta</button>
      <p class="note" style="margin:6px 0 0">Evite preço fixo no texto — use /orcamento ou /perfil, que buscam o valor atual do catálogo.</p>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px"><button class="btn ghost sm" id="cCanc">Cancelar</button><button class="btn blue sm" id="cOk">Salvar</button></div>`, { largura: 720 });
    const box = document.getElementById('cResp');
    document.getElementById('cAdd').onclick = () => box.insertAdjacentHTML('beforeend', linhaResp());
    box.addEventListener('click', ev => ev.target.closest('[data-rm]')?.closest('.at-resp').remove());
    document.getElementById('cCanc').onclick = fecharModal;
    document.getElementById('cOk').onclick = async () => {
      const v = id => document.getElementById(id).value.trim(); const fixas = ['/orcamento', '/preparo', '/prelink', '/unidades', '/perfil'];
      const resp = [...box.querySelectorAll('.at-resp')].map(r => ({ atalho: '/' + r.querySelector('[data-r=atalho]').value.trim().toLowerCase().replace(/^\/+/, '').replace(/\s+/g, '-'), texto: r.querySelector('[data-r=texto]').value.trim() })).filter(r => r.atalho.length > 1 && r.texto);
      const dup = resp.find((r, i) => fixas.includes(r.atalho) || resp.findIndex(x => x.atalho === r.atalho) !== i); if (dup) { toast(`Atalho repetido ou reservado: ${dup.atalho}`); return; }
      if (!v('cSemI') || !v('cSemF')) { toast('Informe o horário de segunda a sexta.'); return; }
      const novo = { ...wa, distribuicao: document.getElementById('cDist').checked, horario: { semana: [v('cSemI'), v('cSemF')], sabado: v('cSabI') && v('cSabF') ? [v('cSabI'), v('cSabF')] : null, domingo: null },
        boasVindas: document.getElementById('cBvOff').checked ? '' : v('cBv') || null, foraHorario: v('cFora') || null,
        etiquetas: [...new Set(v('cEtq').split(',').map(x => x.trim()).filter(Boolean))].slice(0, 20), respostas: resp.slice(0, 80) };
      try { await D.salvarConfig({ wa: novo }); st.cfg = await D.config(true); fecharModal(); toast('Configurações do atendimento salvas', true); if (st.conv) { rodape(); contexto(); } } catch (err) { toast('Erro: ' + err.message); }
    };
  });

  // ---------- simulador (admin) ----------
  $('bSim')?.addEventListener('click', () => {
    modal(`<div class="modal-b"><h2 style="margin:0 0 4px">🧪 Simulador de WhatsApp</h2><p class="note" style="margin:0 0 12px">Grava uma mensagem como se o paciente tivesse escrito. Use só dados de teste. Com a distribuição ligada, a conversa de teste vai só para você — nunca para a equipe.</p>
      <div class="form" style="grid-template-columns:1fr 1fr"><label class="f">Telefone<input class="in" id="sTel" value="${st.conv?.id ? W.fmtTelWa(st.conv.id) : '(67) 9 0000-0001'}"></label><label class="f">Nome no WhatsApp<input class="in" id="sNome" value="${escapeHtml(st.conv?.nome || 'Paciente Teste')}"></label>
      <label class="f full">Mensagem<textarea class="in" id="sTxt" rows="2" placeholder="ex.: Boa tarde, quanto fica esse pedido? Particular"></textarea></label>
      <label class="f full">Foto do pedido (opcional)<input class="in" type="file" id="sImg" accept="image/*"></label></div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px"><button class="btn ghost sm" id="sCanc">Fechar</button><button class="btn blue sm" id="sOk">Receber mensagem</button></div></div>`, { largura: 520 });
    document.getElementById('sCanc').onclick = fecharModal;
    document.getElementById('sOk').onclick = async () => {
      const f = document.getElementById('sImg').files[0]; const texto = document.getElementById('sTxt').value.trim(); if (!texto && !f) { toast('Escreva algo ou escolha uma foto.'); return; }
      try { const imagem = f ? await comprimirImagem(f, 1400, .8) : null;
        st.cfg = await D.config(true).catch(() => st.cfg) || {}; // mesmas regras que o servidor usará: horário, boas-vindas, distribuição
        // no simulador a distribuição só considera VOCÊ (conversa de teste nunca cai para a equipe)
        const atendente = st.cfg.wa?.distribuicao ? W.escolherAtendente((await D.usuarios().catch(() => st.users)).filter(u => u.id === perfil.uid), st.convs) : null;
        const tel = await W.simularEntrada({ tel: document.getElementById('sTel').value, nome: document.getElementById('sNome').value.trim(), texto, imagem }, { cfg: st.cfg, atendente });
        fecharModal(); if (!st.sel) abrir(tel); toast('Mensagem recebida (teste)' + (atendente ? ' · distribuída para você' : ''), true); }
      catch (err) { toast('Erro: ' + err.message); }
    };
  });
}
