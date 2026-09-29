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
  const st = { convs: [], enc: [], aba: 'meus', busca: '', sel: null, conv: null, msgs: [], orc: null, hist: [], users: [], cfg: {}, cat: null, notaModo: false, editando: false };
  el.innerHTML = `
  <div class="at-top"><div class="kp" id="kp"></div><div class="sp"></div>
    ${admin ? '<button class="btn ghost sm" id="bSim" title="Grava mensagens de teste como se viessem do WhatsApp">🧪 Simulador</button>' : ''}</div>
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
  let offC = null, offM = null, offO = null;
  addEventListener('pagehide', () => { offA(); offE(); offC?.(); offM?.(); offO?.(); });
  setInterval(() => { lista(); kpis(); if (st.conv) rodape(); }, 30000); // atualiza contadores de tempo

  // ---------- topo ----------
  function kpis() {
    const agora = Date.now(); const fila = st.convs.filter(c => c.status === 'fila');
    const esperando = st.convs.filter(c => c.ultimaDirecao === 'entrada' && agora - W.ms(c.ultimaEm) > 10 * 60e3).length;
    const meus = st.convs.filter(c => c.atendenteUid === perfil.uid).length;
    const hoje = new Date().toDateString(); const tr = [...st.convs, ...st.enc].filter(c => c.primeiraRespostaEm && new Date(W.ms(c.primeiraEntradaEm)).toDateString() === hoje).map(c => (W.ms(c.primeiraRespostaEm) - W.ms(c.primeiraEntradaEm)) / 60e3).filter(x => x >= 0);
    $('kp').innerHTML = `<span>Na fila <b>${fila.length}</b></span><span class="${esperando ? 'w' : ''}">Esperando &gt;10 min <b>${esperando}</b></span><span>Meus abertos <b>${meus}</b></span><span>1ª resposta hoje <b>${tr.length ? Math.round(tr.reduce((a, b) => a + b, 0) / tr.length) + ' min' : '—'}</b></span>`;
  }
  function badge() { const b = document.getElementById('badgeWa'); if (b) { const n = st.convs.filter(c => c.status === 'fila').length; b.textContent = n; b.hidden = !n; } }

  // ---------- lista ----------
  const ABAS = [['fila', 'Fila'], ['meus', 'Meus'], ['aguardando', 'Aguardando'], ['enc', 'Encerrados']];
  function filtradas() {
    const q = st.busca.trim().toLowerCase(), qd = W.soDig(q);
    let l = st.aba === 'enc' ? [...st.enc].sort((a, b) => W.ms(b.ultimaEm) - W.ms(a.ultimaEm))
      : st.aba === 'fila' ? st.convs.filter(c => c.status === 'fila')
      : st.aba === 'aguardando' ? st.convs.filter(c => c.status === 'aguardando' && (admin || c.atendenteUid === perfil.uid))
      : st.convs.filter(c => c.atendenteUid === perfil.uid && c.status === 'aberta');
    if (q) l = [...st.convs, ...st.enc].filter(c => (c.nome || '').toLowerCase().includes(q) || (qd && (c.id.includes(qd) || String(c.orcamentoNumero || '').includes(qd.replace(/^0+/, '')))));
    return l;
  }
  function lista() {
    const cont = { fila: st.convs.filter(c => c.status === 'fila').length, meus: st.convs.filter(c => c.atendenteUid === perfil.uid && c.status === 'aberta').length, aguardando: st.convs.filter(c => c.status === 'aguardando' && (admin || c.atendenteUid === perfil.uid)).length };
    $('tabs').innerHTML = ABAS.map(([k, n]) => `<button class="at-tab ${st.aba === k ? 'on' : ''}" data-aba="${k}">${n}${cont[k] != null ? ` <em>${cont[k]}</em>` : ''}</button>`).join('');
    const l = filtradas();
    $('lista').innerHTML = l.map(c => { const j = c.status !== 'encerrada' ? restante(c) : null; return `<div class="at-cv ${st.sel === c.id ? 'on' : ''}" data-tel="${c.id}">
      <span class="av" style="background:${corDe(c.id)}">${escapeHtml(iniciais(c.nome || '?'))}</span>
      <div style="min-width:0"><div class="nm">${escapeHtml(c.nome || W.fmtTelWa(c.id))}</div><div class="pv">${c.ultimaDirecao === 'saida' ? 'Você: ' : ''}${escapeHtml(c.ultimaMsg || '')}</div>
        <div class="chips">${j ? `<span class="ch jan">⏱ ${j}</span>` : c.status !== 'encerrada' ? '<span class="ch fech">janela fechada</span>' : ''}${c.orcamentoNumero ? `<span class="ch orc">#${numOrc(c.orcamentoNumero)}</span>` : ''}${c.status === 'fila' ? '<span class="ch">na fila</span>' : ''}${c.atendenteNome && st.aba !== 'meus' && c.status !== 'fila' ? `<span class="ch">${escapeHtml(primeiroNome(c.atendenteNome))}</span>` : ''}${c.status === 'encerrada' && c.motivo ? `<span class="ch">${escapeHtml(c.motivo.split(' — ')[0])}</span>` : ''}${c.simulado ? '<span class="ch sim">teste</span>' : ''}</div></div>
      <div class="rt">${hora(c.ultimaEm)}${c.naoLidas ? `<span class="un">${c.naoLidas}</span>` : ''}</div></div>`; }).join('') || `<div class="at-vazio" style="padding:30px 10px">${st.aba === 'fila' ? 'Fila vazia 🎉' : 'Nada aqui.'}</div>`;
  }
  $('tabs').addEventListener('click', e => { const b = e.target.closest('[data-aba]'); if (!b) return; st.aba = b.dataset.aba; lista(); });
  $('busca').addEventListener('input', e => { st.busca = e.target.value; lista(); });
  $('lista').addEventListener('click', e => { const d = e.target.closest('[data-tel]'); if (d) abrir(d.dataset.tel); });

  // ---------- conversa ----------
  function abrir(tel) {
    fecharEditor(true); st.sel = tel; st.msgs = []; st.orc = null; st.hist = []; st.notaModo = false; offC?.(); offM?.(); offO?.(); offO = null; lista();
    offC = W.ouvirConversa(tel, c => { const antes = st.conv?.orcamentoId; st.conv = c; if (!c) return; cabecalho(); rodape(); contexto(); if (c.orcamentoId !== antes) ligarOrc(); if (c.naoLidas && (c.atendenteUid === perfil.uid)) W.marcarLida(tel); });
    offM = W.ouvirMensagens(tel, m => { st.msgs = m; mensagens(); });
    W.orcamentosDoTelefone(tel).then(h => { st.hist = h; contexto(); }).catch(() => {});
    $('chat').innerHTML = `<div class="at-h" id="cH"></div><div class="at-msgs" id="msgs"></div><div class="at-pop" id="pop" hidden></div><div class="at-comp" id="comp"></div>`;
  }
  function ligarOrc() { offO?.(); offO = null; st.orc = null; if (st.conv?.orcamentoId) offO = W.ouvirOrcamento(st.conv.orcamentoId, o => { st.orc = o; contexto(); }); else contexto(); }
  const minha = () => st.conv && st.conv.atendenteUid === perfil.uid && st.conv.status !== 'encerrada';
  function cabecalho() {
    const c = st.conv; const dono = c.atendenteNome ? `com ${escapeHtml(primeiroNome(c.atendenteNome))}` : 'na fila';
    $('cH').innerHTML = `<span class="av" style="background:${corDe(c.id)}">${escapeHtml(iniciais(c.nome || '?'))}</span>
      <div style="min-width:0"><div class="nm">${escapeHtml(c.nome || W.fmtTelWa(c.id))}</div><small>${W.fmtTelWa(c.id)} · ${c.status === 'encerrada' ? 'encerrada' + (c.motivo ? ' — ' + escapeHtml(c.motivo) : '') : dono}</small></div><div class="sp"></div>
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
    return '';
  }
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
    $('ctx').innerHTML = `<div class="at-card"><h3>👤 Paciente</h3><div class="kv"><span>Nome</span><b>${escapeHtml(c.nome || '—')}</b><span>WhatsApp</span><b>${W.fmtTelWa(c.id)}</b>${o ? `<span>Convênio</span><b>${escapeHtml(o.convenioNome || o.convenio || '')}</b>` : ''}</div></div>
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
    } catch (err) { toast('Erro: ' + err.message); }
  });
  async function enviarTxt() {
    const t = $('txt'); const v = t.value.trim(); if (!v) return; t.disabled = true;
    try { if (st.notaModo) { await W.nota(st.sel, v, perfil); st.notaModo = false; } else await W.enviar(st.sel, v, perfil, st.cfg); t.value = ''; rodape(); }
    catch (err) { toast('Não enviou: ' + err.message); } finally { const n = $('txt'); if (n) { n.disabled = false; n.focus(); } }
  }
  el.addEventListener('keydown', e => { if (e.target.id === 'txt' && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviarTxt(); } });
  el.addEventListener('input', e => { if (e.target.id !== 'txt') return; const v = e.target.value; const pop = $('pop');
    if (v.startsWith('/') && !v.includes(' ') && !v.includes('\n')) { const ops = [['/orcamento', 'Resumo do orçamento ligado'], ['/preparo', 'Jejum/preparo dos exames do orçamento'], ['/prelink', 'Link do pré-cadastro'], ['/unidades', 'Endereços e horários das 8 unidades'], ['/perfil', 'Perfis de check-up com preço atual']].filter(o => o[0].startsWith(v));
      pop.innerHTML = ops.map(o => `<div data-q="${o[0]}"><b>${o[0]}</b> <span>${o[1]}</span></div>`).join(''); pop.hidden = !ops.length; } else pop.hidden = true; });

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

  // ---------- simulador (admin) ----------
  $('bSim')?.addEventListener('click', () => {
    modal(`<div class="modal-b"><h2 style="margin:0 0 4px">🧪 Simulador de WhatsApp</h2><p class="note" style="margin:0 0 12px">Grava uma mensagem como se o paciente tivesse escrito. Use só dados de teste.</p>
      <div class="form" style="grid-template-columns:1fr 1fr"><label class="f">Telefone<input class="in" id="sTel" value="${st.conv?.id ? W.fmtTelWa(st.conv.id) : '(67) 9 0000-0001'}"></label><label class="f">Nome no WhatsApp<input class="in" id="sNome" value="${escapeHtml(st.conv?.nome || 'Paciente Teste')}"></label>
      <label class="f full">Mensagem<textarea class="in" id="sTxt" rows="2" placeholder="ex.: Boa tarde, quanto fica esse pedido? Particular"></textarea></label>
      <label class="f full">Foto do pedido (opcional)<input class="in" type="file" id="sImg" accept="image/*"></label></div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px"><button class="btn ghost sm" id="sCanc">Fechar</button><button class="btn blue sm" id="sOk">Receber mensagem</button></div></div>`, { largura: 520 });
    document.getElementById('sCanc').onclick = fecharModal;
    document.getElementById('sOk').onclick = async () => {
      const f = document.getElementById('sImg').files[0]; const texto = document.getElementById('sTxt').value.trim(); if (!texto && !f) { toast('Escreva algo ou escolha uma foto.'); return; }
      try { const imagem = f ? await comprimirImagem(f, 1400, .8) : null; const tel = await W.simularEntrada({ tel: document.getElementById('sTel').value, nome: document.getElementById('sNome').value.trim(), texto, imagem }); fecharModal(); if (!st.sel) abrir(tel); toast('Mensagem recebida (teste)', true); }
      catch (err) { toast('Erro: ' + err.message); }
    };
  });
}
