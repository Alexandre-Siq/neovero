/*
 * O lote segue depois de uma falha. Com "parar no primeiro erro", as OS seguintes
 * ficam pendentes. O painel oferece tentar de novo só as que falharam.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { carregarModulos, montarApp } from './ajuda/ambiente.mjs';

const NV = await carregarModulos();
await import('../src/ui/estilos.js');
await import('../src/ui/aprender.js');
await import('../src/ui/lista.js');
await import('../src/ui/painel.js');

const SERVICOS = NV.classificar.SERVICOS_CONHECIDOS;

function configurar(extra) {
  NV.config.restaurarPadrao();
  NV.config.aplicar(
    Object.assign(
      {
        presetAtivo: 'ti-automatico',
        tempos: { elemento: 800, modal: 800, salvar: 800, fechar: 800, intervalo: 15 },
        lote: { esperaEntreOs: 10, maximo: 20, pararNoPrimeiroErro: false },
        cacheServicos: { valores: SERVICOS, atualizadoEm: new Date().toISOString() }
      },
      extra || {}
    )
  );
}

function montar() {
  const descricoes = {
    202602691: 'impressora sem tonner',
    202602690: 'computador nao esta ligando',
    202602688: 'notebook sem acesso a rede'
  };
  const numeros = Object.keys(descricoes);
  const app = montarApp({ listaOs: numeros, numero: numeros[0], descricao: descricoes[numeros[0]], opcoesServico: SERVICOS });
  document.querySelectorAll('.linha-os').forEach(function (linha) {
    const numero = linha.querySelector('.numero').textContent;
    linha.addEventListener('click', function () {
      app.estado.descricao = descricoes[numero];
      app.estado.render();
    });
  });
  return app;
}

const SERVICOS_REVISADOS = {
  202602691: 'SUBSTITUIÇÃO DE TONNER/CILINDRO',
  202602690: 'LIGAR EQUIPAMENTO',
  202602688: 'EQUIPAMENTO SEM ACESSO A REDE/INTERNET'
};

test('sem parar no primeiro erro, o lote fecha as outras depois da falha', async () => {
  configurar();
  const app = montar();
  const original = NV.fluxo.fecharOS;
  NV.fluxo.fecharOS = async function (options) {
    if (app.estado.numero === '202602691') {
      return { ok: false, erro: 'o combo recusou o serviço', numeroOs: '202602691' };
    }
    return original.call(NV.fluxo, options);
  };
  try {
    const resumo = await NV.lote.fechar({
      numeros: ['202602691', '202602690', '202602688'],
      servicosPorOs: SERVICOS_REVISADOS
    });
    assert.equal(resumo.processadas, 3);
    assert.equal(resumo.sucesso, 2, JSON.stringify(resumo.falhas, null, 2));
    assert.equal(resumo.falhas.length, 1);
    assert.equal(resumo.falhas[0].numeroOs, '202602691');
    assert.deepEqual(resumo.pendentes, []);
    assert.equal(resumo.interrompido, false);
    assert.equal(app.estado.fechada, true);
  } finally {
    NV.fluxo.fecharOS = original;
  }
});

test('parar no primeiro erro deixa as seguintes como pendentes', async () => {
  configurar({ lote: { esperaEntreOs: 10, maximo: 20, pararNoPrimeiroErro: true } });
  const app = montar();
  const original = NV.fluxo.fecharOS;
  NV.fluxo.fecharOS = async function () {
    return { ok: false, erro: 'o combo recusou o serviço', numeroOs: app.estado.numero };
  };
  try {
    const resumo = await NV.lote.fechar({
      numeros: ['202602691', '202602690', '202602688'],
      servicosPorOs: SERVICOS_REVISADOS
    });
    assert.equal(resumo.processadas, 1);
    assert.equal(resumo.interrompido, true);
    assert.equal(resumo.motivo, 'erro');
    assert.deepEqual(resumo.pendentes, ['202602690', '202602688']);
  } finally {
    NV.fluxo.fecharOS = original;
  }
});

test('o resumo oferece tentar de novo e continuar as restantes', async () => {
  configurar();
  montarApp();
  NV.painel.montar();
  const sombra = document.querySelector('[data-nv-ui="painel"]').shadowRoot;

  const limpo = await NV.painel.decidirDepoisDoLote({
    total: 2,
    sucesso: 2,
    falhas: [],
    pendentes: [],
    interrompido: false
  });
  assert.equal(limpo, null);

  const promessa = NV.painel.decidirDepoisDoLote({
    total: 3,
    sucesso: 0,
    falhas: [{ ok: false, numeroOs: '202602691', erro: 'o combo recusou o serviço', servicoUsado: 'LIGAR EQUIPAMENTO' }],
    pendentes: ['202602690', '202602688'],
    interrompido: true,
    motivo: 'erro'
  });
  const sobre = sombra.querySelector('.sobreposicao');
  assert.match(sobre.textContent, /combo recusou/);
  assert.match(sobre.textContent, /202602690/);
  assert.ok(sobre.querySelector('[data-retry]'));
  assert.ok(sobre.querySelector('[data-continuar]'));

  sobre.querySelector('[data-retry]').click();
  const decisao = await promessa;
  assert.equal(decisao.acao, 'retry');
  assert.deepEqual(decisao.numeros, ['202602691']);

  const continuar = NV.painel.decidirDepoisDoLote({
    total: 3,
    sucesso: 1,
    falhas: [],
    pendentes: ['202602688'],
    interrompido: true,
    motivo: 'cancelado'
  });
  sombra.querySelector('[data-continuar]').click();
  assert.deepEqual((await continuar).numeros, ['202602688']);
});
