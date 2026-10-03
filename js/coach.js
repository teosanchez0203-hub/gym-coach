// ── Local intelligence engine — no API needed ─────────────────────────────────

// Epley 1RM formula
function oneRepMax(kg, reps) {
  if (reps <= 0) return 0;
  if (reps === 1) return kg;
  return Math.round(kg * (1 + reps / 30) * 10) / 10;
}

// Get historical best 1RM for an exercise (excluding today's in-progress session)
async function getHistoricalPR(exerciseId) {
  const sessions = await getAllSessions();
  let best = 0;
  sessions.forEach(s => {
    const ex = (s.ejercicios || []).find(e => e.id === exerciseId);
    if (!ex) return;
    (ex.series || []).forEach(set => {
      const orm = oneRepMax(set.kg, set.reps);
      if (orm > best) best = orm;
    });
  });
  return best;
}

// Check if a set is a PR — returns null or {orm, previous}
async function checkForPR(exerciseId, kg, reps) {
  if (!kg || !reps || reps < 1) return null;
  const currentORM = oneRepMax(kg, reps);
  const activeBest = typeof state !== 'undefined' ? Math.max(0, ...(state.sessionSets[exerciseId] || []).map(s => oneRepMax(s.kg,s.reps))) : 0;
  const savedBest = await getHistoricalPR(exerciseId);
  const previousBest = Math.max(savedBest, activeBest);
  if (previousBest > 0 && currentORM > previousBest) {
    return { orm: currentORM, previous: previousBest, kg, reps };
  }
  return null;
}

