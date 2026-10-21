/*
 * Fila de atendimento: fechar a partir da lista do Monitor, sem abrir a OS antes,
 * e fechar em sequência sem travar no que falhou.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { carregarModulos, montarApp, modalAberto } from './ajuda/ambiente.mjs';

const NV = await carregarModulos();

function configurarPadrao(extra) {
  NV.config.restaurarPadrao();
  NV.config.aplicar(
    Object.assign(
      {
        presetAtivo: 'ti-configuracao',
        tempos: { elemento: 800, modal: 800, salvar: 800, fechar: 800, intervalo: 15 },
        lote: { esperaEntreOs: 10, maximo: 25, pararNoPrimeiroErro: true }
      },
      extra || {}
    )
  );
  NV.fila.limparMemoria();
}

test('lista os chamados pendentes na ordem do Monitor', () => {
  configurarPadrao();
  montarApp({ listaOs: ['202602693', '202602691', '202602690'] });

  const pendentes = NV.fila.pendentes({ cache: false });

  assert.deepEqual(
    pendentes.map((p) => p.numero),
    ['202602693', '202602691', '202602690']
  );
  assert.equal(NV.fila.contar({ cache: false }), 3);
  assert.equal(NV.fila.proximo().numero, '202602693');
});

test('fecha uma OS escolhida na lista sem precisar abri-la antes', async () => {
  configurarPadrao();
  const app = montarApp({ listaOs: ['202602693', '202602691', '202602690'], numero: '202602693' });

  const resultado = await NV.fila.fecharUm('202602690', { agora: new Date(2026, 8, 9, 10, 30) });

  assert.equal(resultado.ok, true, JSON.stringify(resultado, null, 2));
  assert.equal(resultado.fechada, true);
  assert.equal(resultado.numeroOs, '202602690');
  assert.equal(app.estado.numero, '202602690', 'a OS pedida deveria ter sido aberta');
  assert.equal(app.estado.fechada, true);
  assert.equal(app.estado.ocorrencias[0].fim, '09/09/2026, 10:30');
});

test('o que já foi fechado sai da fila', async () => {
  configurarPadrao();
  montarApp({ listaOs: ['202602693', '202602691'] });

  await NV.fila.fecharUm('202602693', {});

  const numeros = NV.fila.pendentes({ cache: false }).map((p) => p.numero);
  assert.deepEqual(numeros, ['202602691'], 'a OS fechada não deve reaparecer como pendente');
  assert.equal(NV.fila.proximo().numero, '202602691');
});

test('"fechar o próximo" segue a ordem da lista', async () => {
  configurarPadrao();
  const app = montarApp({ listaOs: ['202602693', '202602691'] });

  const primeiro = await NV.fila.fecharProximo({});
  assert.equal(primeiro.numeroOs, '202602693');

  const segundo = await NV.fila.fecharProximo({});
  assert.equal(segundo.numeroOs, '202602691');
  assert.equal(app.estado.numero, '202602691');

  const vazio = await NV.fila.fecharProximo({});
  assert.equal(vazio.vazia, true);
});

test('sequência fecha todos os pendentes', async () => {
  configurarPadrao();
  const app = montarApp({ listaOs: ['202602693', '202602691', '202602690'] });

  const resumo = await NV.fila.fecharEmSequencia({});

  assert.equal(resumo.processadas, 3, JSON.stringify(resumo.falhas, null, 2));
  assert.equal(resumo.sucesso, 3);
  assert.equal(resumo.restantes, 0);
  assert.equal(app.estado.fechada, true);
});

test('sequência respeita o limite configurado', async () => {
  configurarPadrao({ lote: { esperaEntreOs: 10, maximo: 2, pararNoPrimeiroErro: true } });
  montarApp({ listaOs: ['202602693', '202602691', '202602690'] });

  const resumo = await NV.fila.fecharEmSequencia({});

  assert.equal(resumo.processadas, 2);
  assert.equal(resumo.restantes, 1);
});

test('OS que falhou sai da fila para não travar a sequência', async () => {
  configurarPadrao({ lote: { esperaEntreOs: 10, maximo: 25, pararNoPrimeiroErro: false } });
  const app = montarApp({
    listaOs: ['202602693', '202602691'],
    opcoesServico: ['TROCA DE TONER']
  });

  const resumo = await NV.fila.fecharEmSequencia({});

  assert.equal(resumo.processadas, 2, 'deveria ter tentado as duas');
  assert.equal(resumo.sucesso, 0);
  assert.equal(resumo.restantes, 0, 'as duas saíram da fila mesmo falhando');
  assert.equal(app.estado.fechada, false);

  const modal = modalAberto();
  if (modal) modal.remove();
});

test('sequência para no primeiro erro quando configurado', async () => {
  configurarPadrao();
  montarApp({ listaOs: ['202602693', '202602691'], opcoesServico: ['TROCA DE TONER'] });

  const resumo = await NV.fila.fecharEmSequencia({});

  assert.equal(resumo.processadas, 1);
  assert.equal(resumo.falhas.length, 1);

  const modal = modalAberto();
  if (modal) modal.remove();
});

test('cancelar interrompe a sequência', async () => {
  configurarPadrao();
  const app = montarApp({ listaOs: ['202602693', '202602691'] });
  const sinal = NV.fluxo.criarSinal();
  sinal.cancelar();

  const resumo = await NV.fila.fecharEmSequencia({ sinal: sinal });

  assert.equal(resumo.processadas, 0);
  assert.equal(app.estado.ocorrencias.length, 0);
});

test('limparMemoria devolve as OS processadas à fila', async () => {
  configurarPadrao();
  montarApp({ listaOs: ['202602693', '202602691'] });

  await NV.fila.fecharProximo({});
  assert.equal(NV.fila.contar({ cache: false }), 1);

  NV.fila.limparMemoria();
  assert.equal(NV.fila.contar({ cache: false }), 2);
});
