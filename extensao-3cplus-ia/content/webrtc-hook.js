/**
 * webrtc-hook.js — roda no "MAIN world" (contexto real da página, não o
 * mundo isolado padrão de content script), porque só assim dá pra
 * substituir o RTCPeerConnection que o JS da própria 3C Plus usa.
 *
 * Fase 2: além de avisar quando a ligação abre/fecha, agora:
 *  - captura o áudio remoto (voz do cliente) e manda pro backend via
 *    WebSocket (PCM16 mono 16kHz) pra transcrição em tempo real.
 *  - troca o que o microfone manda pela voz da IA (recebida do backend
 *    como MP3) assim que uma resposta fica pronta.
 */
(function () {
  const marcar = (tipo, detalhe) => {
    window.postMessage({ source: '3cplus-ia-diag', tipo, detalhe, quando: new Date().toISOString() }, '*');
  };

  const BACKEND_WS_URL = 'ws://localhost:4001';

  const OriginalRTCPeerConnection = window.RTCPeerConnection;
  if (!OriginalRTCPeerConnection) {
    marcar('erro', 'RTCPeerConnection não existe nessa página (não deve ser WebRTC nativo do navegador).');
    return;
  }

  // --- Reamostra Float32 (sampleRate do AudioContext) pra Int16 16kHz,
  // formato que a Deepgram espera (linear16, 16000Hz, mono). ---------------
  function paraInt16_16k(float32, sampleRateOrigem) {
    const razao = sampleRateOrigem / 16000;
    const tamanhoNovo = Math.floor(float32.length / razao);
    const int16 = new Int16Array(tamanhoNovo);
    for (let i = 0; i < tamanhoNovo; i++) {
      const amostra = float32[Math.floor(i * razao)];
      const limitada = Math.max(-1, Math.min(1, amostra));
      int16[i] = limitada < 0 ? limitada * 0x8000 : limitada * 0x7fff;
    }
    return int16;
  }

  /** Captura o áudio remoto (cliente) de uma MediaStream e manda os chunks por WebSocket. */
  function iniciarCapturaEEnvio(stream, ws) {
    const audioCtx = new AudioContext();
    const origem = audioCtx.createMediaStreamSource(stream);
    const processador = audioCtx.createScriptProcessor(4096, 1, 1);
    origem.connect(processador);
    // Precisa conectar num destino pra o ScriptProcessor rodar, mas com
    // ganho 0 pra não ecoar o áudio do cliente de volta na própria aba.
    const silencio = audioCtx.createGain();
    silencio.gain.value = 0;
    processador.connect(silencio);
    silencio.connect(audioCtx.destination);

    processador.onaudioprocess = (event) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      const dados = event.inputBuffer.getChannelData(0);
      const pcm16 = paraInt16_16k(dados, audioCtx.sampleRate);
      ws.send(pcm16.buffer);
    };

    return () => {
      processador.disconnect();
      origem.disconnect();
      audioCtx.close();
    };
  }

  /**
   * Cria um "microfone falso": um MediaStreamTrack de áudio controlado por
   * nós, que vira o que a ligação manda pro cliente no lugar do
   * microfone de verdade. Começa em silêncio; toca a voz da IA quando
   * chega.
   */
  function criarMicrofoneFalso() {
    const audioCtx = new AudioContext();
    const destino = audioCtx.createMediaStreamDestination();
    const track = destino.stream.getAudioTracks()[0];

    async function tocar(mp3Bytes) {
      const bufferAudio = await audioCtx.decodeAudioData(mp3Bytes.slice(0));
      const fonte = audioCtx.createBufferSource();
      fonte.buffer = bufferAudio;
      fonte.connect(destino);
      fonte.start();
    }

    return { track, tocar };
  }

  /** Liga tudo: WebSocket com o backend, captura do cliente, microfone falso. */
  function iniciarPipelineDeIA(pc, remoteStream) {
    const ws = new WebSocket(BACKEND_WS_URL);
    ws.binaryType = 'arraybuffer';
    let pararCaptura = null;
    const microfoneFalso = criarMicrofoneFalso();

    ws.addEventListener('open', () => {
      marcar('ia-backend-conectado', {});
      ws.send(JSON.stringify({ type: 'start' }));
      pararCaptura = iniciarCapturaEEnvio(remoteStream, ws);

      // Troca o que a ligação envia pelo nosso "microfone falso" — a
      // partir daqui, quem fala pro cliente é a IA, não o microfone real.
      const sender = pc.getSenders().find((s) => s.track && s.track.kind === 'audio');
      if (sender) sender.replaceTrack(microfoneFalso.track);
    });

    ws.addEventListener('message', (event) => {
      if (typeof event.data === 'string') {
        const msg = JSON.parse(event.data);
        marcar(msg.type === 'transcript' ? 'cliente-disse' : 'ia-vai-responder', { texto: msg.text });
        return;
      }
      microfoneFalso.tocar(event.data).catch((err) => marcar('erro-tocando-audio', { erro: err.message }));
    });

    ws.addEventListener('error', () => marcar('erro-ia-backend', { url: BACKEND_WS_URL }));
    ws.addEventListener('close', () => {
      marcar('ia-backend-desconectado', {});
      if (pararCaptura) pararCaptura();
    });

    pc.addEventListener('connectionstatechange', () => {
      if (pc.connectionState === 'closed' || pc.connectionState === 'failed') {
        ws.send(JSON.stringify({ type: 'stop' }));
        ws.close();
      }
    });
  }

  function RTCPeerConnectionHook(...args) {
    const pc = new OriginalRTCPeerConnection(...args);
    marcar('pc-criada', { configuracao: args[0] || null });

    pc.addEventListener('track', (event) => {
      marcar('audio-remoto-recebido', {
        kind: event.track.kind,
        streams: event.streams.length,
      });
      if (event.track.kind === 'audio' && event.streams[0]) {
        iniciarPipelineDeIA(pc, event.streams[0]);
      }
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
