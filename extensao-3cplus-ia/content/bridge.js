/**
 * bridge.js — roda no mundo isolado padrão (content script normal).
 * Recebe os avisos do webrtc-hook.js (que roda no MAIN world, via
 * window.postMessage) e mostra num painel flutuante na própria página —
 * assim dá pra ver o resultado sem precisar abrir o DevTools.
 */
(function () {
  let painel;
  let lista;

  function criarPainel() {
    painel = document.createElement('div');
    painel.style.cssText = [
      'position:fixed', 'bottom:16px', 'right:16px', 'width:380px', 'max-height:300px',
      'overflow-y:auto', 'background:#111', 'color:#0f0', 'font:12px monospace',
      'padding:10px', 'border-radius:8px', 'z-index:2147483647', 'box-shadow:0 4px 16px rgba(0,0,0,.5)',
    ].join(';');
    const titulo = document.createElement('div');
    titulo.textContent = 'IA 3C Plus — diagnóstico WebRTC';
    titulo.style.cssText = 'color:#fff;font-weight:bold;margin-bottom:6px;';
    lista = document.createElement('div');
    painel.appendChild(titulo);
    painel.appendChild(lista);
    document.documentElement.appendChild(painel);
  }

  function logar(tipo, detalhe, quando) {
    if (!painel) criarPainel();
    const linha = document.createElement('div');
    const hora = new Date(quando).toLocaleTimeString('pt-BR');
    linha.textContent = `[${hora}] ${tipo} ${detalhe ? JSON.stringify(detalhe) : ''}`;
    lista.appendChild(linha);
    lista.scrollTop = lista.scrollHeight;
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const msg = event.data;
    if (!msg || msg.source !== '3cplus-ia-diag') return;
    logar(msg.tipo, msg.detalhe, msg.quando);
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', criarPainel);
  } else {
    criarPainel();
  }
})();
