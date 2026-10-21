/* MedRim · interface de resultados no padrão Nephrosys (TXT laboratório → clínica).
   - M.NEPHRO_PDF: tabela de códigos do PDF "Requisição dos Exames Padrão Nephrosys TXT".
   - M.RES: como cada código do TXT exportado pelo laboratório é interpretado (nome, unidade, alvo).
     Códigos marcados "inferido" foram deduzidos dos valores e conferidos pela matemática do hemograma
     (VCM = Ht/Hemácias×10, HCM = Hb/Hemácias×10, CHCM = Hb/Ht×100, absoluto = % × leucócitos).
   - Alvos: sugestão baseada em KDIGO/KDOQI para hemodiálise — VALIDAR com o nefrologista responsável. */
(function (M) {
  'use strict';

  M.NEPHRO_PDF = {
    '001': 'Ureia (pré-diálise)', '002': 'Ureia (pós-diálise)', '003': 'Creatinina', '004': 'Potássio', '005': 'Cálcio',
    '006': 'Fósforo', '007': 'TGP', '008': 'Glicose', '009': 'Hemácias (eritrócitos)', '010': 'Hemoglobina',
    '011': 'Hematócrito', '012': 'Leucócito', '013': 'HBsAg', '014': 'Anti HCV', '015': 'Plaquetas',
    '021': 'Fosfatase alcalina', '022': 'Ferro sérico', '023': 'Cap. ligação do ferro', '024': 'Cap. latente do ferro',
    '025': 'Proteínas totais e frações', '028': 'Anti HBs', '029': 'Ferritina', '030': 'Índice transferrina',
    '041': 'Ácido úrico', '042': 'PTH', '043': 'Transferrina', '061': 'Colesterol', '062': 'Colesterol HDL',
    '063': 'Colesterol LDL', '064': 'Colesterol VLDL', '065': 'Triglicérides', '066': 'Alumínio sérico', '067': 'Anti HIV',
    '068': 'Sódio', '069': 'Anti HBC – IgM', '070': 'Magnésio', '080': 'Cálcio iônico', '081': 'Hemoglobina glicosada',
    '082': 'Tacrolimus', '083': 'Ciclosporina', '084': 'Sirolimus', '085': 'CD4/CD3', '086': 'Potássio pós',
    '087': 'Anti HBC – IgG', '088': 'Tipagem sanguínea', '089': 'Hemoglobina glicosada', '090': '25-hidroxivitamina D',
    '091': 'TSH', '092': 'T4 (tiroxina)', '093': 'Bacterioscopia (Gram)', '094': 'Cultura de bactérias', '095': 'Hemocultura',
    '100': 'Hemograma', '216': 'Eritrograma',
    '601': 'PSA', '602': 'VDRL', '603': 'Chagas', '604': 'CMV IgG', '605': 'CMV IgM', '606': 'Toxoplasmose IgG',
    '607': 'Toxoplasmose IgM', '608': 'Epstein-Barr IgG', '609': 'Epstein-Barr IgM', '610': 'TGO', '611': 'Gama GT',
    '612': 'Reserva alcalina (bicarbonato)', '613': 'Proteína C reativa', '614': 'Homocisteína', '615': 'Beta-2 microglobulina',
    '616': 'Ácido fólico', '617': 'Ácido úrico urinário', '618': 'Aldolase', '619': 'Alfafetoproteína', '620': 'Amilase',
    '621': 'Antibiograma', '622': 'CEA', '623': 'Anti-TPO', '624': 'Bilirrubina direta', '625': 'Bilirrubina total',
    '626': 'Calciúria 24 h', '627': 'Citratúria 24 h', '628': 'CK-MB', '629': 'Clearance de creatinina', '630': 'Complemento C3',
    '631': 'Complemento C4', '632': 'Complemento CH50', '633': 'CPK', '634': 'Dismorfismo eritrocitário', '635': 'FAN',
    '636': 'Fator reumatoide', '637': 'Gasometria venosa', '638': 'Glicose pós-prandial', '639': 'Insulina',
    '640': 'Magnésio urina 24 h', '641': 'Microalbuminúria', '642': 'Oxalúria 24 h', '643': 'Potássio urina 24 h',
    '644': 'Proteinúria 24 h', '645': 'Sodiúria 24 h', '646': 'T3', '647': 'T4 livre', '648': 'TTPA', '649': 'Tempo de protrombina',
    '650': 'Testosterona', '651': 'Ureia urina 24 h', '652': 'Urina tipo I', '653': 'Urocultura', '654': 'VHS', '655': 'T3 livre',
    '656': 'Anti-HBc total', '658': 'Colesterol não-HDL', '659': 'PSA livre', '660': 'PSA livre/total', '661': 'Vitamina B12',
    '662': 'HCV PCR qualitativo', '670': 'Fosfatase ácida', '671': 'Anti-DNA', '672': 'Aldosterona', '673': 'Cortisol',
    '674': 'Microalbumina na urina', '675': 'Creatinina no líquido amniótico', '676': 'Ácido vanilmandélico',
    '677': 'Hemocultura aeróbica 1', '678': 'Hemocultura aeróbica 2', '679': 'Hemocultura aeróbica 3',
    '680': 'Rel. proteínas/creatinina', '681': 'Proteinúria', '682': 'Creatinina urinária', '683': 'Eletroforese de proteínas',
    '687': 'LDH', '688': 'Haptoglobina', '689': 'Reticulócitos', '690': 'HCV PCR quantitativo', '691': 'Digoxina',
    '692': 'Rel. albumina/globulina', '693': 'Zinco', '694': 'Vitamina C', '695': 'Ácido oxálico', '697': 'Líquido peritoneal',
    '698': 'BNP', '699': 'Procalcitonina', '700': 'NT-proBNP',
  };

  // grupos para a ficha do médico
  M.RES_GRUPOS = {
    dialise: 'Adequação da diálise', eletro: 'Eletrólitos', osso: 'Metabolismo mineral e ósseo', anemia: 'Anemia e ferro',
    hemo: 'Hemograma', prot: 'Proteínas e nutrição', glic: 'Glicemia', figado: 'Fígado', renal: 'Função renal',
  };

  /** Código do TXT → interpretação. ref = [mín, máx] (null = sem limite); crit = valores críticos; pdf = código equivalente no PDF. */
  M.RES = {
    '001': { nome: 'Ureia pré-diálise', curto: 'Ur pré', un: 'mg/dL', grupo: 'dialise', pdf: '001' },
    '002': { nome: 'Ureia pós-diálise', curto: 'Ur pós', un: 'mg/dL', grupo: 'dialise', pdf: '002' },
    '003': { nome: 'Creatinina', curto: 'Creat', un: 'mg/dL', grupo: 'renal', pdf: '003' },
    '004': { nome: 'Potássio', curto: 'K', un: 'mEq/L', grupo: 'eletro', ref: [3.5, 5.5], crit: [3.0, 6.5], pdf: '004' },
    '043': { nome: 'Sódio', curto: 'Na', un: 'mEq/L', grupo: 'eletro', ref: [135, 145], crit: [125, 155], pdf: '068', inferido: true },
    '005': { nome: 'Cálcio', curto: 'Ca', un: 'mg/dL', grupo: 'osso', ref: [8.4, 10.2], crit: [6.0, 12], pdf: '005' },
    '006': { nome: 'Fósforo', curto: 'P', un: 'mg/dL', grupo: 'osso', ref: [3.5, 5.5], pdf: '006' },
    '034': { nome: 'PTH intacto', curto: 'PTH', un: 'pg/mL', grupo: 'osso', ref: [130, 600], pdf: '042', inferido: true },
    '021': { nome: 'Fosfatase alcalina', curto: 'FAL', un: 'U/L', grupo: 'osso', ref: [40, 130], pdf: '021' },
    '016': { nome: 'Hemoglobina', curto: 'Hb', un: 'g/dL', grupo: 'anemia', ref: [10, 12], crit: [7, null], pdf: '010', inferido: true },
    '017': { nome: 'Hematócrito', curto: 'Ht', un: '%', grupo: 'anemia', ref: [30, 36], pdf: '011', inferido: true },
    '022': { nome: 'Ferro sérico', curto: 'Fe', un: 'µg/dL', grupo: 'anemia', ref: [50, 170], pdf: '022' },
    '023': { nome: 'Cap. total de ligação do ferro', curto: 'CTLF', un: 'µg/dL', grupo: 'anemia', ref: [250, 450], pdf: '023' },
    '030': { nome: 'Saturação da transferrina (IST)', curto: 'IST', un: '%', grupo: 'anemia', ref: [20, 50], pdf: '030' },
    '029': { nome: 'Ferritina', curto: 'Ferrit', un: 'ng/mL', grupo: 'anemia', ref: [200, 800], pdf: '029' },
    '015': { nome: 'Hemácias', curto: 'Hem', un: 'milhões/mm³', grupo: 'hemo', ref: [3.9, 5.9], pdf: '009', inferido: true },
    '059': { nome: 'VCM', curto: 'VCM', un: 'fL', grupo: 'hemo', ref: [80, 100], inferido: true },
    '060': { nome: 'HCM', curto: 'HCM', un: 'pg', grupo: 'hemo', ref: [27, 32], inferido: true },
    '061': { nome: 'CHCM', curto: 'CHCM', un: 'g/dL', grupo: 'hemo', ref: [32, 36], inferido: true },
    '058': { nome: 'RDW', curto: 'RDW', un: '%', grupo: 'hemo', ref: [11.5, 14.5], inferido: true },
    '012': { nome: 'Leucócitos', curto: 'Leuc', un: '/mm³', grupo: 'hemo', ref: [4000, 11000], crit: [1500, 30000], pdf: '012' },
    '046': { nome: 'Mielócitos', curto: 'Miel', un: '%', grupo: 'hemo', abs: true, inferido: true },
    '047': { nome: 'Metamielócitos', curto: 'Meta', un: '%', grupo: 'hemo', abs: true, inferido: true },
    '048': { nome: 'Bastões', curto: 'Bast', un: '%', grupo: 'hemo', ref: [0, 5], abs: true, inferido: true },
    '049': { nome: 'Segmentados', curto: 'Seg', un: '%', grupo: 'hemo', ref: [40, 75], abs: true, inferido: true },
    '050': { nome: 'Eosinófilos', curto: 'Eos', un: '%', grupo: 'hemo', ref: [1, 6], abs: true, inferido: true },
    '051': { nome: 'Linfócitos', curto: 'Linf', un: '%', grupo: 'hemo', ref: [20, 45], abs: true, inferido: true },
    '052': { nome: 'Monócitos', curto: 'Mono', un: '%', grupo: 'hemo', ref: [2, 10], abs: true, inferido: true },
    '053': { nome: 'Basófilos', curto: 'Baso', un: '%', grupo: 'hemo', ref: [0, 2], abs: true, inferido: true },
    '055': { nome: 'Outros / atípicos', curto: 'Out', un: '%', grupo: 'hemo', abs: true, inferido: true },
    '056': { nome: 'Plaquetas', curto: 'Plaq', un: '/mm³', grupo: 'hemo', ref: [150000, 450000], crit: [50000, null], pdf: '015', inferido: true },
    '062': { nome: 'Total do diferencial', curto: 'Σ dif', un: '%', grupo: 'hemo', oculto: true, inferido: true },
    '025': { nome: 'Proteínas totais', curto: 'PT', un: 'g/dL', grupo: 'prot', ref: [6.0, 8.3], pdf: '025' },
    '026': { nome: 'Albumina', curto: 'Alb', un: 'g/dL', grupo: 'prot', ref: [3.5, 5.2], inferido: true },
    '027': { nome: 'Globulina', curto: 'Glob', un: 'g/dL', grupo: 'prot', ref: [2.0, 3.5], inferido: true },
    '008': { nome: 'Glicose', curto: 'Glic', un: 'mg/dL', grupo: 'glic', ref: [70, 180], crit: [50, 400], pdf: '008' },
    '067': { nome: 'Hemoglobina glicada', curto: 'HbA1c', un: '%', grupo: 'glic', ref: [null, 7.5], pdf: '089', inferido: true },
    '007': { nome: 'TGP (ALT)', curto: 'TGP', un: 'U/L', grupo: 'figado', ref: [null, 41], pdf: '007' },
  };

  // derivados calculados na tela (não vão no TXT)
  M.RES_DERIVADOS = {
    urr:  { nome: 'URR (taxa de redução da ureia)', curto: 'URR', un: '%', grupo: 'dialise', ref: [65, null] },
    ktv:  { nome: 'Kt/V estimado*', curto: 'Kt/V*', un: '', grupo: 'dialise', ref: [1.2, null], nota: 'Daugirdas 2ª geração com sessão de 4 h e sem UF/peso — estimativa; para o valor exato faltam tempo, UF e peso pós da clínica.' },
    cap:  { nome: 'Produto Ca × P', curto: 'Ca×P', un: 'mg²/dL²', grupo: 'osso', ref: [null, 55] },
    cacor: { nome: 'Cálcio corrigido pela albumina', curto: 'Ca corr', un: 'mg/dL', grupo: 'osso', ref: [8.4, 10.2] },
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

  M.defRes = c => M.RES[c] || M.RES_DERIVADOS[c] || { nome: 'Código ' + c + (M.NEPHRO_PDF[c] ? ' (' + M.NEPHRO_PDF[c] + ')' : ''), curto: c, un: '', grupo: 'outros', desconhecido: true };

  /** 'ok' | 'baixo' | 'alto' | 'crit-baixo' | 'crit-alto' | null */
  M.classificar = function (cod, v) {
    if (!v || v.n == null) return null;
    const d = M.defRes(cod), x = v.n;
    if (d.crit) { if (d.crit[0] != null && x < d.crit[0] && v.op !== '>') return 'crit-baixo'; if (d.crit[1] != null && x > d.crit[1] && v.op !== '<') return 'crit-alto'; }
    if (!d.ref) return 'ok';
    if (d.ref[0] != null && x < d.ref[0] && v.op !== '>') return 'baixo';
    if (d.ref[1] != null && (x > d.ref[1] || (v.op === '>' && x >= d.ref[1]))) return 'alto';
    return 'ok';
  };

  /** Situação do código do TXT frente à tabela do PDF */
  M.statusInterface = function (cod) {
    const r = M.RES[cod], pdfNome = M.NEPHRO_PDF[cod];
    if (!r) return { st: 'desconhecido', txt: pdfNome ? `No PDF: ${pdfNome}` : 'Código não interpretado' };
    if (r.pdf === cod) return { st: 'confere', txt: 'Confere com o PDF' };
    if (pdfNome && r.pdf) return { st: 'diverge', txt: `No PDF o ${cod} é “${pdfNome}”; ${r.nome} é ${r.pdf}` };
    if (pdfNome) return { st: 'diverge', txt: `No PDF o ${cod} é “${pdfNome}”` };
    if (r.pdf) return { st: 'ausente', txt: `${cod} não existe no PDF; lá ${r.nome} é ${r.pdf}` };
    return { st: 'ausente', txt: 'Não existe no PDF (detalhe do hemograma/frações)' };
  };
})(window.MED = window.MED || {});
