# MedRim — gestor das baterias Hiperrim (mockup)

Pasta para o repositório `celula`. Depois de enviada, a página fica em **`celulams.com.br/medrim/`**
(ou `natanaelinvotec.github.io/celula/medrim/`, se o domínio ainda não estiver apontado).

> **Importante (LGPD):** esta pasta **não contém nenhum dado de paciente**, e é assim que deve continuar,
> porque o repositório é público. Os arquivos da escala e dos CSVs são lidos **no navegador** de quem usa
> e ficam guardados só ali (localStorage). **Nunca** suba para o GitHub o Word, os CSVs ou o backup `.json`.

## Arquivos

| Arquivo | Para que serve |
|---|---|
| `index.html` | A página (painel, salões, sincronização, relatório, regras, proposta). |
| `css/medrim.css` | Visual (mesmo design system do app Célula: Nunito, azul/vermelho, tema escuro). |
| `js/dados.js` | **Configuração**: exames, baterias (9/14/19/29), calendário, controles e regras. É o arquivo que se edita para mudar regras. |
| `js/importar.js` | Lê o `.docx` (sem biblioteca externa) e os CSVs (Windows-1252). |
| `js/sincronizar.js` | Casa os nomes abreviados da escala com o nome completo/CPF do CSV. |
| `js/app.js` | Estado, regras de coleta, painel, busca e navegação. |
| `js/salao.js` | Salões/máquinas, ficha do paciente, ferramentas (transferir, trânsito, admissão, internação, óbito). |
| `js/telas.js` | Importação, sincronização, relatório de cadastro, baterias & regras, proposta. |
| `js/nephrosys.js` | **Configuração da interface de resultados**: tabela de códigos do PDF Nephrosys, como cada código do TXT é interpretado, alvos e valores críticos. |
| `js/etiquetas.js` | Lê os PDFs de etiquetas do Autolac (sem biblioteca externa), liga protocolo → paciente e monta o mapa de coleta. |
| `js/resultados.js` | Importa o TXT de resultados, guarda o histórico, visão do médico, ficha do paciente, arquivos para download e tela da interface. |
| `img/` | Logos (Célula e Hiperrim) e ícone da aba. |

## Como subir no GitHub

1. Descompacte o arquivo `.zip`/`.rar` — vai aparecer a pasta `medrim`.
2. No GitHub, abra o repositório **celula** → **Add file → Upload files**.
3. Arraste **a pasta `medrim` inteira** (com `css`, `js` e `img` dentro) → **Commit changes**.
4. Em 1–2 minutos, abra `celulams.com.br/medrim/`.

## Como usar (todo mês)

1. **Importar arquivos** → solte o `.docx` da escala + os 6 CSVs
   (`SEG QUA E SEX 1 TURNO.csv` … `TER QUI E SAB 3 TURNO.csv`). O nome do CSV define dias e turno.
2. **Sincronização** → confirme ou corrija os casamentos em dúvida. O que você confirma vira
   dicionário e casa sozinho nos próximos meses.
3. **Salões** → ajuste internados, admissionais, trânsito, óbitos e transferências (arrastar e soltar).
4. **Relatório de cadastro** → na ordem das etiquetas; exporte para Excel ou imprima/PDF.
5. **Lista conferida (.xlsx)** → a planilha “Lista de pacientes” (Nome, CPF, Salão, Dias, Turno, Equipamento)
   pode ser solta junto com os arquivos, ou sozinha depois: o MedRim coloca cada CPF na máquina indicada,
   confirma o vínculo e lembra nos próximos meses. Linhas com máquina inexistente aparecem em Movimentações.
6. **Planilha de pendentes (.xlsx)** → os nomes da escala sem pedido no CSV, com colunas Nome na escala, Nome completo,
   CPF, Data de nascimento, Bateria e Ação (Cadastrar / Outro lab / Excluir). Solte a planilha preenchida em
   **Importar arquivos**: a máquina é a chave (Salão + Dias + Turno + Equipamento + Nome na escala). Ação em branco com
   nome preenchido = cadastrar; sem nome = continua pendente. Linhas com CPF inválido/repetido ou máquina que mudou são
   recusadas e aparecem em Movimentações. Reenviar a mesma planilha não duplica nada.
7. **Etiquetas & mapa de coleta** → depois de cadastrar no Autolac, solte os PDFs “Resumo de Solicitações Incluídas”
   (um por perfil: `normal`, `gli`, `cr`, `glicr` — o perfil vem do nome do arquivo e pode ser trocado na tela).
   O MedRim liga cada protocolo (13-XXXXXX) ao paciente, aponta quem coleta sem etiqueta, protocolo sem paciente e perfil
   diferente do MedRim, e imprime o **mapa de coleta**: uma folha A4 deitada por salão e turno, máquinas na ordem do salão,
   nome + protocolo em letra grande (filtro Seg/Qua/Sex, Ter/Qui/Sáb ou ambos). Os PDFs são lidos no navegador.
