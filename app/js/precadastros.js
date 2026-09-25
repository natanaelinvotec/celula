// precadastros.js — fila de pré-cadastros enviados pelos pacientes (página pública pre.html).
// Qualquer atendente disponível pega o próximo, cadastra no AutoLAC e marca "Cadastrei" — some da fila para todo mundo em tempo real.
import { fmtData, toast, escapeHtml } from './firebase.js';
import * as D from './dados.js';
import { numOrc, ICO, copiar } from './ui.js';
import { fmtCpf, fmtNasc, fmtTel } from './historico.js';

export function montarPreCadastros(el, { perfil }) {
  el.innerHTML = `<div class="card lem" style="margin-bottom:14px"><div class="card-h"><h2>Fila para cadastrar no AutoLAC</h2><span class="badge-n" id="pCnt" hidden></span><div class="sp"></div><span class="note">quem estiver livre pega o próximo: copie os dados, cadastre no AutoLAC e clique em “Cadastrei”</span></div>
    <div class="card-b" id="pFila" style="display:flex;flex-direction:column;gap:8px"><div class="note">Carregando…</div></div></div>
  <div class="card"><div class="card-h"><h2>Já cadastrados</h2><span class="cnt" id="pCntOk"></span><div class="sp"></div><label class="f" style="min-width:220px">Buscar<input class="in" id="pQ" placeholder="nome, CPF ou nº do orçamento"></label></div>
    <div class="card-b" id="pFeitos" style="display:flex;flex-direction:column;gap:8px"></div></div>`;
  const $ = id => el.querySelector('#' + id);
  let lista = []; const orcs = {}; const users = {};
  D.usuarios().then(us => { for (const u of us) users[u.id] = u.nome; render(); }).catch(() => {});
  const off = D.ouvirPreCadastros((map, l) => { lista = l; render(); carregarOrcs(); }, 400);
  addEventListener('pagehide', () => off());
  async function carregarOrcs() { // dados do orçamento (paciente, atendente, convênio) para cada pré-cadastro novo
    let mudou = false;
    for (const p of lista) { if (orcs[p.id] !== undefined) continue; orcs[p.id] = null; try { orcs[p.id] = await D.orcamentoPorId(p.id); mudou = true; } catch {} }
    if (mudou) render();
  }
  const card = (p, fila) => { const o = orcs[p.id]; return `<div class="lem-it" data-id="${p.id}" style="${fila ? 'border-left:4px solid var(--red)' : ''}">
      <div><b>${escapeHtml(p.nome)}</b> <small style="display:inline">${o?.paciente && o.paciente.trim().toLowerCase() !== p.nome.trim().toLowerCase() ? `· no orçamento: ${escapeHtml(o.paciente)}` : ''}</small>
        <small>CPF ${fmtCpf(p.cpf)} · nasc. ${fmtNasc(p.nascimento)} · cel. ${fmtTel(p.telefone)}</small>
        <small>orçamento <b>#${numOrc(p.orcamentoNumero || o?.numero)}</b>${o ? ` · ${escapeHtml(o.convenioNome || o.convenio || '')}${o.duplo && o.convenio2Nome ? ' + ' + escapeHtml(o.convenio2Nome) : ''} · ${o.qtd ?? o.itens?.length ?? 0} exame(s) · atendente ${escapeHtml((o.atendenteNome || '').split(' ')[0])}` : ''} · enviado ${fmtData(p.enviadoEm)}${p.visto ? ` · <span class="pill ok" style="padding:0 7px">✓ cadastrado ${fmtData(p.vistoEm)}${p.vistoPor ? ' por ' + escapeHtml((users[p.vistoPor] || '').split(' ')[0]) : ''}</span>` : ''}</small></div>
      <button class="btn ghost sm" data-copypre="${p.id}" title="Copia nome, CPF, nascimento e celular separados por TAB">${ICO.copy} Copiar dados</button>
      <a class="btn ghost sm" href="orcamento.html?id=${p.id}" title="Abrir o orçamento">Orçamento</a>
      ${fila ? `<button class="btn blue sm" data-visto="${p.id}">✓ Cadastrei no AutoLAC</button>` : ''}
    </div>`; };
  function render() {
    const fila = lista.filter(p => !p.visto).sort((a, b) => (a.enviadoEm?.toMillis?.() || 0) - (b.enviadoEm?.toMillis?.() || 0)); // mais antigo primeiro
    const q = ($('pQ').value || '').trim().toLowerCase().replace(/\D/g, '') || null, qn = ($('pQ').value || '').trim().toLowerCase();
    const feitos = lista.filter(p => p.visto && (!qn || p.nome.toLowerCase().includes(qn) || (q && (String(p.cpf).includes(q) || String(p.orcamentoNumero || '').includes(q)))));
    $('pCnt').textContent = fila.length; $('pCnt').hidden = !fila.length;
    $('pFila').innerHTML = fila.map(p => card(p, true)).join('') || '<div class="note">Nenhum pré-cadastro aguardando. 👍</div>';
    $('pCntOk').textContent = `${feitos.length} de ${lista.filter(p => p.visto).length}`;
    $('pFeitos').innerHTML = feitos.slice(0, 100).map(p => card(p, false)).join('') || '<div class="note">Nada por aqui ainda.</div>';
    document.title = `${fila.length ? '(' + fila.length + ') ' : ''}Pré-cadastros · Célula Diagnósticos`;
  }
  $('pQ').addEventListener('input', render);
  el.addEventListener('click', async e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.copypre) { const p = lista.find(x => x.id === b.dataset.copypre); copiar(`${p.nome}\t${fmtCpf(p.cpf)}\t${fmtNasc(p.nascimento)}\t${fmtTel(p.telefone)}`); return; }
    if (b.dataset.visto) { b.disabled = true; try { await D.marcarPreVisto(b.dataset.visto); toast('Pré-cadastro marcado como cadastrado no AutoLAC', true); } catch (err) { b.disabled = false; toast('Erro: ' + err.message); } }
  });
}
