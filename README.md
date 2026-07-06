# Sinaleiro

Analisa o save do seu mundo de **Satisfactory** e recomenda onde colocar sinais ferroviários — qual trilho, que lado, virado para onde — sobre o mapa real do jogo.

- **Sinal de Trajeto** (Path) nas entradas de cada junção, virado para a junção.
- **Sinal de Trecho** (Block) nas saídas, virado para fora — libera o bloco assim que o trem sai.
- Modo **bidirecional** (par entrada+saída por aproximação) ou **mão única** (a direção de cada trilho é inferida do traçado).

## Privacidade

O site roda o analisador **inteiro no seu navegador** (Python via [Pyodide](https://pyodide.org/), em WebAssembly). **Seu save nunca sai da sua máquina** — não há upload, não há servidor.

## Uso via linha de comando

O pipeline também funciona como ferramenta local (Python 3.11+, sem dependências externas):

```sh
python3 src/report.py /caminho/para/Save.sav out --mao-unica   # ou --bidirecional
# gera out/mapa_sinais.html (mapa interativo) e out/sinais_recomendados.txt (checklist)

python3 src/web_api.py /caminho/para/Save.sav --mao-unica       # payload JSON do site
```

## Desenvolvimento do site

```sh
cd web
npm install
npm run dev     # empacota src/*.py + vendor/ para o Pyodide, prepara o mapa e sobe o Vite
npm run build   # build de produção em web/dist
npm run smoke   # teste de paridade: pipeline no Pyodide (Node) vs CPython
```

## Arquitetura

```
save .sav ─▶ src/parse_save.py ─▶ src/graph.py ─▶ src/directions.py (mão única)
                                       │
                                       ▼
                              src/signal_rules.py ─▶ recomendações
                                       │
                    ┌──────────────────┴──────────────────┐
                    ▼                                     ▼
             src/report.py (CLI:                   src/web_api.py (JSON
             HTML + checklist)                     para o site / Pyodide)
```

- `src/` é a **fonte única** do algoritmo: o site empacota esses mesmos arquivos (mais `vendor/sat_sav_parse`, o parser de saves) num zip carregado pelo Pyodide dentro de um Web Worker.
- `web/` é o frontend (Vite + TypeScript vanilla, sem framework), publicado no GitHub Pages.
- O parser binário de saves é o [sat_sav_parse](vendor/sat_sav_parse/) (vendorizado; veja a licença própria em `vendor/sat_sav_parse/LICENSE`).
- `assets/map_1.0.jpg` é o mapa do jogo usado como camada base; a calibração mundo→mapa vive em `src/report.py` e `web/src/map/calibration.ts`.
