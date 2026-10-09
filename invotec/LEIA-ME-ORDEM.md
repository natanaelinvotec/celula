# Gerador de O.S. Invotec — instalação passo a passo

Arquivos deste pacote (todos vão na **raiz** do repositório `celula`, junto com os demais):

| Arquivo | Para que serve |
|---|---|
| `ordem.html` | A página do sistema (login, painel, assistente, prévia e PDF). |
| `ordem.js` | A lógica do app. Não precisa editar. |
| `firebase-config.js` | **Único arquivo que você edita**: chaves do Firebase, dados da empresa, equipamentos e textos prontos. |
| `logo-invotec.svg` / `simbolo-invotec.svg` | Logo nova (cabeçalho, login e laudo) e ícone da aba. |
| `firestore.rules` | Regras de segurança do banco (você cola no console do Firebase). |
| `LEIA-ME-ORDEM.md` | Este guia. |

Endereço final: `https://natanaelinvotec.github.io/celula/ordem.html`
(o GitHub Pages serve o `ordem.html`; o link `github.com/.../celula/ordem.html` mostra o código, não a página).

---

## 1. Criar o projeto no Firebase (5 min)

1. Entre em <https://console.firebase.google.com> com sua conta Google.
2. **Adicionar projeto** → nome `invotec-os` (ou outro) → pode desativar o Google Analytics → **Criar projeto**.
3. Na tela inicial do projeto, clique no ícone **`</>` (Web)** para registrar um app → apelido `ordem` → **não** marque Firebase Hosting → **Registrar app**.
4. Vai aparecer um bloco `const firebaseConfig = { apiKey: "...", authDomain: "...", ... }`.
   Copie **só o conteúdo entre chaves** e cole no arquivo `firebase-config.js`, substituindo os valores `COLE_AQUI`/`SEU-PROJETO`.

   > Essas chaves não são secretas: elas identificam o projeto. A proteção vem do login (passo 2) e das regras (passo 4).

## 2. Ativar o login e **criar sua senha**

1. Menu lateral **Criação → Authentication** → **Vamos começar**.
2. Aba **Sign-in method** → **E-mail/senha** → ativar a primeira chave (**E-mail/senha**) → **Salvar**.
3. Aba **Users** → **Adicionar usuário** → digite seu e-mail e uma senha forte (mínimo 6 caracteres; use 12+ com letras, números e símbolos) → **Adicionar usuário**.
   Esse é o login que você usa na página. Só quem estiver cadastrado aqui entra.
4. Aba **Settings → Domínios autorizados** → **Adicionar domínio** → `natanaelinvotec.github.io`.
   (`localhost` já vem liberado para testes.)

**Trocar a senha depois:** em *Users*, clique nos três pontos do usuário → **Redefinir senha** (envia e-mail), ou use **Esqueci a senha** na própria tela de login.
**Mais usuários:** basta adicionar em *Users*. Todos veem as mesmas O.S.; cada um tem sua própria assinatura padrão.

## 3. Criar o banco de dados (Firestore)

1. Menu **Criação → Firestore Database** → **Criar banco de dados**.
2. Local: `southamerica-east1 (São Paulo)` → **Avançar**.
3. Modo: **produção** (bloqueado) → **Criar**.

## 4. Colar as regras de segurança

1. Em **Firestore Database → aba Regras**.
2. Apague o que está lá, cole o conteúdo do arquivo `firestore.rules` → **Publicar**.

Resultado: sem login ninguém lê nem grava nada, mesmo conhecendo as chaves do `firebase-config.js`.

## 5. Publicar no GitHub

1. Copie os 6 arquivos para a **raiz** do repositório `celula` e faça o commit/push (pode ser pelo site do GitHub: *Add file → Upload files*).
2. Confirme que o GitHub Pages está ativo: **Settings → Pages → Source: Deploy from a branch → `main` / `(root)`**.
3. Após 1–2 minutos abra `https://natanaelinvotec.github.io/celula/ordem.html`, faça login e crie a primeira O.S.

### Opcional (recomendado): travar a chave ao seu domínio
Google Cloud Console → **APIs e serviços → Credenciais** → clique na *Browser key (auto created by Firebase)* → **Restrições de aplicativos → Sites** → adicione `natanaelinvotec.github.io/*` → Salvar. Assim a chave só funciona a partir do seu site.

---

## Como usar

**Cadastrar O.S.** → 7 etapas: nº da O.S. Quallyx → equipamento (preenche cliente, endereço, telefone, local e CNPJ) → tipo de serviço → descrição (texto pronto editável) → fotos de prova: toque em *Tirar foto* (abre a câmera) ou *Escolher da galeria*, escreva a descrição e repita para a próxima, ou *Continuar*; de 1 a 10 fotos, em pé (360×504) ou deitadas (504×360), todas no mesmo tamanho no laudo, que cresce ou encolhe conforme a quantidade → datas/horas das etapas → assinaturas (dedo/caneta na tela ou envio de imagem; marque *Salvar como minha assinatura padrão* uma vez e ela já vem preenchida nas próximas).
**Prévia** → *Gravar* (salva na nuvem) ou *Gravar e baixar PDF* (salva e gera `OS-8680-Invotec.pdf`, A4 retrato).
**Painel** → busca, filtros por cliente, tipo e período; *Ver / PDF* reabre e baixa de novo; *Editar*; *Duplicar* (nova O.S. com os mesmos dados, útil para preventivas repetidas); 🗑 exclui.
**Celular**: adicione à tela inicial (Chrome → menu → *Adicionar à tela inicial*) e abre como app.

## Manutenção

- **Novo equipamento / cliente, telefone mudou, novo texto pronto, mudar atendente padrão:** edite `firebase-config.js` (listas `EQUIPAMENTOS`, `TEXTOS_PRONTOS`, `EMPRESA`) e faça o commit. Nada mais muda.
- **Backup:** botão **⬇ Backup** no painel baixa todas as O.S. com fotos em um arquivo JSON; **⬆ Importar** restaura esse arquivo (ou carrega o histórico). O.S. com número já existente são puladas.
- **Custo:** plano gratuito do Firebase (Spark) cobre com folga: cada foto ocupa ~50 KB (uma O.S. com 10 fotos, ~0,5 MB); o limite grátis é 1 GB armazenado e 50 mil leituras/dia.

## Se algo não funcionar

| Sintoma | Causa provável |
|---|---|
| "O arquivo firebase-config.js ainda não foi preenchido" | Passo 1.4 não feito. |
| "E-mail ou senha incorretos" | Usuário não criado (passo 2.3) ou e-mail/senha ativado sem salvar (2.2). |
| "auth/unauthorized-domain" | Domínio não adicionado (passo 2.4). |
| "Missing or insufficient permissions" | Regras não publicadas (passo 4). |
| PDF não baixa | Bloqueio de download do navegador; use o botão de novo ou Ctrl+P → *Salvar como PDF* (a página já está formatada para A4). |
