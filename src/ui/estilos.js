/* CSS do painel. Vive dentro de um shadow root para não brigar com o tema do Neovero. */
(function (NV) {
  'use strict';

  NV.estilos = `
  :host { all: initial; }
  * { box-sizing: border-box; font-family: system-ui, "Segoe UI", Roboto, sans-serif; }

  .painel {
    position: fixed; right: 18px; bottom: 18px; z-index: 2147482000;
    width: 300px; background: #171a1f; color: #e8eaed;
    border: 1px solid #2c3138; border-radius: 12px;
    box-shadow: 0 12px 40px rgba(0,0,0,.45); overflow: hidden;
    font-size: 13px;
  }
  .painel.recolhido .corpo { display: none; }

  .cabecalho {
    display: flex; align-items: center; gap: 8px;
    padding: 10px 12px; background: #10b981; color: #06281f; cursor: move;
    font-weight: 700; letter-spacing: .2px;
  }
  .cabecalho .titulo { flex: 1; font-size: 13px; }
  .cabecalho button {
    background: rgba(0,0,0,.12); border: 0; color: inherit; cursor: pointer;
    width: 24px; height: 24px; border-radius: 6px; font-size: 14px; line-height: 1;
  }
  .cabecalho button:hover { background: rgba(0,0,0,.25); }

  .corpo { padding: 12px; display: grid; gap: 10px; }

  label.campo { display: grid; gap: 4px; font-size: 11px; text-transform: uppercase; color: #9aa4b2; letter-spacing: .4px; }
  select, input[type="text"], input[type="number"], textarea {
    width: 100%; background: #0f1216; color: #e8eaed; border: 1px solid #2c3138;
    border-radius: 8px; padding: 7px 9px; font-size: 13px;
  }
  textarea { min-height: 56px; resize: vertical; }
  select:focus, input:focus, textarea:focus { outline: 2px solid #10b981; outline-offset: -1px; }

  button.acao {
    border: 0; border-radius: 9px; padding: 10px 12px; font-size: 13px; font-weight: 700;
    cursor: pointer; background: #10b981; color: #06281f; width: 100%;
  }
  button.acao:hover { filter: brightness(1.08); }
  button.acao:disabled { opacity: .55; cursor: progress; }
  button.secundaria { background: #232830; color: #dfe3e8; font-weight: 600; }
  button.perigo { background: #7f1d1d; color: #fee2e2; }
  .linha { display: flex; gap: 6px; }
  .linha > * { flex: 1; }

  .status { font-size: 12px; color: #9aa4b2; min-height: 16px; line-height: 1.35; }
  .status.ok { color: #34d399; }
  .status.erro { color: #f87171; }
  .status.trabalhando { color: #fbbf24; }

  .aviso {
    background: #2a2210; border: 1px solid #7c5e10; color: #fde68a;
    padding: 8px 10px; border-radius: 8px; font-size: 12px; line-height: 1.4;
  }

  .sobreposicao {
    position: fixed; inset: 0; z-index: 2147482500; background: rgba(6,8,10,.65);
    display: flex; align-items: center; justify-content: center; padding: 24px;
  }
  .modal {
    width: min(720px, 100%); max-height: 86vh; overflow: auto;
    background: #171a1f; color: #e8eaed; border: 1px solid #2c3138;
    border-radius: 14px; box-shadow: 0 20px 60px rgba(0,0,0,.5);
  }
  .modal header {
    display: flex; align-items: center; gap: 10px; padding: 14px 16px;
    border-bottom: 1px solid #2c3138; font-weight: 700; position: sticky; top: 0; background: #171a1f;
  }
  .modal header .titulo { flex: 1; }
  .modal .conteudo { padding: 16px; display: grid; gap: 14px; }
  .modal footer { padding: 12px 16px; border-top: 1px solid #2c3138; display: flex; gap: 8px; justify-content: flex-end; }
  .modal footer button { width: auto; padding: 9px 16px; }

  .abas { display: flex; gap: 4px; padding: 0 16px; border-bottom: 1px solid #2c3138; }
  .abas button {
    background: none; border: 0; color: #9aa4b2; padding: 10px 12px; cursor: pointer;
    font-size: 13px; font-weight: 600; border-bottom: 2px solid transparent;
  }
  .abas button.ativa { color: #10b981; border-bottom-color: #10b981; }

  .grade2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .grade3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
  fieldset { border: 1px solid #2c3138; border-radius: 10px; padding: 12px; display: grid; gap: 10px; }
  legend { padding: 0 6px; font-size: 12px; text-transform: uppercase; color: #9aa4b2; letter-spacing: .4px; }

  label.check { display: flex; align-items: flex-start; gap: 8px; font-size: 13px; color: #dfe3e8; }
  label.check input { margin-top: 2px; }
  label.check small { display: block; color: #8b95a3; font-size: 11px; }

  ul.lista { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; max-height: 220px; overflow: auto; }
  ul.lista li {
    display: flex; align-items: center; gap: 8px; padding: 7px 9px;
    background: #0f1216; border: 1px solid #2c3138; border-radius: 8px; font-size: 12px;
  }
  ul.lista li .nome { flex: 1; }
  ul.lista li button { width: auto; padding: 5px 9px; font-size: 11px; }
  code { background: #0f1216; border: 1px solid #2c3138; border-radius: 5px; padding: 1px 5px; font-size: 11px; word-break: break-all; }

  pre.log {
    background: #0b0d10; border: 1px solid #2c3138; border-radius: 8px; padding: 10px;
    max-height: 320px; overflow: auto; font-size: 11px; line-height: 1.5;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre-wrap;
  }
  .log-erro { color: #f87171; }
  .log-aviso { color: #fbbf24; }
  .log-passo { color: #93c5fd; }

  .aviso-inline { font-size: 11px; color: #8b95a3; line-height: 1.45; }
  .badge { background: #232830; border-radius: 999px; padding: 2px 8px; font-size: 11px; color: #9aa4b2; }
  `;
})((globalThis.NV = globalThis.NV || {}));
