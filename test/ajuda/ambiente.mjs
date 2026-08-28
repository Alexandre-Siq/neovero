/*
 * Ambiente de teste: jsdom + a mesma réplica da tela do Neovero usada nas páginas de
 * demonstração (demo/app-falso.js). Fonte única, para o que os testes exercitam ser
 * exatamente o que o usuário vê ao abrir dist/autoteste.html.
 */
import { JSDOM } from 'jsdom';

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
  await import('../../src/core/classificar.js');
  await import('../../src/core/localizar.js');
  await import('../../src/core/campos.js');
  await import('../../src/core/fluxo.js');
  await import('../../src/core/lote.js');
  await import('../../src/core/diagnostico.js');
  /* Script de página: registra window.AppFalso ao ser carregado. */
  await import('../../demo/app-falso.js');
  return globalThis.NV;
}

/*
 * Monta a réplica. Opções repassadas para AppFalso.montar:
 *   numero, listaOs, abertura, opcoesServico, semTooltipFecharOs, comAtendimentoIniciado
 */
export function montarApp(opcoes) {
  return jsdomInstancia.window.AppFalso.montar(Object.assign({ numero: '202602691' }, opcoes || {}));
}

/* Réplica dentro de um iframe de mesma origem, como nas janelas MDI do ASP.NET. */
export function montarAppEmFrame(opcoes) {
  const app = jsdomInstancia.window.AppFalso.emIframe(Object.assign({ numero: '202602691' }, opcoes || {}));
  if (!app) throw new Error('não foi possível acessar o conteúdo do iframe');
  simularLayout(app.iframe.contentWindow);
  return app;
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
