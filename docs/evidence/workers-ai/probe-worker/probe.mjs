import fs from 'node:fs';
const exp = JSON.parse(fs.readFileSync('../real/expected.json','utf8'));
const models = process.argv.slice(2);
const results = [];
for (const model of models) for (const e of exp) {
  const image = fs.readFileSync('../real/'+e.file).toString('base64');
  const r = await (await fetch('http://127.0.0.1:8799', { method:'POST', body: JSON.stringify({ model, image }) })).json();
  let parsed = null; let raw = r.out?.response;
  if (raw && typeof raw === 'object') parsed = raw; else if (typeof raw === 'string') { const m = raw.match(/\{[\s\S]*\}/); try { parsed = JSON.parse(m?.[0] ?? ''); } catch {} }
  const fields = ['issuerName','recipientName','documentNumber','issueDate','dueDate','net','gst','total'];
  const norm = v => String(v ?? '').replace(/[$,\s]/g,'').toLowerCase();
  const score = parsed ? fields.filter(f => norm(parsed[f]) === norm(e[f]) || (['net','gst','total'].includes(f) && Number(norm(parsed[f])) === Number(e[f]))).length : 0;
  results.push({ model, file:e.file, ok:r.ok, ms:r.ms, error:r.error, jsonParsed: !!parsed, fieldsCorrect: `${score}/${fields.length}`, lineItems: parsed?.lineItems?.length, expectedLineItems: e.lineCount, mismatches: parsed ? fields.filter(f => !(norm(parsed[f]) === norm(e[f]) || (['net','gst','total'].includes(f) && Number(norm(parsed[f])) === Number(e[f])))).map(f=>`${f}: got ${JSON.stringify(parsed[f])} want ${e[f]}`) : [], usage: r.out?.usage });
  console.log(JSON.stringify(results.at(-1)));
}
fs.writeFileSync('results.json', JSON.stringify(results,null,2));
