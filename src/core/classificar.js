/*
 * Escolhe o "Serviço" a partir da descrição da requisição.
 *
 * Duas camadas, na ordem:
 *   1. regras de palavra-chave (previsíveis, editáveis pelo usuário);
 *   2. semelhança por palavras, com radical simples de português (rede de segurança).
 *
 * O resultado sempre vem com a origem e as alternativas, para o usuário poder
 * conferir e corrigir a regra em vez de ficar no escuro.
 */
(function (NV) {
  'use strict';

  const text = NV.text;
  const classificar = {};

  /* Lista observada na produção (ishaoc) em 28/08/2026. Serve de referência para
     testar regras; em execução vale sempre a lista lida da tela. */
  classificar.SERVICOS_CONHECIDOS = [
    'ABASTECER IMPRESSORAS DE TINTA',
    'ABERTURA DE CHAMADO EXTERNO',
    'ADEQUAÇÃO DE CABOS',
    'ADEQUAÇÃO DE PROJETO',
    'ANALISE DE SISTEMA',
    'ATALHO',
    'BLOQUEIO DE E-MAIL',
    'CANCELAMENTO DE ATENDIMENTO',
    'CHECAGEM E VALIDAÇÃO DE EQUIPAMENTOS',
    'CONFIGURAÇÃO DE ACESSO AO SENIOR',
    'CONFIGURAÇÃO DE ACESSO AO SISTEMA FLEURY',
    'CONFIGURAÇÃO DE ACESSO AO SLACK',
    'CONFIGURAÇÃO DE EMAIL',
    'CONFIGURAÇÃO DE EQUIPAMENTOS',
    'CONFIGURAÇÃO DE GRUPOS PARA ACESSOS DE PASTAS FILESERVER',
    'CONFIGURAÇÃO DE IMPRESSORA',
    'CONFIGURAÇÃO DE IMPRESSORA DE SENHA / ETIQUETAS',
    'CONFIGURAÇÃO DE PERFIL - MV',
    'CONFIGURAÇÃO DE PERFIL NO WINDOWS',
    'CONFIGURAÇÃO DE RIS/PACS FIDI',
    'CONFIGURAÇÃO DE SOFTWARE',
    'CONFIGURAÇÃO DE USUÁRIO NA INTRANET',
    'CONFIGURAÇÃO DE USUARIO PARA ACESSO A PASTAS DO FILE SERVER',
    'CONFIGURAÇÕES INTRANET',
    'CONFIGURAÇÕES MV',
    'CONFIGURAR PAINEL DE SENHA',
    'CONFIGURAR SPARK',
    'CRIAÇÃO DE AGENDA - MV',
    'CRIAÇÃO DE E-MAIL',
    'CRIAÇÃO DE PONTO DE REDE',
    'CRIAÇÃO DE USUARIO (SAU)',
    'CRIAÇÃO DE USUÁRIO ACTIO',
    'CRIAÇÃO DE USUÁRIO FILESERVER',
    'CRIAÇÃO DE USUÁRIO INTRANET',
    'CRIAÇÃO DE USUÁRIO NEOVERO',
    'CUTTER TRAVADO - RELÓGIO',
    'DESENVOLVIMENTO DE RELATÓRIOS PERSONALIZADOS MV',
    'DESENVOLVIMENTO DE TELAS MVPEP',
    'DUVIDA',
    'ENSINAR COMO UTILIZAR MÓDULO MV SOUL/PEP/PORTARIA/CLASSIFICAÇÃO DE RISCO',
    'EQUIPAMENTO SEM ACESSO A REDE/INTERNET',
    'ERRO DE IMPRESSÃO',
    'ERRO DE PROCESSO',
    'ESTUDO/LEVANTAMENTO PARA PROJETO',
    'EXECUÇÃO DE PROJETO',
    'INSTALAÇÃO DE EQUIPAMENTO',
    'INSTALAÇÃO DE SOFTWARE OU APP',
    'INSTALAR/CONFIGURAR RIS-PACS',
    'LIBERAÇÃO DE ACESSO TASY/SENIOR',
    'LIBERAÇÃO DE JAVA',
    'LIBERAÇÃO DE PASTA DE SERVIDOR DE ARQUIVOS',
    'LIBERAÇÃO DE SOFTWARE',
    'LIGAR EQUIPAMENTO',
    'LIMPEZA CABEÇA DE IMPRESSÃO',
    'MANUTENÇÃO DE EQUIPAMENTO',
    'MIGRAÇÃO DE ARQUIVOS',
    'MUDANÇA DE EQUIPAMENTO',
    'REBOOT EM RAMAL CISCO',
    'RECUPERAÇÃO DE ARQUIVO CORROMPIDO',
    'REPARO DE PONTO DE REDE',
    'RESET DE REDE IMPRESSORA',
    'RESET DE SENHA (SAU)',
    'RESET DE SENHA ACTIO',
    'RESET DE SENHA CALLCENTER',
    'RESET DE SENHA DE E-MAIL',
    'RESET DE SENHA NEOVERO',
    'RESET DE SENHA SENIOR',
    'SEGUNDA VIA DE LAUDO - WTT',
    'SERVIÇO TRAVADO',
    'SUBSTITUIÇÃO DE TONNER/CILINDRO',
    'SUPORTE PARA ARQUIVOS DE TEXTO E PLANILHAS',
    'TROCA DE BOBINA DO RELOGIO DE PONTO',
    'TROCA DE EQUIPAMENTO',
    'TROCA DE PERIFERICOS',
    'VERIFICAÇÃO DE EQUIPAMENTO'
  ];

  /*
   * Regras iniciais. São um chute informado a partir dos nomes dos serviços —
   * a ideia é você corrigir em ⚙ → Classificação conforme for usando.
   * Ordem não importa: vence a palavra-chave mais longa que casar. `peso` ajusta essa
   * disputa: +1 para regras específicas ("mouse") e -1 para genéricas ("quebrado"),
   * senão "mouse quebrado" cairia em manutenção em vez de troca de periférico.
   */
  classificar.REGRAS_PADRAO = [
    { quando: ['nao liga', 'não liga', 'nao esta ligando', 'nao ligando', 'sem energia', 'nao inicializa', 'nao da boot'], servico: 'LIGAR EQUIPAMENTO' },
    { quando: ['nao imprime', 'erro ao imprimir', 'erro de impressao', 'falha na impressao', 'nao esta imprimindo'], servico: 'ERRO DE IMPRESSÃO' },
    { quando: ['toner', 'tonner', 'cilindro'], servico: 'SUBSTITUIÇÃO DE TONNER/CILINDRO', peso: 1 },
    { quando: ['sem tinta', 'abastecer tinta', 'trocar tinta', 'cartucho'], servico: 'ABASTECER IMPRESSORAS DE TINTA' },
    { quando: ['cabeca de impressao', 'impressao borrada', 'saindo falhado', 'listras'], servico: 'LIMPEZA CABEÇA DE IMPRESSÃO' },
    { quando: ['impressora de senha', 'impressora de etiqueta', 'etiquetas'], servico: 'CONFIGURAÇÃO DE IMPRESSORA DE SENHA / ETIQUETAS' },
    { quando: ['instalar impressora', 'configurar impressora', 'adicionar impressora'], servico: 'CONFIGURAÇÃO DE IMPRESSORA' },
    { quando: ['impressora sem rede', 'impressora offline', 'resetar rede da impressora'], servico: 'RESET DE REDE IMPRESSORA' },
    { quando: ['painel de senha'], servico: 'CONFIGURAR PAINEL DE SENHA' },
    { quando: ['sem internet', 'sem rede', 'sem acesso a rede', 'nao conecta na rede', 'nao pega wifi', 'wi-fi', 'wifi'], servico: 'EQUIPAMENTO SEM ACESSO A REDE/INTERNET' },
    { quando: ['novo ponto de rede', 'criar ponto de rede', 'ponto de rede novo'], servico: 'CRIAÇÃO DE PONTO DE REDE' },
    { quando: ['ponto de rede quebrado', 'reparar ponto de rede', 'consertar ponto de rede'], servico: 'REPARO DE PONTO DE REDE' },
    { quando: ['cabo', 'cabeamento', 'organizar cabos'], servico: 'ADEQUAÇÃO DE CABOS' },
    { quando: ['senha do email', 'senha de e-mail', 'resetar senha do outlook'], servico: 'RESET DE SENHA DE E-MAIL' },
    { quando: ['senha do senior', 'senha senior'], servico: 'RESET DE SENHA SENIOR' },
    { quando: ['senha do actio', 'senha actio'], servico: 'RESET DE SENHA ACTIO' },
    { quando: ['senha do sau', 'senha sau'], servico: 'RESET DE SENHA (SAU)' },
    { quando: ['senha do neovero', 'senha neovero'], servico: 'RESET DE SENHA NEOVERO' },
    { quando: ['senha do callcenter', 'senha callcenter'], servico: 'RESET DE SENHA CALLCENTER' },
    { quando: ['criar email', 'criar e-mail', 'novo email', 'novo e-mail'], servico: 'CRIAÇÃO DE E-MAIL' },
    { quando: ['bloquear email', 'bloquear e-mail', 'desligamento'], servico: 'BLOQUEIO DE E-MAIL' },
    { quando: ['configurar email', 'configurar e-mail', 'outlook'], servico: 'CONFIGURAÇÃO DE EMAIL' },
    { quando: ['usuario intranet', 'acesso a intranet'], servico: 'CRIAÇÃO DE USUÁRIO INTRANET' },
    { quando: ['acesso a pasta', 'liberar pasta', 'pasta do servidor', 'file server', 'fileserver'], servico: 'LIBERAÇÃO DE PASTA DE SERVIDOR DE ARQUIVOS' },
    { quando: ['instalar programa', 'instalar software', 'instalar aplicativo', 'instalar app'], servico: 'INSTALAÇÃO DE SOFTWARE OU APP' },
    { quando: ['liberar software', 'liberar programa'], servico: 'LIBERAÇÃO DE SOFTWARE' },
    { quando: ['java'], servico: 'LIBERAÇÃO DE JAVA', peso: 1 },
    { quando: ['slack'], servico: 'CONFIGURAÇÃO DE ACESSO AO SLACK' },
    { quando: ['spark'], servico: 'CONFIGURAR SPARK' },
    { quando: ['ramal', 'telefone cisco'], servico: 'REBOOT EM RAMAL CISCO', peso: 1 },
    { quando: ['bobina', 'relogio de ponto'], servico: 'TROCA DE BOBINA DO RELOGIO DE PONTO' },
    { quando: ['cutter'], servico: 'CUTTER TRAVADO - RELÓGIO' },
    { quando: ['segunda via de laudo', 'laudo wtt'], servico: 'SEGUNDA VIA DE LAUDO - WTT' },
    { quando: ['mouse', 'teclado', 'periferico', 'monitor', 'headset', 'webcam'], servico: 'TROCA DE PERIFERICOS', peso: 1 },
    { quando: ['trocar o computador', 'trocar equipamento', 'substituir equipamento'], servico: 'TROCA DE EQUIPAMENTO' },
    { quando: ['mudar de lugar', 'mudanca de equipamento', 'realocar'], servico: 'MUDANÇA DE EQUIPAMENTO' },
    { quando: ['instalar equipamento', 'equipamento novo'], servico: 'INSTALAÇÃO DE EQUIPAMENTO' },
    { quando: ['manutencao', 'conserto', 'defeito', 'quebrado'], servico: 'MANUTENÇÃO DE EQUIPAMENTO', peso: -1 },
    { quando: ['travando', 'travado', 'lento', 'congelando'], servico: 'SERVIÇO TRAVADO', peso: -1 },
    { quando: ['arquivo corrompido', 'nao abre o arquivo'], servico: 'RECUPERAÇÃO DE ARQUIVO CORROMPIDO' },
    { quando: ['excel', 'planilha', 'word'], servico: 'SUPORTE PARA ARQUIVOS DE TEXTO E PLANILHAS' },
    { quando: ['duvida', 'como faco', 'como fazer'], servico: 'DUVIDA', peso: -1 },
    { quando: ['perfil mv'], servico: 'CONFIGURAÇÃO DE PERFIL - MV' },
    { quando: ['perfil do windows', 'perfil no windows'], servico: 'CONFIGURAÇÃO DE PERFIL NO WINDOWS' },
    { quando: ['agenda mv', 'criar agenda'], servico: 'CRIAÇÃO DE AGENDA - MV' },
    { quando: ['ris', 'pacs'], servico: 'INSTALAR/CONFIGURAR RIS-PACS' },
    { quando: ['fidi'], servico: 'CONFIGURAÇÃO DE RIS/PACS FIDI' },
    { quando: ['tasy', 'acesso senior'], servico: 'LIBERAÇÃO DE ACESSO TASY/SENIOR' },
    { quando: ['fleury'], servico: 'CONFIGURAÇÃO DE ACESSO AO SISTEMA FLEURY' },
    { quando: ['atalho'], servico: 'ATALHO' },
    { quando: ['migrar arquivos', 'migracao de arquivos', 'backup'], servico: 'MIGRAÇÃO DE ARQUIVOS' },
    { quando: ['chamado externo', 'assistencia tecnica', 'fornecedor'], servico: 'ABERTURA DE CHAMADO EXTERNO' },
    { quando: ['verificar equipamento', 'checar equipamento'], servico: 'VERIFICAÇÃO DE EQUIPAMENTO', peso: -1 }
  ];

  const STOPWORDS = [
    'de', 'da', 'do', 'das', 'dos', 'e', 'ou', 'a', 'o', 'as', 'os', 'em', 'no', 'na', 'nos', 'nas',
    'para', 'por', 'com', 'ao', 'aos', 'um', 'uma', 'que', 'se', 'ja', 'pra', 'pro', 'sob', 'sobre',
    'esta', 'estao', 'foi', 'ser', 'esse', 'essa', 'este', 'esta', 'isso', 'meu', 'minha', 'sua', 'seu',
    'favor', 'gentileza', 'bom', 'dia', 'tarde', 'noite', 'obrigado'
  ];

  const SUFIXOS = [
    'amentos', 'imentos', 'amento', 'imento', 'acoes', 'icoes', 'coes', 'acao', 'ucao', 'ados', 'adas',
    'idos', 'idas', 'ando', 'endo', 'indo', 'ado', 'ada', 'ido', 'ida', 'oes', 'ais', 'eis', 'ar', 'er',
    'ir', 'ao', 'ns', 's'
  ];

  /* Radical rústico de português: aproxima "ligando"/"ligar" e "configuração"/"configurar". */
  classificar.raiz = function (palavra) {
    let t = text.normalize(palavra).replace(/[^a-z0-9]/g, '');
    for (let i = 0; i < SUFIXOS.length; i += 1) {
      const s = SUFIXOS[i];
      if (t.length - s.length >= 3 && t.slice(-s.length) === s) {
        t = t.slice(0, -s.length);
        break;
      }
    }
    return t;
  };

  classificar.palavrasRelevantes = function (frase) {
    return text
      .normalize(frase)
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(function (p) {
        return p.length >= 2 && STOPWORDS.indexOf(p) < 0;
      });
  };

  classificar.raizes = function (frase) {
    const vistos = [];
    classificar.palavrasRelevantes(frase).forEach(function (p) {
      const r = classificar.raiz(p);
      if (r && vistos.indexOf(r) < 0) vistos.push(r);
    });
    return vistos;
  };

  /*
   * Casa a palavra-chave em começo de palavra, com tolerância proporcional ao tamanho:
   * palavra curta exige casamento exato (senão "ris" casaria com "risco"), média aceita
   * plural e longa aceita qualquer terminação ("travado" pega "travados").
   */
  function contem(descricaoNormalizada, chave) {
    const alvo = text.normalize(chave).replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!alvo) return false;
    const palavras = alvo.split(' ');
    const ultima = palavras[palavras.length - 1];
    const terminacao = ultima.length <= 3 ? '(?:\\s|$)' : ultima.length <= 5 ? '(?:s|es)?(?:\\s|$)' : '[a-z]*';
    const escapado = alvo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+');
    return new RegExp('(^|\\s)' + escapado + terminacao).test(descricaoNormalizada);
  }
  classificar.contem = contem;

  /* 0..1 — proporção das palavras do nome do serviço presentes na descrição. */
  classificar.pontuar = function (descricao, opcao) {
    const raizesOpcao = classificar.raizes(opcao);
    if (!raizesOpcao.length) return 0;
    const raizesDescricao = classificar.raizes(descricao);
    if (!raizesDescricao.length) return 0;
    let acertos = 0;
    raizesOpcao.forEach(function (r) {
      const bateu = raizesDescricao.some(function (d) {
        return d === r || (r.length >= 4 && d.indexOf(r) === 0) || (d.length >= 4 && r.indexOf(d) === 0);
      });
      if (bateu) acertos += 1;
    });
    return acertos / raizesOpcao.length;
  };

  /*
   * Escolhe o serviço.
   * options: { regras, opcoes, minimo }
   * Retorno: { descricao, escolhido, confianca, origem, regra, alternativas, avisos }
   */
  classificar.sugerir = function (descricao, opcoes, options) {
    const opts = options || {};
    const lista = (opcoes && opcoes.length ? opcoes : classificar.SERVICOS_CONHECIDOS).filter(function (o) {
      return o && !/^selecione/i.test(o);
    });
    const regras = opts.regras || classificar.REGRAS_PADRAO;
    const minimo = opts.minimo != null ? opts.minimo : 0.5;
    const avisos = [];
    const resultado = {
      descricao: descricao || '',
      escolhido: null,
      confianca: 0,
      origem: null,
      regra: null,
      alternativas: [],
      avisos: avisos
    };

    if (!descricao || !text.normalize(descricao)) {
      avisos.push('A descrição do chamado está vazia ou não foi lida.');
      return resultado;
    }

    const descricaoNormalizada = text.normalize(descricao).replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

    /* Ranking por semelhança, sempre calculado (serve de alternativa mesmo com regra). */
    const ranking = lista
      .map(function (opcao) {
        return { opcao: opcao, score: Number(classificar.pontuar(descricao, opcao).toFixed(3)) };
      })
      .filter(function (r) {
        return r.score > 0;
      })
      .sort(function (a, b) {
        if (b.score !== a.score) return b.score - a.score;
        return a.opcao.length - b.opcao.length;
      });
    resultado.alternativas = ranking.slice(0, 6);

    /* Camada 1: regras. Vence a palavra-chave mais longa que casar. */
    let melhorRegra = null;
    regras.forEach(function (regra) {
      if (!regra || !regra.servico) return;
      (regra.quando || []).forEach(function (chave) {
        if (!contem(descricaoNormalizada, chave)) return;
        const tamanho = text.normalize(chave).length + (Number(regra.peso) || 0) * 10;
        if (!melhorRegra || tamanho > melhorRegra.tamanho) {
          melhorRegra = { servico: regra.servico, chave: chave, tamanho: tamanho };
        }
      });
    });

    if (melhorRegra) {
      const naLista = lista.filter(function (o) {
        return text.equals(o, melhorRegra.servico);
      })[0];
      if (naLista) {
        resultado.escolhido = naLista;
        resultado.confianca = 0.95;
        resultado.origem = 'regra';
        resultado.regra = { chave: melhorRegra.chave, servico: naLista };
        return resultado;
      }
      const parecido = text.pickBest(lista, melhorRegra.servico, { min: 0.7 });
      avisos.push(
        'A regra “' + melhorRegra.chave + '” aponta para “' + melhorRegra.servico +
          '”, que não existe na lista atual' + (parecido ? '. Usei o mais próximo: “' + parecido.item + '”' : '')
      );
      if (parecido) {
        resultado.escolhido = parecido.item;
        resultado.confianca = 0.8;
        resultado.origem = 'regra-aproximada';
        resultado.regra = { chave: melhorRegra.chave, servico: melhorRegra.servico };
        return resultado;
      }
    }

    /* Camada 2: semelhança. */
    if (ranking.length && ranking[0].score >= minimo) {
      resultado.escolhido = ranking[0].opcao;
      resultado.confianca = ranking[0].score;
      resultado.origem = 'similaridade';
      return resultado;
    }

    avisos.push(
      'Nenhuma regra casou e a semelhança ficou abaixo do mínimo' +
        (ranking.length ? ' (melhor: “' + ranking[0].opcao + '”, ' + ranking[0].score + ')' : '')
    );
    return resultado;
  };

  /* ------------ regras em texto, para edição na tela ------------ */

  classificar.regrasParaTexto = function (regras) {
    return (regras || [])
      .map(function (r) {
        return (r.quando || []).join(', ') + ' => ' + r.servico;
      })
      .join('\n');
  };

  classificar.textoParaRegras = function (texto) {
    const regras = [];
    const erros = [];
    String(texto || '')
      .split('\n')
      .forEach(function (linha, i) {
        const limpa = linha.trim();
        if (!limpa || limpa.charAt(0) === '#') return;
        const partes = limpa.split('=>');
        if (partes.length !== 2) {
          erros.push('Linha ' + (i + 1) + ': use o formato "palavra, outra palavra => SERVIÇO".');
          return;
        }
        const quando = partes[0]
          .split(',')
          .map(function (p) {
            return p.trim();
          })
          .filter(Boolean);
        const servico = partes[1].trim();
        if (!quando.length || !servico) {
          erros.push('Linha ' + (i + 1) + ': falta palavra-chave ou serviço.');
          return;
        }
        regras.push({ quando: quando, servico: servico });
      });
    return { regras: regras, erros: erros };
  };

  /* Aponta regras cujo serviço não existe na lista lida da tela. */
  classificar.conferirRegras = function (regras, opcoes) {
    const lista = opcoes && opcoes.length ? opcoes : classificar.SERVICOS_CONHECIDOS;
    return (regras || [])
      .filter(function (r) {
        return !lista.some(function (o) {
          return text.equals(o, r.servico);
        });
      })
      .map(function (r) {
        const parecido = text.pickBest(lista, r.servico, { min: 0.7 });
        return { servico: r.servico, sugestao: parecido ? parecido.item : null };
      });
  };

  NV.classificar = classificar;
})((globalThis.NV = globalThis.NV || {}));
