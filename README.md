# Casa Brisa · miguelrsant

Site de uma página em que a **planta baixa vira casa 3D conforme o scroll**. A câmera entra pela porta pivotante e percorre 7 ambientes. Cada ambiente passa de desenho a traço para render realista, em blocos com contorno laranja. No fim, uma folha de papel desenrola e devolve a planta.

Tudo é gerado por código: arquitetura, móveis, vegetação, texturas e céu. Não há modelos 3D nem imagens de terceiros.

## Rodar

```bash
npm install
npm run dev        # http://localhost:5173
```

| Comando | O que faz |
|---|---|
| `npm run dev` | servidor de desenvolvimento (com painel de debug no topo da tela) |
| `npm run build` | checagem de tipos + build de produção em `dist/` |
| `npm run preview` | serve o build de produção (http://localhost:4173) |
| `npm test` | testes da planta e da linha do tempo (vitest) |
| `npm run e2e` | testes no Chrome: logo/link, console sem erros, callout e ficha técnica |

## Onde mexer

| Arquivo | Conteúdo |
|---|---|
| `src/content/brand.ts` | nome, logo, link do logo e do botão "Iniciar um projeto" |
| `src/content/copy.pt-BR.ts` | **todos os textos** do site (os marcados `PLACEHOLDER` esperam a versão final) |
| `src/data/house.ts` | a planta: eixos, ambientes (retângulos em metros), aberturas, áreas externas |
| `src/story/stops.ts` | o percurso: câmera, quando cada ambiente revela, textos das fichas, horário do sol |
| `src/gen/furniture.ts` | móveis (posição de cada peça por ambiente) |
| `src/gen/vegetation.ts` | espécies e plano de plantio |
| `public/brand/` | ícone da marca (também usado como favicon) |

As paredes são derivadas automaticamente das bordas dos ambientes. Para mudar a casa, edite os retângulos em `house.ts` e rode `npm test`: o validador confere sobreposições, áreas, se as aberturas cabem nas paredes e se a câmera só atravessa paredes pelos vãos.

## Parâmetros de URL (úteis para testar)

- `?t=0.42`: abre num ponto do percurso (0 = início, 1 = fim).
- `?q=high|medium|low`: força o nível de qualidade (e desliga o ajuste automático). Sem ele, o nível é detectado automaticamente.
- `?tm=aces|agx|neutral`: tone mapping (padrão: ACES).
- `?pp=0`, `?ao=0`, `?bloom=0`, `?smaa=0`, `?hf=0`: desligam partes do pós-processamento (diagnóstico). `?sh=0` desliga as sombras.

## Como funciona (resumo)

- **Scroll → `t` → cena.** O scroll (Lenis) vira um número `t` de 0 a 1, e `stateAt(t)` calcula câmera, revelação de cada ambiente, sol e céu. Voltar o scroll reproduz exatamente os mesmos quadros.
- **Um material, dois mundos.** Todos os materiais compartilham um trecho de shader (`src/render/shaders/reveal.glsl.ts`) que decide, pixel a pixel, se aquele ponto ainda é "desenho" (papel) ou já é "render" (PBR), com a borda laranja nos blocos recém-revelados.
- **Traço de nanquim.** Um pré-passe grava ID da peça, normal e profundidade. O efeito de composição (`CompositeEffect`) desenha as linhas só onde ainda é desenho.
- **Luz que conta a história.** O sol vai do fim de tarde à hora azul ao longo do percurso. Piscina, cascata, fogo e luzes da casa acendem no final.

## Desempenho

- **Nível de qualidade** (`src/render/quality.ts`): escolhido pelo nome da GPU (Intel HD/UHD, GeForce antigas, celulares → baixo; Iris Xe, Radeon integrada, GTX 7xx–9xx → médio). Se a GPU for desconhecida, decide pelo número de núcleos do processador. A tabela `QUALITY` define, por nível, a resolução das texturas e da sombra, a densidade das folhas, a mata distante, o AO, o SMAA, o número de luzes e o orçamento de pixels.
- **Ajuste automático:** durante toda a visita o site mede o tempo de quadro. Abaixo de ~26 fps ele reduz a qualidade em degraus: desliga o AO, reduz a sombra à metade e depois baixa a resolução (85% → 72% → 60%).
- **Vegetação com LOD:** as plantas são agrupadas por região. Os lotes fora da câmera ou da sombra são descartados, e os que estão a mais de ~38 m usam uma versão com menos folhas (maiores).
- **Carregamento:** as texturas são geradas uma por quadro, e todos os shaders do percurso são compilados antes de o site abrir (sem travadas no meio do scroll).

## Publicar (Vercel)

É um site estático: `npm run build` gera `dist/`. Na Vercel, importe o repositório com o preset **Vite** (build `npm run build`, saída `dist`).

## Limitações conhecidas

- **GPUs antigas com driver nouveau** (por exemplo, GeForce GTX 550 Ti no Linux): o driver trava a GPU de forma intermitente e roda a ~10 fps, mesmo sem pós-processamento. Nos testes, a queda veio da pressão de memória e de banda: a 1280×760 caía ~70% das vezes, e com ~0,6 Mpx renderizados não caiu nenhuma vez. Por isso, no nouveau o site usa um orçamento de pixels menor (a imagem é ampliada na tela). Se o contexto cair mesmo assim, a página recarrega sozinha até 2 vezes, voltando ao mesmo ponto do percurso. Depois disso, mostra a planta estática com o botão "Tentar o 3D de novo". Testes repetidos de queda podem travar o driver no kernel; aí só reiniciando o PC. O site detecta isso, começa no nível de qualidade baixo e, se o contexto WebGL cair, mostra a planta estática (`public/fallback/planta.png`). Para regenerar essa imagem: `node tests/e2e/fallback.mjs` com o `npm run dev` rodando.
- O bundle JS tem ~430 KB gzip (three.js + pós-processamento + texto 3D).
