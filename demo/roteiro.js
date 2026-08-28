/*
 * Monta a réplica da tela e mostra um roteiro curto de teste manual.
 * Usado na página de demonstração autônoma (dist/demo-autonomo.html).
 */
(function () {
  'use strict';

  window.AppFalso.montar({ numero: '202602691' });

  const caixa = document.createElement('div');
  caixa.setAttribute('data-nv-ui', 'roteiro');
  caixa.style.cssText = [
    'position:fixed',
    'left:16px',
    'bottom:16px',
    'width:320px',
    'z-index:2147482000',
    'background:#161b22',
    'color:#e8eaed',
    'border:1px solid #2c3138',
    'border-radius:12px',
    'padding:14px',
    'font:13px/1.5 system-ui,Segoe UI,sans-serif',
    'box-shadow:0 12px 40px rgba(0,0,0,.45)'
  ].join(';');

  caixa.innerHTML =
    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">' +
    '<b style="flex:1">Roteiro de teste</b>' +
    '<button data-fechar style="background:#232830;border:0;color:#dfe3e8;border-radius:6px;width:24px;height:24px;cursor:pointer">✕</button>' +
    '</div>' +
    '<p style="margin:0 0 8px;color:#9aa4b2">Esta é uma <b>réplica</b> da tela do Neovero. Nenhum chamado real é tocado.</p>' +
    '<ol style="margin:0 0 8px;padding-left:18px">' +
    '<li>No painel verde à direita, clique em <b>Simular</b>: o modal abre preenchido. Confira ocorrência, datas e serviço, e clique em Cancelar.</li>' +
    '<li>Clique em <b>Fechar chamado</b> e confirme. A OS deve virar “OS Encerrada por …”.</li>' +
    '<li>Clique em outra OS na lista da esquerda e teste o atalho <b>Alt+F</b>.</li>' +
    '<li>Clique em <b>Log</b> para ver o passo a passo.</li>' +
    '</ol>' +
    '<button data-recomecar style="background:#232830;border:0;color:#dfe3e8;border-radius:8px;padding:8px 12px;cursor:pointer;width:100%">Recomeçar a tela</button>';

  caixa.querySelector('[data-fechar]').addEventListener('click', function () {
    caixa.remove();
  });
  caixa.querySelector('[data-recomecar]').addEventListener('click', function () {
    window.AppFalso.montar({ numero: '202602691' });
  });

  document.body.appendChild(caixa);
})();
