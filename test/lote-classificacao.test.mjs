/*
 * Lote com classificação por descrição: primeiro uma passada de leitura que classifica
 * cada OS (sem escrever nada), depois o fechamento com o serviço revisado.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { carregarModulos, montarApp, modalAberto } from './ajuda/ambiente.mjs';

const NV = await carregarModulos();
const SERVICOS = NV.classificar.SERVICOS_CONHECIDOS;

/* A réplica mostra uma OS por vez; a descrição muda conforme a OS aberta. */
function montarComDescricoes(descricoes) {
  const numeros = Object.keys(descricoes);
  const app = montarApp({ listaOs: numeros, numero: numeros[0], descricao: descricoes[numeros[0]] });
  document.querySelectorAll('.linha-os').forEach(function (linha) {
    const numero = linha.querySelector('.numero').textContent;
    linha.addEventListener('click', function () {
      app.estado.descricao = descricoes[numero];
      app.estado.render();
    });
  });
  return app;
}

function configurarPadrao(extra) {
  NV.config.restaurarPadrao();
  NV.config.aplicar(
    Object.assign(
      {
        presetAtivo: 'ti-automatico',
        tempos: { elemento: 800, modal: 800, salvar: 800, fechar: 800, intervalo: 15 },
        lote: { esperaEntreOs: 10 },
        cacheServicos: { valores: SERVICOS, atualizadoEm: new Date().toISOString() }
      },
      extra || {}
    )
  );
}

test('a passada de leitura classifica cada OS sem alterar nada', async () => {
  configurarPadrao();
  const app = montarComDescricoes({
    202602691: 'impressora sem tonner',
    202602690: 'computador nao esta ligando',
    202602688: 'notebook sem acesso a rede'
  });

  const levantamento = await NV.lote.classificar({ numeros: ['202602691', '202602690', '202602688'] });

  assert.equal(levantamento.itens.length, 3);
  assert.equal(levantamento.itens[0].servico, 'SUBSTITUIÇÃO DE TONNER/CILINDRO');
  assert.equal(levantamento.itens[1].servico, 'LIGAR EQUIPAMENTO');
  assert.equal(levantamento.itens[2].servico, 'EQUIPAMENTO SEM ACESSO A REDE/INTERNET');
  assert.equal(levantamento.itens[0].origem, 'regra');

  assert.equal(app.estado.ocorrencias.length, 0, 'nada deve ser lançado na leitura');
  assert.equal(app.estado.fechada, false);
  assert.equal(modalAberto(), null, 'o modal não deve ficar aberto');
});

test('o lote fecha cada OS com o serviço revisado', async () => {
  configurarPadrao();
  const app = montarComDescricoes({
    202602691: 'impressora sem tonner',
    202602690: 'computador nao esta ligando'
  });
  const fechadas = [];
  const original = NV.fluxo.fecharOS;
  NV.fluxo.fecharOS = async function (options) {
    const resultado = await original.call(NV.fluxo, options);
    fechadas.push({ servico: options.preset.servico, automatico: !!options.preset.servicoAutomatico });
    return resultado;
  };

  try {
    const resumo = await NV.lote.fechar({
      numeros: ['202602691', '202602690'],
      servicosPorOs: {
        202602691: 'SUBSTITUIÇÃO DE TONNER/CILINDRO',
        202602690: 'LIGAR EQUIPAMENTO'
      }
    });

    assert.equal(resumo.sucesso, 2, JSON.stringify(resumo.falhas, null, 2));
    assert.deepEqual(
      fechadas.map((f) => f.servico),
      ['SUBSTITUIÇÃO DE TONNER/CILINDRO', 'LIGAR EQUIPAMENTO']
    );
    assert.deepEqual(
      fechadas.map((f) => f.automatico),
      [false, false],
      'não deve reclassificar o que já foi revisado'
    );
    assert.equal(app.estado.fechada, true);
  } finally {
    NV.fluxo.fecharOS = original;
  }
});

test('sem revisão, o lote usa a classificação de cada chamado', async () => {
  configurarPadrao();
  const app = montarComDescricoes({
    202602691: 'impressora sem tonner',
    202602690: 'computador nao esta ligando'
  });

  const resumo = await NV.lote.fechar({ numeros: ['202602691', '202602690'] });

  assert.equal(resumo.sucesso, 2, JSON.stringify(resumo.falhas, null, 2));
  assert.equal(app.estado.ocorrencias[0].servico, 'LIGAR EQUIPAMENTO', 'última OS classificada pela descrição');
});

test('OS sem descrição cai no serviço do preset', async () => {
  configurarPadrao();
  montarComDescricoes({ 202602691: 'bom dia, obrigado' });

  const levantamento = await NV.lote.classificar({ numeros: ['202602691'] });

  assert.equal(levantamento.itens[0].origem, 'preset');
  assert.equal(levantamento.itens[0].servico, 'CONFIGURAÇÃO DE EQUIPAMENTOS');
});

test('lê a lista de serviços da tela quando não há cache', async () => {
  configurarPadrao({ cacheServicos: { valores: [], atualizadoEm: null } });
  const app = montarComDescricoes({ 202602691: 'impressora sem tonner' });

  const levantamento = await NV.lote.classificar({ numeros: ['202602691'] });

  assert.equal(levantamento.opcoes.length, SERVICOS.length);
  assert.equal(levantamento.itens[0].servico, 'SUBSTITUIÇÃO DE TONNER/CILINDRO');
  assert.equal(app.estado.ocorrencias.length, 0, 'abrir o modal para ler a lista não pode salvar nada');
  assert.equal(modalAberto(), null, 'o modal deve ser fechado no Cancelar');
});

test('cancelar interrompe a passada de leitura', async () => {
  configurarPadrao();
  montarComDescricoes({ 202602691: 'impressora sem tonner', 202602690: 'computador nao liga' });
  const sinal = NV.fluxo.criarSinal();
  sinal.cancelar();

  const levantamento = await NV.lote.classificar({ numeros: ['202602691', '202602690'], sinal: sinal });

  assert.equal(levantamento.itens.length, 0);
});
