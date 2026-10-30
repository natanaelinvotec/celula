/* MedRim · interface de resultados no padrão Nephrosys (TXT laboratório → clínica).
   - Os códigos do TXT exportado pelo laboratório SÃO os códigos da integração com o Nephrosys da Hiperrim
     (em produção, funcionando). O MedRim usa exatamente esses códigos — não a tabela do manual do Nephrosys.
   - M.RES: como cada código do TXT é interpretado (nome, unidade, referência, grupo) e de qual exame da bateria vem (ex).
     Conferido valor a valor: laudo completo de uma bateria anual (dez/2025) × TXT do mesmo paciente —
     os 28 exames do laudo batem com 47 códigos do TXT — e laudo de bateria mensal (out/2026): Hb e Ht avulsos
     saem como 010/011 (no hemograma completo, 016/017). "inferido" = não dava para conferir no laudo (motivo).
   - alias: código que é o mesmo parâmetro de outro (010 → 016, 011 → 017). Na leitura do TXT o valor entra no
     código canônico, para o histórico do paciente ficar numa linha só; o arquivo TXT não é alterado.
   - quali: resultado em texto. 'positivo' → "Reagente" é crítico (HBsAg, anti-HCV, HIV: isolamento/conduta);
     'protecao' → "Não reagente" é baixo (anti-HBs sem proteção: vacinar).
   - ref: valores de referência do LAUDO do Laboratório Célula (laudos de out/2026 e dez/2025). Quando o laudo separa
     por sexo (TGP, ferro, IST, ferritina), ref cobre os dois e rotRef mostra cada um; idade e detalhes ficam em nota.
     lt = limite superior exclusivo ("inferior a"). URR, Kt/V e Ca×P são metas da diálise (não saem no laudo). */
