/*
 * Ambiente de teste: um clone simplificado da tela do Neovero em jsdom.
 * Reproduz o que se vê nas capturas — combos customizados (div + lista flutuante),
 * campos de data em texto livre, rótulos com asterisco, botão "Fechar OS" só com
 * ícone e tooltip, e diálogo de confirmação — para exercitar o fluxo de ponta a ponta.
 */
import { JSDOM } from 'jsdom';

const OPCOES_OCORRENCIA = ['SUPORTE - TI', 'MANUTENÇÃO PREDIAL', 'HIGIENIZAÇÃO'];
const OPCOES_SERVICO = ['CONFIGURAÇÃO DE EQUIPAMENTOS', 'CONFIGURAÇÃO DE REDE', 'TROCA DE PEÇA'];

let jsdomInstancia = null;

/* jsdom não faz layout: todo elemento conectado é considerado visível. */
function simularLayout(janela) {
  janela.Element.prototype.getBoundingClientRect = function () {
    const estilo = janela.getComputedStyle(this);
    const oculto = estilo.display === 'none' || estilo.visibility === 'hidden';
    const largura = oculto ? 0 : 120;
    const altura = oculto ? 0 : 24;
    return { width: largura, height: altura, left: 0, top: 0, right: largura, bottom: altura, x: 0, y: 0 };
  };
}

export function prepararGlobais() {
  if (jsdomInstancia) return jsdomInstancia;

  jsdomInstancia = new JSDOM(
    '<!doctype html><html><head><title>Neovero</title></head><body></body></html>',
    {
      url: 'https://ishaoc.neovero.com/UI/Base/Menu.aspx',
      pretendToBeVisual: true
    }
  );

  const { window } = jsdomInstancia;
  simularLayout(window);

  const globais = [
    'window',
    'document',
    'navigator',
    'location',
    'localStorage',
    'Event',
    'MouseEvent',
    'KeyboardEvent',
    'Element',
    'Node',
    'HTMLElement',
    'HTMLInputElement',
    'HTMLTextAreaElement',
    'HTMLSelectElement',
    'CSS',
    'Blob',
    'FileReader',
    'getComputedStyle'
  ];
  globais.forEach(function (nome) {
    /* alguns globais do Node (navigator, location) só têm getter */
    Object.defineProperty(globalThis, nome, {
      value: window[nome],
      configurable: true,
      writable: true
    });
  });

  return jsdomInstancia;
}

export async function carregarModulos() {
  prepararGlobais();
  await import('../../src/util/text.js');
  await import('../../src/util/dates.js');
  await import('../../src/util/async.js');
  await import('../../src/util/dom.js');
  await import('../../src/core/log.js');
  await import('../../src/core/config.js');
  await import('../../src/core/localizar.js');
  await import('../../src/core/campos.js');
  await import('../../src/core/fluxo.js');
  await import('../../src/core/lote.js');
  return globalThis.NV;
}

function h(doc, tag, props, filhos) {
  const el = doc.createElement(tag);
  Object.keys(props || {}).forEach(function (chave) {
    if (chave === 'texto') el.textContent = props[chave];
    else if (chave === 'classe') el.className = props[chave];
    else el.setAttribute(chave, props[chave]);
  });
  (filhos || []).forEach(function (filho) {
    if (filho) el.appendChild(filho);
  });
  return el;
}

function combo(doc, nome, opcoes) {
  const gatilho = h(doc, 'div', {
    role: 'combobox',
    tabindex: '0',
    'data-combo': nome,
    classe: 'combo',
    texto: 'Selecione ...'
  });
  gatilho.addEventListener('click', function () {
    if (doc.querySelector('ul[data-lista="' + nome + '"]')) return;
    const lista = h(doc, 'ul', { role: 'listbox', 'data-lista': nome, classe: 'painel-opcoes' });
    opcoes.forEach(function (opcao) {
      const item = h(doc, 'li', { role: 'option', texto: opcao });
      item.addEventListener('click', function () {
        gatilho.textContent = opcao;
        lista.remove();
      });
      lista.appendChild(item);
    });
    doc.body.appendChild(lista);
  });
  return gatilho;
}

