/**
 * Svuota gli archivi Supabase dai file di collaudo.
 *
 * Gira in locale e legge SUPABASE_SERVICE_ROLE_KEY da .env.local: usa l'API
 * vera di Storage e non una DELETE su storage.objects, che cancellerebbe solo
 * i metadati lasciando i file orfani nel bucket.
 *
 *   node scripts/pulisci-archivi.mjs           → elenca soltanto
 *   node scripts/pulisci-archivi.mjs --cancella → cancella davvero
 */
import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

const BUCKET = ['certificati_medici', 'certificati-medici', 'moduli-firmati', 'ricevute']
const CANCELLA = process.argv.includes('--cancella')

function leggiEnv(percorso = '.env.local') {
  const env = {}
  for (const riga of readFileSync(percorso, 'utf8').split(/\r?\n/)) {
    const m = riga.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return env
}

const env = leggiEnv()
const url = env.NEXT_PUBLIC_SUPABASE_URL
const chiave = env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !chiave) {
  console.error('Mancano NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(url, chiave, { auth: { persistSession: false } })

/** Elenca ricorsivamente: i moduli stanno in sottocartelle tipo 2026/2027/ */
async function elenca(bucket, prefisso = '') {
  const { data, error } = await supabase.storage.from(bucket).list(prefisso, { limit: 1000 })
  if (error) throw new Error(`${bucket}/${prefisso}: ${error.message}`)

  const percorsi = []
  for (const voce of data ?? []) {
    const completo = prefisso ? `${prefisso}/${voce.name}` : voce.name
    // Le cartelle tornano senza id: si riconoscono così
    if (voce.id === null) percorsi.push(...(await elenca(bucket, completo)))
    else percorsi.push(completo)
  }
  return percorsi
}

let totale = 0
for (const bucket of BUCKET) {
  const percorsi = await elenca(bucket)
  totale += percorsi.length
  console.log(`\n${bucket}: ${percorsi.length} file`)
  for (const p of percorsi) console.log(`   ${p}`)

  if (CANCELLA && percorsi.length > 0) {
    // remove() accetta al massimo un blocco alla volta: vado a gruppi di 100
    for (let i = 0; i < percorsi.length; i += 100) {
      const gruppo = percorsi.slice(i, i + 100)
      const { error } = await supabase.storage.from(bucket).remove(gruppo)
      if (error) console.error(`   ERRORE: ${error.message}`)
    }
    const rimasti = await elenca(bucket)
    console.log(`   → cancellati, rimasti ${rimasti.length}`)
  }
}

console.log(`\nTotale file trovati: ${totale}`)
if (!CANCELLA) console.log('Nessuna cancellazione: rilancia con --cancella per procedere.')
