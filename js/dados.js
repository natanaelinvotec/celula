/* MedRim · dados fixos: exames, baterias, calendário e regras de controle.
   Tudo aqui é configuração — nenhum dado de paciente mora neste arquivo. */
(function (M) {
  'use strict';

  // Código no sistema do laboratório → nome e coluna correspondente no CSV da Hiperrim
  M.EXAMES = {
    'U-DB':      { nome: 'Ureia renal',                          csv: 'UR' },
    'URPOS':     { nome: 'Ureia [pós-hemodiálise]',              csv: 'UR Pós' },
    'CR-DB':     { nome: 'Creatinina renal',                     csv: 'CR' },
    'K-DB':      { nome: 'Potássio renal',                       csv: 'K' },
    'CA-DB':     { nome: 'Cálcio renal',                         csv: 'Ca' },
    'P-DB':      { nome: 'Fósforo renal',                        csv: 'P' },
    'HT':        { nome: 'Hematócrito',                          csv: 'HT' },
    'HB':        { nome: 'Hemoglobina',                          csv: 'HB' },
    'TGP-DB':    { nome: 'Transaminase glutâmico-pirúvica',      csv: 'TGP' },
    'GLI-DB':    { nome: 'Glicemia de jejum renal',              csv: 'Glic' },
    'NA-DB':     { nome: 'Sódio renal',                          csv: 'Na' },
    'PTF-DB':    { nome: 'Proteínas totais e frações',           csv: 'Prot T' },
    'FAL-DB':    { nome: 'Fosfatase alcalina renal',             csv: 'Fosf Alc' },
    'PTHI-DB':   { nome: 'Paratormônio – PTH intacto',           csv: 'PTH' },
    'FE-DB':     { nome: 'Ferro sérico renal',                   csv: 'Ferro' },
    'CAPAT-DB':  { nome: 'Capacidade total de transporte do ferro', csv: 'Sat Transf' },
    'FERRI-DB':  { nome: 'Ferritina',                            csv: 'Ferrit' },
    'HEM':       { nome: 'Hemograma completo',                   csv: 'Hemograma' },
    'HBGL-DB':   { nome: 'Hemoglobina glicada',                  csv: 'HB-Gli' },
    'HBSAG-DB':  { nome: 'Hepatite B – HBsAg',                   csv: 'HbsAg' },
    'AHBS-DB':   { nome: 'Hepatite B – anti-HBs',                csv: 'A HBs' },
    'HCV-DB':    { nome: 'Hepatite C – anti-HCV',                csv: 'A HCV' },
    'VITD25-DB': { nome: 'Vitamina D 25-hidroxi',                csv: 'Vit. D' },
    'AL-HP':     { nome: 'Alumínio',                             csv: 'Al' },
    'HIV-HP':    { nome: 'HIV I e II – anticorpos',              csv: 'A HIV' },
    'COL-DB':    { nome: 'Colesterol total renal',               csv: 'COL' },
    'HDL-DB':    { nome: 'Colesterol HDL renal',                 csv: 'HDL' },
    'LDL-DB':    { nome: 'Colesterol LDL renal',                 csv: 'LDL' },
    'TRIG-DB':   { nome: 'Triglicerídeos renal',                 csv: 'Trigl.' },
    'TSH-DB':    { nome: 'TSH – hormônio tireoestimulante',      csv: 'TSH' },
    'T4-DB':     { nome: 'T4 – tiroxina',                        csv: 'T4' },
  };
  M.CSV_PARA_CODIGO = Object.fromEntries(Object.entries(M.EXAMES).map(([cod, e]) => [e.csv, cod]));

  // Baterias (conforme os prints do sistema). Trimestral: 12 visíveis no print + CA-DB e CAPAT-DB — confirmado pelo TXT de out/2026 (cálcio, CTLF e IST em todos).
  M.BATERIAS = {
    mensal: {
      rotulo: 'Mensal', cor: 'var(--b-mensal)', qtd: 9,
      exames: ['CA-DB', 'HB', 'HT', 'K-DB', 'NA-DB', 'P-DB', 'TGP-DB', 'U-DB', 'URPOS'],
    },
    trimestral: {
      rotulo: 'Trimestral', cor: 'var(--b-tri)', qtd: 14,
      exames: ['CA-DB', 'CAPAT-DB', 'FAL-DB', 'FE-DB', 'FERRI-DB', 'HEM', 'K-DB', 'NA-DB', 'P-DB', 'PTF-DB', 'PTHI-DB', 'TGP-DB', 'U-DB', 'URPOS'],
    },
    semestral: {
      rotulo: 'Semestral', cor: 'var(--b-sem)', qtd: 19,
      exames: ['AHBS-DB', 'CA-DB', 'CAPAT-DB', 'CR-DB', 'FAL-DB', 'FE-DB', 'FERRI-DB', 'HBSAG-DB', 'HCV-DB', 'HEM', 'K-DB', 'NA-DB', 'P-DB', 'PTF-DB', 'PTHI-DB', 'TGP-DB', 'U-DB', 'URPOS', 'VITD25-DB'],
    },
    anual: {
      rotulo: 'Anual', cor: 'var(--b-anual)', qtd: 29, semControle: true,
      exames: ['AHBS-DB', 'CA-DB', 'AL-HP', 'CAPAT-DB', 'CR-DB', 'COL-DB', 'FAL-DB', 'FE-DB', 'FERRI-DB', 'HBSAG-DB', 'GLI-DB', 'HCV-DB', 'HBGL-DB', 'HEM', 'HDL-DB', 'K-DB', 'HIV-HP', 'NA-DB', 'LDL-DB', 'P-DB', 'PTF-DB', 'PTHI-DB', 'TGP-DB', 'T4-DB', 'U-DB', 'TRIG-DB', 'URPOS', 'TSH-DB', 'VITD25-DB'],
    },
  };

  // Admissional: os 29 da anual menos ureia pós-diálise = 28 (sem controle extra — glicose, creatinina e Hb glicada já estão dentro)
  M.BATERIAS.admissional = {
    rotulo: 'Admissional', cor: 'var(--teal)', qtd: 28, semControle: true, especial: true,
    exames: M.BATERIAS.anual.exames.filter(c => c !== 'URPOS'),
  };
  // baterias que podem ser escolhidas no cadastro de quem veio sem pedido no CSV
  M.BATERIAS_MANUAIS = ['mensal', 'trimestral', 'semestral'];

  // Mês (1–12) → tipo de bateria
  M.CALENDARIO = { 1: 'anual', 2: 'mensal', 3: 'mensal', 4: 'trimestral', 5: 'mensal', 6: 'mensal', 7: 'semestral', 8: 'mensal', 9: 'mensal', 10: 'trimestral', 11: 'mensal', 12: 'mensal' };
  M.MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  M.DIAS_ANTES_CADASTRO = 10;

  // Controles por paciente (marcados no CSV) e em quais baterias cada um acrescenta exame.
  M.CONTROLES = {
    glic: { rotulo: 'Glicose',     sigla: 'G', exame: 'GLI-DB',  cor: 'var(--k-glic)' },
    cr:   { rotulo: 'Creatinina',  sigla: 'C', exame: 'CR-DB',   cor: 'var(--k-cr)' },
    hbgl: { rotulo: 'Hb glicada',  sigla: 'H', exame: 'HBGL-DB', cor: 'var(--k-hbgl)' },
  };

  /**
   * Regra de negócio: quais controles acrescentam exame em cada tipo de bateria.
   * Padrão adotado no mockup (a validar com a equipe):
   *  - glicose: mensal, trimestral e semestral (a anual já inclui GLI-DB)
   *  - creatinina: mensal e trimestral (semestral e anual já incluem CR-DB)
   *  - Hb glicada: trimestral e semestral (não aparece no CSV mensal de novembro)
   * A tela "Baterias & regras" permite alterar esta matriz; o valor salvo fica em estado.regras.
   */
  M.REGRAS_PADRAO = {
    glic: { mensal: true, trimestral: true, semestral: true, anual: false },
    cr:   { mensal: true, trimestral: true, semestral: false, anual: false },
    hbgl: { mensal: false, trimestral: true, semestral: true, anual: false },
  };

  M.TURNOS = { M: { rotulo: 'Manhã', csv: 1, ic: 'sun' }, T: { rotulo: 'Tarde', csv: 2, ic: 'sunset' }, N: { rotulo: 'Noite', csv: 3, ic: 'moon' } };
  M.GRUPOS = {
    SQS: { rotulo: 'Seg · Qua · Sex', curto: 'SQS', dias: ['seg', 'qua', 'sex'] },
    TQS: { rotulo: 'Ter · Qui · Sáb', curto: 'TQS', dias: ['ter', 'qui', 'sab'] },
  };
  M.DIAS = { seg: 'Seg', qua: 'Qua', sex: 'Sex', ter: 'Ter', qui: 'Qui', sab: 'Sáb' };

  M.STATUS = {
    ativo:     { rotulo: 'Ativo',       cor: 'var(--ok)' },
    internado: { rotulo: 'Internado',   cor: 'var(--warn)' },
    transito:  { rotulo: 'Em trânsito', cor: 'var(--c5)' },
    obito:     { rotulo: 'Óbito',       cor: 'var(--muted)' },
    saiu:      { rotulo: 'Saiu da clínica', cor: 'var(--muted)' },
  };
})(window.MED = window.MED || {});
