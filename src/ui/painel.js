/* Painel flutuante: preset ativo, botões de ação, configuração, log e lote. */
(function (NV) {
  'use strict';

  const painel = {};

  let host = null;
  let raiz = null;
  let refs = {};
  let ocupado = false;
  let sinalAtual = null;

  function el(tag, attrs, html) {
    const node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'class') node.className = attrs[k];
      else node.setAttribute(k, attrs[k]);
    });
    if (html != null) node.innerHTML = html;
    return node;
  }

  function esc(valor) {
    return String(valor == null ? '' : valor)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function status(mensagem, tipo) {
    if (!refs.status) return;
    refs.status.textContent = mensagem || '';
    refs.status.className = 'status' + (tipo ? ' ' + tipo : '');
  }

  function preencherPresets() {
    const cfg = NV.config.obter();
    refs.preset.innerHTML = cfg.presets
      .map(function (p) {
        return '<option value="' + esc(p.id) + '"' + (p.id === cfg.presetAtivo ? ' selected' : '') + '>' + esc(p.nome) + '</option>';
      })
      .join('');
  }

  function definirOcupado(valor) {
    ocupado = valor;
    refs.btnFechar.textContent = valor ? 'Cancelar' : 'Fechar chamado';
    refs.btnFechar.classList.toggle('perigo', valor);
    [refs.btnSimular, refs.btnOcorrencia, refs.btnLote].forEach(function (b) {
      b.disabled = valor;
    });
  }

  function aoProgresso(evento) {
    if (evento.tipo === 'inicio') status('… ' + evento.passo, 'trabalhando');
    else if (evento.tipo === 'erro') status('✗ ' + evento.passo, 'erro');
    else if (evento.tipo === 'pulado') status('· ' + evento.passo + ' (ignorado)', 'trabalhando');
    else if (evento.tipo === 'os') status('OS ' + evento.numero + ' (' + evento.indice + '/' + evento.total + ')', 'trabalhando');
  }

  function resumoDeErro(resultado) {
    const partes = [];
    if (resultado.passo) partes.push(resultado.passo);
    if (resultado.erro) partes.push(resultado.erro);
    if (resultado.mensagemDaAplicacao) partes.push('Sistema: ' + resultado.mensagemDaAplicacao);
    return partes.join(' — ');
  }

  async function executar(opcoes) {
    if (ocupado) {
      if (sinalAtual) sinalAtual.cancelar();
      status('Cancelando…', 'trabalhando');
      return;
    }
    sinalAtual = NV.fluxo.criarSinal();
    definirOcupado(true);
    try {
      const resultado = await NV.fluxo.fecharOS(
        Object.assign(
          {
            preset: NV.config.presetAtivo(),
            aoProgresso: aoProgresso,
            sinal: sinalAtual,
            aoConfirmar: confirmarFechamento
          },
          opcoes || {}
        )
      );
      if (resultado.ok && resultado.execucaoSeca) {
        status('✓ Simulação: modal preenchido. Confira e salve manualmente.', 'ok');
      } else if (resultado.ok && resultado.fechada) {
        status('✓ OS ' + (resultado.numeroOs || '') + ' fechada em ' + (resultado.ms / 1000).toFixed(1) + 's', 'ok');
      } else if (resultado.ok) {
        status('✓ Ocorrência lançada' + (resultado.numeroOs ? ' na OS ' + resultado.numeroOs : ''), 'ok');
      } else {
        status('✗ ' + resumoDeErro(resultado), 'erro');
      }
      return resultado;
    } catch (erro) {
      status('✗ ' + String(erro.message || erro), 'erro');
    } finally {
      definirOcupado(false);
      sinalAtual = null;
    }
  }

  /* ---------------- diálogos simples dentro do shadow root ---------------- */

  function abrirSobreposicao(titulo, conteudoHtml, rodapeHtml) {
    const sobre = el('div', { class: 'sobreposicao' });
    sobre.innerHTML =
      '<div class="modal">' +
      '<header><span class="titulo">' + esc(titulo) + '</span><button class="acao secundaria" data-fechar style="width:auto;padding:6px 12px">✕</button></header>' +
      '<div class="conteudo"></div>' +
      (rodapeHtml ? '<footer>' + rodapeHtml + '</footer>' : '') +
      '</div>';
    sobre.querySelector('.conteudo').innerHTML = conteudoHtml;
    sobre.addEventListener('click', function (ev) {
      if (ev.target === sobre || (ev.target.dataset && ev.target.dataset.fechar !== undefined)) sobre.remove();
    });
    raiz.appendChild(sobre);
    return sobre;
  }

  function confirmar(titulo, mensagem, textoOk) {
    return new Promise(function (resolve) {
      const sobre = abrirSobreposicao(
        titulo,
        '<p style="margin:0;line-height:1.5">' + mensagem + '</p>',
        '<button class="acao secundaria" data-nao>Não</button><button class="acao" data-sim>' + esc(textoOk || 'Confirmar') + '</button>'
      );
      const fechar = function (valor) {
        sobre.remove();
        resolve(valor);
      };
      sobre.querySelector('[data-sim]').addEventListener('click', () => fechar(true));
      sobre.querySelector('[data-nao]').addEventListener('click', () => fechar(false));
      sobre.addEventListener('click', function (ev) {
        if (ev.target === sobre) fechar(false);
      });
    });
  }

  function confirmarFechamento(info) {
    return confirmar(
      'Fechar a OS?',
      'A ocorrência foi lançada' +
        (info.numeroOs ? ' na OS <b>' + esc(info.numeroOs) + '</b>' : '') +
        '.<br>Confirmar o fechamento da Ordem de Serviço?',
      'Fechar OS'
    );
  }

  /* ---------------- log ---------------- */

  function abrirLog() {
    const linhas = NV.log
      .entradas()
      .map(function (e) {
        const hora = e.t.slice(11, 19);
        const dados = e.dados ? ' ' + JSON.stringify(e.dados) : '';
        return '<span class="log-' + e.nivel + '">' + esc(hora + ' [' + e.nivel + '] ' + e.mensagem + dados) + '</span>';
      })
      .join('\n');
    const sobre = abrirSobreposicao(
      'Log da sessão',
      '<pre class="log">' + (linhas || 'Sem registros ainda.') + '</pre>',
      '<button class="acao secundaria" data-limpar>Limpar</button><button class="acao" data-copiar>Copiar</button>'
    );
    sobre.querySelector('[data-copiar]').addEventListener('click', function () {
      const texto = NV.log
        .entradas()
        .map((e) => e.t + ' [' + e.nivel + '] ' + e.mensagem + (e.dados ? ' ' + JSON.stringify(e.dados) : ''))
        .join('\n');
      navigator.clipboard.writeText(texto).then(
        () => status('Log copiado', 'ok'),
        () => status('Não foi possível copiar', 'erro')
      );
    });
    sobre.querySelector('[data-limpar]').addEventListener('click', function () {
      NV.log.limpar();
      sobre.remove();
      status('Log limpo');
    });
  }

  /* ---------------- lote ---------------- */

  async function abrirLote() {
    const cfg = NV.config.obter();
    const itens = NV.lote.listar();
    if (!itens.length) {
      status('Nenhuma OS encontrada na lista do Monitor de Atendimento', 'erro');
      return;
    }
    const html =
      '<div class="aviso">O modo lote abre cada OS, lança a ocorrência do preset e fecha. ' +
      'Confirme antes que o preset é o correto para <b>todas</b> as OS marcadas.</div>' +
      '<label class="campo">Preset aplicado a todas<span class="badge">' + esc((NV.config.presetAtivo() || {}).nome || '—') + '</span></label>' +
      '<ul class="lista">' +
      itens
        .map(function (i) {
          return '<li><input type="checkbox" value="' + esc(i.numero) + '"><span class="nome">OS ' + esc(i.numero) + '</span></li>';
        })
        .join('') +
      '</ul>' +
      '<label class="check"><input type="checkbox" data-parar ' + (cfg.lote.pararNoPrimeiroErro ? 'checked' : '') +
      '> Parar no primeiro erro</label>';

    const sobre = abrirSobreposicao(
      'Fechar em lote',
      html,
      '<button class="acao secundaria" data-fechar>Cancelar</button><button class="acao" data-executar>Fechar selecionadas</button>'
    );

    sobre.querySelector('[data-executar]').addEventListener('click', async function () {
      const numeros = Array.prototype.slice
        .call(sobre.querySelectorAll('ul.lista input[type="checkbox"]:checked'))
        .map((c) => c.value);
      if (!numeros.length) return;
      NV.config.aplicar({ lote: { pararNoPrimeiroErro: sobre.querySelector('[data-parar]').checked } });
      const ok = await confirmar('Confirmar lote', 'Serão fechadas <b>' + numeros.length + '</b> OS com o preset atual. Continuar?', 'Executar');
      if (!ok) return;
      sobre.remove();
      sinalAtual = NV.fluxo.criarSinal();
      definirOcupado(true);
      try {
        const resumo = await NV.lote.fechar({ numeros: numeros, aoProgresso: aoProgresso, sinal: sinalAtual });
        status(
          '✓ ' + resumo.sucesso + '/' + resumo.total + ' fechadas' + (resumo.falhas.length ? ' · ' + resumo.falhas.length + ' falha(s), veja o log' : ''),
          resumo.falhas.length ? 'erro' : 'ok'
        );
      } finally {
        definirOcupado(false);
        sinalAtual = null;
      }
    });
  }

  /* ---------------- configuração ---------------- */

  const CHAVES_SELETOR = [
    ['botaoOcorrencia', 'Botão "Ocorrência" (na OS)'],
    ['botaoFecharOs', 'Botão "Fechar OS"'],
    ['botaoIniciarAtendimento', 'Botão "Iniciar Atendimento"'],
    ['modalOcorrencia', 'Modal "Nova Ocorrência"'],
    ['campoOcorrencia', 'Campo Ocorrência'],
    ['campoDataOcorrencia', 'Campo Data da Ocorrência'],
    ['campoDataFinal', 'Campo Data Final do Serviço'],
    ['campoCausa', 'Campo Causa'],
    ['campoServico', 'Campo Serviço'],
    ['campoObservacao', 'Campo Observação'],
    ['botaoSalvarModal', 'Botão "Salvar" do modal']
  ];

  function htmlAbaPresets(cfg) {
    return (
      '<label class="campo">Preset em edição' +
      '<select data-preset-edit>' +
      cfg.presets.map((p) => '<option value="' + esc(p.id) + '">' + esc(p.nome) + '</option>').join('') +
      '</select></label>' +
      '<fieldset><legend>Dados da ocorrência</legend>' +
      '<label class="campo">Nome do preset<input type="text" data-f="nome"></label>' +
      '<div class="grade2">' +
      '<label class="campo">Ocorrência (obrigatório)<input type="text" data-f="ocorrencia" placeholder="SUPORTE - TI"></label>' +
      '<label class="campo">Serviço (obrigatório)<input type="text" data-f="servico" placeholder="CONFIGURAÇÃO DE EQUIPAMENTOS"></label>' +
      '</div>' +
      '<div class="grade2">' +
      '<label class="campo">Causa (opcional)<input type="text" data-f="causa"></label>' +
      '<label class="campo">Interno/Externo<select data-f="local"><option value="interno">Interno</option><option value="externo">Externo</option><option value="">Não alterar</option></select></label>' +
      '</div>' +
      '<label class="campo">Observação (opcional)<textarea data-f="observacao"></textarea></label>' +
      '</fieldset>' +
      '<fieldset><legend>Datas</legend>' +
      '<div class="grade2">' +
      '<label class="campo">Regra<select data-f="datas.modo">' +
      '<option value="agora">Terminou agora (início = agora − duração)</option>' +
      '<option value="inicioAgora">Começa agora (fim = agora + duração)</option>' +
      '<option value="abertura">Início na abertura da OS, fim agora</option>' +
      '</select></label>' +
      '<label class="campo">Duração (min)<input type="number" min="0" max="1440" data-f="datas.duracaoMin"></label>' +
      '</div>' +
      '<p class="aviso-inline">O padrão reproduz o que você faz hoje: ocorrência de 1 minuto terminando no momento do fechamento.</p>' +
      '</fieldset>' +
      '<div class="linha">' +
      '<button class="acao secundaria" data-novo>Novo preset</button>' +
      '<button class="acao secundaria" data-duplicar>Duplicar</button>' +
      '<button class="acao perigo" data-excluir>Excluir</button>' +
      '</div>'
    );
  }

  function htmlAbaComportamento(cfg) {
    const check = function (chave, titulo, ajuda) {
      const valor = chave.split('.').reduce((o, k) => (o || {})[k], cfg);
      return (
        '<label class="check"><input type="checkbox" data-c="' + chave + '"' + (valor ? ' checked' : '') + '>' +
        '<span>' + esc(titulo) + (ajuda ? '<small>' + esc(ajuda) + '</small>' : '') + '</span></label>'
      );
    };
    return (
      '<fieldset><legend>Fluxo</legend>' +
      check('fecharOsAposOcorrencia', 'Fechar a OS depois de lançar a ocorrência', 'Desmarque para só lançar a ocorrência.') +
      check('confirmarAntesDeFechar', 'Pedir confirmação antes de clicar em "Fechar OS"') +
      check('autoIniciarAtendimento', 'Clicar em "Iniciar Atendimento" quando o botão estiver visível') +
      check('salvarOsAntesDeFechar', 'Salvar a OS antes de fechar') +
      check('execucaoSeca', 'Modo simulação por padrão', 'Preenche o modal e para antes de salvar.') +
      check('logNoConsole', 'Espelhar log no console do navegador') +
      '</fieldset>' +
      '<fieldset><legend>Compatibilidade</legend>' +
      check('fecharCalendarioComEsc', 'Fechar calendário com Esc depois de escrever a data', 'Desmarque se o Esc fechar o modal inteiro.') +
      '<label class="campo">Escrita nos campos de data<select data-c="entradaDatas">' +
      ['auto', 'valor', 'teclas']
        .map((v) => '<option value="' + v + '"' + (cfg.entradaDatas === v ? ' selected' : '') + '>' + v + '</option>')
        .join('') +
      '</select></label>' +
      '<p class="aviso-inline">"auto" tenta escrever direto e, se o campo tiver máscara, digita tecla por tecla.</p>' +
      '<div class="grade3">' +
      '<label class="campo">Timeout elemento (ms)<input type="number" data-c="tempos.elemento" value="' + cfg.tempos.elemento + '"></label>' +
      '<label class="campo">Timeout modal (ms)<input type="number" data-c="tempos.modal" value="' + cfg.tempos.modal + '"></label>' +
      '<label class="campo">Timeout salvar (ms)<input type="number" data-c="tempos.salvar" value="' + cfg.tempos.salvar + '"></label>' +
      '</div>' +
      '</fieldset>' +
      '<fieldset><legend>Lote</legend>' +
      '<div class="grade3">' +
      '<label class="campo">Máx. por lote<input type="number" data-c="lote.maximo" value="' + cfg.lote.maximo + '"></label>' +
      '<label class="campo">Espera entre OS (ms)<input type="number" data-c="lote.esperaEntreOs" value="' + cfg.lote.esperaEntreOs + '"></label>' +
      '<label class="campo">&nbsp;' + check('lote.pararNoPrimeiroErro', 'Parar no 1º erro') + '</label>' +
      '</div>' +
      '</fieldset>' +
      '<fieldset><legend>Atalhos</legend>' +
      '<div class="grade3">' +
      '<label class="campo">Fechar chamado<input type="text" data-c="atalhos.fechar" value="' + esc(cfg.atalhos.fechar) + '"></label>' +
      '<label class="campo">Lote<input type="text" data-c="atalhos.lote" value="' + esc(cfg.atalhos.lote) + '"></label>' +
      '<label class="campo">Mostrar painel<input type="text" data-c="atalhos.painel" value="' + esc(cfg.atalhos.painel) + '"></label>' +
      '</div>' +
      '<p class="aviso-inline">Formato: Alt+F, Ctrl+Shift+K, etc.</p>' +
      '</fieldset>'
    );
  }

  function htmlAbaSeletores(cfg) {
    return (
      '<div class="aviso">Use isto quando o script não achar um botão ou campo: clique em "Aprender" e depois no elemento real na tela do Neovero.</div>' +
      '<ul class="lista" style="max-height:none">' +
      CHAVES_SELETOR.map(function (par) {
        const atual = (cfg.seletores || {})[par[0]];
        return (
          '<li><span class="nome">' + esc(par[1]) +
          (atual ? '<br><code>' + esc(atual) + '</code>' : '<br><span class="aviso-inline">automático (por texto)</span>') +
          '</span>' +
          '<button class="acao secundaria" data-aprender="' + par[0] + '">Aprender</button>' +
          (atual ? '<button class="acao perigo" data-limpar-seletor="' + par[0] + '">Limpar</button>' : '') +
          '</li>'
        );
      }).join('') +
      '</ul>'
    );
  }

  function htmlAbaDiagnostico(cfg) {
    const gravando = NV.diagnostico.gravando();
    return (
      '<fieldset><legend>Coleta para ajuste fino</legend>' +
      '<p class="aviso-inline">1) Clique em "Iniciar gravação". 2) Faça um fechamento manual completo. ' +
      '3) Clique em "Parar e baixar". O arquivo contém a estrutura do modal e as chamadas de rede ' +
      '(e-mails, CPF, telefones e tokens são mascarados). Envie esse arquivo para calibrar os seletores ' +
      'ou implementar o fechamento direto pela API.</p>' +
      '<div class="linha">' +
      '<button class="acao ' + (gravando ? 'perigo' : 'secundaria') + '" data-gravar>' + (gravando ? 'Parar e baixar' : 'Iniciar gravação') + '</button>' +
      '<button class="acao secundaria" data-capturar>Capturar tela atual</button>' +
      '</div>' +
      '</fieldset>' +
      '<fieldset><legend>Este site</legend>' +
      '<p class="aviso-inline">Host atual: <code>' + esc(location.host) + '</code></p>' +
      '<label class="check"><input type="checkbox" data-host ' + (cfg.hostsLiberados.indexOf(location.host) >= 0 ? 'checked' : '') +
      '><span>Tratar este host como Neovero<small>Marque se o painel não aparecer sozinho.</small></span></label>' +
      '</fieldset>' +
      '<fieldset><legend>Configuração</legend>' +
      '<div class="linha">' +
      '<button class="acao secundaria" data-exportar>Exportar configuração</button>' +
      '<button class="acao secundaria" data-importar>Importar</button>' +
      '<button class="acao perigo" data-restaurar>Restaurar padrão</button>' +
      '</div>' +
      '</fieldset>'
    );
  }

  function abrirConfig() {
    const cfg = NV.config.obter();
    const abas = [
      ['presets', 'Presets', htmlAbaPresets],
      ['comportamento', 'Comportamento', htmlAbaComportamento],
      ['seletores', 'Seletores', htmlAbaSeletores],
      ['diagnostico', 'Diagnóstico', htmlAbaDiagnostico]
    ];

    const sobre = el('div', { class: 'sobreposicao' });
    sobre.innerHTML =
      '<div class="modal">' +
      '<header><span class="titulo">Configuração · Neovero+</span>' +
      '<button class="acao secundaria" data-fechar style="width:auto;padding:6px 12px">✕</button></header>' +
      '<div class="abas">' +
      abas.map((a, i) => '<button data-aba="' + a[0] + '" class="' + (i === 0 ? 'ativa' : '') + '">' + a[1] + '</button>').join('') +
      '</div>' +
      '<div class="conteudo" data-painel-aba></div>' +
      '<footer><button class="acao secundaria" data-fechar>Fechar</button><button class="acao" data-salvar>Salvar</button></footer>' +
      '</div>';
    raiz.appendChild(sobre);

    const conteudo = sobre.querySelector('[data-painel-aba]');
    let abaAtual = 'presets';
    let presetEmEdicao = (NV.config.presetAtivo() || {}).id;

    function valorPorCaminho(objeto, caminho) {
      return caminho.split('.').reduce((o, k) => (o == null ? o : o[k]), objeto);
    }

    function definirPorCaminho(objeto, caminho, valor) {
      const partes = caminho.split('.');
      let atual = objeto;
      for (let i = 0; i < partes.length - 1; i += 1) {
        if (typeof atual[partes[i]] !== 'object' || atual[partes[i]] === null) atual[partes[i]] = {};
        atual = atual[partes[i]];
      }
      atual[partes[partes.length - 1]] = valor;
    }

    function carregarFormularioPreset() {
      const preset = NV.config.obter().presets.find((p) => p.id === presetEmEdicao) || NV.config.obter().presets[0];
      if (!preset) return;
      presetEmEdicao = preset.id;
      const seletor = conteudo.querySelector('[data-preset-edit]');
      if (seletor) seletor.value = preset.id;
      conteudo.querySelectorAll('[data-f]').forEach(function (campo) {
        const valor = valorPorCaminho(preset, campo.dataset.f);
        campo.value = valor == null ? '' : valor;
      });
    }

    function coletarPreset() {
      const base = NV.config.obter().presets.find((p) => p.id === presetEmEdicao) || { id: presetEmEdicao };
      const preset = NV.config.clonar(base);
      conteudo.querySelectorAll('[data-f]').forEach(function (campo) {
        const caminho = campo.dataset.f;
        let valor = campo.value;
        if (campo.type === 'number') valor = Number(valor);
        definirPorCaminho(preset, caminho, valor);
      });
      return preset;
    }

    function coletarComportamento() {
      const mudancas = {};
      conteudo.querySelectorAll('[data-c]').forEach(function (campo) {
        const caminho = campo.dataset.c;
        let valor;
        if (campo.type === 'checkbox') valor = campo.checked;
        else if (campo.type === 'number') valor = Number(campo.value);
        else valor = campo.value;
        definirPorCaminho(mudancas, caminho, valor);
      });
      return mudancas;
    }

    function renderAba(nome) {
      abaAtual = nome;
      const def = abas.find((a) => a[0] === nome);
      conteudo.innerHTML = def[2](NV.config.obter());
      sobre.querySelectorAll('[data-aba]').forEach(function (b) {
        b.classList.toggle('ativa', b.dataset.aba === nome);
      });
      if (nome === 'presets') carregarFormularioPreset();
    }

    function salvarAbaAtual() {
      if (abaAtual === 'presets') {
        const preset = coletarPreset();
        const erros = NV.config.validarPreset(preset);
        if (erros.length) {
          status('✗ ' + erros.join(' '), 'erro');
          return false;
        }
        NV.config.salvarPreset(preset);
        preencherPresets();
        status('Preset salvo: ' + preset.nome, 'ok');
        return true;
      }
      if (abaAtual === 'comportamento') {
        NV.config.aplicar(coletarComportamento());
        NV.log.console = NV.config.obter().logNoConsole;
        status('Configuração salva', 'ok');
        return true;
      }
      if (abaAtual === 'diagnostico') {
        const check = conteudo.querySelector('[data-host]');
        if (check) {
          const cfgAtual = NV.config.obter();
          const lista = cfgAtual.hostsLiberados.filter((h) => h !== location.host);
          if (check.checked) lista.push(location.host);
          NV.config.aplicar({ hostsLiberados: lista });
        }
        status('Configuração salva', 'ok');
        return true;
      }
      return true;
    }

    sobre.addEventListener('click', async function (ev) {
      const alvo = ev.target;
      if (alvo === sobre || (alvo.dataset && alvo.dataset.fechar !== undefined)) {
        sobre.remove();
        return;
      }
      if (alvo.dataset && alvo.dataset.aba) {
        salvarAbaAtual();
        renderAba(alvo.dataset.aba);
        return;
      }
      if (alvo.dataset && alvo.dataset.salvar !== undefined) {
        if (salvarAbaAtual()) sobre.remove();
        return;
      }
      if (alvo.dataset && alvo.dataset.novo !== undefined) {
        const novo = {
          id: NV.config.gerarId('novo'),
          nome: 'Novo preset',
          ocorrencia: '',
          servico: '',
          causa: '',
          local: 'interno',
          observacao: '',
          datas: { modo: 'agora', duracaoMin: 1 }
        };
        const cfgAtual = NV.config.obter();
        NV.config.salvar(Object.assign({}, cfgAtual, { presets: cfgAtual.presets.concat([novo]) }));
        presetEmEdicao = novo.id;
        renderAba('presets');
        preencherPresets();
        return;
      }
      if (alvo.dataset && alvo.dataset.duplicar !== undefined) {
        const atual = coletarPreset();
        const copia = Object.assign({}, atual, { id: NV.config.gerarId(atual.nome), nome: atual.nome + ' (cópia)' });
        NV.config.salvarPreset(copia);
        presetEmEdicao = copia.id;
        renderAba('presets');
        preencherPresets();
        return;
      }
      if (alvo.dataset && alvo.dataset.excluir !== undefined) {
        const ok = await confirmar('Excluir preset', 'Remover este preset da lista?', 'Excluir');
        if (!ok) return;
        NV.config.removerPreset(presetEmEdicao);
        presetEmEdicao = (NV.config.presetAtivo() || {}).id;
        renderAba('presets');
        preencherPresets();
        return;
      }
      if (alvo.dataset && alvo.dataset.aprender) {
        const chave = alvo.dataset.aprender;
        const rotulo = (CHAVES_SELETOR.find((p) => p[0] === chave) || [])[1] || chave;
        sobre.style.display = 'none';
        const resultado = await NV.aprender.iniciar(chave, rotulo);
        sobre.style.display = '';
        renderAba('seletores');
        status(resultado ? '✓ Seletor gravado: ' + rotulo : 'Aprendizado cancelado', resultado ? 'ok' : null);
        return;
      }
      if (alvo.dataset && alvo.dataset.limparSeletor) {
        NV.config.definirSeletor(alvo.dataset.limparSeletor, null);
        renderAba('seletores');
        return;
      }
      if (alvo.dataset && alvo.dataset.gravar !== undefined) {
        if (NV.diagnostico.gravando()) {
          NV.diagnostico.pararGravacao();
          const nome = NV.diagnostico.baixar();
          status('✓ Diagnóstico salvo: ' + nome, 'ok');
        } else {
          NV.diagnostico.iniciarGravacao();
          status('Gravando… faça o fechamento manual e volte aqui', 'trabalhando');
        }
        renderAba('diagnostico');
        return;
      }
      if (alvo.dataset && alvo.dataset.capturar !== undefined) {
        const nome = NV.diagnostico.baixar();
        status('✓ Captura salva: ' + nome, 'ok');
        return;
      }
      if (alvo.dataset && alvo.dataset.exportar !== undefined) {
        NV.diagnostico.baixar(NV.config.obter(), 'neovero-config.json');
        status('✓ Configuração exportada', 'ok');
        return;
      }
      if (alvo.dataset && alvo.dataset.importar !== undefined) {
        const entrada = document.createElement('input');
        entrada.type = 'file';
        entrada.accept = 'application/json';
        entrada.addEventListener('change', function () {
          const arquivo = entrada.files && entrada.files[0];
          if (!arquivo) return;
          const leitor = new FileReader();
          leitor.onload = function () {
            try {
              NV.config.salvar(JSON.parse(String(leitor.result)));
              preencherPresets();
              renderAba(abaAtual);
              status('✓ Configuração importada', 'ok');
            } catch (erro) {
              status('✗ Arquivo inválido', 'erro');
            }
          };
          leitor.readAsText(arquivo);
        });
        entrada.click();
        return;
      }
      if (alvo.dataset && alvo.dataset.restaurar !== undefined) {
        const ok = await confirmar('Restaurar padrão', 'Isso apaga presets e seletores personalizados. Continuar?', 'Restaurar');
        if (!ok) return;
        NV.config.restaurarPadrao();
        presetEmEdicao = (NV.config.presetAtivo() || {}).id;
        preencherPresets();
        renderAba(abaAtual);
        status('Configuração restaurada', 'ok');
      }
    });

    conteudo.addEventListener('change', function (ev) {
      if (ev.target.dataset && ev.target.dataset.presetEdit !== undefined) {
        presetEmEdicao = ev.target.value;
        carregarFormularioPreset();
      }
    });

    renderAba('presets');
    return sobre;
  }

  /* ---------------- arrastar ---------------- */

  let arrastando = false;
  let dx = 0;
  let dy = 0;
  let globaisRegistrados = false;

  function habilitarArrasto() {
    refs.cabecalho.addEventListener('mousedown', function (ev) {
      if (ev.target.tagName === 'BUTTON') return;
      const r = refs.painel.getBoundingClientRect();
      arrastando = true;
      dx = ev.clientX - r.left;
      dy = ev.clientY - r.top;
      ev.preventDefault();
    });
    if (globaisRegistrados) return;
    window.addEventListener('mousemove', function (ev) {
      if (!arrastando) return;
      const x = Math.max(0, Math.min(window.innerWidth - 80, ev.clientX - dx));
      const y = Math.max(0, Math.min(window.innerHeight - 40, ev.clientY - dy));
      refs.painel.style.left = x + 'px';
      refs.painel.style.top = y + 'px';
      refs.painel.style.right = 'auto';
      refs.painel.style.bottom = 'auto';
    });
    window.addEventListener('mouseup', function () {
      if (!arrastando) return;
      arrastando = false;
      const r = refs.painel.getBoundingClientRect();
      NV.config.aplicar({ painel: { x: r.left, y: r.top } });
    });
  }

  /* ---------------- atalhos ---------------- */

  function combinacaoBate(ev, combinacao) {
    if (!combinacao) return false;
    const partes = combinacao.toLowerCase().split('+').map((p) => p.trim());
    const tecla = partes[partes.length - 1];
    const precisaAlt = partes.indexOf('alt') >= 0;
    const precisaCtrl = partes.indexOf('ctrl') >= 0 || partes.indexOf('control') >= 0;
    const precisaShift = partes.indexOf('shift') >= 0;
    if (ev.altKey !== precisaAlt) return false;
    if (ev.ctrlKey !== precisaCtrl) return false;
    if (ev.shiftKey !== precisaShift) return false;
    return String(ev.key || '').toLowerCase() === tecla;
  }

  function registrarAtalhos() {
    if (globaisRegistrados) return;
    NV.dom.ouvirTodos(
      'keydown',
      function (ev) {
        /* O próprio script dispara Escape para fechar calendários; só tecla real conta. */
        if (ev.isTrusted === false) return;
        const cfg = NV.config.obter();
        if (combinacaoBate(ev, cfg.atalhos.fechar)) {
          ev.preventDefault();
          executar({});
        } else if (combinacaoBate(ev, cfg.atalhos.lote)) {
          ev.preventDefault();
          abrirLote();
        } else if (combinacaoBate(ev, cfg.atalhos.painel)) {
          ev.preventDefault();
          painel.alternar();
        } else if (ev.key === 'Escape' && ocupado && sinalAtual) {
          sinalAtual.cancelar();
          status('Cancelando…', 'trabalhando');
        }
      },
      true
    );
  }

  /* ---------------- montagem ---------------- */

  /* A SPA pode substituir o body inteiro e levar o painel embora: nesse caso remonta. */
  painel.montado = function () {
    return !!host && host.isConnected;
  };

  painel.montar = function () {
    if (painel.montado()) return painel;
    host = null;
    raiz = null;
    refs = {};
    const cfg = NV.config.obter();

    host = el('div', { 'data-nv-ui': 'painel' });
    document.body.appendChild(host);
    raiz = host.attachShadow({ mode: 'open' });
    const estilo = document.createElement('style');
    estilo.textContent = NV.estilos;
    raiz.appendChild(estilo);

    const container = el('div', { class: 'painel' + (cfg.painel.recolhido ? ' recolhido' : '') });
    container.innerHTML =
      '<div class="cabecalho" data-cabecalho>' +
      '<span class="titulo">Neovero+ · fechar chamado</span>' +
      '<button data-config title="Configuração">⚙</button>' +
      '<button data-recolher title="Recolher">–</button>' +
      '</div>' +
      '<div class="corpo">' +
      '<label class="campo">Preset<select data-preset></select></label>' +
      '<button class="acao" data-fechar-chamado>Fechar chamado</button>' +
      '<div class="linha">' +
      '<button class="acao secundaria" data-simular title="Preenche o modal e para antes de salvar">Simular</button>' +
      '<button class="acao secundaria" data-so-ocorrencia title="Lança a ocorrência sem fechar a OS">Só ocorrência</button>' +
      '</div>' +
      '<div class="linha">' +
      '<button class="acao secundaria" data-lote>Lote</button>' +
      '<button class="acao secundaria" data-log>Log</button>' +
      '</div>' +
      '<div class="status" data-status></div>' +
      '</div>';
    raiz.appendChild(container);

    refs = {
      painel: container,
      cabecalho: container.querySelector('[data-cabecalho]'),
      preset: container.querySelector('[data-preset]'),
      btnFechar: container.querySelector('[data-fechar-chamado]'),
      btnSimular: container.querySelector('[data-simular]'),
      btnOcorrencia: container.querySelector('[data-so-ocorrencia]'),
      btnLote: container.querySelector('[data-lote]'),
      btnLog: container.querySelector('[data-log]'),
      status: container.querySelector('[data-status]')
    };

    if (cfg.painel.x != null && cfg.painel.y != null) {
      container.style.left = cfg.painel.x + 'px';
      container.style.top = cfg.painel.y + 'px';
      container.style.right = 'auto';
      container.style.bottom = 'auto';
    }

    preencherPresets();
    refs.preset.addEventListener('change', function () {
      NV.config.definirPresetAtivo(refs.preset.value);
      status('Preset: ' + refs.preset.selectedOptions[0].textContent);
    });
    refs.btnFechar.addEventListener('click', () => executar({}));
    refs.btnSimular.addEventListener('click', () => executar({ execucaoSeca: true }));
    refs.btnOcorrencia.addEventListener('click', () => executar({ apenasOcorrencia: true }));
    refs.btnLote.addEventListener('click', abrirLote);
    refs.btnLog.addEventListener('click', abrirLog);
    container.querySelector('[data-config]').addEventListener('click', abrirConfig);
    container.querySelector('[data-recolher]').addEventListener('click', function () {
      const recolhido = container.classList.toggle('recolhido');
      NV.config.aplicar({ painel: { recolhido: recolhido } });
    });

    habilitarArrasto();
    registrarAtalhos();
    globaisRegistrados = true;
    status('Pronto. Abra uma OS e clique em Fechar chamado (' + cfg.atalhos.fechar + ').');
    return painel;
  };

  painel.alternar = function () {
    if (!host) return;
    refs.painel.classList.toggle('recolhido');
  };

  painel.status = status;
  painel.abrirConfig = abrirConfig;
  painel.executar = executar;

  NV.painel = painel;
})((globalThis.NV = globalThis.NV || {}));
