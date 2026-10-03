# Coach de Gym de Teo

HTML, CSS y JavaScript sin frameworks. Datos de sesiones en IndexedDB. Coach local basado en reglas, sin cuentas ni cuotas.

## Probar

Con Node instalado, desde esta carpeta:

```sh
node serve.cjs
```

Abrir http://localhost:3456. Pruebas automáticas: `node --test tests/offline.test.cjs`.

## Mejoras completadas

- Coach local con historial y respuestas sobre la sesión actual.
- Esfuerzo fácil/bien/duro por serie, notas al terminar, gráficas de cargas y estadísticas.
- Recuperación automática de borrador después de registrar series; el guardado fallido conserva el entrenamiento.
- Exportación CSV compatible con Excel y copia JSON con importación validada y atómica.
- Caché offline de todos los scripts y navegación; timer basado en hora real.
- Restricciones de rehabilitación y límite semanal de reverse fly; pruebas de 108 combinaciones de check-in.

## Verificación pendiente en dispositivo real

Las pruebas de reglas verifican 108 combinaciones, estados vacíos, sintaxis y archivos offline. `tests/browser.cjs` verifica en Edge headless a 390×844 el flujo, borrador, persistencia IndexedDB, recarga offline, chat local, bloqueo por mareo y timer. Necesita Playwright disponible (`NODE_PATH` apuntando a su instalación). No certifica instalación móvil, sonido/vibración física ni diseño en un teléfono. Probar en Android/iOS antes de considerar esta versión estable.

1. Completar y guardar una sesión; cerrar y abrir, comprobar historial y nota.
2. Registrar una serie, recargar sin terminar y comprobar recuperación.
3. Cargar una vez conectado; después abrir sin red desde el mismo origen.
4. Probar timer cambiando de pestaña. Los navegadores pueden suspender sonido/vibración en segundo plano; al volver se recalcula la cuenta atrás.
5. Exportar JSON y CSV; importar JSON y comprobar que no duplica IDs.

## Límites honestos

- El coach local no es un modelo de lenguaje: interpreta consultas concretas con reglas. No diagnostica lesiones ni garantiza recuperación.
- Las fuentes de Google son opcionales; offline se usan fuentes del sistema.
- Vídeos externos necesitan conexión y enlaces configurados.
- Google Sheets y Groq siguen siendo integraciones opcionales externas; no se han verificado con credenciales. Una respuesta opaca `no-cors` no confirma que Sheets haya guardado.
- Borrar los datos del navegador elimina el histórico; descarga copias JSON regularmente. Los datos no se sincronizan entre dispositivos.
- Bici/core permiten marcar completado. La revisión visual en teléfono sigue pendiente.