function campo(doc, rotuloTexto, controle, attrsRotulo) {
  const rotulo = h(doc, 'label', Object.assign({ texto: rotuloTexto, classe: 'rotulo' }, attrsRotulo || {}));
  return h(doc, 'div', { classe: 'campo' }, [rotulo, controle]);
}

/* Modal "Nova Ocorrência". Só fecha quando os obrigatórios estão preenchidos. */
function abrirModal(doc, estado) {
  const modal = h(doc, 'div', { role: 'dialog', classe: 'modal-ocorrencia' });
  const comboOcorrencia = combo(doc, 'ocorrencia', OPCOES_OCORRENCIA);
  const comboServico = combo(doc, 'servico', estado.opcoesServico || OPCOES_SERVICO);
  const dataOcorrencia = h(doc, 'input', { type: 'text', 'data-campo': 'dataOcorrencia' });
  const dataFinal = h(doc, 'input', { type: 'text', 'data-campo': 'dataFinal' });
  const radioInterno = h(doc, 'input', { type: 'radio', id: 'interno', name: 'local', checked: 'checked' });
  const radioExterno = h(doc, 'input', { type: 'radio', id: 'externo', name: 'local' });
  const selectCausa = h(doc, 'select', { 'data-campo': 'causa' }, [
    h(doc, 'option', { value: '', texto: 'Selecione ...' }),
    h(doc, 'option', { value: '1', texto: 'FALHA DE HARDWARE' }),
    h(doc, 'option', { value: '2', texto: 'ERRO DE CONFIGURAÇÃO' })
  ]);
  const observacao = h(doc, 'textarea', { 'data-campo': 'observacao' });
  const continuar = h(doc, 'input', { type: 'checkbox', id: 'continuar' });
  const erro = h(doc, 'div', { classe: 'erro-modal', role: 'alert' });
  erro.style.display = 'none';

  const botaoSalvar = h(doc, 'button', { texto: 'Salvar' });
  const botaoCancelar = h(doc, 'button', { texto: 'Cancelar' });

  modal.appendChild(h(doc, 'div', { classe: 'titulo-modal', texto: 'Nova Ocorrência' }));
  modal.appendChild(campo(doc, 'Ocorrência *', comboOcorrencia));
  modal.appendChild(campo(doc, 'Data da Ocorrência *', dataOcorrencia));
  modal.appendChild(campo(doc, 'Data Final do Serviço', dataFinal));
  modal.appendChild(
    h(doc, 'div', { classe: 'campo' }, [
      h(doc, 'label', { for: 'interno', texto: 'Interno' }),
      radioInterno,
      h(doc, 'label', { for: 'externo', texto: 'Externo' }),
      radioExterno
    ])
  );
  modal.appendChild(campo(doc, 'Causa', selectCausa));
  modal.appendChild(campo(doc, 'Serviço *', comboServico));
  modal.appendChild(campo(doc, 'Observação', observacao));
  modal.appendChild(h(doc, 'div', { classe: 'campo' }, [h(doc, 'label', { for: 'continuar', texto: 'Continuar Incluindo' }), continuar]));
  modal.appendChild(erro);
  modal.appendChild(h(doc, 'div', { classe: 'rodape-modal' }, [botaoCancelar, botaoSalvar]));

  botaoCancelar.addEventListener('click', () => modal.remove());
  botaoSalvar.addEventListener('click', function () {
    const faltando = [];
    if (comboOcorrencia.textContent === 'Selecione ...') faltando.push('Ocorrência');
    if (comboServico.textContent === 'Selecione ...') faltando.push('Serviço');
    if (!dataOcorrencia.value) faltando.push('Data da Ocorrência');
    if (faltando.length) {
      erro.style.display = '';
      erro.textContent = 'Erro: preencha os campos obrigatórios: ' + faltando.join(', ');
      return;
    }
    estado.ocorrencias.push({
      ocorrencia: comboOcorrencia.textContent,
      servico: comboServico.textContent,
      inicio: dataOcorrencia.value,
      fim: dataFinal.value,
      causa: selectCausa.options[selectCausa.selectedIndex].textContent,
      interno: radioInterno.checked,
      observacao: observacao.value
    });
    estado.renderOcorrencias();
    if (!continuar.checked) modal.remove();
  });

  doc.body.appendChild(modal);
  return modal;
}

