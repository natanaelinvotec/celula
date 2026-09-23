# Firestore — projeto CelulaMS (celulams) · região southamerica-east1

Carga feita em 23/09/2026 (3.833 documentos). Regras restritas já publicadas; índice composto exames(setor, nome) criado.

## Coleções
| Coleção | Docs | ID | Conteúdo |
|---|---|---|---|
| `config/app` | 1 | fixo | versão da base, cores dos setores, `prazoExtraDiasUteis: 2` |
| `convenios/{slug}` | 91 | slug do nome (`particular`, `cassems_balcao`) | nome, ativo, planos |
| `exames/{mnemonico}` | 1.364 | mnemônico AutoLAC (`VITD25-DB`, `HEM`) | nome, nomeBusca, codigoTuss, setor, cor, laboratorio (DB/CELULA), prazoDias (+2 já somado), prazoDb, material, metodo, `precos.{slugConvenio}` |
| `apelidos/{slug}` | 2.377 | slug do texto normalizado | texto lido → mnemônico, confirmacoes, origem (catalogo/guia_db/recepcao) — **é aqui que a IA aprende** |
| `precos_manuais/{mnemonico__convenio}` | 0 | ex.: `FAL-DB__particular` | valor/prazo digitados pela recepção quando a tabela não tem |
| `orcamentos/{auto}` | 0 | automático | unidade, convenio, paciente, itens[], total, status |

## Regras (firestore.rules)
- catálogo (`config`, `convenios`, `exames`): leitura pública, escrita só pelo console/Functions;
- `apelidos`, `precos_manuais`, `orcamentos`: criação/atualização validadas campo a campo, exclusão proibida;
- qualquer outra coleção: negada.
Para exigir login da recepção depois: trocar `if true` por `if request.auth != null` nas escritas.

## Arquivos
- `pedidos-ia-db.js` — módulo ES para a página (PedidosDB.resolver / ensinar / precoPrazo / gravarOrcamento).
- `seed-browser.js` — recarga do catálogo (rodar no console do navegador com as regras em modo teste, ou adaptar para firebase-admin).
- `firestore.rules`, `firestore.indexes.json`, `firebase.json` — para `firebase deploy --only firestore`.
