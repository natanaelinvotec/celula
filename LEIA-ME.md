# Base de exames — Pedidos por IA (Célula Diagnósticos)

Gerado em 23/09/2026 a partir de `tabelas.pdf` (AutoLAC) e dos 5 guias "Busca de Exames – DB Diagnósticos".

- `base_exames.json` — catálogo unificado: mnemônico, nome, código TUSS, preços por convênio (`precos`), setor DB (cor), prazo (dias úteis, já com +2), material, método.
- `tabelas.json` — tabelas de preço brutas por convênio (91 tabelas).
- `db_guia.json` — 4015 exames do guia DB com setor, prazo original (`prazo_db`) e prazo Célula (`prazo`).
- `particular_min.json` — subconjunto usado no mockup (tabela PARTICULAR).

Cores dos setores (extraídas dos PDFs DB): Análises Clínicas #278d8c · Toxicológico #935b0c · Genômica #563085 · Patologia #8b2e3f · Molecular #252d46 · Próprio (Célula) #2563eb.

Regras: prazo Célula = prazo DB + 2 dias úteis; exames sem sufixo -DB/-HP são considerados próprios (prazo 1 dia). Casamento de prazos por mnemônico (removendo -DB) e, quando não encontrado, por similaridade de nome (campo `match: "nome"`, conferir).
