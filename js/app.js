// ── State ─────────────────────────────────────────────────────────────────────
const state = {
  checkin: null,
  checkinTemp: {},
  safetyWarnings: [],
  selectedSessionType: null,
  activeExercises: [],
  currentExIdx: 0,
  sessionSets: {},      // exerciseId → [{kg, reps}]
  lastWeights: {},      // exerciseId → kg (number)
  lastTexts: {},        // exerciseId → "15×12 · 15×10"
  inputKg: 0,
  inputReps: 12,
  restTimerInterval: null,
  restRemaining: 0,
  restTotal: 0,
  sessionStartTime: null
};

// ── Screen navigation ──────────────────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'instant' });
}

// ── Audio ──────────────────────────────────────────────────────────────────────
function playBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.value = 830;
    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.9);
    osc.start();
    osc.stop(ctx.currentTime + 0.9);
  } catch (e) {}
}

function vibrate(pattern) {
  try { navigator.vibrate && navigator.vibrate(pattern); } catch (e) {}
}

// ── Utilities ──────────────────────────────────────────────────────────────────
function formatKg(n) {
  const v = parseFloat(n);
  if (isNaN(v)) return '0';
  return v % 1 === 0 ? String(v) : String(v);
}

function formatTime(sec) {
  if (sec <= 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatRest(sec) {
  if (!sec) return '—';
  if (sec >= 60) return `${Math.round(sec / 60)} min`;
  return `${sec}s`;
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function dayTimeLabel() {
  const now = new Date();
  const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const time = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  return `${days[now.getDay()]} · ${now.getDate()} ${months[now.getMonth()]} · ${time}`;
}

let toastTimeout;
function showToast(msg, type = 'info') {
  clearTimeout(toastTimeout);
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast toast-${type} show`;
  toastTimeout = setTimeout(() => t.classList.remove('show'), 3500);
}

// ── A: Check-in ───────────────────────────────────────────────────────────────
function initCheckin() {
  skipTimer();
  state.checkinTemp = {};
  state.checkin = null;
  showScreen('screen-checkin');
  document.querySelectorAll('.ci-btn').forEach(b => b.classList.remove('selected'));
  document.getElementById('btn-next-checkin').disabled = true;
  const el = document.getElementById('ci-day-label');
  if (el) el.textContent = dayTimeLabel();
}

function selectCheckinOption(group, value, btn) {
  document.querySelectorAll(`[data-group="${group}"]`).forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  state.checkinTemp[group] = value;
  const required = ['rodilla', 'energia', 'comida', 'tiempo'];
  document.getElementById('btn-next-checkin').disabled = !required.every(g => state.checkinTemp[g]);
}

function submitCheckin() {
  state.checkin = { ...state.checkinTemp };
  state.safetyWarnings = evaluateSafetyRules(state.checkin);
  if (state.safetyWarnings.length > 0) {
    buildWarningsScreen();
    showScreen('screen-warnings');
  } else {
    showSessionSelect();
  }
}

// ── B: Warnings ────────────────────────────────────────────────────────────────
function buildWarningsScreen() {
  const list = document.getElementById('warnings-list');
  list.innerHTML = '';
  let hasBlock = false;

  state.safetyWarnings.forEach(w => {
    if (w.level === 'block') hasBlock = true;
    const d = document.createElement('div');
    d.className = `warn-card warn-card-${w.level}`;
    d.innerHTML = `
      <div class="warn-icon">${w.icon}</div>
      <div>
        <div class="warn-name">${w.title}</div>
        <div class="warn-detail">${w.detail}</div>
      </div>`;
    list.appendChild(d);
  });

  const btn = document.getElementById('btn-proceed-anyway');
  if (hasBlock) {
    btn.textContent = 'Volver — no entrenes hoy';
    btn.onclick = () => initCheckin();
  } else {
    btn.textContent = 'Entendido, seguir →';
    btn.onclick = () => showSessionSelect();
  }
}

// ── C: Session select ──────────────────────────────────────────────────────────
async function showSessionSelect() {
  showScreen('screen-session-select');

  // Day label
  const el = document.getElementById('ss-day-label');
  if (el) el.textContent = dayTimeLabel();

  // Check-in summary cards
  const ci = state.checkin;
  const kneeMap = { bien: { text: '0–3 / 10', cls: '' }, moderado: { text: '4–6 / 10', cls: 'gold' }, grave: { text: '+6 / 10', cls: 'red' } };
  const energyMap = { bien: { text: 'Bien', cls: 'green' }, cansado: { text: 'Cansado', cls: 'gold' }, mareo: { text: 'Mareo', cls: 'red' } };
  const comidaMap = { comido: { text: 'He comido', cls: '' }, ligero: { text: 'Algo ligero', cls: '' }, ayunas: { text: 'En ayunas', cls: 'red' } };
  const tiempoText = ci.tiempo === '75' ? '+60 min' : ci.tiempo + ' min';
  const knee = kneeMap[ci.rodilla] || kneeMap.bien;
  const energy = energyMap[ci.energia] || energyMap.bien;
  const comida = comidaMap[ci.comida] || comidaMap.comido;

  document.getElementById('ss-checkin-summary').innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;padding:0 2px">
      <span class="lbl">Cómo llegas</span>
      <button class="ss-ci-edit" onclick="initCheckin()">Editar</button>
    </div>
    <div class="ss-ci-grid">
      <div class="ss-ci-card">
        <div class="ss-ci-card-label">Rodilla</div>
        <div class="ss-ci-card-value ${knee.cls}">${knee.text}</div>
      </div>
      <div class="ss-ci-card">
        <div class="ss-ci-card-label">Energía</div>
        <div class="ss-ci-card-value ${energy.cls}">${energy.text}</div>
      </div>
      <div class="ss-ci-card">
        <div class="ss-ci-card-label">Comida</div>
        <div class="ss-ci-card-value ${comida.cls}">${comida.text}</div>
      </div>
      <div class="ss-ci-card">
        <div class="ss-ci-card-label">Tiempo</div>
        <div class="ss-ci-card-value">${tiempoText}</div>
      </div>
    </div>`;

  // Subtitle
  let subtitle = 'Elige lo que toca hoy.';
  if (ci.energia === 'cansado') subtitle = 'Energía baja. Considera reducir volumen.';
  if (ci.rodilla === 'moderado') subtitle = 'Rodilla en amarillo — evita pierna pesada hoy.';
  if (ci.rodilla === 'grave') subtitle = 'Rodilla alta — solo bici suave o descanso.';
  document.getElementById('ss-subtitle').textContent = subtitle;

  // Session cards (async: needs last-done dates for recommendation)
  await renderSessionCards();
}

async function renderSessionCards() {
  const sessions = await getAllSessions();
  sessions.sort((a, b) => b.id - a.id);

  // Find last date per type
  const lastDone = {};
  sessions.forEach(s => { if (!lastDone[s.tipo]) lastDone[s.tipo] = new Date(s.fecha); });

  // Recommend the type done longest ago
  const types = ['push', 'pull', 'legs', 'upper'];
  const now = new Date();
  let recommendedType = null;
  let maxDays = -1;
  types.forEach(t => {
    const days = lastDone[t] ? (now - lastDone[t]) / 86400000 : 999;
    if (days > maxDays && days > 0.5) { maxDays = days; recommendedType = t; }
  });

  const availMin = parseInt(state.checkin.tiempo === '75' ? '90' : state.checkin.tiempo);

  document.getElementById('session-list').innerHTML = types.map(type => {
    const sess = SESSIONS[type];
    let exercises = JSON.parse(JSON.stringify(sess.exercises));
    exercises = filterExercisesForCheckin(exercises, state.checkin);
    const estMin = estimateSessionTime(exercises);
    const isRec = type === recommendedType;
    const blocked = checkSessionBlocked(type, state.checkin);

    let warnText = '';
    if (blocked) {
      warnText = blocked.reason;
    } else if (estMin > availMin + 5) {
      warnText = `~${estMin} min — no cabe del todo en ${availMin} min. Recortaré el último accesorio.`;
    } else if (type === 'legs' && state.checkin.rodilla === 'moderado') {
      warnText = 'Rodilla en amarillo — solo bici + femoral ligero hoy.';
    }

    const lastStr = lastDone[type]
      ? lastDone[type].toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })
      : 'Nunca hecha';

    const onClickAttr = blocked
      ? `onclick="showToast('${blocked.reason.replace(/'/g, "\\'")}', 'error')"`
      : `onclick="selectSession('${type}')"`;

    return `
      <div class="sess-card ${isRec ? 'sess-card-rec' : ''}" ${onClickAttr}>
        ${isRec ? `<div class="sess-rec-badge"><div class="sess-rec-dot"></div><span class="sess-rec-text">RECOMENDADO HOY</span></div>` : ''}
        <div class="sess-card-inner">
          <div>
            <div class="sess-name">${sess.name}</div>
            <div class="sess-focus">${sess.focus}</div>
            <div class="sess-meta">~${estMin} min · ${exercises.length} ejercicios · ${lastStr}</div>
          </div>
          <div class="sess-arrow ${isRec ? 'sess-arrow-rec' : ''}">›</div>
        </div>
        ${warnText ? `<div class="sess-warn-row"><div class="sess-warn-dot"></div><span class="sess-warn-text">${warnText}</span></div>` : ''}
      </div>`;
  }).join('');
}

// ── D: Active session ──────────────────────────────────────────────────────────
async function selectSession(type) {
  state.selectedSessionType = type;
  const sessData = SESSIONS[type];
  let exercises = JSON.parse(JSON.stringify(sessData.exercises));

  // Safety filter
  exercises = filterExercisesForCheckin(exercises, state.checkin);

  // Legs + knee grave → only bici
  if (type === 'legs' && state.checkin.rodilla === 'grave') {
    exercises = exercises.filter(e => e.alwaysInclude);
    showToast('Rodilla grave — solo bici hoy.', 'warn');
  }

  // Trim if time is short
  const availMin = parseInt(state.checkin.tiempo === '75' ? '90' : state.checkin.tiempo);
  const estMin = estimateSessionTime(exercises);
  if (estMin > availMin + 5) {
    // Remove last optional exercise
    for (let i = exercises.length - 1; i >= 0; i--) {
      if (exercises[i].optional) {
        exercises.splice(i, 1);
        showToast(`Sesión ajustada a ${estimateSessionTime(exercises)} min (tiempo disponible: ${availMin} min).`, 'info');
        break;
      }
    }
  }

  // Load history data (weights + last-session text)
  await loadLastWeights(exercises);

  state.activeExercises = exercises;
  state.currentExIdx = 0;
  state.sessionSets = {};
  exercises.forEach(ex => { state.sessionSets[ex.id] = []; });
  state.sessionStartTime = Date.now();

  setInputsForExercise(exercises[0]);
  showScreen('screen-active');
  renderExerciseCard();
}

async function loadLastWeights(exercises) {
  state.lastWeights = {};
  state.lastTexts = {};
  await Promise.all(exercises.map(async ex => {
    if (ex.type === 'duration' || ex.type === 'bodyweight') return;
    const last = await getLastExerciseData(ex.id);
    if (last && last.series && last.series.length > 0) {
      const lastSet = last.series[last.series.length - 1];
      state.lastWeights[ex.id] = lastSet.kg;
      state.lastTexts[ex.id] = last.series.map(s => `${formatKg(s.kg)}×${s.reps}`).join(' · ');
    } else {
      state.lastWeights[ex.id] = ex.defaultWeight || 0;
    }
  }));
}

function setInputsForExercise(ex) {
  if (ex.type === 'duration' || ex.type === 'bodyweight') return;
  state.inputKg = state.lastWeights[ex.id] ?? ex.defaultWeight ?? 0;
  const repsStr = String(ex.reps || '12');
  const match = repsStr.match(/\d+/);
  state.inputReps = match ? parseInt(match[0]) : 12;
}

// ── Exercise card render ───────────────────────────────────────────────────────
function renderExerciseCard() {
  const exercises = state.activeExercises;
  const idx = state.currentExIdx;
  const ex = exercises[idx];
  const total = exercises.length;

  // Topbar
  document.getElementById('as-sess-name').textContent = SESSIONS[state.selectedSessionType]?.name || '';
  document.getElementById('as-ex-count').textContent = `EJERCICIO ${idx + 1} DE ${total}`;

  // Progress segments
  document.getElementById('as-progress').innerHTML =
    exercises.map((_, i) => `<div class="as-seg ${i <= idx ? 'as-seg-done' : ''}"></div>`).join('');

  // Nav buttons
  document.getElementById('btn-prev-ex').disabled = idx === 0;
  const isLast = idx === total - 1;
  document.getElementById('btn-next-ex').textContent = isLast ? 'Último ejercicio ›' : 'Siguiente ejercicio ›';
  document.getElementById('btn-next-ex').style.opacity = isLast ? '0.4' : '1';
  document.getElementById('btn-next-ex').disabled = isLast;

  // Priority / warning badge
  let prioBadge = '';
  if (ex.id === 'press_inclinado' && !ex.optional) {
    prioBadge = `<div class="as-prio"><div class="as-prio-dot"></div><span class="as-prio-text">PRIORIDAD 1</span></div>`;
  } else if (ex.id === 'reverse_fly') {
    prioBadge = `<div class="as-prio as-prio-warn"><div class="as-prio-dot"></div><span class="as-prio-text">VIGILAR HOMBRO · MÁX 2 SERIES/SEMANA</span></div>`;
  } else if (ex.kneeMax !== undefined) {
    prioBadge = `<div class="as-prio as-prio-warn"><div class="as-prio-dot"></div><span class="as-prio-text">SOLO SI RODILLA &lt;4/10</span></div>`;
  } else if (ex.id === 'elevaciones_laterales') {
    prioBadge = `<div class="as-prio"><div class="as-prio-dot"></div><span class="as-prio-text">PRIORIDAD ESTÉTICA</span></div>`;
  }

  // Main block: stats or duration
  let mainBlock = '';
  if (ex.type === 'duration') {
    mainBlock = `
      <div class="as-duration-card">
        <div class="as-duration-value">${ex.durationMin} min</div>
        <div style="font:500 13px 'Hanken Grotesk';color:var(--muted)">Ritmo suave, sin forzar.</div>
      </div>`;
  } else if (ex.type === 'bodyweight') {
    mainBlock = `
      <div class="as-duration-card">
        <div class="as-duration-value">${ex.description}</div>
        <div style="font:500 13px 'Hanken Grotesk';color:var(--muted)">Sin peso. Técnica antes que duración.</div>
      </div>`;
  } else {
    const pesoRef = formatKg(state.lastWeights[ex.id] ?? ex.defaultWeight ?? 0);
    mainBlock = `
      <div class="as-stats">
        <div class="as-stat">
          <div class="as-stat-label">PESO</div>
          <div class="as-stat-value">${pesoRef} kg</div>
        </div>
        <div class="as-stat">
          <div class="as-stat-label">OBJETIVO</div>
          <div class="as-stat-value">${ex.sets}×${ex.reps}</div>
        </div>
        <div class="as-stat">
          <div class="as-stat-label">DESCANSO</div>
          <div class="as-stat-value">${formatRest(ex.rest)}</div>
        </div>
      </div>`;
  }

  // Video button
  const videoBtn = ex.videoUrl
    ? `<a href="${ex.videoUrl}" target="_blank" class="as-video-btn">Ver técnica <span class="as-video-arrow">↗</span></a>`
    : `<span class="as-video-btn as-video-btn-empty">Ver técnica <span class="as-video-arrow" style="color:var(--bg5)">↗</span></span>`;

  // Last session text
  const lastText = state.lastTexts[ex.id] || 'Sin histórico todavía';

  // Sets logged
  const sets = state.sessionSets[ex.id] || [];
  const setsHtml = sets.length > 0
    ? `<div class="as-sets">${sets.map((s, i) => `
        <div class="as-set-row">
          <div class="as-set-num">${i + 1}</div>
          <div class="as-set-label">Serie ${i + 1}</div>
          <div class="as-set-value">${formatKg(s.kg)} <span class="as-set-unit">kg ×</span> ${s.reps}</div>
        </div>`).join('')}</div>`
    : `<div class="as-no-sets">Aún no has apuntado series.</div>`;

  // Log widget (only for weighted exercises)
  const logWidget = (ex.type !== 'duration' && ex.type !== 'bodyweight') ? `
    <div class="as-log-card">
      <div class="as-steppers">
        <div class="as-stepper">
          <div class="as-stepper-label">PESO · KG</div>
          <div class="as-stepper-ctrl">
            <button class="as-stepper-btn" onclick="adjustKg(-1)">−</button>
            <div class="as-stepper-value" id="display-kg">${formatKg(state.inputKg)}</div>
            <button class="as-stepper-btn" onclick="adjustKg(1)">+</button>
          </div>
        </div>
        <div class="as-stepper">
          <div class="as-stepper-label">REPS</div>
          <div class="as-stepper-ctrl">
            <button class="as-stepper-btn" onclick="adjustReps(-1)">−</button>
            <div class="as-stepper-value" id="display-reps">${state.inputReps}</div>
            <button class="as-stepper-btn" onclick="adjustReps(1)">+</button>
          </div>
        </div>
      </div>
      <button class="as-add-btn" onclick="addSet()">Apuntar serie ${sets.length + 1}</button>
    </div>` : '';

  document.getElementById('as-body').innerHTML = `
    ${prioBadge}
    <div class="as-ex-name">${ex.name}${ex.optional ? ' <span style="font:500 14px/1 \'Hanken Grotesk\';color:var(--label)">· opcional</span>' : ''}</div>
    ${mainBlock}
    <div class="as-coach">
      <div class="as-coach-top">
        <div class="as-coach-left">
          <div class="as-coach-avatar">C</div>
          <span class="as-coach-label">COACH</span>
        </div>
        ${videoBtn}
      </div>
      <div class="as-coach-tip">${ex.tip}</div>
    </div>
    <div class="as-last-row">
      <span class="as-last-label">ÚLTIMA VEZ</span>
      <div class="as-last-divider"></div>
      <span class="as-last-value">${lastText}</span>
    </div>
    ${logWidget}
    ${setsHtml}
  `;
}

// ── Steppers ──────────────────────────────────────────────────────────────────
function adjustKg(direction) {
  const ex = state.activeExercises[state.currentExIdx];
  const STEP = 2.5;
  let newKg = Math.round((state.inputKg + direction * STEP) * 10) / 10;
  newKg = Math.max(0, newKg);
  if (ex.maxWeight && newKg > ex.maxWeight) {
    showToast(`Máximo ${ex.maxWeight} kg para ${ex.name}`, 'warn');
    return;
  }
  state.inputKg = newKg;
  const el = document.getElementById('display-kg');
  if (el) el.textContent = formatKg(newKg);
}

function adjustReps(direction) {
  const newReps = Math.max(1, Math.min(100, state.inputReps + direction));
  state.inputReps = newReps;
  const el = document.getElementById('display-reps');
  if (el) el.textContent = newReps;
}

// ── Add set ───────────────────────────────────────────────────────────────────
function addSet() {
  const kg = state.inputKg;
  const reps = state.inputReps;
  if (!kg || kg <= 0 || !reps || reps <= 0) {
    showToast('Peso o reps no válidos', 'error');
    return;
  }

  const ex = state.activeExercises[state.currentExIdx];
  state.sessionSets[ex.id].push({ kg, reps });
  state.lastWeights[ex.id] = kg;

  renderExerciseCard();
  startRestTimer(ex.rest || 60);
  vibrate([50]);
}

// ── Navigation ────────────────────────────────────────────────────────────────
function prevExercise() {
  if (state.currentExIdx > 0) {
    skipTimer();
    state.currentExIdx--;
    setInputsForExercise(state.activeExercises[state.currentExIdx]);
    renderExerciseCard();
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
}

function nextExercise() {
  const total = state.activeExercises.length;
  if (state.currentExIdx < total - 1) {
    skipTimer();
    state.currentExIdx++;
    setInputsForExercise(state.activeExercises[state.currentExIdx]);
    renderExerciseCard();
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
}

function confirmBack() {
  if (Object.values(state.sessionSets).some(arr => arr.length > 0)) {
    if (!confirm('¿Salir? Se perderán los datos de esta sesión.')) return;
  }
  skipTimer();
  showSessionSelect();
}

// ── Rest timer ────────────────────────────────────────────────────────────────
function startRestTimer(seconds) {
  clearInterval(state.restTimerInterval);
  state.restRemaining = seconds;
  state.restTotal = seconds;

  const overlay = document.getElementById('rest-overlay');
  overlay.classList.remove('hidden');
  updateRestOverlay();

  state.restTimerInterval = setInterval(() => {
    state.restRemaining--;
    updateRestOverlay();
    if (state.restRemaining <= 0) {
      clearInterval(state.restTimerInterval);
      state.restTimerInterval = null;
      playBeep();
      vibrate([200, 100, 200]);
      const sub = document.getElementById('rest-sublabel');
      if (sub) { sub.textContent = '¡Listo! A por la siguiente serie.'; sub.classList.add('done'); }
    }
  }, 1000);
}

function updateRestOverlay() {
  const countdown = document.getElementById('rest-countdown');
  const ring = document.getElementById('rest-ring-wrap');
  const sub = document.getElementById('rest-sublabel');
  if (!countdown) return;

  countdown.textContent = formatTime(state.restRemaining);

  const progress = state.restTotal > 0 ? (state.restRemaining / state.restTotal) : 0;
  const deg = progress * 360;
  ring.style.backgroundImage = `conic-gradient(var(--gold) ${deg}deg, rgba(255,255,255,0.1) ${deg}deg)`;

  if (sub && state.restRemaining > 0) {
    sub.textContent = 'Respira. Prepara la próxima serie.';
    sub.classList.remove('done');
  }
}

function addRestTime(sec) {
  state.restRemaining += sec;
  state.restTotal += sec;
  if (!state.restTimerInterval && state.restRemaining > 0) {
    // Restart timer if it had finished
    startRestTimer(state.restRemaining);
  } else {
    updateRestOverlay();
  }
}

function skipTimer() {
  clearInterval(state.restTimerInterval);
  state.restTimerInterval = null;
  state.restRemaining = 0;
  state.restTotal = 0;
  const overlay = document.getElementById('rest-overlay');
  if (overlay) overlay.classList.add('hidden');
}

// ── Finish & save ─────────────────────────────────────────────────────────────
async function finishSession() {
  if (!Object.values(state.sessionSets).some(arr => arr.length > 0)) {
    if (!confirm('No has apuntado ninguna serie. ¿Guardar de todas formas?')) return;
  }
  skipTimer();
  const now = Date.now();
  const durMin = Math.round((now - state.sessionStartTime) / 60000);

  const ejercicios = state.activeExercises.map(ex => ({
    id: ex.id,
    nombre: ex.name,
    series: state.sessionSets[ex.id] || []
  })).filter(e => e.series.length > 0 || state.activeExercises.find(x => x.id === e.id)?.type);

  const session = {
    id: now,
    fecha: new Date().toISOString(),
    tipo: state.selectedSessionType,
    duracionMin: durMin,
    checkin: state.checkin,
    ejercicios
  };

  try {
    await saveSession(session);
    showToast('Sesión guardada ✓', 'success');
  } catch (e) {
    showToast('Error al guardar', 'error');
    console.error(e);
  }

  // Export to Google Sheets if configured
  if (getSheetsUrl()) {
    exportSessionToSheets(session)
      .then(ok => { if (ok) showToast('Exportado a Google Sheets ✓', 'success'); })
      .catch(() => {});
  }

  await buildHistoryScreen();
  showScreen('screen-history');
}

// ── E: History ─────────────────────────────────────────────────────────────────
async function showHistory() {
  await buildHistoryScreen();
  showScreen('screen-history');
}

async function buildHistoryScreen() {
  const container = document.getElementById('history-content');
  container.innerHTML = '<div style="padding:40px;text-align:center;color:var(--label);font:500 13px \'Hanken Grotesk\'">Cargando...</div>';

  const sessions = await getAllSessions();
  sessions.sort((a, b) => b.id - a.id);

  if (sessions.length === 0) {
    container.innerHTML = '<div class="hist-empty">Aún no hay sesiones guardadas.<br>¡Completa la primera!</div>';
    return;
  }

  let html = '<div class="hist-section-label" style="margin-bottom:10px">ÚLTIMAS SESIONES</div>';

  sessions.slice(0, 6).forEach(s => {
    const d = new Date(s.fecha);
    const dateStr = d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
    const ejerciciosConSeries = (s.ejercicios || []).filter(e => e.series && e.series.length > 0);
    html += `
      <div class="hist-sess-card">
        <div class="hist-sess-top">
          <span class="hist-badge hist-badge-${s.tipo}">${SESSIONS[s.tipo]?.name || s.tipo}</span>
          <span class="hist-sess-date">${capitalize(dateStr)}</span>
          ${s.duracionMin ? `<span class="hist-sess-dur">${s.duracionMin} min</span>` : ''}
        </div>
        ${ejerciciosConSeries.map(e => `
          <div class="hist-ex-row">
            <span class="hist-ex-name">${e.nombre}</span>
            <span class="hist-ex-sets">${e.series.map(s => `${formatKg(s.kg)}×${s.reps}`).join(' · ')}</span>
          </div>`).join('')}
        ${ejerciciosConSeries.length === 0 ? '<div style="padding:6px 0;font:500 12px \'Hanken Grotesk\';color:var(--label)">Solo ejercicios sin peso (bici, plancha...)</div>' : ''}
      </div>`;
  });

  // Progression alerts
  const alerts = await buildProgressionAlerts();

  // Reverse fly weekly check
  const rfSets = await getReverseFlyWeeklySets();
  if (rfSets >= 2) {
    alerts.push({
      name: 'Reverse fly apoyado',
      message: `Ya llevas ${rfSets} series esta semana. Máximo 2. Hoy no hagas más — protege el hombro.`,
      type: 'warn'
    });
  }

  if (alerts.length > 0) {
    html += '<div class="hist-section-label mt-24" style="margin-bottom:10px">PROGRESIÓN</div>';
    html += alerts.map(a => `
      <div class="prog-card prog-card-${a.type === 'warn' ? 'warn' : 'up'}">
        <div class="prog-icon">${a.type === 'warn' ? '⚠️' : '📈'}</div>
        <div>
          <div class="prog-ex">${a.name}</div>
          <div class="prog-msg">${a.message}</div>
        </div>
      </div>`).join('');
  }

  container.innerHTML = html;
}

async function buildProgressionAlerts() {
  const checked = new Set();
  const alerts = [];

  for (const sessKey of Object.keys(SESSIONS)) {
    for (const ex of SESSIONS[sessKey].exercises) {
      if (checked.has(ex.id)) continue;
      checked.add(ex.id);
      const history = await getExerciseHistory(ex.id);
      const msg = checkProgression(ex.id, history);
      if (msg) {
        alerts.push({ name: ex.name, message: msg, type: msg.startsWith('⚠️') ? 'warn' : 'up' });
      }
    }
  }
  return alerts;
}

// ── Chat helpers ──────────────────────────────────────────────────────────────
function openChatInSession() {
  const ex = state.activeExercises[state.currentExIdx];
  const sets = state.sessionSets[ex?.id] || [];
  let prefill = '';
  if (ex) {
    if (sets.length === 0) {
      prefill = `Voy a hacer ${ex.name}. ¿Algún consejo antes de empezar?`;
    } else {
      const last = sets[sets.length - 1];
      prefill = `Acabo de hacer ${ex.name} — ${last.kg}kg×${last.reps} reps. ¿Mantengo o ajusto algo?`;
    }
  }
  openChat(prefill);
}

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initCheckin();
});
