// Local files only: no account, upload or network connection is required.
function downloadLocalFile(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], {type}));
  const link = document.createElement('a');
  link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function exportBackup() {
  const sessions = await getAllSessions();
  downloadLocalFile('coach-teo-backup.json', JSON.stringify({version:1,sessions},null,2),'application/json');
}
async function exportCSV() {
  const sessions = await getAllSessions();
  // Neutralize spreadsheet formulas in user-entered text.
  const cell = value => '"' + String(value ?? '').replace(/^[=+@-]/, "'$&").replaceAll('"','""') + '"';
  const rows = [['Fecha','Sesión','Ejercicio','Serie','Kg','Reps','Esfuerzo','Comentarios']];
  for(const s of sessions) for(const ex of s.ejercicios || []) (ex.series || []).forEach((set,i) => rows.push([s.fecha,s.tipo,ex.nombre,i+1,set.kg,set.reps,set.rpe,s.nota]));
  downloadLocalFile('coach-teo-entrenos.csv','\uFEFF'+rows.map(row=>row.map(cell).join(';')).join('\r\n'),'text/csv;charset=utf-8');
}
async function importBackup(input) {
  try {
    const file = input.files[0];
    if(!file) return;
    if(file.size > 10 * 1024 * 1024) throw new Error('Archivo demasiado grande');
    const data = JSON.parse(await file.text());
    if(data.version !== 1 || !Array.isArray(data.sessions)) throw new Error('Formato incorrecto');
    for(const s of data.sessions) {
      if(!Number.isFinite(s.id) || !Number.isFinite(Date.parse(s.fecha)) || !['push','pull','legs','upper'].includes(s.tipo) || !Array.isArray(s.ejercicios)) throw new Error('Sesión inválida');
      for(const e of s.ejercicios) {
        if(typeof e.nombre !== 'string' || !Array.isArray(e.series)) throw new Error('Ejercicio inválido');
        for(const set of e.series) if(!Number.isFinite(set.kg) || set.kg < 0 || !Number.isFinite(set.reps) || set.reps <= 0) throw new Error('Serie inválida');
      }
    }
    // Validate the whole file before writing; matching IDs update existing records.
    await importSessions(data.sessions);
    showToast('Copia restaurada', 'success');
  } catch(error) { showToast('No se pudo importar: '+error.message,'error'); }
  finally { input.value=''; }
}
