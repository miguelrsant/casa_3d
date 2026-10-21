// Todos os textos do site. Os marcados com "PLACEHOLDER" esperam a versão final da marca.

export const copy = {
  meta: {
    title: 'Casa Brisa — miguelrsant',
    description:
      'Uma planta baixa que vira casa 3D conforme você rola a página. Casa Brisa, um projeto miguelrsant.',
  },

  hero: {
    kicker: ['MIGUELRSANT', 'CASA BRISA, LITORAL DA BAHIA', '2026'], // PLACEHOLDER: local
    titleLines: ['TODA CASA', 'COMEÇA COMO', 'UMA '] as string[],
    titleAccent: 'PLANTA.',
    body: 'Uma casa térrea de 605 m² entre palmeiras, com a piscina no centro de tudo. Role a página e entre no desenho.', // PLACEHOLDER
    titleBlock: [
      { label: 'PROJETO', value: 'CASA BRISA' },
      { label: 'DESENHO', value: 'PLANTA TÉRREA' },
      { label: 'ESCALA', value: '1 : 200' },
      { label: 'FOLHA', value: 'A-101 REV 0' },
    ],
    legendTitle: 'PLANTA BAIXA — TÉRREO',
    legendSub: ['CASA BRISA', 'LITORAL DA BAHIA', '605 m²', '1:200'], // PLACEHOLDER: local
    scaleBarLabels: ['0', '1', '5', '10 m'],
  },

  header: {
    cta: 'INICIAR UM PROJETO',
    logoAria: 'miguelrsant (abre em nova aba)',
  },

  hints: {
    enter: 'ROLE PARA ENTRAR',
    marker: 'CLIQUE NO MARCADOR PARA ABRIR A FICHA',
    next: 'ROLE PARA O PRÓXIMO AMBIENTE',
    aerial: 'ROLE PARA VOLTAR À PLANTA',
    end: 'FIM DO PERCURSO',
  },

  hud: {
    counterLabel: 'AMBIENTES',
    openFile: 'ABRIR FICHA +',
    stopKicker: 'AMBIENTE',
  },

  file: {
    title: 'FICHA TÉCNICA',
    area: 'ÁREA',
    size: 'MEDIDAS',
    ceiling: 'PÉ-DIREITO',
    finishes: 'ACABAMENTOS',
    close: 'FECHAR',
  },

  loader: {
    label: 'DESENHANDO A PLANTA',
  },

  cta: {
    kicker: 'MIGUELRSANT · ARQUITETURA E INTERIORES', // PLACEHOLDER
    title: ['TODA CASA', 'COMEÇA COMO', 'UMA PLANTA.'],
    body: 'A sua também. Vamos desenhar juntos?', // PLACEHOLDER
    button: 'INICIAR UM PROJETO',
  },

  noWebgl:
    'Seu navegador não suporta WebGL, então mostramos a planta estática. Para o passeio em 3D, use um navegador atualizado.',
  contextLost:
    'A placa de vídeo interrompeu o 3D, então mostramos a planta estática. Para o passeio completo, tente outro navegador ou dispositivo.',
  retry3d: 'Tentar o 3D de novo',
} as const;

export type Copy = typeof copy;
