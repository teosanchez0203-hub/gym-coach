// ── Settings ──────────────────────────────────────────────────────────────────
function getSetting(k)        { return localStorage.getItem('gc_' + k) || ''; }
function setSetting(k, v)     { localStorage.setItem('gc_' + k, v); }
function getApiKey()          { return getSetting('groq_key'); }
function getSheetsUrl()       { return getSetting('sheets_url'); }

// ── System prompt ─────────────────────────────────────────────────────────────
async function buildSystemPrompt() {
  const sessions = await getAllSessions();
  sessions.sort((a, b) => b.id - a.id);

  const historyText = sessions.length === 0
    ? 'Sin sesiones previas todavía.'
    : sessions.slice(0, 20).map(s => {
        const d = new Date(s.fecha).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
        const exStr = (s.ejercicios || [])
          .filter(e => e.series?.length > 0)
          .map(e => `  · ${e.nombre}: ${e.series.map(s => `${s.kg}kg×${s.reps}`).join(' / ')}`)
          .join('\n');
        const ci = s.checkin ? ` [rodilla:${s.checkin.rodilla} energía:${s.checkin.energia}]` : '';
        return `${d} — ${SESSIONS[s.tipo]?.name || s.tipo}${ci} (${s.duracionMin || '?'} min)\n${exStr || '  Sin series registradas'}`;
      }).join('\n\n');

  // Active session context
  let currentCtx = '';
  if (state.selectedSessionType && state.activeExercises?.length > 0) {
    const ex = state.activeExercises[state.currentExIdx];
    const sets = state.sessionSets[ex?.id] || [];
    const allSets = Object.entries(state.sessionSets || {})
      .filter(([, v]) => v.length > 0)
      .map(([id, v]) => {
        const name = state.activeExercises.find(e => e.id === id)?.name || id;
        return `  · ${name}: ${v.map((s, i) => `S${i+1} ${s.kg}kg×${s.reps}`).join(', ')}`;
      }).join('\n');

    currentCtx = `

SESIÓN EN CURSO — ${SESSIONS[state.selectedSessionType]?.name}:
Check-in: rodilla ${state.checkin?.rodilla || '?'} · energía ${state.checkin?.energia || '?'} · comida ${state.checkin?.comida || '?'}
Ejercicio actual: ${ex?.name || '—'} (${state.currentExIdx + 1}/${state.activeExercises.length})
Series apuntadas hoy en este ejercicio: ${sets.length === 0 ? 'ninguna aún' : sets.map((s, i) => `S${i+1}: ${s.kg}kg×${s.reps}`).join(', ')}
${allSets ? `Series totales en sesión:\n${allSets}` : ''}`;
  }

  return `Eres el coach personal de Teo en el gym. Responde siempre en español. Sé directo, técnico y sin motivación vacía. Máximo 3-4 frases por respuesta.

PERFIL:
· Teo, 22 años, 1.67m, ~54-57kg
· Objetivo principal: ganar masa muscular. Prioridad estética: hombros anchos, pecho superior, espalda en V
· Nivel: principiante-intermedio, consolidando técnica
· PROTEGER siempre: rodilla izquierda (dolor recurrente post-lesión de tobillo) y hombro (sensible a exceso de press y deltoide posterior)
· Disponibilidad: 4 días/semana, sesiones 50-60 min

REGLAS CLAVE:
· No cambiar ejercicios principales durante 4-6 semanas
· Progresar primero en reps limpias, luego en peso
· Press inclinado DB es el ejercicio rey — siempre va primero
· Reverse fly: máximo 2 series/semana, nunca pasar de 5 kg
· Ayunas = no entrenar intenso. Mareo = parar todo
· Rodilla +6/10 o en reposo = solo bici suave

HISTORIAL COMPLETO DE SESIONES:
${historyText}${currentCtx}`;
}

// ── Chat state ────────────────────────────────────────────────────────────────
let chatHistory = [];

function clearChat() { chatHistory = []; }

// ── Send message (streaming) ──────────────────────────────────────────────────
async function sendChatMessage(userMessage) {
  const apiKey = getApiKey();
  if (!apiKey) {
    showSettings();
    showToast('Añade tu API key de Groq en Ajustes (es gratis)', 'warn');
    return null;
  }

  chatHistory.push({ role: 'user', content: userMessage });

  const systemPrompt = await buildSystemPrompt();

  // Groq API — formato OpenAI compatible, 100% gratis
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 600,
      stream: true,
      messages: [
        { role: 'system', content: systemPrompt },
        ...chatHistory
      ]
    })
  });

  if (!response.ok) {
    chatHistory.pop();
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `Error ${response.status}`);
  }

  return response;
}

// Stream response text into a DOM element
async function streamIntoElement(response, el) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop(); // keep incomplete line

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') continue;
      try {
        const evt = JSON.parse(data);
        // Groq/OpenAI streaming format
        const delta = evt.choices?.[0]?.delta?.content;
        if (delta) {
          fullText += delta;
          el.textContent = fullText;
          el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      } catch {}
    }
  }

  if (fullText) chatHistory.push({ role: 'assistant', content: fullText });
  return fullText;
}

// ── Chat UI ───────────────────────────────────────────────────────────────────
function openChat(prefill) {
  const overlay = document.getElementById('chat-overlay');
  overlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  // Show greeting if empty
  if (chatHistory.length === 0) {
    renderChatMessages();
    renderChatGreeting();
  } else {
    renderChatMessages();
  }

  const input = document.getElementById('chat-input');
  if (prefill) {
    input.value = prefill;
  }
  setTimeout(() => input.focus(), 100);
}

function closeChat() {
  document.getElementById('chat-overlay').classList.add('hidden');
  document.body.style.overflow = '';
}

