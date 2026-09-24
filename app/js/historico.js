// historico.js — lista/filtros de orçamentos (usada pela atendente e pelo painel).
import { brl, fmtData, toast, escapeHtml, norm, iniciais } from './firebase.js';
import * as D from './dados.js';
import { gerarPdf, numOrc, ICO, copiar } from './ui.js';

export const STATUS = { rascunho: ['Rascunho', 'pill'], gravado: ['Gravado', 'pill'], enviado: ['Enviado', 'pill on'], aguardando_conferencia: ['Aguardando conferência', 'pill warn'], convertido: ['Convertido', 'pill ok'], perdido: ['Perdido', 'pill crit'] };

export function montarHistorico(el, { perfil, admin }) {
  let rows = [], open = null, atendentes = [];
  el.innerHTML = `
  <div class="card" style="margin-bottom:14px"><div class="card-b"><div class="filters">
    <label class="f">Paciente<input class="in" id="hPac" placeholder="nome"></label>
    <label class="f">Nº orçamento<input class="in" id="hNum" placeholder="ex.: 120" inputmode="numeric"></label>
    <label class="f">Telefone<input class="in" id="hTel" placeholder="(67) 9…" inputmode="tel"></label>
    ${admin ? '<label class="f">Atendente<select class="in" id="hAt"><option value="">Todas</option></select></label>' : ''}
    <label class="f">Status<select class="in" id="hSt"><option value="">Todos</option>${Object.entries(STATUS).map(([k, v]) => `<option value="${k}">${v[0]}</option>`).join('')}</select></label>
    <label class="f">Período<select class="in" id="hDias"><option value="1">Hoje</option><option value="7">7 dias</option><option value="30" selected>30 dias</option><option value="90">90 dias</option></select></label>
  </div></div></div>
  <div class="card"><div class="card-h"><h2>${admin ? 'Histórico de orçamentos' : 'Meus orçamentos'}</h2><span class="cnt" id="hCnt"></span><div class="sp"></div><span class="note">Clique na linha para ver os mnemônicos, editar, gerar PDF ou marcar como convertido</span></div>
    <div class="card-b tbl-wrap"><table class="tbl"><thead><tr><th>Nº</th><th>Data</th><th>Paciente</th><th>Telefone</th><th>Convênio</th>${admin ? '<th>Atendente</th>' : ''}<th>Exames</th><th class="num">Total</th><th>Status</th><th></th></tr></thead><tbody id="hBody"><tr><td colspan="9" class="note">Carregando…</td></tr></tbody></table></div></div>`;
  const $ = id => el.querySelector('#' + id);
  async function carregar() {
    const dias = +$('hDias').value; const n = $('hNum').value.trim(); const tel = $('hTel').value.replace(/\D/g, '');
    try {
      if (n) rows = [await D.buscarOrcamentoPorNumero(n)].filter(Boolean);
      else if (tel.length >= 8) rows = await D.buscarOrcamentosPorTelefone(tel);
      else rows = await D.orcamentosRecentes({ dias, atendenteUid: admin ? null : perfil.uid });
      if (!admin) rows = rows.filter(r => r.atendenteUid === perfil.uid);
      if (admin) { const ids = new Map(rows.map(r => [r.atendenteUid, r.atendenteNome])); const sel = $('hAt'); const cur = sel.value; sel.innerHTML = '<option value="">Todas</option>' + [...ids].map(([u, nm]) => `<option value="${u}">${escapeHtml(nm)}</option>`).join(''); sel.value = cur; }
    } catch (e) { toast('Erro ao carregar: ' + e.message); rows = []; }
    render();
  }
  function render() {
    const pac = norm($('hPac').value), st = $('hSt').value, at = admin ? $('hAt').value : '';
    const list = rows.filter(r => (!pac || (r.pacienteBusca || norm(r.paciente)).includes(pac)) && (!st || r.status === st) && (!at || r.atendenteUid === at));
    $('hCnt').textContent = `${list.length} orçamento${list.length !== 1 ? 's' : ''}`;
    $('hBody').innerHTML = list.map(o => { const s = STATUS[o.status] || [o.status, 'pill']; return `<tr data-id="${o.id}" style="cursor:pointer"><td><b>#${numOrc(o.numero)}</b></td><td>${fmtData(o.criadoEm)}</td><td><b>${escapeHtml(o.paciente || '—')}</b></td><td>${escapeHtml(o.telefone || '—')}</td><td>${escapeHtml(o.convenioNome || o.convenio)}${o.renal ? ' <span class="pill red" style="padding:1px 7px">renal</span>' : ''}</td>${admin ? `<td><span class="av s" style="display:inline-grid;vertical-align:middle;margin-right:6px">${escapeHtml(iniciais(o.atendenteNome))}</span>${escapeHtml(o.atendenteNome || '')}</td>` : ''}<td>${o.qtd ?? o.itens?.length ?? 0}</td><td class="num">${brl(o.total)}</td><td><span class="${s[1]}">${s[0]}</span></td><td style="white-space:nowrap"><button class="ib" title="Editar orçamento" data-edit="${o.id}">${ICO.lapis}</button><button class="ib" title="Baixar PDF" data-pdf="${o.id}">${ICO.pdf}</button>${admin ? `<button class="ib red" title="Excluir orçamento" data-del="${o.id}">${ICO.lixo}</button>` : ''}</td></tr>` +
      (open === o.id ? `<tr><td colspan="10" style="padding:6px 12px 14px"><div class="expand"><div style="width:100%"><span class="note">Mnemônicos para digitar no AutoLAC (ordem do pedido):</span></div><code>${(o.mnemonicos || []).map(m => `<span class="mnwrap">${escapeHtml(m)}<button class="ib" title="Copiar ${escapeHtml(m)}" data-copy1="${escapeHtml(m)}">${ICO.copy}</button></span>`).join(' ') || '—'}</code>
        <button class="btn ghost sm" data-copy="${(o.mnemonicos || []).join(' ')}">Copiar lista</button>
        ${o.status !== 'convertido' ? `<button class="btn ok sm" data-conv="${o.id}">✓ Paciente veio coletar — marcar convertido</button>` : `<span class="pill ok">✓ convertido em ${fmtData(o.convertidoEm)} por ${escapeHtml(o.convertidoPorNome || '')}</span>`}
        ${o.status !== 'convertido' && o.status !== 'perdido' ? `<button class="btn ghost sm" data-perd="${o.id}">Marcar perdido</button>` : ''}
        <div style="width:100%" class="note">${(o.itens || []).map(i => `${escapeHtml(i.nome)}${i.prazoDias != null ? ' · ' + i.prazoDias + ' d.u.' : ''}${i.valor != null ? ' · ' + brl(i.valor) : ''}`).join(' &nbsp;|&nbsp; ')}</div></div></td></tr>` : ''); }).join('') || '<tr><td colspan="10" class="note">Nenhum orçamento no filtro.</td></tr>';
  }
  ['hPac', 'hSt'].forEach(id => $(id).addEventListener('input', render)); if (admin) $('hAt').addEventListener('input', render);
  ['hNum', 'hTel', 'hDias'].forEach(id => { let t; $(id).addEventListener('input', () => { clearTimeout(t); t = setTimeout(carregar, 400); }); });
  $('hBody').addEventListener('click', async e => {
    const b = e.target.closest('button');
    if (b?.dataset.copy1) { copiar(b.dataset.copy1); return; }
    if (b?.dataset.edit) { location.href = `orcamento.html?id=${b.dataset.edit}`; return; }
    if (b?.dataset.pdf) { const o = rows.find(r => r.id === b.dataset.pdf); try { await gerarPdf(o, { unitario: !!o.unitarioLiberado || admin }); } catch (err) { toast('Não consegui gerar o PDF: ' + err.message); } return; }
    if (b?.dataset.del) {
      const o = rows.find(r => r.id === b.dataset.del);
      if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.style.background = 'var(--crit-50)'; b.style.color = 'var(--red)'; toast(`Clique de novo na lixeira para EXCLUIR o orçamento #${numOrc(o.numero)} (não tem volta).`); setTimeout(() => { b.dataset.armed = ''; b.style.background = ''; b.style.color = ''; }, 5000); return; }
      try { await D.excluirOrcamento(o.id); rows = rows.filter(r => r.id !== o.id); render(); toast(`Orçamento #${numOrc(o.numero)} excluído`, true); } catch (err) { toast('Erro ao excluir: ' + err.message); } return;
    }
    if (b?.dataset.copy != null) { try { await navigator.clipboard.writeText(b.dataset.copy); toast('Lista de mnemônicos copiada'); } catch { toast('Selecione e copie a lista manualmente.'); } return; }
    if (b?.dataset.conv) { const o = rows.find(r => r.id === b.dataset.conv); try { await D.converterOrcamento(o.id); o.status = 'convertido'; o.convertidoEm = new Date(); o.convertidoPorNome = perfil.nome; render(); toast(`Orçamento #${numOrc(o.numero)} da atendente ${o.atendenteNome} — Convertido com sucesso!`, true); } catch (err) { toast('Erro: ' + err.message); } return; }
    if (b?.dataset.perd) { const o = rows.find(r => r.id === b.dataset.perd); await D.mudarStatus(o.id, 'perdido'); o.status = 'perdido'; render(); return; }
    const tr = e.target.closest('tr[data-id]'); if (tr) { open = open === tr.dataset.id ? null : tr.dataset.id; render(); }
  });
  carregar();
  return { recarregar: carregar, getRows: () => rows };
}
