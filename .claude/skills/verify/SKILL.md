---
name: verify
description: Verifica o site Sinaleiro de ponta a ponta - sobe o Vite, dirige o fluxo landing/loading/results/lupa no Chrome via Playwright e compara o pipeline Pyodide com o CPython.
---

# Verificação do Sinaleiro

## Pipeline Python (paridade CPython × Pyodide)

```sh
cd web && npm run smoke   # precisa de saves/Progresso_autosave_2.sav (pula se ausente)
```

Esperado: paridade byte-idêntica nos dois modos; 84 recomendações (bidirecional) / 49 (mão única) no save de exemplo. Parse ~3 s no Pyodide.

O CLI usa `.venv/bin/python3` (o python3 do sistema é antigo demais para `str | None`).

## UI no browser

```sh
cd web && npm run dev -- --port 5199 --strictPort   # em background
```

Driver Playwright: usar `chromium.launch({ channel: "chrome" })` — o cache de browsers do Playwright costuma estar dessincronizado da versão npm; o Chrome do sistema sempre funciona. `setInputFiles("#fileInput", <save>)` anexa o save (o input é o `#fileInput` escondido da landing).

O site tem seletor de idioma PT/EN (`localStorage["sinaleiro-lang"]`, default auto-detectado de `navigator.language`). O browser do Playwright normalmente reporta locale en-US, o que ativaria EN e quebraria asserts de texto em PT — sempre fixar o idioma antes de navegar: `await context.addInitScript(() => localStorage.setItem("sinaleiro-lang", "pt"))` (ou usar `browser.newContext({ locale: "pt-BR" })`, que também funciona pois é o que o auto-detect lê). Botões do toggle: `.langtoggle button[data-lang=pt|en]` — como landing e results montam o toggle cada um o seu, prefira escopar (`#scr-landing .langtoggle ...` / `#scr-results .langtoggle ...`) e usar `{ force: true }` no click, já que o `.mode`/`.core` do layout intercepta cliques em elementos de telas não visíveis no DOM.

Fluxo que cobre tudo: anexar save → modo mão única → "Analisar malha" → esperar `.results.on` (até 120 s na primeira vez; o Pyodide vem de CDN) → conferir chip "49 sinais" → clicar `.jpin[data-j="J1"]` (abre `.jpanel.on`) → checkbox da sidebar (persiste em localStorage) → alternar para bidirecional via `.rmode` (reanalyze sem re-parse, chip vira "84") → botão Lupa da sidebar → export `.txt` (waitForEvent("download")).

Probes que valem repetir: arquivo de lixo com extensão .sav (deve cair na landing com card "Não conseguimos ler"); arquivo de extensão errada (aviso imediato, sem análise).

## Pegadinhas conhecidas

- `unpackArchive` do Pyodide precisa de ArrayBuffer exato — Buffer do Node é view no pool (`buf.buffer.slice(byteOffset, byteOffset+byteLength)`).
- O worker resolve `py/bundle.zip` via `import.meta.env.BASE_URL` — não derivar do `self.location` (quebra no dev).
- `fit()` do mapa não funciona com a tela `display:none`; a tela precisa estar visível (há retry via rAF).
- Não capturar ponteiro no `pointerdown` do viewport — mata o clique dos pinos (captura só após ~4 px de arrasto).