(function (M) {
  'use strict';

  // grupos para a ficha do médico
  M.RES_GRUPOS = {
    dialise: 'Adequação da diálise', eletro: 'Eletrólitos', osso: 'Metabolismo mineral e ósseo', anemia: 'Anemia e ferro',
    hemo: 'Hemograma', prot: 'Proteínas e nutrição', glic: 'Glicemia', lipides: 'Lipídios', figado: 'Fígado', renal: 'Função renal',
    tireoide: 'Tireoide', sorologia: 'Sorologias (hepatites e HIV)',
  };

  /** Código do TXT → interpretação. ref = [mín, máx] do laudo (null = sem limite); crit = valores críticos; ex = exame(s) da bateria (M.EXAMES). */
  M.RES = {
    '001': { nome: 'Ureia pré-diálise', curto: 'Ur pré', un: 'mg/dL', grupo: 'dialise', ref: [13, 43], nota: 'Laudo: adultos 13 a 43 mg/dL; acima de 60 anos 17 a 49 mg/dL.', ex: ['U-DB'] },
    '002': { nome: 'Ureia pós-diálise', curto: 'Ur pós', un: 'mg/dL', grupo: 'dialise', ref: [10, 40], ex: ['URPOS'] },
    '003': { nome: 'Creatinina', curto: 'Creat', un: 'mg/dL', grupo: 'renal', ref: [0.9, 1.3], ex: ['CR-DB'] },
    '004': { nome: 'Potássio', curto: 'K', un: 'mEq/L', grupo: 'eletro', ref: [3.5, 5.1], crit: [3.0, 6.5], ex: ['K-DB'] },
    '043': { nome: 'Sódio', curto: 'Na', un: 'mEq/L', grupo: 'eletro', ref: [136, 145], crit: [125, 155], ex: ['NA-DB'] },
    '005': { nome: 'Cálcio', curto: 'Ca', un: 'mg/dL', grupo: 'osso', ref: [8.6, 10.3], crit: [6.0, 12], ex: ['CA-DB'] },
    '006': { nome: 'Fósforo', curto: 'P', un: 'mg/dL', grupo: 'osso', ref: [2.7, 4.5], ex: ['P-DB'] },
    '034': { nome: 'PTH intacto', curto: 'PTH', un: 'pg/mL', grupo: 'osso', ref: [18.5, 88], ex: ['PTHI-DB'] },
    '021': { nome: 'Fosfatase alcalina', curto: 'FAL', un: 'U/L', grupo: 'osso', ref: [30, 120], nota: 'Laudo: adultos 30 a 120 U/L.', ex: ['FAL-DB'] },
    '068': { nome: 'Vitamina D (25-hidroxi)', curto: 'Vit D', un: 'ng/mL', grupo: 'osso', ref: [30, 60], crit: [null, 100], nota: 'Laudo: deficiência < 20; população geral 20 a 60; ideal para população de risco (inclui doença renal crônica) 30 a 60; risco de intoxicação > 100 ng/mL.', ex: ['VITD25-DB'] },
    '041': { nome: 'Alumínio sérico', curto: 'Al', un: 'µg/L', grupo: 'osso', ref: [null, 10], crit: [null, 60], ex: ['AL-HP'] },
    '016': { nome: 'Hemoglobina', curto: 'Hb', un: 'g/dL', grupo: 'anemia', ref: [13.5, 19.5], crit: [7, null], nota: 'Laudo do exame de hemoglobina: 13,5 a 19,5 g/dL (no hemograma completo: 12,5 a 16,0 g/dL).', ex: ['HEM'] },
    '017': { nome: 'Hematócrito', curto: 'Ht', un: '%', grupo: 'anemia', ref: [42, 60], nota: 'Laudo do exame de hematócrito: 42,0 a 60,0 % (no hemograma completo: 37,0 a 47,0 %).', ex: ['HEM'] },
    '010': { nome: 'Hemoglobina (exame avulso)', curto: 'Hb', un: 'g/dL', grupo: 'anemia', ref: [13.5, 19.5], crit: [7, null], ex: ['HB'], alias: '016' },
    '011': { nome: 'Hematócrito (exame avulso)', curto: 'Ht', un: '%', grupo: 'anemia', ref: [42, 60], ex: ['HT'], alias: '017' },
    '022': { nome: 'Ferro sérico', curto: 'Fe', un: 'µg/dL', grupo: 'anemia', ref: [50, 175], rotRef: 'H 65 – 175 · M 50 – 170', ex: ['FE-DB', 'CAPAT-DB'] },
    '023': { nome: 'Cap. total de ligação do ferro', curto: 'CTLF', un: 'µg/dL', grupo: 'anemia', ref: [250, 425], ex: ['CAPAT-DB'] },
    '030': { nome: 'Saturação da transferrina (IST)', curto: 'IST', un: '%', grupo: 'anemia', ref: [15, 50], rotRef: 'H 20 – 50 · M 15 – 50', ex: ['CAPAT-DB'] },
    '029': { nome: 'Ferritina', curto: 'Ferrit', un: 'ng/mL', grupo: 'anemia', ref: [3.59, 561.58], rotRef: 'H 66,12 – 561,58 · M 3,59 – 269,59', rotCurto: 'H 66–562 · M 3,6–270', ex: ['FERRI-DB'] },
    '015': { nome: 'Hemácias', curto: 'Hem', un: 'milhões/mm³', grupo: 'hemo', ref: [4.2, 5.4], ex: ['HEM'] },
    '059': { nome: 'VCM', curto: 'VCM', un: 'fL', grupo: 'hemo', ref: [80, 100], ex: ['HEM'] },
    '060': { nome: 'HCM', curto: 'HCM', un: 'pg', grupo: 'hemo', ref: [27, 31], ex: ['HEM'] },
    '061': { nome: 'CHCM', curto: 'CHCM', un: 'g/dL', grupo: 'hemo', ref: [31, 36], ex: ['HEM'] },
    '058': { nome: 'RDW', curto: 'RDW', un: '%', grupo: 'hemo', nota: 'O laudo não traz valor de referência para o RDW.', ex: ['HEM'] },
    '012': { nome: 'Leucócitos', curto: 'Leuc', un: '/mm³', grupo: 'hemo', ref: [5000, 10500], crit: [1500, 30000], ex: ['HEM'] },
    '046': { nome: 'Mielócitos', curto: 'Miel', un: '%', grupo: 'hemo', abs: true, ex: ['HEM'], motivo: 'veio zerado no laudo de conferência', inferido: true },
    '047': { nome: 'Metamielócitos', curto: 'Meta', un: '%', grupo: 'hemo', abs: true, ex: ['HEM'], motivo: 'veio zerado no laudo de conferência', inferido: true },
    '048': { nome: 'Bastonetes', curto: 'Bast', un: '%', grupo: 'hemo', abs: true, nota: 'Laudo: até 1.000 céls/mm³ (sem referência em %).', ex: ['HEM'], motivo: 'veio zerado no laudo de conferência', inferido: true },
    '049': { nome: 'Segmentados', curto: 'Seg', un: '%', grupo: 'hemo', ref: [40, 70], abs: true, ex: ['HEM'] },
    '050': { nome: 'Eosinófilos', curto: 'Eos', un: '%', grupo: 'hemo', ref: [0.5, 6], abs: true, ex: ['HEM'] },
    '051': { nome: 'Linfócitos típicos', curto: 'Linf', un: '%', grupo: 'hemo', ref: [20, 45], abs: true, ex: ['HEM'] },
    '055': { nome: 'Linfócitos atípicos', curto: 'Atíp', un: '%', grupo: 'hemo', abs: true, ex: ['HEM'], motivo: 'veio zerado no laudo de conferência', inferido: true },
    '052': { nome: 'Monócitos', curto: 'Mono', un: '%', grupo: 'hemo', ref: [2, 10], abs: true, ex: ['HEM'] },
    '053': { nome: 'Basófilos', curto: 'Baso', un: '%', grupo: 'hemo', ref: [0, 2], abs: true, ex: ['HEM'] },
    '056': { nome: 'Plaquetas', curto: 'Plaq', un: '/mm³', grupo: 'hemo', ref: [150000, 450000], crit: [50000, null], ex: ['HEM'] },
    '062': { nome: 'Total do diferencial', curto: 'Σ dif', un: '%', grupo: 'hemo', oculto: true, ex: ['HEM'], motivo: 'soma do diferencial (100 %) — não sai no laudo', inferido: true },
    '025': { nome: 'Proteínas totais', curto: 'PT', un: 'g/dL', grupo: 'prot', ref: [6.4, 8.3], nota: 'Laudo: adultos ambulatórios 6,4 a 8,3; internados 6,0 a 7,8 g/dL.', ex: ['PTF-DB'] },
    '026': { nome: 'Albumina', curto: 'Alb', un: 'g/dL', grupo: 'prot', ref: [3.5, 5.2], nota: 'Laudo: 20 a 60 anos 3,5 a 5,2; 60 a 90 anos 3,2 a 4,6; acima de 90 anos 2,9 a 4,5 g/dL.', ex: ['PTF-DB'] },
    '027': { nome: 'Globulina', curto: 'Glob', un: 'g/dL', grupo: 'prot', ref: [2.2, 4.2], ex: ['PTF-DB'] },
    '008': { nome: 'Glicose', curto: 'Glic', un: 'mg/dL', grupo: 'glic', ref: [70, 99], crit: [50, 400], ex: ['GLI-DB'] },
    '067': { nome: 'Hemoglobina glicada', curto: 'HbA1c', un: '%', grupo: 'glic', ref: [null, 7.5], ex: ['HBGL-DB'], motivo: 'não veio na bateria anual de exemplo; no TXT mensal os valores (5–8 %) são de Hb glicada', inferido: true },
    '036': { nome: 'Colesterol total', curto: 'CT', un: 'mg/dL', grupo: 'lipides', ref: [null, 200], lt: true, ex: ['COL-DB'] },
    '037': { nome: 'Colesterol HDL', curto: 'HDL', un: 'mg/dL', grupo: 'lipides', ref: [40, null], nota: 'Laudo (adultos): baixo < 40; aceitável 41 a 59; desejável ≥ 60 mg/dL.', ex: ['HDL-DB'] },
    '038': { nome: 'Colesterol LDL', curto: 'LDL', un: 'mg/dL', grupo: 'lipides', ref: [null, 115], lt: true, nota: 'Laudo (adultos): baixo risco cardiovascular < 115; intermediário < 100; alto < 70; muito alto < 50; extremo < 40 mg/dL.', ex: ['LDL-DB'] },
    '040': { nome: 'Triglicerídeos', curto: 'TG', un: 'mg/dL', grupo: 'lipides', ref: [null, 150], lt: true, ex: ['TRIG-DB'] },
    '007': { nome: 'TGP (ALT)', curto: 'TGP', un: 'U/L', grupo: 'figado', ref: [null, 45], lt: true, rotRef: 'H < 45 · M < 34', ex: ['TGP-DB'] },
    '070': { nome: 'TSH', curto: 'TSH', un: 'µUI/mL', grupo: 'tireoide', ref: [0.38, 5.33], ex: ['TSH-DB'] },
    '071': { nome: 'T4 (tiroxina)', curto: 'T4', un: 'µg/dL', grupo: 'tireoide', ref: [5.1, 14.1], ex: ['T4-DB'] },
    '013': { nome: 'HBsAg', curto: 'HBsAg', un: '', grupo: 'sorologia', quali: 'positivo', ex: ['HBSAG-DB'] },
    '018': { nome: 'HBsAg (índice)', curto: 'HBsAg i', un: 'índice', grupo: 'sorologia', ref: [null, 0.9], crit: [null, 0.99], lt: true, ex: ['HBSAG-DB'] },
    '028': { nome: 'Anti-HBs', curto: 'aHBs', un: '', grupo: 'sorologia', quali: 'protecao', ex: ['AHBS-DB'] },
    '020': { nome: 'Anti-HBs (título)', curto: 'aHBs tít', un: 'mUI/mL', grupo: 'sorologia', ref: [10, null], ex: ['AHBS-DB'] },
    '014': { nome: 'Anti-HCV', curto: 'aHCV', un: '', grupo: 'sorologia', quali: 'positivo', ex: ['HCV-DB'] },
    '019': { nome: 'Anti-HCV (índice)', curto: 'aHCV i', un: 'índice', grupo: 'sorologia', ref: [null, 1], crit: [null, 0.99], lt: true, ex: ['HCV-DB'] },
    '042': { nome: 'Anti-HIV I/II', curto: 'HIV', un: '', grupo: 'sorologia', quali: 'positivo', ex: ['HIV-HP'] },
  };

  // derivados calculados na tela (não vão no TXT)
  M.RES_DERIVADOS = {
    urr:  { nome: 'URR (taxa de redução da ureia)', curto: 'URR', un: '%', grupo: 'dialise', ref: [65, null] },
    ktv:  { nome: 'Kt/V estimado*', curto: 'Kt/V*', un: '', grupo: 'dialise', ref: [1.2, null], nota: 'Daugirdas 2ª geração com sessão de 4 h e sem UF/peso — estimativa; para o valor exato faltam tempo, UF e peso pós da clínica.' },
    cap:  { nome: 'Produto Ca × P', curto: 'Ca×P', un: 'mg²/dL²', grupo: 'osso', ref: [null, 55] },
    cacor: { nome: 'Cálcio corrigido pela albumina', curto: 'Ca corr', un: 'mg/dL', grupo: 'osso', ref: [8.6, 10.3] },
  };

  // colunas do mapa do médico (ordem)
  M.RES_MAPA = ['urr', '016', '004', '043', '005', '006', 'cap', '034', '021', '029', '030', '026', '008', '067', '007', '012', '056'];

  /** "1.675,56" → 1675.56 · "Superior a 3.500,0" → {n:3500, op:'>'} */
  M.numBr = function (txt) {
    const s = String(txt || '').trim();
    let op = null;
    if (/^(superior|maior)/i.test(s) || s.startsWith('>')) op = '>';
    else if (/^(inferior|menor)/i.test(s) || s.startsWith('<')) op = '<';
    const m = s.match(/-?[\d.]*\d(?:,\d+)?/);
    if (!m) return { n: null, op };
    return { n: parseFloat(m[0].replace(/\./g, '').replace(',', '.')), op };
  };

  /** Valores derivados de um conjunto {codigo: {n}} */
  M.derivados = function (val) {
    const n = c => (val[c] && val[c].n != null ? val[c].n : null);
    const d = {};
    const pre = n('001'), pos = n('002');
    if (pre && pos != null) {
      const R = pos / pre;
      d.urr = { n: Math.round((1 - R) * 1000) / 10, aviso: pos >= pre ? 'Ureia pós ≥ pré — conferir coleta' : null };
      if (R > 0 && R - 0.032 > 0) d.ktv = { n: Math.round(-Math.log(R - 0.032) * 100) / 100 };
    }
    if (n('005') != null && n('006') != null) d.cap = { n: Math.round(n('005') * n('006') * 10) / 10 };
    if (n('005') != null && n('026') != null) d.cacor = { n: Math.round((n('005') + 0.8 * (4 - n('026'))) * 10) / 10 };
    return d;
  };

  M.defRes = c => M.RES[c] || M.RES_DERIVADOS[c] || { nome: 'Código ' + c, curto: c, un: '', grupo: 'outros', desconhecido: true };

  /** 'ok' | 'baixo' | 'alto' | 'crit-baixo' | 'crit-alto' | null */
  M.classificar = function (cod, v) {
    if (!v) return null;
    const d = M.defRes(cod);
    if (d.quali) {
      const t = String(v.t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
      if (!t) return null;
      const nao = /nao\s*reagente|negativo/.test(t), reag = !nao && /reagente|positivo/.test(t);
      if (d.quali === 'positivo') return reag ? 'crit-alto' : nao ? 'ok' : 'alto'; // indeterminado → alto
      return nao ? 'baixo' : reag ? 'ok' : 'alto'; // anti-HBs: não reagente = sem proteção
    }
    if (v.n == null) return null;
    const x = v.n;
    if (d.crit) { if (d.crit[0] != null && x < d.crit[0] && v.op !== '>') return 'crit-baixo'; if (d.crit[1] != null && x > d.crit[1] && v.op !== '<') return 'crit-alto'; }
    if (!d.ref) return 'ok';
    if (d.ref[0] != null && x < d.ref[0] && v.op !== '>') return 'baixo';
    if (d.ref[1] != null && (x > d.ref[1] || (d.lt && x >= d.ref[1]) || (v.op === '>' && x >= d.ref[1]))) return 'alto';
    return 'ok';
  };

  /** Códigos-alias → código canônico (mesmo parâmetro). Usado na leitura do TXT e ao carregar lotes antigos. */
  M.canonico = cod => (M.RES[cod] && M.RES[cod].alias) || cod;
  M.aliasarValores = function (v) {
    if (!v) return v;
    Object.keys(v).forEach(k => {
      const d = M.canonico(k); if (d === k) return;
      if (!v[d]) v[d] = Object.assign({}, v[k], { orig: k });
      delete v[k];
    });
    return v;
  };

  /** Situação do código do TXT na conferência laudo × TXT */
  M.conferencia = function (cod) {
    const r = M.RES[cod];
    if (!r) return { st: 'desconhecido', txt: 'Código não interpretado' };
    if (r.inferido) return { st: 'inferido', txt: r.motivo || 'Deduzido pelos valores do arquivo' };
    if (r.alias) return { st: 'conferido', txt: `Laudo × TXT · no histórico entra junto com o ${r.alias}` };
    return { st: 'conferido', txt: 'Laudo × TXT' };
  };
})(window.MED = window.MED || {});
