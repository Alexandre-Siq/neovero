/*
 * Configuração persistida. Usa o storage do gerenciador de userscripts quando existe
 * (compartilhado entre subdomínios) e cai para localStorage na extensão/navegador puro.
 */
(function (NV) {
  'use strict';

  const CHAVE = 'neovero-fechamento-rapido/config';

  const PRESETS_PADRAO = [
    {
      id: 'ti-configuracao',
      nome: 'TI — Configuração de equipamentos',
      ocorrencia: 'SUPORTE - TI',
      servico: 'CONFIGURAÇÃO DE EQUIPAMENTOS',
      causa: '',
      local: 'interno',
      observacao: '',
      datas: { modo: 'agora', duracaoMin: 1 }
    },
    {
      id: 'ti-suporte-remoto',
      nome: 'TI — Suporte remoto',
      ocorrencia: 'SUPORTE - TI',
      servico: '',
      causa: '',
      local: 'interno',
      observacao: 'Atendimento remoto realizado.',
      datas: { modo: 'agora', duracaoMin: 5 }
    }
  ];

  const PADRAO = {
    versao: 1,
    hostsLiberados: [],
    execucaoSeca: false,
    confirmarAntesDeFechar: true,
    autoIniciarAtendimento: true,
    salvarOsAntesDeFechar: false,
    fecharOsAposOcorrencia: true,
    fecharCalendarioComEsc: true,
    logNoConsole: false,
    presetAtivo: 'ti-configuracao',
    presets: PRESETS_PADRAO,
    atalhos: {
      fechar: 'Alt+F',
      lote: 'Alt+Shift+F',
      painel: 'Alt+N'
    },
    tempos: {
      elemento: 10000,
      modal: 12000,
      salvar: 20000,
      fechar: 20000,
      intervalo: 120
    },
    lote: {
      habilitado: false,
      esperaEntreOs: 1500,
      maximo: 25,
      pararNoPrimeiroErro: true
    },
    entradaDatas: 'auto',
    rotulos: {
      botaoOcorrencia: ['Ocorrência'],
      tituloModal: ['Nova Ocorrência'],
      campoOcorrencia: ['Ocorrência'],
      campoDataOcorrencia: ['Data da Ocorrência'],
      campoDataFinal: ['Data Final do Serviço'],
      campoCausa: ['Causa'],
      campoServico: ['Serviço'],
      campoObservacao: ['Observação', 'Observacao'],
      opcaoInterno: ['Interno'],
      opcaoExterno: ['Externo'],
      continuarIncluindo: ['Continuar Incluindo'],
      salvarModal: ['Salvar'],
      cancelarModal: ['Cancelar'],
      iniciarAtendimento: ['Iniciar Atendimento'],
      fecharOs: ['Fechar OS'],
      salvarOs: ['Salvar'],
      janelaOs: ['ORDEM DE SERVIÇO'],
      confirmar: ['Sim', 'Confirmar', 'OK', 'Fechar OS', 'Concluir']
    },
    seletores: {},
    painel: { x: null, y: null, recolhido: false }
  };

  function clonar(valor) {
    return JSON.parse(JSON.stringify(valor));
  }

  /* Mescla preservando o formato do padrão: se o usuário salvou algo com tipo errado, ignora. */
  function mesclar(padrao, salvo) {
    if (salvo === undefined || salvo === null) return clonar(padrao);
    if (Array.isArray(padrao)) return Array.isArray(salvo) ? clonar(salvo) : clonar(padrao);
    if (typeof padrao === 'object') {
      if (typeof salvo !== 'object' || Array.isArray(salvo)) return clonar(padrao);
      const saida = {};
      Object.keys(padrao).forEach(function (chave) {
        saida[chave] = mesclar(padrao[chave], salvo[chave]);
      });
      Object.keys(salvo).forEach(function (chave) {
        if (!(chave in saida)) saida[chave] = clonar(salvo[chave]);
      });
      return saida;
    }
    return typeof salvo === typeof padrao ? salvo : clonar(padrao);
  }

  function lerBruto() {
    try {
      if (typeof GM_getValue === 'function') {
        const valor = GM_getValue(CHAVE, null);
        if (valor) return typeof valor === 'string' ? JSON.parse(valor) : valor;
      }
    } catch (erro) {
      /* segue para localStorage */
    }
    try {
      const cru = localStorage.getItem(CHAVE);
      return cru ? JSON.parse(cru) : null;
    } catch (erro) {
      return null;
    }
  }

  function gravarBruto(objeto) {
    const cru = JSON.stringify(objeto);
    let gravou = false;
    try {
      if (typeof GM_setValue === 'function') {
        GM_setValue(CHAVE, cru);
        gravou = true;
      }
    } catch (erro) {
      /* segue para localStorage */
    }
    try {
      localStorage.setItem(CHAVE, cru);
      gravou = true;
    } catch (erro) {
      /* pode falhar em modo privado */
    }
    return gravou;
  }

  let atual = null;

  const config = {
    CHAVE: CHAVE,
    PADRAO: PADRAO,
    clonar: clonar,
    mesclar: mesclar,

    carregar: function () {
      atual = mesclar(PADRAO, lerBruto());
      return atual;
    },

    obter: function () {
      if (!atual) config.carregar();
      return atual;
    },

    salvar: function (novo) {
      atual = mesclar(PADRAO, novo || atual);
      const ok = gravarBruto(atual);
      if (!ok && NV.log) NV.log.aviso('Não foi possível persistir a configuração neste navegador');
      return atual;
    },

    aplicar: function (mudancas) {
      return config.salvar(mesclar(config.obter(), mudancas || {}));
    },

    restaurarPadrao: function () {
      return config.salvar(clonar(PADRAO));
    },

    presetAtivo: function () {
      const cfg = config.obter();
      const achado = cfg.presets.find(function (p) {
        return p.id === cfg.presetAtivo;
      });
      return achado || cfg.presets[0] || null;
    },

    definirPresetAtivo: function (id) {
      return config.aplicar({ presetAtivo: id });
    },

    salvarPreset: function (preset) {
      const cfg = config.obter();
      const presets = cfg.presets.slice();
      const idx = presets.findIndex(function (p) {
        return p.id === preset.id;
      });
      if (idx >= 0) presets[idx] = preset;
      else presets.push(preset);
      return config.salvar(Object.assign({}, cfg, { presets: presets }));
    },

    removerPreset: function (id) {
      const cfg = config.obter();
      const presets = cfg.presets.filter(function (p) {
        return p.id !== id;
      });
      const presetAtivo = cfg.presetAtivo === id ? (presets[0] && presets[0].id) || '' : cfg.presetAtivo;
      return config.salvar(Object.assign({}, cfg, { presets: presets, presetAtivo: presetAtivo }));
    },

    /* Validação usada pela tela de configuração antes de gravar. */
    validarPreset: function (preset) {
      const erros = [];
      if (!preset || !String(preset.nome || '').trim()) erros.push('Informe um nome para o preset.');
      if (!preset || !String(preset.ocorrencia || '').trim()) erros.push('O campo "Ocorrência" é obrigatório.');
      if (!preset || !String(preset.servico || '').trim()) erros.push('O campo "Serviço" é obrigatório.');
      const modo = preset && preset.datas && preset.datas.modo;
      if (modo && ['agora', 'inicioAgora', 'abertura'].indexOf(modo) < 0) erros.push('Modo de data inválido: ' + modo);
      const duracao = preset && preset.datas ? Number(preset.datas.duracaoMin) : 0;
      if (Number.isNaN(duracao) || duracao < 0 || duracao > 24 * 60) erros.push('Duração deve estar entre 0 e 1440 minutos.');
      return erros;
    },

    gerarId: function (nome) {
      const base = NV.text
        .normalize(nome || 'preset')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      return (base || 'preset') + '-' + Math.random().toString(36).slice(2, 6);
    },

    seletor: function (chave) {
      const cfg = config.obter();
      return cfg.seletores ? cfg.seletores[chave] || null : null;
    },

    definirSeletor: function (chave, caminho) {
      const cfg = config.obter();
      const seletores = Object.assign({}, cfg.seletores);
      if (caminho) seletores[chave] = caminho;
      else delete seletores[chave];
      return config.salvar(Object.assign({}, cfg, { seletores: seletores }));
    }
  };

  NV.config = config;
})((globalThis.NV = globalThis.NV || {}));
