/**
 * server.js — ponte entre a extensão "IA nas Ligações — 3C Plus" e os
 * serviços de IA.
 *
 * Protocolo WebSocket com a extensão (ws://localhost:PORT):
 *  - Extensão -> servidor: mensagens de texto JSON {type: "start"} /
 *    {type: "stop"}; mensagens binárias = PCM16 mono 16kHz (áudio do
 *    cliente, capturado do lado remoto da ligação).
 *  - Servidor -> extensão: {type: "transcript", text} (o que o cliente
 *    falou); {type: "reply_text", text} (o que a IA vai responder);
 *    mensagens binárias = MP3 (voz sintetizada, pra extensão tocar no
 *    lugar do microfone).
 *
 * Servidor -> Deepgram: streaming de voz->texto (wss://api.deepgram.com).
 * Servidor -> Anthropic: decide a resposta.
 * Servidor -> ElevenLabs: texto->voz.
 */

import 'dotenv/config';
import { WebSocketServer, WebSocket } from 'ws';
import http from 'node:http';

const PORT = process.env.PORT || 4001;
const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID;

const SYSTEM_PROMPT =
  process.env.SYSTEM_PROMPT ||
  'Você é uma atendente falando ao telefone. Seja breve, natural e direta — ' +
    'frases curtas, sem listas nem formatação, porque tudo é lido em voz alta.';

function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

// --- Deepgram (streaming STT) ---------------------------------------------

function openDeepgramStream({ onTranscript, onUtteranceEnd }) {
  if (!DEEPGRAM_API_KEY) throw new Error('DEEPGRAM_API_KEY não configurada.');
  const url =
    'wss://api.deepgram.com/v1/listen' +
    '?model=nova-2&language=pt-BR&encoding=linear16&sample_rate=16000&channels=1' +
    '&interim_results=true&endpointing=600&utterance_end_ms=1200';
  const dg = new WebSocket(url, { headers: { Authorization: `Token ${DEEPGRAM_API_KEY}` } });

  dg.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (msg.type === 'UtteranceEnd') {
      onUtteranceEnd();
      return;
    }
    const alt = msg.channel?.alternatives?.[0];
    if (alt?.transcript && msg.is_final) {
      onTranscript(alt.transcript);
    }
  });
  dg.on('error', (err) => log('Erro na conexão com a Deepgram:', err.message));

  return dg;
}

// --- Anthropic (decide a resposta) -----------------------------------------

async function gerarResposta(history) {
  if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY não configurada.');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 300,
      system: SYSTEM_PROMPT,
      messages: history,
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return (data.content || []).map((b) => b.text || '').join('').trim();
}

// --- ElevenLabs (texto -> voz) ----------------------------------------------

async function sintetizarVoz(texto) {
  if (!ELEVENLABS_API_KEY || !ELEVENLABS_VOICE_ID) {
    throw new Error('ELEVENLABS_API_KEY / ELEVENLABS_VOICE_ID não configuradas.');
  }
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'xi-api-key': ELEVENLABS_API_KEY,
    },
    body: JSON.stringify({
      text: texto,
      model_id: 'eleven_multilingual_v2',
      voice_settings: { stability: 0.4, similarity_boost: 0.8 },
    }),
  });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${await res.text()}`);
  return Buffer.from(await res.arrayBuffer());
}

// --- Sessão de uma ligação ---------------------------------------------------

function criarSessao(ws) {
  const history = [];
  let dg = null;
  let falandoAgora = false;

  function enviar(obj) {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
  }

  async function processarTurno(textoCliente) {
    history.push({ role: 'user', content: textoCliente });
    enviar({ type: 'transcript', text: textoCliente });

    let resposta;
    try {
      resposta = await gerarResposta(history);
    } catch (err) {
      log('Erro gerando resposta:', err.message);
      resposta = 'Desculpa, tive um problema aqui. Pode repetir?';
    }
    history.push({ role: 'assistant', content: resposta });
    enviar({ type: 'reply_text', text: resposta });

    try {
      const audio = await sintetizarVoz(resposta);
      if (ws.readyState === WebSocket.OPEN) ws.send(audio);
    } catch (err) {
      log('Erro sintetizando voz:', err.message);
    }
  }

  function iniciarDeepgram() {
    dg = openDeepgramStream({
      onTranscript: (texto) => {
        falandoAgora = true;
        criarSessao._bufferAtual = (criarSessao._bufferAtual || '') + ' ' + texto;
      },
      onUtteranceEnd: () => {
        const texto = (criarSessao._bufferAtual || '').trim();
        criarSessao._bufferAtual = '';
        falandoAgora = false;
        if (texto) processarTurno(texto).catch((err) => log('Erro no turno:', err.message));
      },
    });
  }

  return {
    onStart() {
      iniciarDeepgram();
      log('Sessão iniciada.');
    },
    onAudio(chunk) {
      if (dg && dg.readyState === WebSocket.OPEN) dg.send(chunk);
    },
    onStop() {
      if (dg) dg.close();
      log('Sessão encerrada.');
    },
  };
}

// --- Servidor WebSocket -------------------------------------------------------

const httpServer = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (ws) => {
  log('Extensão conectada.');
  const sessao = criarSessao(ws);

  ws.on('message', (data, isBinary) => {
    if (isBinary) {
      sessao.onAudio(data);
      return;
    }
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }
    if (msg.type === 'start') sessao.onStart();
    if (msg.type === 'stop') sessao.onStop();
  });

  ws.on('close', () => sessao.onStop());
});

httpServer.listen(PORT, () => log(`3cplus-ia-backend escutando na porta ${PORT}`));
