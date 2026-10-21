import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import vm from 'node:vm';

const exec = promisify(execFile);
const RAIZ = new URL('..', import.meta.url).pathname;

test('o build gera userscript e extensão compiláveis', async () => {
  await exec('node', ['build.mjs'], { cwd: RAIZ });

  const userscript = await readFile(RAIZ + 'dist/neovero-fechamento-rapido.user.js', 'utf8');
  const pkg = JSON.parse(await readFile(RAIZ + 'package.json', 'utf8'));

  assert.match(userscript, /^\/\/ ==UserScript==/);
  assert.match(userscript, new RegExp('@version\\s+' + pkg.version.replace(/\./g, '\\.')));
  assert.match(userscript, /@match\s+\*:\/\/\*\.neovero\.com\/\*/);
  assert.ok(!userscript.includes('__VERSAO__'), 'a versão deve ser substituída no build');

  /* Compila sem executar: pega erro de sintaxe em qualquer um dos módulos. */
  new vm.Script(userscript, { filename: 'userscript.js' });

  const conteudo = await readFile(RAIZ + 'dist/extensao/content.js', 'utf8');
  new vm.Script(conteudo, { filename: 'content.js' });

  const manifesto = JSON.parse(await readFile(RAIZ + 'dist/extensao/manifest.json', 'utf8'));
  assert.equal(manifesto.manifest_version, 3);
  assert.equal(manifesto.content_scripts[0].world, 'MAIN');
  assert.ok(manifesto.content_scripts[0].matches.length > 0);
});
