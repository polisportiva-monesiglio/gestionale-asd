import { createClient } from 'npm:@supabase/supabase-js@2'

function getAnnoSportivo(date: Date = new Date()): string {
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()
  const isNuovaStagione = month > 8 || (month === 8 && day >= 15)
  if (isNuovaStagione) return `${year}/${year + 1}`
  return `${year - 1}/${year}`
}

// Invia un messaggio WhatsApp usando un template pre-approvato da Meta
// (obbligatorio per i messaggi business-initiated fuori dalla finestra 24h).
async function sendWhatsApp(
  accountSid: string,
  authToken: string,
  from: string,
  to: string,
  contentSid: string,
  variables: Record<string, string>
): Promise<void> {
  const params = new URLSearchParams({
    From: from,
    To: `whatsapp:${to}`,
    ContentSid: contentSid,
    ContentVariables: JSON.stringify(variables),
  })
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + btoa(`${accountSid}:${authToken}`),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    }
  )
  const data = await res.json()
  if (!res.ok) throw new Error(data.message ?? 'Errore Twilio')
}

Deno.serve(async (req: Request) => {
  const cronSecret = Deno.env.get('CRON_SECRET')
  if (!cronSecret || req.headers.get('x-cron-secret') !== cronSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )
  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID')!
  const authToken  = Deno.env.get('TWILIO_AUTH_TOKEN')!
  const from       = Deno.env.get('TWILIO_WHATSAPP_FROM')!
  const contentSid = Deno.env.get('TWILIO_CONTENT_SID_CODICE_CASSETTA')

  if (!contentSid) {
    return new Response(
      JSON.stringify({ error: 'Secret TWILIO_CONTENT_SID_CODICE_CASSETTA non configurato' }),
      { status: 500 }
    )
  }

  const { data: impostazione, error: errImpostazioni } = await supabase
    .from('impostazioni')
    .select('valore')
    .eq('chiave', 'codice_cassetta')
    .maybeSingle()

  if (errImpostazioni || !impostazione?.valore) {
    return new Response(JSON.stringify({ error: 'Codice cassetta non configurato' }), { status: 500 })
  }
  const codiceCassetta = impostazione.valore
  const annoSportivo   = getAnnoSportivo()

  const oggi    = new Date()
  const periodo = `${oggi.getFullYear()}-${String(oggi.getMonth() + 1).padStart(2, '0')}`
  const mese    = oggi.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })

  const { data: giaInviati } = await supabase
    .from('invii_codice_cassetta')
    .select('destinatario')
    .eq('periodo', periodo)
    .eq('esito', 'inviato')
  const giaInviatiSet = new Set((giaInviati ?? []).map((r: { destinatario: string }) => r.destinatario))

  type Dest = { nome: string; telefono: string }
  const destinatari = new Map<string, Dest>()

  // Soci con abbonamento pagato nella stagione corrente
  const { data: abbonamenti } = await supabase
    .from('abbonamenti_soci')
    .select('soci(nome, telefono)')
    .eq('stato_pagamento', 'pagato')
    .eq('anno_sportivo', annoSportivo)

  for (const row of abbonamenti ?? []) {
    const s = row.soci as unknown as { nome: string; telefono: string | null } | null
    if (s?.telefono) destinatari.set(s.telefono, { nome: s.nome, telefono: s.telefono })
  }

  // Gestori attivi con numero di telefono
  const { data: gestori } = await supabase
    .from('gestori')
    .select('nome, telefono')
    .eq('attivo', true)
    .not('telefono', 'is', null)

  for (const g of gestori ?? []) {
    if (g.telefono) destinatari.set(g.telefono, { nome: g.nome ?? 'Gestore', telefono: g.telefono })
  }

  let inviate = 0
  let saltati = 0
  const erroriDettaglio: { destinatario: string; messaggio: string }[] = []

  for (const dest of destinatari.values()) {
    if (giaInviatiSet.has(dest.telefono)) {
      saltati++
      continue
    }

    try {
      // Template approvato: "Ciao {{1}}! Per il mese di {{2}} il codice di
      // apertura della cassetta delle chiavi della palestra è {{3}}."
      await sendWhatsApp(accountSid, authToken, from, dest.telefono, contentSid, {
        '1': dest.nome,
        '2': mese,
        '3': codiceCassetta,
      })
      inviate++
      await supabase.from('invii_codice_cassetta').upsert({
        periodo, destinatario: dest.telefono, esito: 'inviato', errore_messaggio: null, aggiornato_il: new Date().toISOString(),
      })
    } catch (e) {
      const messaggio = e instanceof Error ? e.message : 'Errore sconosciuto'
      erroriDettaglio.push({ destinatario: dest.telefono, messaggio })
      await supabase.from('invii_codice_cassetta').upsert({
        periodo, destinatario: dest.telefono, esito: 'errore', errore_messaggio: messaggio, aggiornato_il: new Date().toISOString(),
      })
    }
  }

  return new Response(
    JSON.stringify({ inviate, saltati, errori: erroriDettaglio.length, destinatariErrori: erroriDettaglio, totale: destinatari.size }),
    { headers: { 'Content-Type': 'application/json' } }
  )
})
