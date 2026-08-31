import { createClient } from 'npm:@supabase/supabase-js@2'

function getAnnoSportivo(date: Date = new Date()): string {
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()
  const isNuovaStagione = month > 8 || (month === 8 && day >= 15)
  if (isNuovaStagione) return `${year}/${year + 1}`
  return `${year - 1}/${year}`
}

const MITTENTE = 'Polisportiva Monesiglio <info@polisportiva-monesiglio.it>'

function testoSicuroHtml(valore: unknown): string {
  return String(valore ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

// L'email e' il canale garantito: non dipende da nessuna verifica di terzi.
// Qui non si puo' riusare lib/notifiche.ts dell'applicazione, che e' codice
// Next.js: questa gira su Deno, dentro Supabase.
async function inviaEmail(chiave: string, a: string[], oggetto: string, html: string): Promise<void> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${chiave}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: MITTENTE, to: a, subject: oggetto, html }),
  })
  if (!res.ok) {
    const d = await res.json().catch(() => ({}))
    throw new Error(d?.message ?? `Resend ha risposto ${res.status}`)
  }
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

function corpoEmail(nome: string, giorni: number, scadenza: string): string {
  return `
    <div style="font-family: Arial, Helvetica, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #eee; border-radius: 10px; color: #111827;">
      <h2 style="color: #b89f21; margin: 0 0 4px;">Polisportiva Monesiglio</h2>
      <p style="margin: 0 0 20px; font-size: 13px; color: #6b7280;">Certificato medico in scadenza</p>
      <p style="font-size: 15px;">Ciao ${testoSicuroHtml(nome)},</p>
      <p style="font-size: 15px;">
        il tuo certificato medico scade fra <strong>${giorni} giorni</strong>, il
        <strong>${testoSicuroHtml(scadenza)}</strong>.
      </p>
      <p style="font-size: 15px;">
        Senza un certificato in corso di validità non è possibile allenarsi: appena hai quello
        nuovo puoi caricarlo dalla tua area personale.
      </p>
      <p style="font-size: 14px;"><a href="https://www.polisportiva-monesiglio.it/area-socio" style="color: #b89f21;">Vai alla tua area personale</a></p>
      <p style="margin-top: 28px; font-size: 11px; color: #9ca3af; border-top: 1px solid #eee; padding-top: 12px;">
        Messaggio automatico del gestionale della ASD Polisportiva Monesiglio.
      </p>
    </div>
  `
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

  const chiaveResend = Deno.env.get('RESEND_API_KEY')
  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID')
  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN')
  const from = Deno.env.get('TWILIO_WHATSAPP_FROM')
  const contentSid = Deno.env.get('TWILIO_CONTENT_SID_SCADENZA_CERTIFICATO')
  const whatsappConfigurato = Boolean(accountSid && authToken && from && contentSid)

  if (!chiaveResend) {
    return new Response(
      JSON.stringify({ error: 'Secret RESEND_API_KEY non configurato: nessun canale garantito' }),
      { status: 500 }
    )
  }

  const oggi = new Date()
  const tra30Giorni = new Date(oggi)
  tra30Giorni.setDate(tra30Giorni.getDate() + 30)
  const annoSportivo = getAnnoSportivo(oggi)

  const { data: tesseramenti, error } = await supabase
    .from('tesseramenti_annuali')
    .select('id, socio_id, data_scadenza_certificato, soci(nome, email, telefono, minorenne, genitore_email)')
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
  let whatsappRiusciti = 0
  let whatsappFalliti = 0
  const erroriDettaglio: { socio_id: string; messaggio: string }[] = []

  for (const t of tesseramenti ?? []) {
    const socio = t.soci as unknown as {
      nome: string
      email: string | null
      telefono: string | null
      minorenne: boolean | null
      genitore_email: string | null
    } | null

    if (giaNotificatiSet.has(t.socio_id)) {
      saltati++
      continue
    }

    // Per un minorenne l'avviso va anche a chi ha firmato per lui: la casella
    // del ragazzo puo' essere una che nessun adulto guarda, e il certificato
    // lo procura un genitore.
    const indirizzi = [...new Set(
      [socio?.email, socio?.minorenne ? socio?.genitore_email : null]
        .filter((x): x is string => typeof x === 'string' && x.includes('@'))
        .map(x => x.trim().toLowerCase())
    )]

    const scadenza = new Date(t.data_scadenza_certificato)
    const giorniRimasti = Math.ceil((scadenza.getTime() - oggi.getTime()) / (1000 * 60 * 60 * 24))
    const canali: Record<string, string> = {}

    // 1. Email: e' il canale su cui si regge l'avviso. Prima chi non aveva un
    //    numero di telefono veniva saltato in silenzio e non era avvisato mai.
    let emailOk = false
    if (indirizzi.length === 0) {
      canali.email = 'saltato: nessun indirizzo'
    } else {
      try {
        await inviaEmail(
          chiaveResend,
          indirizzi,
          `Il certificato medico scade fra ${giorniRimasti} giorni`,
          corpoEmail(socio?.nome ?? 'Socio', giorniRimasti, scadenza.toLocaleDateString('it-IT'))
        )
        canali.email = 'inviato'
        emailOk = true
        inviate++
      } catch (e) {
        const messaggio = e instanceof Error ? e.message : 'Errore sconosciuto'
        canali.email = `errore: ${messaggio}`
        erroriDettaglio.push({ socio_id: t.socio_id, messaggio })
      }
    }

    // 2. WhatsApp: un di piu', con il suo esito registrato a parte.
    if (!whatsappConfigurato) {
      canali.whatsapp = 'saltato: canale non configurato'
    } else if (!socio?.telefono) {
      canali.whatsapp = 'saltato: nessun numero'
    } else {
      try {
        // Template approvato: "Ciao {{1}}! ⚠️ Il tuo certificato medico scade
        // tra *{{2}} giorni* ({{3}}). Rinnova il certificato accedendo all'area
        // socio del gestionale."
        await sendWhatsApp(accountSid!, authToken!, from!, socio.telefono, contentSid!, {
          '1': socio.nome,
          '2': String(giorniRimasti),
          '3': scadenza.toLocaleDateString('it-IT'),
        })
        canali.whatsapp = 'inviato'
        whatsappRiusciti++
      } catch (e) {
        const messaggio = e instanceof Error ? e.message : 'Errore sconosciuto'
        canali.whatsapp = `errore: ${messaggio}`
        whatsappFalliti++
      }
    }

    await supabase.from('invii_notifiche_certificato').upsert({
      anno_sportivo: annoSportivo,
      socio_id: t.socio_id,
      tipo: '30_giorni',
      esito: emailOk ? 'inviato' : 'errore',
      errore_messaggio: emailOk ? null : canali.email,
      canali,
      aggiornato_il: new Date().toISOString(),
    })
  }

  return new Response(
    JSON.stringify({
      inviate,
      saltati,
      errori: erroriDettaglio.length,
      erroriDettaglio,
      totale: (tesseramenti ?? []).length,
      whatsapp: { configurato: whatsappConfigurato, riusciti: whatsappRiusciti, falliti: whatsappFalliti },
    }),
    { headers: { 'Content-Type': 'application/json' } }
  )
})
