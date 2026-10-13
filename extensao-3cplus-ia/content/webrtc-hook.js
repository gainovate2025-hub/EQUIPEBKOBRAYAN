/**
 * webrtc-hook.js — roda no "MAIN world" (contexto real da página, não o
 * mundo isolado padrão de content script), porque só assim dá pra
 * substituir o RTCPeerConnection que o JS da própria 3C Plus usa.
 *
 * Fase 1 (diagnóstico): só detecta e avisa quando:
 *  - uma RTCPeerConnection é criada (a 3C Plus está abrindo uma ligação)
 *  - chega áudio remoto (voz do cliente) — evento "track"
 *  - o navegador manda áudio local (seu microfone) — via addTrack/getUserMedia
 *
 * Não grava nem altera nada ainda — só confirma que dá pra "ver" a
 * ligação acontecendo, antes de tentar interceptar de verdade.
 */
(function () {
  const marcar = (tipo, detalhe) => {
    window.postMessage({ source: '3cplus-ia-diag', tipo, detalhe, quando: new Date().toISOString() }, '*');
  };

  const OriginalRTCPeerConnection = window.RTCPeerConnection;
  if (!OriginalRTCPeerConnection) {
    marcar('erro', 'RTCPeerConnection não existe nessa página (não deve ser WebRTC nativo do navegador).');
    return;
  }

  function RTCPeerConnectionHook(...args) {
    const pc = new OriginalRTCPeerConnection(...args);
    marcar('pc-criada', { configuracao: args[0] || null });

    pc.addEventListener('track', (event) => {
      marcar('audio-remoto-recebido', {
        kind: event.track.kind,
        streams: event.streams.length,
      });
    });

    const originalAddTrack = pc.addTrack.bind(pc);
    pc.addTrack = (track, ...streams) => {
      marcar('audio-local-enviado', { kind: track.kind, label: track.label });
      return originalAddTrack(track, ...streams);
    };

    pc.addEventListener('connectionstatechange', () => {
      marcar('pc-estado', pc.connectionState);
    });

    return pc;
  }
  RTCPeerConnectionHook.prototype = OriginalRTCPeerConnection.prototype;
  window.RTCPeerConnection = RTCPeerConnectionHook;

  // getUserMedia também é interceptado separadamente: confirma que o
  // microfone foi pedido, mesmo que a lib use uma RTCPeerConnection
  // própria (algumas libs de call center embrulham isso).
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      marcar('getusermedia-chamado', constraints);
      const stream = await originalGetUserMedia(constraints);
      marcar('getusermedia-concedido', { tracks: stream.getTracks().map((t) => t.kind) });
      return stream;
    };
  }

  marcar('hook-instalado', { url: location.href });
})();
