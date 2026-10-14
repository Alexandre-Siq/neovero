import test from 'node:test';
import assert from 'node:assert/strict';

await import('../src/util/async.js');
const { async: espera } = globalThis.NV;

test('waitFor resolve quando a condição fica verdadeira', async () => {
  let contador = 0;
  const valor = await espera.waitFor(() => (++contador >= 3 ? 'pronto' : null), { timeout: 1000, intervalo: 10 });
  assert.equal(valor, 'pronto');
  assert.equal(contador, 3);
});

test('waitFor estoura o timeout com mensagem descritiva', async () => {
  await assert.rejects(
    () => espera.waitFor(() => null, { timeout: 60, intervalo: 10, rotulo: 'modal de teste' }),
    (erro) => {
      assert.equal(erro.name, 'PassoError');
      assert.match(erro.message, /modal de teste/);
      return true;
    }
  );
});

test('waitFor não deixa exceção da condição vazar antes do timeout', async () => {
  let tentativas = 0;
  const valor = await espera.waitFor(
    () => {
      tentativas += 1;
      if (tentativas < 2) throw new Error('ainda não renderizou');
      return true;
    },
    { timeout: 500, intervalo: 10 }
  );
  assert.equal(valor, true);
});

test('waitUntilGone espera o elemento desaparecer', async () => {
  let presente = true;
  setTimeout(() => {
    presente = false;
  }, 40);
  await espera.waitUntilGone(() => presente, { timeout: 1000, intervalo: 10 });
  assert.equal(presente, false);
});

test('tentar repete até o limite e propaga o último erro', async () => {
  let chamadas = 0;
  await assert.rejects(
    () =>
      espera.tentar(
        () => {
          chamadas += 1;
          throw new Error('falhou ' + chamadas);
        },
        { tentativas: 3, espera: 1 }
      ),
    /falhou 3/
  );
  assert.equal(chamadas, 3);
});
