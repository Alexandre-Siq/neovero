/*
 * A grade do Monitor de Atendimento só desenha a janela visível. O lote precisa
 * rolar para enxergar os chamados que estão fora da tela e, na hora de abrir,
 * rolar de novo até a OS escolhida estar renderizada.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { carregarModulos } from './ajuda/ambiente.mjs';

const NV = await carregarModulos();

function monitorVirtual(numeros) {
  const ALTURA = 28;
  const VISIVEIS = 10;
  const box = document.createElement('div');
  let topo = 0;

  function render() {
    box.textContent = '';
    const inicio = Math.max(0, Math.floor(topo / ALTURA));
    numeros.slice(inicio, inicio + VISIVEIS).forEach(function (numero) {
      const linha = document.createElement('div');
      const span = document.createElement('span');
      span.textContent = numero;
      linha.appendChild(span);
      box.appendChild(linha);
    });
  }

  render();
  const alturaTotal = numeros.length * ALTURA;
  const alturaJanela = VISIVEIS * ALTURA;
  Object.defineProperty(box, 'scrollHeight', { configurable: true, get: () => alturaTotal });
  Object.defineProperty(box, 'clientHeight', { configurable: true, get: () => alturaJanela });
  Object.defineProperty(box, 'scrollTop', {
    configurable: true,
    get: () => topo,
    set: function (valor) {
      topo = Math.max(0, Math.min(valor, alturaTotal - alturaJanela));
      render();
    }
  });
  document.body.appendChild(box);
  return box;
}

test('rolando o monitor, o lote enxerga chamados fora da janela visível', async () => {
  const numeros = [];
  for (let i = 1; i <= 40; i += 1) numeros.push(String(202600000 + i));
  const box = monitorVirtual(numeros);

  const visiveis = NV.localizar.itensDoMonitor().map((item) => item.numero);
  assert.equal(visiveis.length, 10, 'a janela virtual mostra só uma fatia');
  assert.equal(visiveis[0], numeros[0]);
  assert.ok(!visiveis.includes(numeros[39]));

  const coletados = await NV.localizar.coletarItensDoMonitor({ espera: 0 });
  assert.equal(coletados.length, 40);
  assert.deepEqual(
    coletados.map((item) => item.numero),
    numeros
  );

  box.remove();
});

test('abrir uma OS que não está na janela rola até ela aparecer', async () => {
  const numeros = [];
  for (let i = 1; i <= 40; i += 1) numeros.push(String(202610000 + i));
  const box = monitorVirtual(numeros);

  const item = await NV.localizar.revelarItemDoMonitor(numeros[35], { espera: 0 });
  assert.ok(item, 'deveria achar a OS no fim da lista');
  assert.equal(item.numero, numeros[35]);
  assert.equal(item.el.isConnected, true);
  assert.ok(NV.localizar.itensDoMonitor().some((atual) => atual.numero === numeros[35]));

  box.remove();
});
