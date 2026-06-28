// Exercise data — weights are per dumbbell (mancuerna)
const SESSIONS = {
  push: {
    name: "Push",
    focus: "Pecho superior + hombro lateral",
    exercises: [
      {
        id: "press_inclinado",
        name: "Press inclinado DB",
        defaultWeight: 15,
        sets: 3,
        reps: "12-15",
        rest: 105,
        tip: "Banco ~30°, escápulas firmes. Prioridad 1.",
        videoUrl: ""
      },
      {
        id: "press_plano",
        name: "Press plano DB",
        defaultWeight: 17.5,
        sets: 3,
        reps: "15",
        rest: 105,
        tip: "Hasta 3×15 fácil, luego subir a 20 kg.",
        videoUrl: ""
      },
      {
        id: "elevaciones_laterales",
        name: "Elevaciones laterales",
        defaultWeight: 7.5,
        sets: 3,
        reps: "15",
        rest: 52,
        tip: "Sin balanceo ni trapecio. Técnica antes que peso.",
        videoUrl: ""
      },
      {
        id: "triceps_unilateral",
        name: "Tríceps unilateral",
        defaultWeight: 7.5,
        sets: 3,
        reps: "12-15",
        rest: 52,
        tip: "Remate. Reducir peso si limita los presses.",
        videoUrl: "",
        optional: true
      }
    ]
  },

  pull: {
    name: "Pull",
    focus: "Dorsal + espalda + bíceps",
    exercises: [
      {
        id: "low_row",
        name: "Low row unilateral",
        defaultWeight: 35,
        sets: 3,
        reps: "12-15",
        rest: 90,
        tip: "Codo hacia cadera, sin rotar tronco.",
        videoUrl: ""
      },
      {
        id: "jalon_ancho",
        name: "Jalón ancho",
        defaultWeight: 40,
        sets: 3,
        reps: "15/15/12-15",
        rest: 90,
        tip: "45 kg solo con control total. No redondear espalda.",
        videoUrl: ""
      },
      {
        id: "hammer_curl",
        name: "Hammer curl",
        defaultWeight: 12.5,
        sets: 3,
        reps: "12-15",
        rest: 52,
        tip: "Sin balanceo. Mantener repetible sesión a sesión.",
        videoUrl: ""
      },
      {
        id: "curl_normal",
        name: "Curl normal",
        defaultWeight: 12.5,
        sets: 2,
        reps: "12-15",
        rest: 52,
        tip: "Complemento opcional. Solo si hay energía.",
        videoUrl: "",
        optional: true
      },
      {
        id: "reverse_fly",
        name: "Reverse fly apoyado",
        defaultWeight: 5,
        sets: 2,
        reps: "15",
        rest: 52,
        tip: "Máx 2 series/semana. 5 kg es el peso correcto. Vigilar hombro.",
        videoUrl: "",
        maxWeight: 5,
        maxSetsPerWeek: 2
      }
    ]
  },

  legs: {
    name: "Pierna-Rehab",
    focus: "Mantener pierna, cuidar rodilla",
    exercises: [
      {
        id: "bicicleta",
        name: "Bicicleta",
        type: "duration",
        durationMin: 25,
        rest: 0,
        tip: "Suave. Lubrica la rodilla, no canses.",
        videoUrl: "",
        alwaysInclude: true
      },
      {
        id: "prensa",
        name: "Prensa",
        defaultWeight: 40,
        sets: 3,
        reps: "15",
        rest: 90,
        tip: "SOLO si rodilla <4/10. Sin dolor en escaleras previo.",
        videoUrl: "",
        kneeMax: 3  // only if knee score <= 3
      },
      {
        id: "curl_femoral",
        name: "Curl femoral",
        defaultWeight: 30,
        sets: 3,
        reps: "13-15",
        rest: 60,
        tip: "Más seguro que extensión. Rango controlado.",
        videoUrl: ""
      },
      {
        id: "gemelos",
        name: "Gemelos",
        defaultWeight: 40,
        sets: 3,
        reps: "15",
        rest: 45,
        tip: "Rango completo: talón bajo, puntilla arriba.",
        videoUrl: ""
      },
      {
        id: "core_plancha",
        name: "Core (plancha lateral + banana)",
        type: "bodyweight",
        description: "45s/lado + banana 1 min",
        rest: 30,
        tip: "No dejar caer la cadera. Tensión total.",
        videoUrl: ""
      }
    ]
  },

  upper: {
    name: "Upper",
    focus: "Reforzar prioridades estéticas",
    exercises: [
      {
        id: "press_inclinado",
        name: "Press inclinado DB",
        defaultWeight: 15,
        sets: 3,
        reps: "12-15",
        rest: 105,
        tip: "Priorizar sobre el plano. Banco ~30°, escápulas firmes.",
        videoUrl: ""
      },
      {
        id: "low_row",
        name: "Low row / Press plano DB",
        defaultWeight: 35,
        sets: 3,
        reps: "12-15",
        rest: 90,
        tip: "Elige según fatiga: low row (35 kg) o press plano (17,5 kg).",
        videoUrl: ""
      },
      {
        id: "elevaciones_laterales",
        name: "Elevaciones laterales",
        defaultWeight: 7.5,
        sets: 3,
        reps: "15",
        rest: 52,
        tip: "Prioridad estética. Sin balanceo ni trapecio.",
        videoUrl: ""
      },
      {
        id: "hammer_curl",
        name: "Brazos (Hammer + Tríceps)",
        defaultWeight: 12.5,
        sets: 3,
        reps: "12-15",
        rest: 52,
        tip: "Remate final. Hammer curl y/o tríceps unilateral.",
        videoUrl: "",
        optional: true
      }
    ]
  }
};

// Estimate session duration in minutes
function estimateSessionTime(exercises) {
  let totalSec = 0;
  exercises.forEach(ex => {
    if (ex.type === "duration") {
      totalSec += ex.durationMin * 60;
    } else if (ex.type === "bodyweight") {
      totalSec += (ex.rest || 30) + 120; // ~2 min for the exercise
    } else {
      const sets = ex.sets || 3;
      const rest = ex.rest || 60;
      totalSec += sets * (40 + rest); // 40s per set + rest
    }
  });
  return Math.round(totalSec / 60);
}
