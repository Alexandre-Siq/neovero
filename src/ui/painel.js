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
    [refs.btnSimular, refs.btnOcorrencia, refs.btnLote, refs.btnConferir].forEach(function (b) {
      if (b) b.disabled = valor;
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
            aoConfirmar: confirmarFechamento,
            aoEscolherServico: escolherServico
          },
          opcoes || {}
        )
      );
      if (resultado.ok && resultado.execucaoSeca) {
        const problemas = (resultado.problemas || []).length;
        status(
          problemas
            ? '⚠ Simulação com ' + problemas + ' problema(s). Abra o Log e me mande o texto.'
            : '✓ Simulação: modal preenchido. Confira e salve manualmente.',
          problemas ? 'erro' : 'ok'
        );
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

  /* Grava uma regra nova a partir de uma correção do usuário. */
  function criarRegra(chave, servico) {
    const limpa = String(chave || '').trim();
    if (!limpa || !servico) return false;
    const cfg = NV.config.obter();
    const regras = NV.config.regrasDeClassificacao().map(function (r) {
      return { quando: (r.quando || []).slice(), servico: r.servico, peso: r.peso };
    });
    const existente = regras.filter(function (r) {
      return NV.text.equals(r.servico, servico);
    })[0];
    if (existente) {
      if (existente.quando.indexOf(limpa) < 0) existente.quando.push(limpa);
    } else {
      regras.push({ quando: [limpa], servico: servico });
    }
    NV.config.aplicar({ classificacao: Object.assign({}, cfg.classificacao, { regras: regras }) });
    NV.log.info('Regra criada', { chave: limpa, servico: servico });
    return true;
  }

  /* Confiança intermediária: o usuário escolhe entre as alternativas ranqueadas. */
  function escolherServico(info) {
    return new Promise(function (resolve) {
      const alternativas = (info.sugestao.alternativas || []).slice(0, 6);
      const palavra = NV.classificar.sugerirPalavraChave(info.descricao, NV.config.regrasDeClassificacao());
      const html =
        '<p style="margin:0 0 10px">Descrição do chamado:</p>' +
        '<p style="margin:0 0 12px"><code>' + esc(NV.text.truncate(info.descricao, 220)) + '</code></p>' +
        '<div class="aviso">Sugestão: <b>' + esc(info.sugestao.escolhido) + '</b> · confiança ' +
        Math.round((info.sugestao.confianca || 0) * 100) + '%' +
        (info.sugestao.regra ? ' (regra “' + esc(info.sugestao.regra.chave) + '”)' : ' (semelhança)') +
        '</div>' +
        '<ul class="lista" style="max-height:260px">' +
        alternativas
          .map(function (a) {
            return (
              '<li><span class="nome">' + esc(a.opcao) + '</span>' +
              '<span class="badge">' + Math.round(a.score * 100) + '%</span>' +
              '<button class="acao" data-opcao="' + esc(a.opcao) + '">Usar</button></li>'
            );
          })
          .join('') +
        '</ul>' +
        (palavra
          ? '<label class="check" style="margin-top:10px"><input type="checkbox" data-aprender checked>' +
            '<span>Criar regra para a palavra <input type="text" data-palavra value="' + esc(palavra) +
            '" style="width:150px;display:inline-block;margin:0 4px"> → o serviço escolhido' +
            '<small>Assim o próximo chamado parecido é classificado sozinho.</small></span></label>'
          : '');

      const sobre = abrirSobreposicao(
        'Qual serviço usar?',
        html,
        '<button class="acao secundaria" data-cancelar>Cancelar fechamento</button>' +
          (info.preset.servico ? '<button class="acao secundaria" data-preset>Usar o do preset</button>' : '') +
          '<button class="acao" data-sugerido>Usar a sugestão</button>'
      );

      const responder = function (valor) {
        /* Só aprende quando o usuário corrigiu a sugestão. */
        const aprender = sobre.querySelector('[data-aprender]');
        if (valor && aprender && aprender.checked && valor !== info.sugestao.escolhido) {
          const campo = sobre.querySelector('[data-palavra]');
          if (criarRegra(campo ? campo.value : palavra, valor)) {
            status('✓ Regra criada: “' + (campo ? campo.value : palavra) + '” → ' + valor, 'ok');
          }
        }
        sobre.remove();
        resolve(valor);
      };
      sobre.addEventListener('click', function (ev) {
        const alvo = ev.target;
        if (alvo.dataset && alvo.dataset.opcao) responder(alvo.dataset.opcao);
        else if (alvo.dataset && alvo.dataset.sugerido !== undefined) responder(info.sugestao.escolhido);
        else if (alvo.dataset && alvo.dataset.preset !== undefined) responder(info.preset.servico);
        else if (alvo.dataset && alvo.dataset.cancelar !== undefined) responder(null);
        else if (alvo === sobre) responder(null);
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

  /* ---------------- conferir tela (levantamento) ---------------- */

  async function conferirTela() {
    if (ocupado) return;
    definirOcupado(true);
    status('… conferindo a tela (não altera nada)', 'trabalhando');
    let relatorio = null;
    try {
      relatorio = await NV.fluxo.levantamento({});
    } catch (erro) {
      status('✗ ' + String(erro.message || erro), 'erro');
      definirOcupado(false);
      return;
    }
    definirOcupado(false);

    const problemas = relatorio.problemas || [];
    status(
      problemas.length ? '⚠ ' + problemas.length + ' ponto(s) a ajustar — veja o relatório' : '✓ Tela reconhecida por completo',
      problemas.length ? 'erro' : 'ok'
    );

    const linhaElemento = function (item) {
      const cor = item.encontrado ? '#34d399' : item.opcional ? '#fbbf24' : '#f87171';
      const icone = item.encontrado ? '✓' : item.opcional ? '·' : '✕';
      return (
        '<li><span style="color:' + cor + ';font-weight:700">' + icone + '</span>' +
        '<span class="nome">' + esc(item.rotulo) +
        (item.encontrado ? '<br><code>' + esc(item.descricao) + '</code>' + (item.emFrame ? ' <span class="badge">iframe</span>' : '') : '') +
        '</span></li>'
      );
    };

    const listaOpcoes = function (chave, rotulo) {
      const lista = (relatorio.opcoes || {})[chave];
      if (lista == null) return '<p class="aviso-inline">' + esc(rotulo) + ': lista não lida.</p>';
      return (
        '<p class="aviso-inline"><b>' + esc(rotulo) + '</b> (' + lista.length + '): ' +
        esc(lista.slice(0, 12).join(' · ')) + (lista.length > 12 ? ' …' : '') + '</p>'
      );
    };

    const conferencia = (relatorio.conferenciaDoPreset || [])
      .map(function (c) {
        const cor = c.situacao === 'exato' ? '#34d399' : c.situacao === 'aproximado' ? '#fbbf24' : '#f87171';
        return (
          '<li><span style="color:' + cor + ';font-weight:700">' +
          (c.situacao === 'exato' ? '✓' : c.situacao === 'aproximado' ? '≈' : '✕') +
          '</span><span class="nome">' + esc(c.campo) + ': “' + esc(c.valor) + '”' +
          (c.sugestao ? '<br>sugestão da produção: <code>' + esc(c.sugestao) + '</code>' : '') +
          '</span></li>'
        );
      })
      .join('');

    const html =
      '<div class="' + (problemas.length ? 'aviso' : 'aviso-inline') + '">' +
      (problemas.length
        ? '<b>' + problemas.length + ' ponto(s) a ajustar.</b> Clique em “Copiar para enviar” e mande o texto — ' +
          'com ele eu corrijo os seletores ou os presets.'
        : 'Tudo que o fluxo precisa foi localizado nesta tela.') +
      '</div>' +
      '<fieldset><legend>Ambiente</legend>' +
      '<p class="aviso-inline">OS em foco: <b>' + esc(relatorio.numeroOs || 'não identificada') + '</b> · ' +
      'abertura: ' + esc(relatorio.aberturaOs || 'não lida') + ' · ' +
      'documentos na página: ' + relatorio.documentos + (relatorio.documentos > 1 ? ' (usa iframe)' : '') + '</p>' +
      '<p class="aviso-inline">Descrição lida: ' +
      (relatorio.descricao ? '<code>' + esc(NV.text.truncate(relatorio.descricao, 200)) + '</code>' : '<b>não lida</b>') +
      '</p>' +
      '</fieldset>' +
      (relatorio.classificacao
        ? '<fieldset><legend>Classificação do serviço</legend>' +
          (relatorio.classificacao.escolhido
            ? '<p class="aviso-inline">→ <b>' + esc(relatorio.classificacao.escolhido) + '</b> · ' +
              Math.round(relatorio.classificacao.confianca * 100) + '% · ' + esc(relatorio.classificacao.origem) +
              (relatorio.classificacao.regra ? ' (regra “' + esc(relatorio.classificacao.regra.chave) + '”)' : '') + '</p>'
            : '<p class="aviso-inline" style="color:#f87171">Nenhum serviço classificado para esta descrição.</p>') +
          ((relatorio.classificacao.alternativas || []).length
            ? '<p class="aviso-inline">Alternativas: ' +
              esc(
                relatorio.classificacao.alternativas
                  .map(function (a) {
                    return a.opcao + ' (' + Math.round(a.score * 100) + '%)';
                  })
                  .join(' · ')
              ) + '</p>'
            : '') +
          '</fieldset>'
        : '') +
      '<fieldset><legend>Elementos</legend><ul class="lista" style="max-height:none">' +
      (relatorio.elementos || []).map(linhaElemento).join('') +
      '</ul></fieldset>' +
      '<fieldset><legend>Opções encontradas na produção</legend>' +
      listaOpcoes('ocorrencia', 'Ocorrência') +
      listaOpcoes('servico', 'Serviço') +
      listaOpcoes('causa', 'Causa') +
      '</fieldset>' +
      (conferencia
        ? '<fieldset><legend>Preset × produção</legend><ul class="lista" style="max-height:none">' + conferencia + '</ul></fieldset>'
        : '') +
      (problemas.length
        ? '<fieldset><legend>Problemas</legend><ul class="lista" style="max-height:none">' +
          problemas.map((p) => '<li><span class="nome">' + esc(p) + '</span></li>').join('') +
          '</ul></fieldset>'
        : '');

    const sobre = abrirSobreposicao(
      'Conferir tela',
      html,
      '<button class="acao secundaria" data-baixar>Baixar JSON completo</button>' +
        '<button class="acao" data-copiar>Copiar para enviar</button>'
    );

    sobre.querySelector('[data-copiar]').addEventListener('click', function () {
      const texto = NV.diagnostico.resumoTexto(relatorio);
      navigator.clipboard.writeText(texto).then(
        function () {
          sobre.querySelector('[data-copiar]').textContent = 'Copiado!';
        },
        function () {
          window.prompt('Copie o texto abaixo:', texto);
        }
      );
    });
    sobre.querySelector('[data-baixar]').addEventListener('click', function () {
      const completo = NV.diagnostico.capturar();
      completo.levantamento = relatorio;
      NV.diagnostico.baixar(completo);
    });
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

  async function executarLote(numeros, servicosPorOs) {
    sinalAtual = NV.fluxo.criarSinal();
    definirOcupado(true);
    try {
      const resumo = await NV.lote.fechar({
        numeros: numeros,
        servicosPorOs: servicosPorOs || null,
        aoProgresso: aoProgresso,
        sinal: sinalAtual,
        aoEscolherServico: escolherServico
      });
      status(
        '✓ ' + resumo.sucesso + '/' + resumo.total + ' fechadas' +
          (resumo.falhas.length ? ' · ' + resumo.falhas.length + ' falha(s), veja o log' : ''),
        resumo.falhas.length ? 'erro' : 'ok'
      );
      return resumo;
    } finally {
      definirOcupado(false);
      sinalAtual = null;
    }
  }

  /* Segunda etapa do lote: revisar o serviço classificado de cada OS antes de fechar. */
  function revisarClassificacaoDoLote(itens, opcoes) {
    return new Promise(function (resolve) {
      const semDescricao = itens.filter(function (i) {
        return !i.descricao;
      }).length;

      const opcoesHtml = function (selecionado) {
        return (opcoes || [])
          .map(function (o) {
            return '<option value="' + esc(o) + '"' + (o === selecionado ? ' selected' : '') + '>' + esc(o) + '</option>';
          })
          .join('');
      };

      const linhas = itens
        .map(function (item) {
          const confianca = item.sugestao && item.sugestao.confianca ? Math.round(item.sugestao.confianca * 100) + '%' : '—';
          const cor = !item.descricao ? '#f87171' : item.origem === 'regra' ? '#34d399' : '#fbbf24';
          return (
            '<li style="display:block">' +
            '<div style="display:flex;gap:8px;align-items:baseline">' +
            '<b>OS ' + esc(item.numero) + '</b>' +
            '<span class="nome" style="color:#8b95a3">' +
            esc(item.descricao ? NV.text.truncate(item.descricao, 90) : 'descrição não lida' + (item.erro ? ' (' + item.erro + ')' : '')) +
            '</span>' +
            '<span class="badge" style="color:' + cor + '">' + esc(item.origem) + ' ' + confianca + '</span>' +
            '</div>' +
            '<select data-os="' + esc(item.numero) + '" style="margin-top:6px">' +
            '<option value="">— não fechar esta OS —</option>' +
            opcoesHtml(item.servico) +
            '</select>' +
            '</li>'
          );
        })
        .join('');

      const html =
        '<div class="' + (semDescricao ? 'aviso' : 'aviso-inline') + '">' +
        (semDescricao
          ? '<b>' + semDescricao + ' OS sem descrição lida.</b> Confira o serviço nessas linhas antes de continuar.'
          : 'Serviço sugerido pela descrição de cada chamado. Ajuste o que estiver errado — o combo tem a lista completa.') +
        '</div>' +
        '<ul class="lista" style="max-height:420px">' + linhas + '</ul>';

      const sobre = abrirSobreposicao(
        'Revisar classificação do lote',
        html,
        '<button class="acao secundaria" data-cancelar>Cancelar</button>' +
          '<button class="acao" data-executar>Fechar as OS revisadas</button>'
      );

      sobre.addEventListener('click', function (ev) {
        const alvo = ev.target;
        if (alvo.dataset && alvo.dataset.executar !== undefined) {
          const mapa = {};
          const numeros = [];
          sobre.querySelectorAll('select[data-os]').forEach(function (sel) {
            if (!sel.value) return;
            mapa[sel.dataset.os] = sel.value;
            numeros.push(sel.dataset.os);
          });
          sobre.remove();
          resolve({ numeros: numeros, servicosPorOs: mapa });
        } else if ((alvo.dataset && alvo.dataset.cancelar !== undefined) || alvo === sobre) {
          sobre.remove();
          resolve(null);
        }
      });
    });
  }

  async function abrirLote() {
    const cfg = NV.config.obter();
    const preset = NV.config.presetAtivo() || {};
    const itens = NV.lote.listar();
    if (!itens.length) {
      status('Nenhuma OS encontrada na lista do Monitor de Atendimento', 'erro');
      return;
    }
    const automatico = !!preset.servicoAutomatico;
    const html =
      '<div class="aviso">O modo lote abre cada OS, lança a ocorrência e fecha. ' +
      (automatico
        ? 'Como o preset escolhe o serviço pela descrição, primeiro é feita uma passada de leitura ' +
          'para você <b>revisar a classificação</b> de cada chamado.'
        : 'Confirme antes que o preset é o correto para <b>todas</b> as OS marcadas.') +
      '</div>' +
      '<label class="campo">Preset aplicado<span class="badge">' + esc(preset.nome || '—') + '</span></label>' +
      '<ul class="lista">' +
      itens
        .map(function (i) {
          return '<li><input type="checkbox" value="' + esc(i.numero) + '"><span class="nome">OS ' + esc(i.numero) + '</span></li>';
        })
        .join('') +
      '</ul>' +
      '<label class="check"><input type="checkbox" data-parar ' + (cfg.lote.pararNoPrimeiroErro ? 'checked' : '') +
      '> Parar no primeiro erro</label>' +
      (automatico
        ? '<label class="check"><input type="checkbox" data-revisar checked>' +
          '<span>Revisar a classificação antes de fechar' +
          '<small>Desmarcado, usa a sugestão de cada chamado sem perguntar.</small></span></label>'
        : '');

    const sobre = abrirSobreposicao(
      'Fechar em lote',
      html,
      '<button class="acao secundaria" data-fechar>Cancelar</button><button class="acao" data-executar>Continuar</button>'
    );

    sobre.querySelector('[data-executar]').addEventListener('click', async function () {
      const numeros = Array.prototype.slice
        .call(sobre.querySelectorAll('ul.lista input[type="checkbox"]:checked'))
        .map((c) => c.value);
      if (!numeros.length) return;
      const revisar = automatico && sobre.querySelector('[data-revisar]').checked;
      NV.config.aplicar({ lote: { pararNoPrimeiroErro: sobre.querySelector('[data-parar]').checked } });
      sobre.remove();

      if (!revisar) {
        const ok = await confirmar(
          'Confirmar lote',
          'Serão fechadas <b>' + numeros.length + '</b> OS' +
            (automatico ? ', com o serviço decidido pela descrição de cada chamado' : ' com o preset atual') + '. Continuar?',
          'Executar'
        );
        if (!ok) return;
        await executarLote(numeros, null);
        return;
      }

      /* Passada de leitura: classifica cada OS sem escrever nada. */
      sinalAtual = NV.fluxo.criarSinal();
      definirOcupado(true);
      let levantamento;
      try {
        status('… lendo a descrição de ' + numeros.length + ' chamados', 'trabalhando');
        levantamento = await NV.lote.classificar({ numeros: numeros, aoProgresso: aoProgresso, sinal: sinalAtual });
      } catch (erro) {
        status('✗ ' + String(erro.message || erro), 'erro');
        return;
      } finally {
        definirOcupado(false);
        sinalAtual = null;
      }

      if (!levantamento.itens.length) {
        status('Nada para revisar', 'erro');
        return;
      }

      const revisado = await revisarClassificacaoDoLote(levantamento.itens, levantamento.opcoes);
      if (!revisado || !revisado.numeros.length) {
        status('Lote cancelado');
        return;
      }
      await executarLote(revisado.numeros, revisado.servicosPorOs);
    });
  }

  /* ---------------- configuração ---------------- */

  const CHAVES_SELETOR = [
    ['descricaoRequisicao', 'Descrição da requisição (texto do chamado)'],
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
      '<label class="check"><input type="checkbox" data-f="servicoAutomatico">' +
      '<span>Escolher o serviço pela descrição do chamado' +
      '<small>Usa as regras de ⚙ → Classificação. O campo "Serviço" acima passa a ser a reserva ' +
      'para quando não houver classificação confiável.</small></span></label>' +
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

  function htmlAbaClassificacao(cfg) {
    const regras = NV.config.regrasDeClassificacao();
    const cache = cfg.cacheServicos || {};
    const usandoPadrao = !(cfg.classificacao.regras || []).length;
    return (
      '<div class="aviso">As regras decidem o <b>Serviço</b> a partir da descrição do chamado. ' +
      'Formato: <code>palavra, outra palavra =&gt; NOME DO SERVIÇO</code>, uma por linha. ' +
      'Vence a palavra-chave mais longa que aparecer no texto; se nenhuma casar, entra a semelhança por palavras.</div>' +
      '<fieldset><legend>Lista de serviços da produção</legend>' +
      '<p class="aviso-inline">' +
      (cache.valores && cache.valores.length
        ? cache.valores.length + ' serviços em cache (lidos em ' + esc(String(cache.atualizadoEm || '').slice(0, 16).replace('T', ' ')) + ').'
        : 'Nenhuma lista lida ainda — use "Conferir tela" com um chamado aberto, ou o botão abaixo.') +
      '</p>' +
      '<button class="acao secundaria" data-ler-servicos>Ler a lista da tela agora</button>' +
      '</fieldset>' +
      '<fieldset><legend>Regras' + (usandoPadrao ? ' (usando as que vêm com o script)' : ' (personalizadas)') + '</legend>' +
      '<textarea data-regras style="min-height:220px;font-family:ui-monospace,Menlo,monospace;font-size:12px">' +
      esc(NV.classificar.regrasParaTexto(regras)) +
      '</textarea>' +
      '<div class="linha">' +
      '<button class="acao secundaria" data-restaurar-regras>Voltar às regras padrão</button>' +
      '<button class="acao secundaria" data-conferir-regras>Conferir contra a lista</button>' +
      '</div>' +
      '</fieldset>' +
      '<fieldset><legend>Testar</legend>' +
      '<label class="campo">Descrição de exemplo' +
      '<input type="text" data-teste placeholder="computador da enfermagem nao esta ligando"></label>' +
      '<button class="acao secundaria" data-testar>Classificar</button>' +
      '<div data-resultado-teste class="aviso-inline"></div>' +
      '</fieldset>' +
      '<fieldset><legend>Limites</legend>' +
      '<div class="grade2">' +
      '<label class="campo">Confiança mínima (0 a 1)' +
      '<input type="number" step="0.05" min="0" max="1" data-c="classificacao.minimoConfianca" value="' +
      cfg.classificacao.minimoConfianca + '"></label>' +
      '<label class="campo">Perguntar quando abaixo de' +
      '<input type="number" step="0.05" min="0" max="1" data-c="classificacao.confirmarAbaixoDe" value="' +
      cfg.classificacao.confirmarAbaixoDe + '"></label>' +
      '</div>' +
      '<label class="check"><input type="checkbox" data-c="classificacao.reservaDoPreset"' +
      (cfg.classificacao.reservaDoPreset ? ' checked' : '') +
      '><span>Usar o serviço do preset quando não houver classificação confiável' +
      '<small>Desmarcado, o fechamento é abortado em vez de usar a reserva.</small></span></label>' +
      '<p class="aviso-inline">Uma regra que casa vale 95%. Com "perguntar quando abaixo de" em 0,9, ' +
      'toda decisão por semelhança passa por você antes de ser usada.</p>' +
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
      ['classificacao', 'Classificação', htmlAbaClassificacao],
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
        if (campo.type === 'checkbox') campo.checked = !!valor;
        else campo.value = valor == null ? '' : valor;
      });
    }

    function coletarPreset() {
      const base = NV.config.obter().presets.find((p) => p.id === presetEmEdicao) || { id: presetEmEdicao };
      const preset = NV.config.clonar(base);
      conteudo.querySelectorAll('[data-f]').forEach(function (campo) {
        const caminho = campo.dataset.f;
        let valor;
        if (campo.type === 'checkbox') valor = campo.checked;
        else if (campo.type === 'number') valor = Number(campo.value);
        else valor = campo.value;
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
      if (abaAtual === 'classificacao') {
        const area = conteudo.querySelector('[data-regras]');
        const analise = NV.classificar.textoParaRegras(area ? area.value : '');
        if (analise.erros.length) {
          status('✗ ' + analise.erros[0], 'erro');
          return false;
        }
        const mudancas = coletarComportamento();
        /* Regras iguais às padrão continuam "padrão", para receberem melhorias futuras. */
        const iguaisAoPadrao =
          NV.classificar.regrasParaTexto(analise.regras) === NV.classificar.regrasParaTexto(NV.classificar.REGRAS_PADRAO);
        definirPorCaminho(mudancas, 'classificacao.regras', iguaisAoPadrao ? [] : analise.regras);
        NV.config.aplicar(mudancas);
        status('Classificação salva (' + analise.regras.length + ' regras)', 'ok');
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
      if (alvo.dataset && alvo.dataset.lerServicos !== undefined) {
        status('… lendo a lista de serviços da tela', 'trabalhando');
        try {
          const janela = NV.localizar.janelaOs();
          let modal = NV.localizar.modalOcorrencia();
          const precisaAbrir = !modal;
          if (precisaAbrir) {
            modal = await NV.fluxo.abrirModalOcorrencia(janela, NV.config.obter().tempos);
          }
          const lista = await NV.fluxo.opcoesDeServico(modal, { forcarLeitura: true });
          if (precisaAbrir) {
            const cancelar = NV.dom.acharBotao(modal, NV.config.obter().rotulos.cancelarModal, { min: 0.98 });
            if (cancelar) NV.dom.clicar(cancelar);
          }
          status('✓ ' + lista.opcoes.length + ' serviços lidos da tela', 'ok');
          renderAba('classificacao');
        } catch (erro) {
          status('✗ ' + String(erro.message || erro) + ' (abra um chamado antes)', 'erro');
        }
        return;
      }
      if (alvo.dataset && alvo.dataset.restaurarRegras !== undefined) {
        conteudo.querySelector('[data-regras]').value = NV.classificar.regrasParaTexto(NV.classificar.REGRAS_PADRAO);
        status('Regras padrão carregadas no editor (salve para aplicar)');
        return;
      }
      if (alvo.dataset && alvo.dataset.conferirRegras !== undefined) {
        const analise = NV.classificar.textoParaRegras(conteudo.querySelector('[data-regras]').value);
        const destino = conteudo.querySelector('[data-resultado-teste]');
        if (analise.erros.length) {
          destino.innerHTML = '<span style="color:#f87171">' + esc(analise.erros.join(' ')) + '</span>';
          return;
        }
        const invalidas = NV.classificar.conferirRegras(analise.regras, NV.config.servicosEmCache());
        destino.innerHTML = invalidas.length
          ? '<span style="color:#fbbf24">' + invalidas.length + ' regra(s) apontam para serviço inexistente:</span><br>' +
            invalidas
              .map(function (i) {
                return '· <code>' + esc(i.servico) + '</code>' + (i.sugestao ? ' → talvez <code>' + esc(i.sugestao) + '</code>' : '');
              })
              .join('<br>')
          : '<span style="color:#34d399">Todas as ' + analise.regras.length + ' regras apontam para serviços existentes.</span>';
        return;
      }
      if (alvo.dataset && alvo.dataset.testar !== undefined) {
        const descricao = conteudo.querySelector('[data-teste]').value;
        const analise = NV.classificar.textoParaRegras(conteudo.querySelector('[data-regras]').value);
        const sugestao = NV.classificar.sugerir(descricao, NV.config.servicosEmCache(), {
          regras: analise.regras.length ? analise.regras : NV.classificar.REGRAS_PADRAO,
          minimo: Number(conteudo.querySelector('[data-c="classificacao.minimoConfianca"]').value)
        });
        const destino = conteudo.querySelector('[data-resultado-teste]');
        destino.innerHTML = sugestao.escolhido
          ? '<span style="color:#34d399">→ <b>' + esc(sugestao.escolhido) + '</b></span> · ' +
            Math.round(sugestao.confianca * 100) + '% · ' + esc(sugestao.origem) +
            (sugestao.regra ? ' (regra “' + esc(sugestao.regra.chave) + '”)' : '') +
            (sugestao.alternativas.length > 1
              ? '<br>alternativas: ' +
                esc(
                  sugestao.alternativas
                    .slice(1, 4)
                    .map(function (a) {
                      return a.opcao + ' (' + Math.round(a.score * 100) + '%)';
                    })
                    .join(' · ')
                )
              : '')
          : '<span style="color:#f87171">Sem classificação.</span> ' + esc((sugestao.avisos || []).join(' '));
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
      '<button class="acao secundaria" data-conferir title="Só leitura: mostra o que o script encontra nesta tela">Conferir tela</button>' +
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
      btnConferir: container.querySelector('[data-conferir]'),
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
    refs.btnConferir.addEventListener('click', conferirTela);
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