/*
 * Cria um iframe de mesma origem e devolve o documento interno, para simular a
 * janela MDI do ASP.NET (Menu.aspx que carrega a tela da OS dentro de um frame).
 */
export function montarAppEmFrame(opcoes) {
  const doc = jsdomInstancia.window.document;
  doc.body.innerHTML = '';
  const iframe = doc.createElement('iframe');
  iframe.setAttribute('name', 'janelaOs');
  doc.body.appendChild(iframe);
  simularLayout(iframe.contentWindow);
  const app = montarApp(Object.assign({}, opcoes || {}, { documento: iframe.contentDocument }));
  app.iframe = iframe;
  return app;
}

/*
 * Monta a janela da OS. Opções:
 *   numero, abertura, comAtendimentoIniciado, opcoesServico, semTooltipFecharOs, documento
 */
export function montarApp(opcoes) {
  const opts = opcoes || {};
  const doc = opts.documento || jsdomInstancia.window.document;
  doc.body.innerHTML = '';

  const numero = opts.numero || '202602691';
  const estado = { ocorrencias: [], fechada: false, opcoesServico: opts.opcoesServico };

  const listaOcorrencias = h(doc, 'div', { classe: 'lista-ocorrencias' });
  const statusJanela = h(doc, 'span', { classe: 'status-os', texto: 'Aberta por KAUE HENRIQUE DOS SANTOS DIAS' });

  estado.renderOcorrencias = function () {
    listaOcorrencias.innerHTML = '';
    estado.ocorrencias.forEach(function (o) {
      listaOcorrencias.appendChild(
        h(doc, 'div', { classe: 'item-ocorrencia' }, [
          h(doc, 'span', { texto: o.inicio + ' solucionada em ' + o.fim }),
          h(doc, 'div', { texto: o.ocorrencia }),
          h(doc, 'div', { texto: o.servico })
        ])
      );
    });
  };

  /* Monitor de Atendimento: lista de OS à esquerda. */
  const monitor = h(doc, 'div', { classe: 'monitor' }, [h(doc, 'div', { classe: 'titulo', texto: 'Monitor de Atendimento' })]);
  (opts.listaOs || [numero]).forEach(function (n) {
    const linha = h(doc, 'div', { classe: 'linha-os', tabindex: '0' }, [
      h(doc, 'span', { classe: 'numero', texto: n }),
      h(doc, 'span', { classe: 'local', texto: '5º ANDAR - ÁREAS COMUNS (8030)' })
    ]);
    linha.addEventListener('click', function () {
      const titulo = doc.querySelector('.titulo-os');
      if (titulo) titulo.textContent = 'ORDEM DE SERVIÇO ' + n;
      estado.ocorrencias = [];
      estado.renderOcorrencias();
      statusJanela.textContent = 'Aberta por KAUE HENRIQUE DOS SANTOS DIAS';
    });
    monitor.appendChild(linha);
  });
  doc.body.appendChild(monitor);

  const botaoFechar = h(doc, 'button', Object.assign({ classe: 'icone-fechar', texto: '✓' }, opts.semTooltipFecharOs ? {} : { title: 'Fechar OS' }));
  const botaoIniciar = h(doc, 'button', { texto: 'Iniciar Atendimento' });
  if (opts.comAtendimentoIniciado) botaoIniciar.style.display = 'none';

  const cabecalho = h(doc, 'div', { classe: 'cabecalho-os' }, [
    h(doc, 'span', { classe: 'titulo-os', texto: 'ORDEM DE SERVIÇO ' + numero }),
    botaoFechar
  ]);

  const barra = h(doc, 'div', { classe: 'barra-os' }, [
    h(doc, 'button', { texto: 'Salvar' }),
    h(doc, 'button', { texto: 'Cancelar' }),
    botaoIniciar
  ]);

  const dados = h(doc, 'div', { classe: 'dados-os' }, [
    h(doc, 'div', { classe: 'celula' }, [h(doc, 'span', { texto: 'Requisição' }), h(doc, 'span', { texto: '14/08/2026 09:51' })]),
    h(doc, 'div', { classe: 'celula' }, [
      h(doc, 'span', { texto: 'Abertura' }),
      h(doc, 'span', { texto: opts.abertura || '14/08/2026 09:51' })
    ]),
    h(doc, 'div', { classe: 'celula' }, [h(doc, 'span', { texto: 'Atendimento' }), h(doc, 'span', { texto: 'Aguardando há 14 dias' })])
  ]);

  const requisicao = h(doc, 'div', { classe: 'requisicao' }, [
    h(doc, 'div', { texto: 'Requisição de Serviço' }),
    h(doc, 'div', { texto: 'computador da enfermagem nao esta ligando' })
  ]);

  const secaoOcorrencias = h(doc, 'div', { classe: 'secao' }, [
    h(doc, 'div', { classe: 'titulo-secao', texto: 'Ocorrências' }),
    listaOcorrencias
  ]);

  const botaoOcorrencia = h(doc, 'div', { classe: 'botao-adicionar' }, [
    h(doc, 'div', { classe: 'icone', texto: '☺' }),
    h(doc, 'span', { texto: 'Ocorrência' })
  ]);
  botaoOcorrencia.addEventListener('click', function () {
    abrirModal(doc, estado);
  });

  const barraAdicionar = h(doc, 'div', { classe: 'adicionar' }, [
    h(doc, 'div', { classe: 'titulo-adicionar', texto: 'Adicionar' }),
    botaoOcorrencia,
    h(doc, 'div', { classe: 'botao-adicionar' }, [h(doc, 'span', { texto: 'Serviço' })]),
    h(doc, 'div', { classe: 'botao-adicionar' }, [h(doc, 'span', { texto: 'Produto' })])
  ]);

  const janela = h(doc, 'div', { classe: 'janela-os' }, [
    cabecalho,
    barra,
    statusJanela,
    dados,
    requisicao,
    secaoOcorrencias,
    barraAdicionar
  ]);

  botaoIniciar.addEventListener('click', function () {
    botaoIniciar.style.display = 'none';
    estado.atendimentoIniciado = true;
  });

  botaoFechar.addEventListener('click', function () {
    if (doc.querySelector('.dialogo-confirmacao')) return;
    const dialogo = h(doc, 'div', { role: 'dialog', classe: 'dialogo-confirmacao' }, [
      h(doc, 'div', { texto: 'Confirma o encerramento desta Ordem de Serviço?' })
    ]);
    const sim = h(doc, 'button', { texto: 'Sim' });
    const nao = h(doc, 'button', { texto: 'Não' });
    sim.addEventListener('click', function () {
      dialogo.remove();
      estado.fechada = true;
      statusJanela.textContent = 'OS Encerrada por KAUE HENRIQUE DOS SANTOS DIAS';
    });
    nao.addEventListener('click', () => dialogo.remove());
    dialogo.appendChild(nao);
    dialogo.appendChild(sim);
    doc.body.appendChild(dialogo);
  });

  doc.body.appendChild(janela);
  return { doc, janela, estado, numero };
}

function documentos() {
  const doc = jsdomInstancia.window.document;
  const lista = [doc];
  doc.querySelectorAll('iframe').forEach(function (iframe) {
    if (iframe.contentDocument) lista.push(iframe.contentDocument);
  });
  return lista;
}

export function modalAberto() {
  for (const doc of documentos()) {
    const modal = doc.querySelector('.modal-ocorrencia');
    if (modal) return modal;
  }
  return null;
}

export function valorDoCampo(chave) {
  const modal = modalAberto();
  if (!modal) return null;
  if (chave === 'ocorrencia' || chave === 'servico') {
    const el = modal.querySelector('[data-combo="' + chave + '"]');
    return el ? el.textContent : null;
  }
  const el = modal.querySelector('[data-campo="' + chave + '"]');
  return el ? el.value : null;
}
