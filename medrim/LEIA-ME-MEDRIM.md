# MedRim — gestor das baterias Hiperrim

**Versão online (desde 22/10/2026):** login por e-mail e senha e dados no Firestore do projeto `celulams`
(`js/nuvem.js`). Papéis em `medrim_usuarios/{uid}`, aplicados no servidor pelas regras (`app/firestore.rules`, bloco MedRim):

| Papel | Pode |
|---|---|
| **programador** | Tudo: importação mensal (Word + CSVs), etiquetas, resultados, regras, usuários, integração, backup. |
| **enfermaria** | Editar pacientes e escala: transferência, internação, óbito, admissão, cadastro sem pedido, travas, convênio, observações. |
| **faturamento** | Ver painel, salões, relatório, etiquetas e resultados; baixar o TXT para o Nephrosys. Não edita. |

- Primeiro acesso: quem está em `config/app.admins` (administração do app Célula) vira **programador** sozinho.
  Os demais acessos são criados em **Usuários e acessos**. Quem já tem login do Célula e entra no MedRim gera um pedido para liberar.
- **Usuários e acessos** (programador): criar (com gerador de senha), trocar papel, desativar/reativar, **excluir** (some da lista,
  perde o acesso na hora; dá para restaurar em “Excluídos”) e **trocar senha** de outra pessoa pelo link enviado ao e-mail dela.
  Qualquer papel troca a **própria senha** no cadeado ao lado do nome, no menu. Apagar o login de vez e definir a senha de
  outra pessoa sem e-mail exigem o Admin SDK (servidor) — pelo navegador o Firebase não permite.
- Contas do MedRim **não** ganham perfil no app de atendimento (regra em `usuarios/{uid}`).
- Gravação: só o que mudou (um campo por vaga/paciente/chave), com mesclagem em tempo real entre usuários e
  histórico com o nome de quem fez. Nada de paciente fica guardado no navegador.
- Coleções: `medrim_vagas` (1 doc por salão/turno), `medrim_pacientes` (16 páginas), `medrim_meta`
  (estado, apelidos, travas, convenios, notas, etiquetas), `medrim_eventos/{AAAA-MM}`, `medrim_lotes` e `medrim_txt`
  (fatiados), `medrim_entrada` (integração), `medrim_pedidos`.
- Integração: ver a tela **Integração (API)** — o sistema do laboratório grava o TXT em `medrim_entrada` pela API REST.
- Para testar sem nuvem: em `index.html`, `window.MED = { nuvem: false }` (volta ao modo só-navegador).

---

## Versão local (histórico)

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
| `js/relatorio.js` | **Relatório do período**: números atuais dos equipamentos e movimentações (transferências, óbitos, abandonos, transplantes, altas, internações…) entre duas datas. |
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
8. **Relatório do período** (botão azul no Painel, ou no menu) → escolha Hoje, 7 dias, 30 dias, Este mês,
   Mês anterior, 90 dias, Este ano ou Personalizado (De/Até). Mostra a ocupação agora (máquinas, vagas, ocupadas,
   vazias, por salão e por dias/turno) e tudo o que aconteceu no período: transferências, óbitos, abandonos,
   transplantes, altas/transferências externas, internações, retornos, admissões, trânsito, travas e remoções,
   com gráfico por dia/semana/mês e as listas nominais. **Excel** baixa resumo + detalhe; **Imprimir / PDF** sai em A4.
   Óbitos, abandonos, transplantes e altas contam pela situação atual do paciente e pela data da saída — se a saída
   for corrigida na ficha, o relatório acompanha sem contar duas vezes. Online, o relatório busca os eventos de todos
   os meses do período na nuvem (enfermaria e faturamento também veem, só leitura).
9. **Backup (JSON)** → guarda o estado (contém dados pessoais: salve em local seguro, fora do GitHub).
   Para levar tudo para outro computador: **Importar arquivos → Restaurar backup**.

## Resultados (TXT padrão Nephrosys)

1. **Resultados → Subir TXT**: escolha o arquivo que o sistema do laboratório exporta (ex.: `Bateria_Out_2026.txt`).
   A competência vem do nome do arquivo (ou da data de coleta + 1 mês) e pode ser trocada antes de importar.
2. A tela **Resultados** mostra o mapa por salão/dias/turno, com cores por alvo, valores críticos no topo
   e setas ↑↓ em relação ao mês anterior (a partir do 2º TXT importado).
3. Clique no paciente para a **ficha**: destaques (URR, Kt/V estimado, Hb, Ht, K, P, Ca×P, PTH, ferritina, IST, albumina) —
   clicar num destaque abre a **régua do histórico daquele exame** (valor de cada mês na onda, colorido pelo alvo) —
   tabelas por grupo, hemograma completo, histórico de todos os meses e observações do médico.
4. **Arquivos TXT**: cada TXT fica guardado exatamente como foi exportado (mesmos bytes) para a Hiperrim baixar.
5. **Interface Nephrosys**: os códigos do TXT do laboratório **são** os da integração com o Nephrosys da Hiperrim
   (em produção, funcionando) — o MedRim usa esses códigos e não altera o arquivo. A tela mostra cada exame da bateria →
   código(s) no TXT, conferidos valor a valor contra um laudo completo de bateria anual (dez/2025). Ficam como “inferido”
   só 046/047/048/055 (zerados no laudo), 062 (soma do diferencial) e 067 (Hb glicada, confirmada pelo TXT mensal).
   Hb e Ht **avulsos** (bateria mensal) saem como **010/011**; dentro do hemograma completo, como **016/017**. No histórico
   do médico eles entram na mesma linha (010 → 016, 011 → 017); o TXT não é alterado.
6. **Régua do histórico** (topo de Resultados e de Arquivos TXT): um ponto por mês, numa onda senoidal animada.
   Ponto cheio = TXT carregado (clique para ver o mês); vazio = falta — o programador clica para subir o TXT daquele mês
   ou arrasta **vários TXT de uma vez**: cada arquivo vai para o mês do nome (ex.: `Bateria_Out_2026`) ou da coleta + 1 mês,
   com conferência antes de importar (mês que já tem TXT vem desmarcado). Respeita “reduzir movimento” do sistema.
   Pacientes do TXT que **não estão no MedRim hoje** aparecem agrupados (“fora do sistema”), com excluir/manter por paciente.
   Em meses anteriores vêm marcados para **excluir**: não entram no histórico e o TXT guardado vira uma cópia filtrada e
   renumerada (avisada em Arquivos TXT). No mês atual o padrão é manter, porque esse TXT vai para a Hiperrim.

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
- Internado: fora até o retorno. Trânsito: fora por padrão. Saída da clínica (óbito, saiu — alta/transferência externa,
  **abandonou o tratamento**, **transplantado** — não faz mais diálise): libera a máquina e tira das baterias; fica no histórico.
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
