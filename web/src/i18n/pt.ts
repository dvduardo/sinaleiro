// Dicionário PT — fonte de verdade das strings da UI (extraídas verbatim
// do código anterior à internacionalização). O tipo Messages, derivado
// daqui, obriga en.ts a ter as mesmas chaves e assinaturas.
export const pt = {
  "app.title": "Sinaleiro — sinais ferroviários para Satisfactory",
  "loading.screenAria": "Analisando o save",

  // landing.ts
  "landing.brand": "Sinaleiro",
  "landing.brandTag": "planejador de sinais ferroviários · não oficial",
  "landing.h1": "Seu save entra. Um plano de sinalização sai.",
  "landing.lead": "Lemos a malha ferroviária do seu mundo, encontramos cada junção e dizemos exatamente onde colocar Sinais de Trajeto e de Trecho — com coordenadas e motivo.",
  "landing.dropAria": "Anexar arquivo de save",
  "landing.dropTitle": "Arraste seu arquivo .sav aqui",
  "landing.dropHint": "ou clique para procurar · encontramos ele em %LocalAppData%/FactoryGame",
  "landing.dropHintFile": (mb: string) => `${mb} MB · clique para trocar de arquivo`,
  "landing.modeAria": "Modo dos trilhos",
  "landing.mode.mixed": "⇆ Misto (automático)",
  "landing.mode.bidirectional": "⇄ Bidirecionais",
  "landing.mode.oneway": "→ Mão única",
  "landing.modeNote.mixed": "// detectamos trilho a trilho: mão única ganha um sinal por poste, trechos bidirecionais o par completo",
  "landing.modeNote.bidirectional": "// cada aproximação de junção recebe o par Trajeto + Trecho",
  "landing.modeNote.oneway": "// entradas recebem Trajeto, saídas só Trecho — a mão é inferida do seu layout",
  "landing.cta": "Analisar malha ▸",
  "landing.demoLink": "sem um save à mão? veja uma malha de demonstração ▸",
  "landing.privacyLabel": "Privacidade:",
  "landing.privacyText": "a análise roda inteira no seu navegador — o save nunca sai da sua máquina.",
  "landing.footer": 'Projeto de fã, sem afiliação com a Coffee Stain Studios. Mapa © Satisfactory.<br>Código aberto a contribuições — <a href="https://github.com/dvduardo/sinaleiro" target="_blank" rel="noopener">github.com/dvduardo/sinaleiro</a>.',
  "landing.invalidFile": (name: string) => `"${name}" não é um arquivo .sav.`,
  "landing.error.invalid-save.title": "Não conseguimos ler esse arquivo.",
  "landing.error.invalid-save.hint": "Confira se é um save do Satisfactory (.sav) — normalmente em %LocalAppData%/FactoryGame/Saved/SaveGames.",
  "landing.error.no-rails.title": "O save foi lido, mas não tem trilhos de trem.",
  "landing.error.no-rails.hint": "Construa uma ferrovia no seu mundo e salve de novo — aí sim temos o que sinalizar.",
  "landing.error.pyodide-load.title": "Falha ao carregar o motor de análise.",
  "landing.error.pyodide-load.hint": "Verifique sua conexão e recarregue a página — o download só acontece uma vez.",
  "landing.error.internal.title": "Algo deu errado durante a análise.",
  "landing.error.internal.hint": "Tente de novo; se persistir, pode ser um save muito grande para este dispositivo — tente no desktop.",

  // loading.ts
  "loading.banner": "FICSIT OS v2.7 — módulo ferroviário",
  "loading.received": (name: string, mb: string) => `save recebido: <b>${name}</b> (${mb} MB)`,
  "loading.progress": "Progresso",
  "loading.stage.pyodide": "carregando módulo ferroviário FICSIT…",
  "loading.stage.bundle": "montando pipeline de análise…",
  "loading.stage.read": "lendo o arquivo do save…",
  "loading.stage.parse": "descompactando e reconstruindo a malha ferroviária…",
  "loading.stage.graph": "montando grafo de trilhos e junções…",
  "loading.stage.directions": "inferindo a mão das vias pelo traçado…",
  "loading.stage.signals": "posicionando sinais em cada junção…",
  "loading.stage.serialize": "preparando o mapa interativo…",

  // results.ts
  "results.demoName": "malha de demonstração",
  "results.modeAria": "Modo dos trilhos",
  "results.mode.mixed": "⇆ Misto",
  "results.mode.bidirectional": "⇄ Bidirecional",
  "results.mode.oneway": "→ Mão única",
  "results.export": "⭳ Checklist .txt",
  "results.new": "Novo save",
  "results.legend.junction": "Junção — clique no pino para abrir a lupa",
  "results.legend.path": "Sinal existente (Trajeto)",
  "results.legend.block": "Sinal existente (Trecho)",
  "results.legend.station": "Estação",
  "results.legend.bidirectional": "Trilho bidirecional (tracejado = presumido)",
  "results.legend.stub": "Linha inacabada",
  "results.reanalyzing": "recalculando sinais…",
  "results.sidebarAria": "Plano de instalação",
  "results.stat.signals": "sinais",
  "results.stat.junctions": "junções",
  "results.stat.stations": "estações",
  "results.stat.oneway": "mão única",
  "results.stat.bidirectional": "bidirecionais",
  "results.stat.assumed": "presumidos",
  "results.stat.stubs": "inacabados",
  "results.stat.suspectJunctions": "junções suspeitas",
  "results.stat.inferredHand": "mão inferida",
  "results.stat.ambiguous": "ambíguos",

  // sidebar.ts
  "sidebar.title": "Plano de instalação",
  "sidebar.count": (n: number) => `de ${n} sinais instalados`,
  "sidebar.junction": (label: string, warn: boolean) => `Junção ${label}${warn ? " ⚠" : ""}`,
  "sidebar.nearStation": (name: string) => `perto de "${name}"`,
  "sidebar.noStation": "sem estação próxima",
  "sidebar.lupa": "Lupa",
  "sidebar.checkAria": "Marcar como colocado",
  "sidebar.type.path": "Trajeto",
  "sidebar.type.block": "Trecho",
  "sidebar.facing.entry": "virado para a junção",
  "sidebar.facing.exit": "virado para fora",
  "sidebar.bidirectionalSuffix": " (trecho bidirecional)",

  // lens.ts
  "lens.aria": "Lupa de junção",
  "lens.flag.oneway": "mão única",
  "lens.flag.stub": "braço inacabado",
  "lens.flag.crossing": "⚠ cruzamento",
  "lens.title": (label: string, n: number, flags: string) =>
    `Junção ${label} · ${n} ${n === 1 ? "sinal" : "sinais"}${flags ? " · " + flags : ""}`,
  "lens.near": (m: number, name: string) => `${m} m de "${name}"`,
  "lens.noStation": "sem estação próxima",
  "lens.copy": "copiar X Y",
  "lens.copied": "copiado ✓",
  "lens.closeAria": "Fechar painel",
  "lens.approachLabel": (dir: string) => dir,
  "lens.dim": (m: string) => `≈ ${m} m`,
  "lens.legend.path": "Trajeto (verde) — a seta é o sentido do trem que vai ler o sinal: aponta PARA a junção",
  "lens.legend.block.oneway": "Trecho (âmbar) nas saídas, apontando no sentido de saída",
  "lens.legend.block.mixed": "Trecho (âmbar) — nas saídas de mão única e no par dos braços bidirecionais, apontando PARA FORA",
  "lens.legend.block.bidirectional": "Trecho (âmbar) — mesmo poste, lado oposto do trilho, apontando PARA FORA",
  "lens.step.where": (near: string) => `<b>Onde:</b> vá até a coordenada acima${near}.`,
  "lens.step.whereNear": (m: number, name: string) => ` — ${m} m da estação "${name}"`,
  "lens.step.distance": (setback: string) => `<b>Distância:</b> em cada trilho que chega, pare ≈${setback} m antes do ponto de encontro.`,
  "lens.step.onlyPath": "<b>Só Trajeto:</b> o cruzamento inteiro é um bloco único — nenhum sinal dentro dele; cada entrada recebe um Trajeto virado para o X.",
  "lens.step.oneway": "<b>Um sinal por poste:</b> siga as setas — a entrada recebe só o Trajeto (virado para a junção) e cada saída só o Trecho (virado para fora).",
  "lens.step.mixed": "<b>Por braço:</b> braço de mão única recebe um sinal só (siga a seta); braço bidirecional recebe o par Trajeto + Trecho no mesmo poste, um para cada lado.",
  "lens.step.bidirectional": "<b>Lado e sentido:</b> olhando para a junção, o <b>Trajeto</b> fica do seu lado direito, virado para ela. O <b>Trecho</b> vai no mesmo poste, do outro lado do trilho, virado para fora.",
  "lens.note.crossing": "⚠ Junções de 4+ aproximações são o principal ponto de deadlock — confira se nenhum trem consegue parar em cima do cruzamento.",
  "lens.note.ambiguous": "A mão de um dos trilhos não pôde ser inferida — ele volta ao par completo Trajeto + Trecho e o trilho aparece tracejado no mapa. Confira o traçado.",
  "lens.note.assumed": "Um dos braços não tem evidência de mão e foi tratado como bidirecional (tracejado no esquema e no mapa) — o par completo é seguro em qualquer caso.",
  "lens.note.stub": (n: number) => n === 1
    ? "Um braço desta junção é uma linha inacabada (cinza no mapa) e não recebeu recomendação — conecte a linha e reanalise."
    : `${n} braços desta junção são linhas inacabadas (cinza no mapa) e não receberam recomendação — conecte a linha e reanalise.`,
  "lens.note.rightHand": "Regra que o site já resolve por você: no jogo, um sinal só vale para o trem que passa por ele à direita — por isso cada lado do trilho tem o seu.",

  // mapView.ts
  "map.stationTitle": (name: string) => name,
  "map.existingSignal.path": "Sinal existente (Trajeto)",
  "map.existingSignal.block": "Sinal existente (Trecho)",

  // compass (identidade em PT)
  "compass": {
    norte: "norte", nordeste: "nordeste", leste: "leste", sudeste: "sudeste",
    sul: "sul", sudoeste: "sudoeste", oeste: "oeste", noroeste: "noroeste",
  } as Record<string, string>,

  // export.ts
  "export.filename.mixed": "sinais_recomendados_misto.txt",
  "export.filename.oneway": "sinais_recomendados_mao_unica.txt",
  "export.filename.bidirectional": "sinais_recomendados.txt",

  // report.ts (checklist .txt)
  "report.mode.mixed": "misto (mão única e bidirecional detectados por trilho)",
  "report.mode.oneway": "mão única (mão direita)",
  "report.mode.bidirectional": "bidirecional",
  "report.header.modeLine": (modeTxt: string) => `Modo: ${modeTxt}`,
  "report.header.counts": (total: number, path: number, block: number) =>
    `${total} sinais recomendados — ${path} Sinal de Trajeto (Path), ${block} Sinal de Trecho (Block)`,
  "report.header.tracksMixed": (oneway: number, biConfirmed: number, biAssumed: number, stub: number) =>
    `Trilhos: ${oneway} mão única · ${biConfirmed} bidirecionais confirmados · ${biAssumed} bidirecionais presumidos · ${stub} inacabados`,
  "report.header.directions": (known: number, total: number) =>
    `Direções: ${known}/${total} trilhos inferidos; ${total - known} ambíguos`,
  "report.station": (m: number, name: string) => `${m}m de '${name}'`,
  "report.noStation": "sem estação próxima cadastrada",
  "report.line": (i: number, namePt: string, type: string, junction: string, role: string, x: number, y: number, z: number, station: string) =>
    `${String(i).padStart(3, " ")}. [${namePt} (${type}) · ${junction} · ${role}] X=${x} Y=${y} Z=${z}  (${station})`,
  "report.reason": (m: string) => `     motivo: ${m}`,
  "report.reason.entry": (dir: string, label: string, degree: number) =>
    `Entrada ${dir} da junção ${label} (${degree} trilhos se encontram). Coloque virado PARA a junção.`,
  "report.reason.exit": (dir: string, label: string) =>
    `Saída ${dir} da junção ${label} — fecha o bloco da junção e o libera assim que o trem sai. Coloque no mesmo ponto, virado PARA FORA da junção.`,
  "report.reason.ambiguousSuffix": " ATENÇÃO: direção deste trilho não pôde ser inferida — tratado como bidirecional; confira o traçado.",
  "report.reason.biConfirmedSuffix": " Trecho bidirecional (via única obrigatória): recebe o par completo de sinais.",
  "report.reason.biAssumedSuffix": " Trecho sem evidência de mão — tratado como bidirecional; o par completo é a opção segura.",
  "report.assumedHeader": "TRECHOS BIDIRECIONAIS PRESUMIDOS (sem evidência de mão — par completo aplicado):",
  "report.assumedLine": (track: string, where: string) => `  - track ${track} (${where})`,
  "report.ambiguousHeader": "TRECHOS AMBÍGUOS (direção não inferida — tratados como bidirecionais):",
  "report.ambiguousJunctionLine": (label: string, dir: string, track: string) =>
    `  - ${label}, aproximação ${dir} (track ${track}): 2 sinais emitidos; confira o traçado`,
  "report.ambiguousOtherLine": (track: string, where: string) => `  - track ${track} (fora de junção, ${where})`,
  "report.approxStation": (m: number, name: string) => `~${m}m de '${name}'`,

  "role.entry": "entrada",
  "role.exit": "saída",
  "signal.path": "Sinal de Trajeto",
  "signal.block": "Sinal de Trecho",
};

export type Messages = typeof pt;
