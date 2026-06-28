// Safety rules — evaluate check-in and return warnings
// Returns array of {level: "block"|"warn", message, detail}
function evaluateSafetyRules(checkin) {
  const warnings = [];

  // Rule 1: Mareo → STOP
  if (checkin.energia === "mareo") {
    warnings.push({
      level: "block",
      icon: "🛑",
      title: "Mareo — No entrenes hoy",
      detail: "Siéntate, bebe agua y toma hidratos rápidos (plátano, miel). No te duches con agua caliente hasta que pase. Esto puede ser serio."
    });
  }

  // Rule 2: Ayunas → block intense session
  if (checkin.comida === "ayunas") {
    warnings.push({
      level: "block",
      icon: "🍌",
      title: "En ayunas — Come algo antes",
      detail: "Entreno intenso en ayunas = mareo garantizado. Come: plátano, yogur, tostada con miel, o toma una isotónica. (Esto ya te pasó antes.)"
    });
  }

  // Rule 3: Rodilla >6 → only bike + foam roller
  if (checkin.rodilla === "grave") {
    warnings.push({
      level: "block",
      icon: "🦵",
      title: "Rodilla en reposo o >6/10",
      detail: "Nada de prensa ni extensión hoy. Solo bici suave + rodillo. Si dura más de 2 días consulta."
    });
  }

  // Rule 4: Rodilla 4-6 → avoid heavy legs
  if (checkin.rodilla === "moderado") {
    warnings.push({
      level: "warn",
      icon: "⚠️",
      title: "Rodilla 4-6/10",
      detail: "Evita pierna pesada. Si haces Pierna-Rehab: solo bici + femoral ligero. Sin prensa hoy."
    });
  }

  // Rule 5: Low energy — soft warning
  if (checkin.energia === "cansado") {
    warnings.push({
      level: "info",
      icon: "😴",
      title: "Energía baja",
      detail: "Baja el volumen si es necesario. Mejor sesión corta bien hecha que forzar y lesionarte."
    });
  }

  return warnings;
}

// Filter/modify exercises based on check-in state
function filterExercisesForCheckin(exercises, checkin) {
  return exercises.filter(ex => {
    // Prensa only if knee <= 3
    if (ex.kneeMax !== undefined) {
      return checkin.rodilla === "bien"; // "bien" = 0-3
    }
    return true;
  }).map(ex => {
    // Curl normal: only if energy is good
    if (ex.id === "curl_normal" && checkin.energia !== "bien") {
      return { ...ex, optional: true, tip: ex.tip + " (energía baja — considera saltarte)" };
    }
    return ex;
  });
}

// Check if a session type is blocked by current check-in
// Returns null if ok, or {reason} if blocked
function checkSessionBlocked(sessionType, checkin) {
  if (checkin.energia === "mareo") {
    return { reason: "Tienes mareo. No debes entrenar hoy." };
  }
  if (checkin.comida === "ayunas" && sessionType !== "legs") {
    return { reason: "Estás en ayunas. Come algo antes de una sesión intensa." };
  }
  if (checkin.rodilla === "grave" && sessionType === "legs") {
    return { reason: "Rodilla >6/10. Solo bici suave y rodillo hoy." };
  }
  return null;
}

// Progression rules — check if it's time to suggest a weight increase
// history = [{fecha, series: [{kg, reps}]}] sorted newest first
function checkProgression(exerciseId, history) {
  if (!history || history.length === 0) return null;

  const rules = {
    press_inclinado: () => {
      // 3×15 at 15kg → suggest 17.5kg
      const recent = history.slice(0, 3);
      const achieved = recent.filter(h => {
        const series = h.series;
        return series.length >= 3 && series.every(s => s.kg >= 15 && s.reps >= 15);
      });
      if (achieved.length >= 2) {
        return "¡Toca subir! Completa 3×15 a 15 kg en 2 sesiones → pasa a 17,5 kg (objetivo: 8-10 reps).";
      }
      // Also check if already at 17.5
      const at175 = recent.filter(h => h.series.some(s => s.kg >= 17.5 && s.reps >= 8));
      if (at175.length >= 2) {
        return "Consolidando 17,5 kg. Llega a 17,5×12 antes de subir.";
      }
      return null;
    },

    press_plano: () => {
      const recent = history.slice(0, 3);
      const achieved = recent.filter(h => {
        return h.series.length >= 3 && h.series.every(s => s.kg >= 17.5 && s.reps >= 15);
      });
      if (achieved.length >= 2) {
        return "¡Toca subir! 3×15 a 17,5 kg logrado → proponer 20 kg con cautela.";
      }
      return null;
    },

    low_row: () => {
      const recent = history.slice(0, 3);
      const achieved = recent.filter(h => {
        return h.series.length >= 3 && h.series.every(s => s.kg >= 35 && s.reps >= 12);
      });
      if (achieved.length >= 2) {
        return "Low row consolidado a 35 kg. Puedes plantearte subir o añadir serie.";
      }
      return null;
    },

    jalon_ancho: () => {
      const recent = history.slice(0, 3);
      const achieved = recent.filter(h => {
        if (h.series.length < 3) return false;
        return h.series[0].reps >= 15 && h.series[1].reps >= 15 && h.series[2].reps >= 12;
      });
      if (achieved.length >= 2) {
        return "¡Jalón consolidado! 40 kg × 15/15/12+ → prueba 45 kg solo si mantienes control total.";
      }
      return null;
    },

    elevaciones_laterales: () => {
      const recent = history.slice(0, 3);
      const achieved = recent.filter(h => {
        return h.series.length >= 3 && h.series.every(s => s.kg >= 7.5 && s.reps >= 15);
      });
      if (achieved.length >= 2) {
        return "3×15 limpias consolidadas → prueba 10 kg solo si no hay balanceo ni trapecio.";
      }
      return null;
    },

    hammer_curl: () => {
      const recent = history.slice(0, 3);
      const achieved = recent.filter(h => {
        return h.series.length >= 3 && h.series.every(s => s.kg >= 12.5 && s.reps >= 12);
      });
      if (achieved.length >= 2) {
        return "Hammer curl consolidado a 12,5 kg. Puedes subir a 15 kg.";
      }
      return null;
    },

    reverse_fly: () => {
      // Never progress — always stay at 5kg
      const recent = history.slice(0, 2);
      const tooMuch = recent.filter(h => h.series.length > 2);
      if (tooMuch.length > 0) {
        return "⚠️ Reverse fly: máximo 2 series/semana. No superar 5 kg. Protege el hombro.";
      }
      return null;
    }
  };

  const fn = rules[exerciseId];
  return fn ? fn() : null;
}
