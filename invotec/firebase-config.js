// =====================================================================
//  CONFIGURAÇÃO DO FIREBASE — Gerador de O.S. Invotec
//  Cole aqui o objeto "firebaseConfig" copiado do console do Firebase:
//  Configurações do projeto > Geral > Seus apps > (app da Web) > SDK setup and configuration > Config
//  Veja o passo a passo completo em LEIA-ME-ORDEM.md
// =====================================================================
export const firebaseConfig = {
  apiKey: "AIzaSyC90ChGGQ2lXQkRNkNfKrqo0DQGqRt_eOU",
  authDomain: "invotec-os.firebaseapp.com",
  projectId: "invotec-os",
  storageBucket: "invotec-os.firebasestorage.app",
  messagingSenderId: "202577019726",
  appId: "1:202577019726:web:f3dc0ae98184ee45ab941f"
};

// Dados da empresa que aparecem no cabeçalho do laudo
export const EMPRESA = {
  nome: "Invotec",
  cnpj: "34.372.617/0001-50",
  contato: "(67) 99212-2801",
  endereco: "Rua Ciro Macuco, 61 - Campo Grande/MS",
  tecnicoPadrao: "Natanael Alves da Silva",
  atendentePadrao: "Natanael Silva"
};

// Equipamentos cadastrados: ao escolher um, o cabeçalho do cliente é preenchido
export const EQUIPAMENTOS = [
  { eq: "ST-200 SN STAQB-981 Quallyx aQua", cliente: "Santa Casa Campo Grande MS", endereco: "Rua EDUARDO SANTOS PEREIRA, 88, Centro - Campo Grande/MS", telefone: "(67) 3322-4000", local: "Santa Casa Campo Grande MS", cnpj: "28.966.389/0012-04" },
  { eq: "ST-200 SN STAQB-636 Quallyx aQua", cliente: "Santa Casa Campo Grande MS", endereco: "Rua EDUARDO SANTOS PEREIRA, 88, Centro - Campo Grande/MS", telefone: "(67) 3322-4000", local: "Santa Casa Campo Grande MS", cnpj: "28.966.389/0012-04" },
  { eq: "ST-200 SN STAQB-683 Quallyx aQua", cliente: "Hospital do Coração Campo Grande MS", endereco: "Rua Marechal Rondon, 1702, Centro - Campo Grande/MS", telefone: "(67) 3323-9150", local: "Hospital do Coração Campo Grande MS", cnpj: "28.966.389/0012-04" },
  { eq: "FujiFilm Dri-Chem NX600", cliente: "Hospital do Coração Campo Grande MS", endereco: "Rua Marechal Rondon, 1702, Centro - Campo Grande/MS", telefone: "(67) 3323-9150", local: "Hospital do Coração Campo Grande MS", cnpj: "28.966.389/0012-04" },
  { eq: "ST-200 SN STAQB-664 Quallyx aQua", cliente: "Hospital Cassems Campo Grande MS", endereco: "Av. Mato Grosso, 5151, Centro - Campo Grande/MS", telefone: "(67) 3323-0300", local: "Hospital Cassems Campo Grande MS", cnpj: "04.311.093/0001-26" },
  { eq: "ST-200 SN STAQB-358 Quallyx aQua", cliente: "Hospital Cassems Campo Grande MS", endereco: "Rua da Paz, 311 - Centro - Campo Grande/MS", telefone: "(67) 3042-8730", local: "Hospital Cassems Campo Grande MS", cnpj: "04.311.093/0028-46" }
];

export const TIPOS_SERVICO = ["Preventiva Anual", "Manutenção", "Troca de periférico"];

// Textos prontos da descrição dos serviços (editáveis na tela)
export const TEXTOS_PRONTOS = [
  { id: "prev", titulo: "Preventiva ST-200 (completa)", texto:
`Durante a manutenção preventiva periódica do equipamento ST-200, foram executados os seguintes procedimentos técnicos e substituições de consumíveis para garantir o pleno funcionamento e a precisão analítica do sistema:

Substituição de Insumos e Componentes:
- Troca completa da solução de referência.
- Substituição do kit de tubulações do sistema de fluidos (Eletrodo, Bomba Peristáltica e Esgoto).
- Substituição da tubulação do trajeto da agulha até o detector de bolhas.

Limpeza e Manutenção Preventiva:
- Realizada a limpeza técnica e geral do bloco de eletrodos para evitar acúmulo de resíduos e garantir a condutividade ideal.

Ajustes Finais e Configurações:
- Acompanhamento dos ajustes finais e a validação da comunicação de interfaceamento do equipamento com o sistema do laboratório (LIS).

Testes de Validação e Controle de Qualidade:
- Processamento e análise de Controles de Qualidade (CQ). Testagem utilizando amostras de impacto clínico.
Resultado: Todos os testes de repetibilidade, calibração e precisão apresentaram resultados estritamente dentro das normalidades e especificações exigidas pelo fabricante.

Conclusão: O equipamento encontra-se em perfeitas condições operacionais, com comunicação de interfaceamento estável e parâmetros analíticos validados. Liberado para a rotina normal do setor.` },
  { id: "corr", titulo: "Manutenção corretiva (limpeza / vedação)", texto:
`Após a limpeza das tubulações do equipamento, correções dos encaixes, lubrificação da borracha da peristáltica, limpeza dos eletrodos, troca dos selos de vedação, todos os parâmetros retornaram normalmente. Equipamento liberado para uso após a passagem dos CQs.` }
];
