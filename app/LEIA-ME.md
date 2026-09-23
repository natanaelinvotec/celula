# Pedidos por IA — app (pasta `app/` do repositório celula)

Site estático (GitHub Pages) + Firebase (projeto **CelulaMS**): Auth por e-mail/senha, Firestore, Firebase AI Logic (Gemini Developer API, nível gratuito).

## Páginas
| Arquivo | Quem usa | O que faz |
|---|---|---|
| `login.html` | todos | entrar / esqueci a senha |
| `orcamento.html` | atendente | foto do pedido → IA → conferência → orçamento; "Enviar para conferência"; WhatsApp |
| `orcamentos.html` | atendente | histórico com filtros (paciente, nº, telefone), lista de mnemônicos, "marcar convertido" |
| `conta.html` | todos | foto, nome, senha |
| `painel.html` | admin | dashboard, solicitações, orçamentos, catálogo, usuários, exportar, configurações (rotas por `#`) |

## Módulos (`js/`)
`firebase.js` (init, sessão, papéis, utilitários) · `dados.js` (Firestore) · `ia.js` (Gemini com tentativas e modelo reserva) · `shell.js` (menu/topo) · `historico.js` (lista de orçamentos) · `orcamento.js` · `painel.js`.

## Primeiro acesso
1. No console Firebase → Authentication → Users → **Adicionar usuário** com o e-mail que está em `config/app.admins` (natanael.invotec@gmail.com). Ao entrar, o perfil é criado como **admin**.
2. No painel → Usuários → criar as atendentes e a Dra. Flávia (papel Admin).
3. Para publicar: GitHub → Settings → Pages → Branch `main` / root. O app fica em `https://natanaelinvotec.github.io/celula/app/`.
4. Adicionar `natanaelinvotec.github.io` em Authentication → Settings → **Domínios autorizados**.

## Regras
`firestore.rules` (esta pasta) já está publicada no projeto. Papéis: `atendente` (orçamentos, apelidos, solicitações) e `admin` (catálogo, aprovações, usuários, config). Auditoria em `auditoria/`.

## IA
Modelos: `gemini-3.6-flash` → reserva `gemini-3.5-flash`. Sem `responseMimeType` (no nível gratuito dá erro 500 com imagem); o JSON é pedido no prompt. Limite gratuito por minuto/dia: se aparecer "Limite de uso da IA atingido", aguarde ou passe o projeto para Blaze. Recomendado ativar o **App Check** (reCAPTCHA v3) em Firebase AI Logic → Configurações quando o site estiver no ar.

## Regras de negócio
- Prazo Célula = prazo DB + 2 dias úteis (`config/app.prazoExtraDiasUteis`).
- Exames com `renal: true` (…RENAL) só aparecem com o interruptor "Orçamento renal" ligado (pacote HIPERRIM, `config/app.pacoteRenal`).
- Confiança da IA < 85% → pergunta à atendente; confirmação/correção vira apelido (`apelidos`) e a IA acerta da próxima vez.
- Exame sem valor no convênio ou fora do catálogo → "Enviar para conferência" → `solicitacoes` → admin aprova (mnemônico, prazo, valores) → orçamento da atendente atualiza em tempo real.
- Numeração dos orçamentos continua do AutoLAC (`config/contadores.orcamento`, iniciado em 53044).