8. **Backup (JSON)** → guarda o estado (contém dados pessoais: salve em local seguro, fora do GitHub).
   Para levar tudo para outro computador: **Importar arquivos → Restaurar backup**.

## Resultados (TXT padrão Nephrosys)

1. **Resultados → Subir TXT**: escolha o arquivo que o sistema do laboratório exporta (ex.: `Bateria_Out_2026.txt`).
   A competência vem do nome do arquivo (ou da data de coleta + 1 mês) e pode ser trocada antes de importar.
2. A tela **Resultados** mostra o mapa por salão/dias/turno, com cores por alvo, valores críticos no topo
   e setas ↑↓ em relação ao mês anterior (a partir do 2º TXT importado).
3. Clique no paciente para a **ficha**: destaques (URR, Kt/V estimado, Hb, K, P, Ca×P, PTH, ferritina, IST, albumina),
   tabelas por grupo, hemograma completo, histórico de todos os meses e observações do médico.
4. **Arquivos TXT**: cada TXT fica guardado exatamente como foi exportado (mesmos bytes) para a Hiperrim baixar.
5. **Interface Nephrosys**: códigos do TXT × tabela do PDF. Hoje 5 códigos significam outro exame no PDF
   (043 sódio, 067 Hb glicada, 015 hemácias, 061 CHCM, 062 total do diferencial) — conferir com a Hiperrim.

Layout lido do TXT (separador `|`, ISO-8859-1, CRLF):

```
01 | sequência | nome | (vazio) | (vazio) | CPF | data da coleta        ← paciente
02 | sequência | código | valor | valor absoluto | (vazio) |            ← resultado
```

Os alvos e valores críticos (`js/nephrosys.js`) são uma sugestão baseada em KDIGO/KDOQI — validar com o nefrologista responsável.
No mockup, os resultados ficam no IndexedDB do navegador (não vão para o GitHub).

## Regras assumidas (a confirmar)

- Trimestral = 14: os 12 do print + `CA-DB` e `CAPAT-DB` — confirmado pelo TXT de outubro.
- Controles: glicose → mensal/trimestral/semestral; creatinina → mensal/trimestral; Hb glicada → trimestral/semestral; anual sem controle.
  (Editável na tela **Baterias & regras** ou em `M.REGRAS_PADRAO`, no `js/dados.js`.)
- Admissional: 28 exames (anual sem ureia pós, sem controles extras); entra na lista do mês da admissão no lugar da bateria do mês; janeiro faz a anual completa. Se já foi coletado, marcar na admissão.
- Sem pedido no CSV: cadastrar com a bateria escolhida (mensal/trimestral/semestral) — entra na sequência normal; “Excluir” tira o nome da escala.
- Outro laboratório = **trava** (cadeado). Vale pela pessoa (CPF, ou nome da escala + dias + turno), atravessa os meses e o
  "Começar do zero": mesmo que a Hiperrim mande o paciente no CSV, ele fica fora do relatório e das pendências. Clique no cadeado para liberar.
- Convênio (Unimed): marcado pelo CPF na ficha do paciente; selo pequeno na máquina, no relatório e coluna Convênio no Excel.
- Internado: fora até o retorno. Trânsito: fora por padrão. Óbito/saída: libera a máquina.
- Ordem do relatório: Salão → Seg/Qua/Sex (manhã, tarde, noite) → Ter/Qui/Sáb (manhã, tarde, noite) → máquina.

## Versão final (próxima fase)

O mesmo modelo de dados vai para o **Firestore do projeto `celulams`**, com o login que o app de
atendimento já usa (`app/js/firebase.js` → `exigirLogin`). Coleções sugeridas:

```
medrim_escala/{salao-turno-grupo-maq}   ocupante, dias, observações
medrim_pacientes/{cpf}                   nome, nascimento, código, controles, status, admissão
medrim_baterias/{aaaa-mm}                tipo, regras, lista gerada, quem gerou
medrim_apelidos/{nomeEscala|grupo|turno} → cpf (dicionário aprendido)
medrim_eventos/{id}                      transferências, internações, óbitos… (somente inclusão)
medrim_resultados/{aaaa-mm}/pacientes/{cpf}  valores do TXT por competência (histórico)
Storage: medrim/txt/{aaaa-mm}.txt        o TXT original para a Hiperrim baixar
```

Regras de acesso: leitura/escrita só para usuário ativo com papel `laboratorio`; papel `hiperrim`
(médicos e equipe da clínica) só leitura de resultados e download dos TXT; eventos sem update/delete —
no mesmo estilo do `app/firestore.rules`.
