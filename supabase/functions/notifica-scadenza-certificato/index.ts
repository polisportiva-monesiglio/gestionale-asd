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
  const contentSid = Deno.env.get('TWILIO_CONTENT_SID_SCADENZA_CERTIFICATO')

  if (!contentSid) {
    return new Response(
      JSON.stringify({ error: 'Secret TWILIO_CONTENT_SID_SCADENZA_CERTIFICATO non configurato' }),
      { status: 500 }
    )
  }

  const oggi        = new Date()
  const tra30Giorni = new Date(oggi)
  tra30Giorni.setDate(tra30Giorni.getDate() + 30)
  const annoSportivo = getAnnoSportivo(oggi)

  const { data: tesseramenti, error } = await supabase
    .from('tesseramenti_annuali')
    .select('id, socio_id, data_scadenza_certificato, soci(nome, telefono)')
    .eq('anno_sportivo', annoSportivo)
    .gte('data_scadenza_certificato', oggi.toISOString().split('T')[0])
    .lte('data_scadenza_certificato', tra30Giorni.toISOString().split('T')[0])

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  const { data: giaNotificati } = await supabase
    .from('invii_notifiche_certificato')
    .select('socio_id')
    .eq('anno_sportivo', annoSportivo)
    .eq('tipo', '30_giorni')
    .eq('esito', 'inviato')
  const giaNotificatiSet = new Set((giaNotificati ?? []).map((r: { socio_id: string }) => r.socio_id))

  let inviate = 0
  let saltati = 0
  const erroriDettaglio: { socio_id: string; messaggio: string }[] = []

  for (const t of tesseramenti ?? []) {
    const socio = t.soci as unknown as { nome: string; telefono: string | null } | null

    if (!socio?.telefono || giaNotificatiSet.has(t.socio_id)) {
      saltati++
      continue
    }

    const scadenza      = new Date(t.data_scadenza_certificato)
    const giorniRimasti = Math.ceil((scadenza.getTime() - oggi.getTime()) / (1000 * 60 * 60 * 24))

    try {
      // Template approvato: "Ciao {{1}}! ⚠️ Il tuo certificato medico scade
      // tra *{{2}} giorni* ({{3}}). Rinnova il certificato accedendo all'area
      // socio del gestionale."
      await sendWhatsApp(accountSid, authToken, from, socio.telefono, contentSid, {
        '1': socio.nome,
        '2': String(giorniRimasti),
        '3': scadenza.toLocaleDateString('it-IT'),
      })
      inviate++
      await supabase.from('invii_notifiche_certificato').upsert({
        anno_sportivo: annoSportivo,
        socio_id:      t.socio_id,
        tipo:          '30_giorni',
        esito:         'inviato',
        errore_messaggio: null,
        aggiornato_il: new Date().toISOString(),
      })
    } catch (e) {
      const messaggio = e instanceof Error ? e.message : 'Errore sconosciuto'
      erroriDettaglio.push({ socio_id: t.socio_id, messaggio })
      await supabase.from('invii_notifiche_certificato').upsert({
        anno_sportivo: annoSportivo,
        socio_id:      t.socio_id,
        tipo:          '30_giorni',
        esito:         'errore',
        errore_messaggio: messaggio,
        aggiornato_il: new Date().toISOString(),
      })
    }
  }

  return new Response(
    JSON.stringify({ inviate, saltati, errori: erroriDettaglio.length, erroriDettaglio, totale: (tesseramenti ?? []).length }),
    { headers: { 'Content-Type': 'application/json' } }
  )
})
