/**
 * Sposta i certificati dal vecchio archivio `certificati_medici` (underscore,
 * usato dal form pubblico) a `certificati-medici`, sotto il prefisso
 * `iscrizioni/`, e allinea i riferimenti in tabella.
 *
 * Da lanciare una volta sola. Senza --esegui si limita a mostrare il piano.
 *
 *   node scripts/unifica-certificati.mjs
 *   node scripts/unifica-certificati.mjs --esegui
 */
import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

const VECCHIO = 'certificati_medici'
const NUOVO = 'certificati-medici'
const PREFISSO = 'iscrizioni'
const ESEGUI = process.argv.includes('--esegui')

const env = {}
for (const riga of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = riga.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const { data: file, error } = await supabase.storage.from(VECCHIO).list('', { limit: 1000 })
if (error) throw error

const daSpostare = (file ?? []).filter(f => f.id !== null)
console.log(`Trovati ${daSpostare.length} file in ${VECCHIO}\n`)

for (const f of daSpostare) {
  const destinazione = `${PREFISSO}/${f.name}`
  console.log(`  ${f.name}  →  ${NUOVO}/${destinazione}`)
  if (!ESEGUI) continue

  const { data: contenuto, error: errDownload } = await supabase.storage.from(VECCHIO).download(f.name)
  if (errDownload) { console.error(`     scaricamento fallito: ${errDownload.message}`); continue }

  const buffer = Buffer.from(await contenuto.arrayBuffer())
  const { error: errUpload } = await supabase.storage.from(NUOVO).upload(destinazione, buffer, {
    contentType: f.metadata?.mimetype ?? 'application/pdf',
    upsert: true,
  })
  if (errUpload) { console.error(`     caricamento fallito: ${errUpload.message}`); continue }

  // Allinea i riferimenti: i percorsi del vecchio archivio non hanno cartelle,
  // quelli dell'area socio cominciano con l'id utente. Il prefisso distingue.
  for (const [tabella, colonna] of [['tesseramenti_annuali', 'url_certificato_pdf'],
                                    ['certificati_medici_storico', 'url_certificato_pdf']]) {
    const { error: errUpd } = await supabase.from(tabella).update({ [colonna]: destinazione }).eq(colonna, f.name)
    if (errUpd) console.error(`     ${tabella}: ${errUpd.message}`)
  }

  const { error: errDel } = await supabase.storage.from(VECCHIO).remove([f.name])
  if (errDel) console.error(`     rimozione originale fallita: ${errDel.message}`)
  else console.log('     spostato')
}

if (!ESEGUI) console.log('\nNessuna modifica: rilancia con --esegui.')
else console.log('\nFatto.')