function renderChatGreeting() {
  const msgs = document.getElementById('chat-messages');
  const inSession = state.selectedSessionType && state.activeExercises?.length > 0;
  const ex = inSession ? state.activeExercises[state.currentExIdx] : null;

  let greeting = 'Hola Teo. ¿En qué puedo ayudarte?';
  let chips = [];

  if (inSession && ex) {
    greeting = `Estás en ${SESSIONS[state.selectedSessionType]?.name}, en ${ex.name}. ¿Qué necesitas?`;
    chips = [
      '¿Bajo el peso o mantengo?',
      '¿Cuántas series más tiene sentido hacer?',
      'Siento molestia en el hombro, ¿qué hago?',
      '¿Estoy progresando bien en este ejercicio?'
    ];
  } else {
    chips = [
      '¿Cómo fue mi última sesión?',
      '¿Cuándo toca progresar en el press inclinado?',
      '¿Qué sesión me recomiendas hoy?',
      '¿Cómo va mi progreso general?'
    ];
  }

  msgs.innerHTML = `
    <div class="chat-ai-msg">
      <div class="chat-avatar">C</div>
      <div class="chat-bubble chat-bubble-ai">${greeting}</div>
    </div>
    <div class="chat-chips">
      ${chips.map(c => `<button class="chat-chip" onclick="submitChatChip(this)">${c}</button>`).join('')}
    </div>`;
  msgs.scrollTop = msgs.scrollHeight;
}

function renderChatMessages() {
  const msgs = document.getElementById('chat-messages');
  msgs.innerHTML = chatHistory.map(m => {
    if (m.role === 'user') {
      return `<div class="chat-user-msg"><div class="chat-bubble chat-bubble-user">${escapeHtml(m.content)}</div></div>`;
    }
    return `<div class="chat-ai-msg"><div class="chat-avatar">C</div><div class="chat-bubble chat-bubble-ai">${escapeHtml(m.content)}</div></div>`;
  }).join('');
  msgs.scrollTop = msgs.scrollHeight;
}

async function submitChat() {
  const input = document.getElementById('chat-input');
  const msg = input.value.trim();
  if (!msg) return;
  input.value = '';
  await sendChatWithMessage(msg);
}

async function submitChatChip(btn) {
  const msg = btn.textContent;
  document.querySelectorAll('.chat-chips').forEach(el => el.remove());
  await sendChatWithMessage(msg);
}

async function sendChatWithMessage(msg) {
  const msgs = document.getElementById('chat-messages');
  const sendBtn = document.getElementById('chat-send-btn');

  // Add user message
  msgs.innerHTML += `<div class="chat-user-msg"><div class="chat-bubble chat-bubble-user">${escapeHtml(msg)}</div></div>`;

  // Add AI placeholder
  const aiId = 'ai-' + Date.now();
  msgs.innerHTML += `
    <div class="chat-ai-msg" id="${aiId}">
      <div class="chat-avatar">C</div>
      <div class="chat-bubble chat-bubble-ai chat-bubble-loading">...</div>
    </div>`;
  msgs.scrollTop = msgs.scrollHeight;
  sendBtn.disabled = true;

  const bubbleEl = document.querySelector(`#${aiId} .chat-bubble`);
  bubbleEl.textContent = '';

  try {
    const response = await sendChatMessage(msg);
    if (!response) return;
    await streamIntoElement(response, bubbleEl);
  } catch (e) {
    bubbleEl.textContent = `Error: ${e.message}`;
    bubbleEl.style.color = 'var(--red)';
    chatHistory.pop(); // remove failed user message
  } finally {
    sendBtn.disabled = false;
    document.getElementById('chat-input').focus();
  }
}

function handleChatKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitChat(); }
}

function escapeHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
}

// ── Settings UI ───────────────────────────────────────────────────────────────
function showSettings() {
  document.getElementById('settings-overlay').classList.remove('hidden');
  document.getElementById('settings-key').value = getApiKey();
  document.getElementById('settings-sheets').value = getSheetsUrl();
  document.body.style.overflow = 'hidden';
}

function closeSettings() {
  document.getElementById('settings-overlay').classList.add('hidden');
  document.body.style.overflow = '';
}

function saveSettings() {
  const key = document.getElementById('settings-key').value.trim();
  const sheets = document.getElementById('settings-sheets').value.trim();
  setSetting('anthropic_key', key);
  setSetting('sheets_url', sheets);
  closeSettings();
  showToast('Ajustes guardados ✓', 'success');
}

function toggleKeyVisibility() {
  const input = document.getElementById('settings-key');
  const btn = document.getElementById('toggle-key-btn');
  if (input.type === 'password') {
    input.type = 'text';
    btn.textContent = 'Ocultar';
  } else {
    input.type = 'password';
    btn.textContent = 'Mostrar';
  }
}

// ── Google Sheets Export ──────────────────────────────────────────────────────
async function exportSessionToSheets(session) {
  const url = getSheetsUrl();
  if (!url) return false;

  try {
    await fetch(url, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({
        fecha: new Date(session.fecha).toLocaleDateString('es-ES'),
        hora: new Date(session.fecha).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
        sesion: SESSIONS[session.tipo]?.name || session.tipo,
        duracion: session.duracionMin || '',
        rodilla: session.checkin?.rodilla || '',
        energia: session.checkin?.energia || '',
        comida: session.checkin?.comida || '',
        ejercicios: (session.ejercicios || [])
          .filter(e => e.series?.length > 0)
          .map(e => ({ nombre: e.nombre, series: e.series }))
      })
    });
    return true;
  } catch (e) {
    console.warn('Sheets export failed:', e);
    return false;
  }
}
