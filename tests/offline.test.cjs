const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const context = vm.createContext({ console, Date, Set, Map, getAllSessions: async () => [] });
for (const file of ['data.js','rules.js','coach.js']) vm.runInContext(fs.readFileSync(path.join(root,'js',file),'utf8'),context);
const run = code => vm.runInContext(code,context);
test('all 108 check-in combinations evaluate safely', () => {
  for(const rodilla of ['bien','moderado','grave']) for(const energia of ['bien','cansado','mareo']) for(const comida of ['comido','ligero','ayunas']) for(const tiempo of ['30','45','60','75']) {
    const warnings = context.evaluateSafetyRules({rodilla,energia,comida,tiempo});
    assert.ok(Array.isArray(warnings));
    if(energia === 'mareo' || comida === 'ayunas' || rodilla === 'grave') assert.ok(warnings.some(w=>w.level==='block'));
  }
});
test('moderate knee limits rehab but does not remove upper work', () => {
  assert.equal(run("filterExercisesForCheckin(SESSIONS.legs.exercises,{rodilla:'moderado',comida:'comido'}).map(e=>e.id).join(',')"),'bicicleta,curl_femoral');
  assert.equal(run("filterExercisesForCheckin(SESSIONS.push.exercises,{rodilla:'moderado',comida:'comido'}).length"),4);
});
test('severe knee and fasting restrict rehab to bicycle', () => {
  assert.equal(run("filterExercisesForCheckin(SESSIONS.legs.exercises,{rodilla:'grave',comida:'comido'}).map(e=>e.id).join(',')"),'bicicleta');
  assert.equal(run("filterExercisesForCheckin(SESSIONS.legs.exercises,{rodilla:'bien',comida:'ayunas'}).map(e=>e.id).join(',')"),'bicicleta');
});
test('incline progresses after specified 3x15 and has empty-state support', () => {
  assert.equal(context.checkProgression('press_inclinado',[]),null);
  assert.match(context.checkProgression('press_inclinado',[{series:[{kg:15,reps:15},{kg:15,reps:15},{kg:15,reps:15}]}]),/17,5/);
});
test('pulldown cannot progress on reps at incorrect weight', () => {
  const h = [{series:[{kg:10,reps:15},{kg:10,reps:15},{kg:10,reps:15}]}];
  assert.equal(context.checkProgression('jalon_ancho',h.concat(h)),null);
});
test('pain takes precedence over training recommendations', async () => {
  assert.match(await context.localCoachResponse('Me duele el hombro hoy, ¿subir peso?'),/No fuerces/);
});
test('empty history stats and coach do not crash', async () => {
  assert.equal((await context.computeStats()).total,0);
  assert.match(await context.localCoachResponse('última sesión'),/primera/);
});
test('offline shell contains every local script used by HTML', () => {
  const html = fs.readFileSync(path.join(root,'index.html'),'utf8');
  const sw = fs.readFileSync(path.join(root,'service-worker.js'),'utf8');
  for(const match of html.matchAll(/src="(js\/[^?" ]+)/g)) assert.ok(sw.includes(match[1]),match[1]);
});
test('all scripts parse and inline scripts parse', () => {
  for(const file of fs.readdirSync(path.join(root,'js'))) new vm.Script(fs.readFileSync(path.join(root,'js',file),'utf8'));
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  for(const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new vm.Script(m[1]);
});
