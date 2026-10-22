/* MedRim · leitura dos arquivos no próprio navegador (nada é enviado a servidor).
   - .docx da escala: leitor de ZIP mínimo + DecompressionStream('deflate-raw') + DOMParser
   - .csv da bateria: Windows-1252, separador ';' */
(function (M) {
  'use strict';
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

  // ---------- ZIP mínimo (só o necessário para abrir um .docx) ----------
  async function abrirZip(buf) {
    const u8 = new Uint8Array(buf), dv = new DataView(buf);
    let eocd = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('O arquivo não parece ser um .docx válido.');
    const total = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    const arquivos = {};
    for (let k = 0; k < total && dv.getUint32(p, true) === 0x02014b50; k++) {
      const metodo = dv.getUint16(p + 10, true), tam = dv.getUint32(p + 20, true);
      const nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true);
      const off = dv.getUint32(p + 42, true);
      arquivos[new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nl))] = { metodo, tam, off };
      p += 46 + nl + el + cl;
    }
    return async nome => {
      const f = arquivos[nome];
      if (!f) return null;
      const ini = f.off + 30 + dv.getUint16(f.off + 26, true) + dv.getUint16(f.off + 28, true);
      const dados = u8.subarray(ini, ini + f.tam);
      if (f.metodo === 0) return new TextDecoder().decode(dados);
      if (f.metodo !== 8) throw new Error('Compressão não suportada no .docx');
      const fluxo = new Blob([dados]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return new TextDecoder().decode(await new Response(fluxo).arrayBuffer());
    };
  }

  const filhos = (el, nome) => Array.from(el.children).filter(c => c.localName === nome && c.namespaceURI === W);

  /** Texto de uma célula + quanto dele está riscado. Células com tabela aninhada: usa a 1ª subcélula com texto. */
  function lerCelula(tc) {
    const aninhada = tc.getElementsByTagNameNS(W, 'tbl')[0];
    if (aninhada) {
      for (const sub of aninhada.getElementsByTagNameNS(W, 'tc')) {
        const r = lerCelula(sub);
        if (r.texto) return r;
      }
    }
    let texto = '', riscado = 0, total = 0;
    for (const par of filhos(tc, 'p')) {
      for (const r of par.getElementsByTagNameNS(W, 'r')) {
        let t = '';
        for (const n of r.children) {
          if (n.localName === 't') t += n.textContent;
          else if (n.localName === 'tab' || n.localName === 'br') t += ' ';
        }
        if (!t) continue;
        const st = r.getElementsByTagNameNS(W, 'strike')[0] || r.getElementsByTagNameNS(W, 'dstrike')[0];
        const ehRisco = st && !/^(0|false)$/.test(st.getAttributeNS(W, 'val') || st.getAttribute('w:val') || '');
        const n = t.replace(/\s/g, '').length;
        total += n; if (ehRisco) riscado += n;
        texto += t;
      }
      texto += ' ';
    }
    return { texto: texto.replace(/\s+/g, ' ').trim(), riscado: total > 0 && riscado / total > 0.5 };
  }

  const DIA_POR_CABECALHO = { SEGUNDA: 'seg', QUARTA: 'qua', SEXTA: 'sex', TERCA: 'ter', QUINTA: 'qui', SABADO: 'sab' };
  const TURNO_POR_TEXTO = t => /MANH/.test(t) ? 'M' : /TARD/.test(t) ? 'T' : /NOIT/.test(t) ? 'N' : null;
  const ehVago = t => !t || /^[\s*\-–_.]+$/.test(t);

  /** Lê a escala (.docx) → lista de linhas { salao, turno, maq, ordem, celulas:{seg..sab}, foraDaGrade[] } */
  M.lerEscalaDocx = async function (arquivo) {
    const ler = await abrirZip(await arquivo.arrayBuffer());
    const xml = await ler('word/document.xml');
    if (!xml) throw new Error('Não encontrei o conteúdo do documento dentro do .docx.');
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const corpo = doc.getElementsByTagNameNS(W, 'body')[0];
    const linhas = [], avisos = [];
    let titulo = null;
    for (const el of corpo.children) {
      if (el.localName === 'p') {
        const t = el.textContent.replace(/\s+/g, ' ').trim();
        if (t) titulo = t;
        continue;
      }
      if (el.localName !== 'tbl') continue;
      const tn = M.norm(titulo || '');
      const mSalao = tn.match(/SALAO\s*(\d+)/), turno = TURNO_POR_TEXTO(tn);
      if (!mSalao || !turno) { avisos.push('Tabela sem título reconhecível: "' + (titulo || '?') + '" — ignorada.'); continue; }
      const salao = +mSalao[1];
      const trs = filhos(el, 'tr');
      const cab = filhos(trs[0], 'tc').map(tc => M.norm(lerCelula(tc).texto));
      const colDia = cab.map(h => DIA_POR_CABECALHO[h] || null);
      let hdf = 0, ordem = 0;
      for (const tr of trs.slice(1)) {
        const tcs = filhos(tr, 'tc').map(lerCelula);
        let rot = (tcs[0]?.texto || '').trim();
        if (!rot) continue;
        let maq;
        if (/HDF/i.test(rot)) maq = 'HDF' + (++hdf);
        else if (/^\d+$/.test(rot)) maq = rot.padStart(2, '0');
        else maq = rot;
        const celulas = {}, foraDaGrade = [];
        tcs.slice(1).forEach((c, i) => {
          const dia = colDia[i + 1];
          if (dia) celulas[dia] = { texto: ehVago(c.texto) ? '' : c.texto, riscado: c.riscado };
          else if (!ehVago(c.texto)) foraDaGrade.push(c.texto);
        });
        linhas.push({ salao, turno, maq, ordem: ++ordem, celulas, foraDaGrade: [...new Set(foraDaGrade)] });
      }
    }
    if (!linhas.length) throw new Error('Nenhuma tabela "Escala de pacientes - Salão X – Turno" encontrada.');
    return { linhas, avisos };
  };

  /** Identifica grupo e turno pelo nome do arquivo: "SEG QUA E SEX 1 TURNO.csv" */
  M.identificarCsv = function (nome) {
    const n = M.norm(nome);
    const grupo = /\bSEG\b/.test(n) ? 'SQS' : /\bTER\b/.test(n) ? 'TQS' : null;
    const m = n.match(/(\d)\s*(?:O\s*)?TURNO/);
    const turno = m ? ({ 1: 'M', 2: 'T', 3: 'N' })[m[1]] : null;
    return { grupo, turno };
  };

  /** Lê um CSV da bateria → pacientes { cpf, nome, nasc, codigo, lab, controles, examesCsv[] } */
  M.lerCsvBateria = async function (arquivo, grupo, turno) {
    const buf = await arquivo.arrayBuffer();
    let txt = new TextDecoder('utf-8', { fatal: false }).decode(buf);
    if (txt.includes('�')) txt = new TextDecoder('windows-1252').decode(buf);
    const linhas = txt.split(/\r?\n/).filter(l => l.trim());
    const cab = linhas[0].split(';').map(s => s.trim());
    const idx = h => cab.findIndex(c => M.norm(c) === M.norm(h));
    const iNome = idx('Nome'), iNasc = idx('Dt.Nasc'), iCpf = idx('CPF'), iCod = idx('Código'), iLab = idx('Lab. Cliente');
    if (iNome < 0 || iCpf < 0) throw new Error(arquivo.name + ': cabeçalho sem colunas Nome/CPF.');
    const pacientes = [];
    for (const l of linhas.slice(1)) {
      const c = l.split(';');
      const nome = (c[iNome] || '').replace(/\s+/g, ' ').trim();
      if (!nome) continue;
      const examesCsv = [];
      cab.forEach((h, i) => { if (M.CSV_PARA_CODIGO[h] && /^x$/i.test((c[i] || '').trim())) examesCsv.push(M.CSV_PARA_CODIGO[h]); });
      const nasc = (c[iNasc] || '').trim().slice(0, 10); // dd/mm/aaaa
      pacientes.push({
        cpf: M.soDigitos(c[iCpf]).padStart(11, '0'),
        nome, nasc,
        codigo: (c[iCod] || '').trim(),
        lab: (c[iLab] || '').trim(),
        grupo, turno,
        examesCsv,
        controles: { glic: examesCsv.includes('GLI-DB'), cr: examesCsv.includes('CR-DB'), hbgl: examesCsv.includes('HBGL-DB') },
        arquivo: arquivo.name,
      });
    }
    return pacientes;
  };

  // ---------- planilha conferida (.xlsx) ----------
  M.abrirZip = abrirZip;
  const SS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const colIdx = ref => { let n = 0; for (const ch of ref.replace(/\d+/g, '')) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
  /** Lê a planilha "Lista de pacientes" (Nome, CPF, Salão, Dias, Turno, Equipamento) → linhas para aplicar na escala. */
  /** Data vinda da planilha → 'dd/mm/aaaa' ('' se vazia ou ilegível). O Excel grava datas como número serial (dias desde 30/12/1899). */
  function dataPlanilha(v) {
    const s = String(v == null ? '' : v).trim();
    if (!s) return '';
    let d = null;
    if (/^\d+(\.\d+)?$/.test(s) && +s > 1000) d = new Date(Date.UTC(1899, 11, 30) + Math.floor(+s) * 864e5);
    else {
      const m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/) || null, iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (m) { const a = +m[3] < 100 ? 1900 + +m[3] : +m[3]; d = new Date(Date.UTC(a, +m[2] - 1, +m[1])); if (d.getUTCDate() !== +m[1]) d = null; }
      else if (iso) d = new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3]));
    }
    if (!d || isNaN(d)) return '';
    const p = n => String(n).padStart(2, '0');
    return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
  }

  M.lerPlanilhaXlsx = async function (arquivo) {
    const ler = await abrirZip(await arquivo.arrayBuffer());
    const dp = x => new DOMParser().parseFromString(x, 'application/xml');
    const wb = dp(await ler('xl/workbook.xml') || '');
    const rels = dp(await ler('xl/_rels/workbook.xml.rels') || '');
    const folhas = Array.from(wb.getElementsByTagNameNS(SS, 'sheet'));
    if (!folhas.length) throw new Error(arquivo.name + ': não parece uma planilha do Excel.');
    const folha = folhas.find(f => M.norm(f.getAttribute('name')) === 'PACIENTES') || folhas[0];
    const rid = folha.getAttribute('r:id') || folha.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
    const rel = Array.from(rels.getElementsByTagName('Relationship')).find(r => r.getAttribute('Id') === rid);
    const alvo = rel ? rel.getAttribute('Target').replace(/^\//, '').replace(/^(?!xl\/)/, 'xl/') : 'xl/worksheets/sheet1.xml';
    const ssXml = await ler('xl/sharedStrings.xml');
    const comp = ssXml ? Array.from(dp(ssXml).getElementsByTagNameNS(SS, 'si')).map(si => Array.from(si.getElementsByTagNameNS(SS, 't')).map(t => t.textContent).join('')) : [];
    const sh = dp(await ler(alvo) || '');
    const linhas = Array.from(sh.getElementsByTagNameNS(SS, 'row')).map(r => {
      const out = [];
      for (const c of r.getElementsByTagNameNS(SS, 'c')) {
        const t = c.getAttribute('t'), v = c.getElementsByTagNameNS(SS, 'v')[0];
        let val = '';
        if (t === 's') val = comp[+(v && v.textContent)] || '';
        else if (t === 'inlineStr') val = Array.from(c.getElementsByTagNameNS(SS, 't')).map(x => x.textContent).join('');
        else val = v ? v.textContent : '';
        out[colIdx(c.getAttribute('r'))] = val;
      }
      return out;
    });
    const iCab = linhas.findIndex(l => l.some(x => M.norm(x) === 'CPF'));
    if (iCab < 0) throw new Error(arquivo.name + ': não achei a coluna CPF.');
    const cab = linhas[iCab].map(x => M.norm(x || ''));
    const col = nome => cab.findIndex(h => h === nome || h.startsWith(nome));
    const escala = col('NOME NA ESCALA');
    const c = {
      nome: col('NOME COMPLETO') >= 0 ? col('NOME COMPLETO') : cab.findIndex((h, i) => i !== escala && h.startsWith('NOME')),
      escala, cpf: col('CPF'), salao: col('SALAO'), dias: col('DIAS'), turno: col('TURNO'),
      maq: col('EQUIPAMENTO') >= 0 ? col('EQUIPAMENTO') : col('MAQ'),
      nasc: col('DATA DE NASC') >= 0 ? col('DATA DE NASC') : col('NASC'), bat: col('BATERIA'), acao: col('ACAO'),
    };
    // planilha de pendentes (nomes da escala sem pedido no CSV): cada linha é uma máquina, não um CPF do CSV
    const pendentes = c.escala >= 0 || c.acao >= 0;
    const res = [];
    linhas.slice(iCab + 1).forEach((l, k) => {
      const cpfBruto = M.soDigitos(String(l[c.cpf] == null ? '' : l[c.cpf]));
      const cpf = cpfBruto ? cpfBruto.padStart(11, '0') : '';
      const acaoT = M.norm(c.acao >= 0 ? l[c.acao] || '' : '');
      const acao = /^CADAST/.test(acaoT) ? 'cadastrar' : /^OUTRO/.test(acaoT) ? 'outrolab' : /^EXCLU|^REMOV/.test(acaoT) ? 'excluir' : '';
      const nomeEscala = c.escala >= 0 ? String(l[c.escala] || '').trim() : '';
      if (pendentes ? !nomeEscala : (!cpf || cpf === '00000000000')) return;
      const dias = M.norm(l[c.dias] || ''), turno = M.norm(l[c.turno] || ''), maqT = String(l[c.maq] == null ? '' : l[c.maq]).trim();
      const hdf = maqT.toUpperCase().match(/HDF\s*(\d)/);
      const batT = M.norm(c.bat >= 0 ? l[c.bat] || '' : '');
      res.push({
        linha: iCab + k + 2, nome: String(l[c.nome] || '').trim().replace(/\s+/g, ' '), cpf,
        pendente: pendentes, nomeEscala, acao, nasc: dataPlanilha(c.nasc >= 0 ? l[c.nasc] : ''),
        bateria: /^TRI/.test(batT) ? 'trimestral' : /^SEM/.test(batT) ? 'semestral' : /^MEN/.test(batT) ? 'mensal' : '',
        salao: parseInt(l[c.salao], 10) || null,
        grupo: /SEG/.test(dias) ? 'SQS' : /TER/.test(dias) ? 'TQS' : null,
        turno: /MANH|^1/.test(turno) ? 'M' : /TARD|^2/.test(turno) ? 'T' : /NOIT|^3/.test(turno) ? 'N' : null,
        maq: hdf ? 'HDF' + hdf[1] : /^\d+(\.0+)?$/.test(maqT) ? String(parseInt(maqT, 10)).padStart(2, '0') : maqT || null,
      });
    });
    return res;
  };

  // ---------- utilitários de texto compartilhados ----------
  M.semAcento = s => (s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '');
  M.norm = s => M.semAcento(s).toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
  M.soDigitos = s => (s || '').replace(/\D/g, '');
})(window.MED = window.MED || {});