// ── Weekly & monthly stats ────────────────────────────────────────────────────
async function computeStats() {
  const sessions = await getAllSessions();
  sessions.sort((a, b) => b.id - a.id);
  const now = new Date();
  const weekAgo = new Date(now - 7 * 86400000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const thisWeek = sessions.filter(s => new Date(s.fecha) > weekAgo);
  const thisMonth = sessions.filter(s => new Date(s.fecha) >= monthStart);
  const lastMonth = sessions.filter(s => {
    const d = new Date(s.fecha);
    return d >= lastMonthStart && d < monthStart;
  });

  // Total volume this month (sum of kg × reps across all sets)
  const monthVolume = thisMonth.reduce((total, s) => {
    return total + (s.ejercicios || []).reduce((t, e) => {
      return t + (e.series || []).reduce((tt, set) => tt + (set.kg * set.reps), 0);
    }, 0);
  }, 0);

  // Consecutive training weeks (streak)
  let streak = 0;
  let weekOffset = 0;
  while (true) {
    const wStart = new Date(now - (weekOffset + 1) * 7 * 86400000);
    const wEnd   = new Date(now - weekOffset * 7 * 86400000);
    const inWeek = sessions.filter(s => {
      const d = new Date(s.fecha);
      return d >= wStart && d < wEnd;
    });
    if (inWeek.length >= 3) { streak++; weekOffset++; }
    else break;
  }

  return {
    total: sessions.length,
    thisWeek: thisWeek.length,
    thisMonth: thisMonth.length,
    lastMonth: lastMonth.length,
    monthVolume: Math.round(monthVolume),
    streak
  };
}

// ── Local coach responses (no API key needed) ─────────────────────────────────
async function localCoachResponse(userMessage) {
  const msg = userMessage.toLowerCase();
  // Safety intent wins over generic words such as "hoy" or "peso".
  if (/mareo|dolor|duele|molestia|lesión|hombro|rodilla/.test(msg)) return 'No fuerces un ejercicio que causa dolor ni entrenes con mareo. Detén la sesión si estás mareado; si el dolor es intenso o aparece en reposo, evita cargar la zona y busca valoración profesional. Este coach local no diagnostica lesiones. Revisa los avisos del check-in antes de continuar.';
  if (typeof state !== 'undefined' && state.activeExercises?.length && /bajo|mantengo|series más/.test(msg)) {
    const ex = state.activeExercises[state.currentExIdx];
    const sets = state.sessionSets[ex.id] || [];
    const last = sets[sets.length - 1];
    return `${ex.name}: llevas ${sets.length} de ${ex.sets || 0} series previstas. ${last?.rpe === 'hard' ? 'La última fue dura: no subas peso; reduce si la técnica se deteriora.' : 'Mantén la carga mientras puedas repetir las reps con control. No añadas series solo para compensar cansancio.'}`;
  }
  const sessions = await getAllSessions();
  sessions.sort((a, b) => b.id - a.id);
  const now = new Date();

  // Helper: find last session of a type
  const lastOf = (type) => sessions.find(s => s.tipo === type);
  const daysAgo = (session) => session ? Math.round((now - new Date(session.fecha)) / 86400000) : null;

  // ── "última sesión" / "ayer" / "qué hice" ──
  if (/última|ayer|qué hice|última vez/.test(msg)) {
    if (!sessions.length) return 'Aún no tienes sesiones registradas. ¡Completa la primera!';
    const s = sessions[0];
    const d = new Date(s.fecha).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
    const exLines = (s.ejercicios || []).filter(e => e.series?.length > 0)
      .map(e => `• ${e.nombre}: ${e.series.map(s => `${s.kg}kg×${s.reps}`).join(' / ')}`).join('\n');
    return `Tu última sesión fue el ${d} — ${SESSIONS[s.tipo]?.name || s.tipo}:\n\n${exLines || 'Sin series registradas.'}\n\n${daysAgo(s) <= 1 ? 'Fue ayer. Recupera bien.' : daysAgo(s) <= 3 ? 'Vas bien de frecuencia.' : 'Llevas unos días sin entrenar.'}`;
  }

  // ── "progresar" / "subir" / "toca" / "peso" ──
  if (/progresar|progresando|subir|toca|cuándo|peso nuevo/.test(msg)) {
    const results = [];
    const checked = new Set();
    for (const sess of Object.values(SESSIONS)) {
      for (const ex of sess.exercises) {
        if (checked.has(ex.id)) continue;
        checked.add(ex.id);
        const history = sessions.flatMap(s => {
          const e = (s.ejercicios || []).find(e => e.id === ex.id);
          return (e?.series?.length > 0) ? [{ fecha: s.fecha, series: e.series }] : [];
        });
        const msg2 = checkProgression(ex.id, history);
        if (msg2 && !msg2.startsWith('⚠️')) results.push(`📈 ${ex.name}\n${msg2}`);
      }
    }
    if (!results.length) return 'Aún no hay suficientes sesiones para detectar oportunidades de progresión. Necesito ver el mismo ejercicio 2-3 veces antes de recomendarte subir peso.';
    return `Oportunidades de progresión detectadas:\n\n${results.join('\n\n')}`;
  }

  // ── "recomiendas" / "hoy" / "qué hago" / "sesión" ──
  if (/recomiend|hoy|qué hago|qué sesión|qué entreno/.test(msg)) {
    const lastDone = {};
    sessions.forEach(s => { if (!lastDone[s.tipo]) lastDone[s.tipo] = new Date(s.fecha); });
    let best = null; let maxDays = -1;
    ['push', 'pull', 'legs', 'upper'].forEach(t => {
      const days = lastDone[t] ? (now - lastDone[t]) / 86400000 : 999;
      if (days > maxDays) { maxDays = days; best = t; }
    });
    const days = Math.round(maxDays);
    const sessName = SESSIONS[best]?.name || best;
    const focus = SESSIONS[best]?.focus || '';
    if (days > 100) return `Empieza con ${sessName} — es la primera vez que la vas a hacer.\n\nFoco: ${focus}`;
    return `Te recomiendo ${sessName} — llevas ${days} día${days !== 1 ? 's' : ''} sin hacerla.\n\nFoco: ${focus}\n\n${days >= 5 ? 'Estás bien recuperado.' : days >= 3 ? 'Recuperación adecuada.' : 'Si te notas cansado, considera descansar un día más.'}`;
  }

  // ── "progreso" / "cómo voy" / "general" / "resumen" ──
  if (/progreso|cómo voy|general|resumen|estadísticas|stats/.test(msg)) {
    const stats = await computeStats();
    const thisWeek = sessions.filter(s => (now - new Date(s.fecha)) / 86400000 < 7);
    const typeCount = {};
    sessions.slice(0, 30).forEach(s => { typeCount[s.tipo] = (typeCount[s.tipo] || 0) + 1; });
    const fav = Object.entries(typeCount).sort((a, b) => b[1] - a[1])[0];
    return `📊 Tu resumen:\n\n• Sesiones totales: ${stats.total}\n• Esta semana: ${stats.thisWeek} sesiones\n• Este mes: ${stats.thisMonth} sesiones\n• Volumen este mes: ${(stats.monthVolume / 1000).toFixed(1)} toneladas\n• Racha: ${stats.streak} semana${stats.streak !== 1 ? 's' : ''} consecutivas con 3+ sesiones\n• Sesión favorita: ${SESSIONS[fav?.[0]]?.name || '—'}\n\n${stats.total < 5 ? 'Estás empezando. La consistencia ahora es más importante que la intensidad.' : stats.total < 20 ? 'Buen ritmo. Sigue acumulando sesiones.' : 'Llevas un historial sólido. Foco en progresión de carga.'}`;
  }

  // ── "rodilla" / "lesión" / "duele" ──
  if (/rodilla|lesión|duele|dolor|hombro/.test(msg)) {
    return `Para cualquier dolor o molestia, la norma general:\n\n• Dolor 0-3/10: puedes entrenar, evita cargas máximas\n• Dolor 4-6/10: solo ejercicios sin impacto, sin prensa ni extensión de rodilla\n• Dolor +6/10 o en reposo: no entrenes hoy, hielo y reposo\n\nPara el hombro: no superes 2 series de reverse fly por semana y no subas de 5kg en ese ejercicio.\n\nSi el dolor persiste más de 3-4 días, consulta a un fisio.`;
  }

  // ── "récord" / "PR" / "mejor" ──
  if (/récord|\bpr\b|mejor|máximo|máx/.test(msg)) {
    const prs = [];
    const checked2 = new Set();
    for (const sess of Object.values(SESSIONS)) {
      for (const ex of sess.exercises) {
        if (checked2.has(ex.id) || ex.type === 'duration' || ex.type === 'bodyweight') continue;
        checked2.add(ex.id);
        let bestORM = 0; let bestKg = 0; let bestReps = 0;
        sessions.forEach(s => {
          const e = (s.ejercicios || []).find(e => e.id === ex.id);
          (e?.series || []).forEach(set => {
            const orm = oneRepMax(set.kg, set.reps);
            if (orm > bestORM) { bestORM = orm; bestKg = set.kg; bestReps = set.reps; }
          });
        });
        if (bestORM > 0) prs.push(`• ${ex.name}: ${bestKg}kg × ${bestReps} reps (1RM est. ${bestORM}kg)`);
      }
    }
    if (!prs.length) return 'Aún no tienes récords registrados. ¡Completa más sesiones!';
    return `🏆 Tus mejores marcas:\n\n${prs.join('\n')}`;
  }

  // ── "fatiga" / "descanso" / "recuper" ──
  if (/fatiga|descans|recuper|overtraining|cansad/.test(msg)) {
    const thisWeek = sessions.filter(s => (now - new Date(s.fecha)) / 86400000 < 7);
    const last = sessions[0];
    const daysSince = daysAgo(last);
    if (thisWeek.length >= 5) return `Llevas ${thisWeek.length} sesiones esta semana. Eso es mucho para tu volumen actual. Descansa 1-2 días antes de continuar.`;
    if (thisWeek.length >= 4) return `4 sesiones esta semana — en el límite. Si sientes cansancio acumulado, el descanso también es entrenamiento.`;
    if (daysSince && daysSince >= 5) return `Llevas ${daysSince} días sin entrenar. Estás completamente recuperado — la sesión de hoy debería ir bien.`;
    return `Llevas ${thisWeek.length} sesiones esta semana. Frecuencia adecuada. Duerme 7-8h y come suficiente proteína para recuperar bien.`;
  }

  // ── Default: resumen contextual ──
  if (!sessions.length) {
    return 'Aún no tengo datos tuyos. Completa tu primera sesión y podré darte análisis personalizados de tu progreso, recomendaciones de peso, y alertas de recuperación.';
  }
  const last = sessions[0];
  const daysSinceLast = daysAgo(last);
  const thisWeek = sessions.filter(s => (now - new Date(s.fecha)) / 86400000 < 7);
  return `Tengo ${sessions.length} sesiones tuyas en memoria. Esta semana has entrenado ${thisWeek.length} día${thisWeek.length !== 1 ? 's' : ''}. Última sesión hace ${daysSinceLast} día${daysSinceLast !== 1 ? 's' : ''}.\n\nPuedo responderte sobre:\n• Tu última sesión\n• Cuándo toca progresar en cada ejercicio\n• Qué sesión te recomiendo hoy\n• Tus récords personales\n• Tu fatiga y recuperación\n• Tu progreso general`;
}

// ── SVG Sparkline chart ───────────────────────────────────────────────────────
function renderSparkline(values, width = 140, height = 48) {
  if (!values || values.length < 2) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pad = 6;
  const w = width - pad * 2;
  const h = height - pad * 2;

  const points = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * w;
    const y = pad + h - ((v - min) / range) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const lastX = parseFloat(points[points.length - 1].split(',')[0]);
  const lastY = parseFloat(points[points.length - 1].split(',')[1]);
  const firstVal = values[0];
  const lastVal = values[values.length - 1];
  const trend = lastVal >= firstVal ? '#7fc99a' : '#e05a5a';

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" xmlns="http://www.w3.org/2000/svg">
    <polyline points="${points.join(' ')}" stroke="${trend}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="0.9"/>
    <circle cx="${lastX}" cy="${lastY}" r="3" fill="${trend}"/>
  </svg>`;
}

// Get weight history for an exercise (last 10 sessions)
async function getWeightHistory(exerciseId) {
  const history = await getExerciseHistory(exerciseId);
  return history.slice(0, 10).reverse()
    .map(h => Math.max(...h.series.map(s => s.kg)));
}
