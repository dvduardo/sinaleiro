# Sinaleiro

**No ar em https://dvduardo.github.io/sinaleiro/** · projeto aberto — [contribuições são bem-vindas](#contribuindo).

Analisa o save do seu mundo de **Satisfactory** e recomenda onde colocar sinais ferroviários — qual trilho, que lado, virado para onde — sobre o mapa real do jogo.

- **Sinal de Trajeto** (Path) nas entradas de cada junção, virado para a junção.
- **Sinal de Trecho** (Block) nas saídas, virado para fora — libera o bloco assim que o trem sai.
- Modo **misto** (padrão): cada trilho é classificado automaticamente como mão única ou bidirecional — via dupla ganha um sinal por poste, via simples ganha o par completo, e pontas soltas em construção ficam de fora. Os modos manuais **bidirecional** e **mão única** continuam disponíveis.

No modo misto a classificação combina quatro evidências: trilhos-ponte do grafo não podem ser mão única (o trem não teria volta); pares paralelos seguem a regra da mão direita; a orientação da estação no save dá o sentido de atracação; e a geometria da agulha resolve desvios pendurados entre duas junções (um trem não faz curva fechada numa junção). Sem evidência nenhuma, o trecho é tratado como bidirecional — o par completo de sinais é sempre seguro.

## Privacidade

O site roda o analisador **inteiro no seu navegador** (Python via [Pyodide](https://pyodide.org/), em WebAssembly). **Seu save nunca sai da sua máquina** — não há upload, não há servidor.

## Uso via linha de comando

O pipeline também funciona como ferramenta local (Python 3.11+, sem dependências externas):

```sh
python3 src/report.py /caminho/para/Save.sav out --misto   # ou --mao-unica / --bidirecional
# gera out/mapa_sinais.html (mapa interativo) e out/sinais_recomendados.txt (checklist)

python3 src/web_api.py /caminho/para/Save.sav --misto       # payload JSON do site
python3 src/classify.py /caminho/para/Save.sav              # só a classificação por trilho
```

## Rodando localmente

Pré-requisitos: [Node.js](https://nodejs.org/) 22+ (site) e Python 3.11+ (CLI e teste de paridade — sem nenhuma dependência pip).

```sh
git clone https://github.com/dvduardo/sinaleiro.git
cd sinaleiro/web
npm install
npm run dev     # abre em http://localhost:5173
```

O `npm run dev` já faz tudo: empacota `src/*.py` + `vendor/` para o Pyodide, prepara o mapa e sobe o Vite. Para testar, use um save seu (`%LocalAppData%/FactoryGame/Saved/SaveGames` no Windows) ou o botão "veja uma malha de demonstração" na landing — não precisa ter o jogo.

Outros comandos úteis:

```sh
npm run build   # build de produção em web/dist (tsc + vite)
npm run smoke   # teste de paridade: pipeline no Pyodide (Node) vs CPython
npm run demo    # regenera os payloads do modo demonstração (web/public/demo/)
```

Os payloads da demonstração ("veja uma malha de demonstração" na landing) são
**commitados** — o CI não tem saves. Rode `npm run demo` e commite quando o
`PAYLOAD_VERSION` de `src/web_api.py` mudar ou para trocar o save de exemplo
(`npm run demo -- /caminho/para/Save.sav`).

## Arquitetura

```
save .sav ─▶ src/parse_save.py ─▶ src/graph.py ─▶ src/directions.py (mão única)
                                       │          src/classify.py   (misto)
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

## Ideias futuras (contribuições bem-vindas)

- **Facing dos sinais existentes**: ler a rotação dos sinais que o jogador já colocou — sinal só num sentido = mão única naquele sentido; nos dois = bidirecional confirmado pelo próprio jogador. Também consertaria a limitação atual de "sinal do mesmo tipo virado para o lado errado conta como já existente".
- **Balloon loops**: detectar laços de retorno pendurados por um único nó (laço mão única + haste bidirecional).
- Aplicar a geometria da agulha também no modo mão única puro (hoje ela é exclusiva do misto para manter o modo antigo intacto).

## Contribuindo

Teve uma ideia boa ou achou um bug? **Contribuições são bem-vindas** — abra uma [issue](https://github.com/dvduardo/sinaleiro/issues) para discutir ou mande direto uma [pull request](https://github.com/dvduardo/sinaleiro/pulls) (a `main` é protegida; toda mudança entra por PR).

Para uma PR tranquila:

1. Faça o fork e rode o projeto localmente (seção acima).
2. `cd web && npm run build` precisa passar — é o mesmo check que o CI roda na sua PR.
3. Se mexer no pipeline Python (`src/`), rode também `npm run smoke` com um save seu: ele garante que o resultado no navegador (Pyodide) continua idêntico ao do CPython.
4. Conte na descrição o que muda para o jogador — de preferência com um print do mapa.
