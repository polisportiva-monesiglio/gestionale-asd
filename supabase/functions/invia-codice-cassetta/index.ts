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
async function inviaEmail(chiave: string, a: string, oggetto: string, html: string): Promise<void> {
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

function corpoEmail(nome: string, mese: string, codice: string): string {
  return `
    <div style="font-family: Arial, Helvetica, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #eee; border-radius: 10px; color: #111827;">
      <h2 style="color: #b89f21; margin: 0 0 4px;">Polisportiva Monesiglio</h2>
      <p style="margin: 0 0 20px; font-size: 13px; color: #6b7280;">Codice della cassetta delle chiavi</p>
      <p style="font-size: 15px;">Ciao ${testoSicuroHtml(nome)},</p>
      <p style="font-size: 15px;">ecco il codice della cassetta delle chiavi della palestra per ${testoSicuroHtml(mese)}:</p>
      <div style="background:#f2c11b; font-size:32px; font-weight:bold; text-align:center; padding:18px; border-radius:10px; color:#111827; letter-spacing:0.15em;">
        ${testoSicuroHtml(codice)}
      </div>
      <p style="font-size: 13px; color:#6b7280; margin-top:16px;">
        Il codice è personale e riservato: non va comunicato a chi non è socio. Ricorda di
        riporre le chiavi nella cassetta entro le 22:00.
      </p>
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
  const contentSid = Deno.env.get('TWILIO_CONTENT_SID_CODICE_CASSETTA')
  const whatsappConfigurato = Boolean(accountSid && authToken && from && contentSid)

  // Senza posta non si parte: e' il canale su cui si regge la promessa. Il
  // WhatsApp mancante invece non e' un errore, e' solo un canale in meno.
  if (!chiaveResend) {
    return new Response(
      JSON.stringify({ error: 'Secret RESEND_API_KEY non configurato: nessun canale garantito' }),
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
  const annoSportivo = getAnnoSportivo()

  const oggi = new Date()
  const periodo = `${oggi.getFullYear()}-${String(oggi.getMonth() + 1).padStart(2, '0')}`
  const mese = oggi.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })

  // La deduplica e' sull'email, non piu' sul telefono: l'indirizzo ce l'hanno
  // tutti, il numero e' facoltativo. Prima chi non aveva il telefono non
  // riceveva niente e non compariva nemmeno fra gli errori.
  const { data: giaInviati } = await supabase
    .from('invii_codice_cassetta')
    .select('destinatario')
    .eq('periodo', periodo)
    .eq('esito', 'inviato')
  const giaInviatiSet = new Set((giaInviati ?? []).map((r: { destinatario: string }) => r.destinatario))

  type Dest = { nome: string; email: string; telefono: string | null }
  const destinatari = new Map<string, Dest>()

  const aggiungi = (nome: string | null, email: string | null, telefono: string | null) => {
    if (!email) return
    const chiave = email.trim().toLowerCase()
    if (!chiave) return
    const gia = destinatari.get(chiave)
    // Se lo stesso indirizzo compare due volte, si tiene il numero se c'e'.
    destinatari.set(chiave, {
      nome: gia?.nome ?? nome ?? 'Socio',
      email: chiave,
      telefono: gia?.telefono ?? telefono ?? null,
    })
  }

  // Soci con abbonamento pagato nella stagione corrente
  const { data: abbonamenti } = await supabase
    .from('abbonamenti_soci')
    .select('soci(nome, email, telefono)')
    .eq('stato_pagamento', 'pagato')
    .eq('anno_sportivo', annoSportivo)

  for (const row of abbonamenti ?? []) {
    const s = row.soci as unknown as { nome: string; email: string | null; telefono: string | null } | null
    aggiungi(s?.nome ?? null, s?.email ?? null, s?.telefono ?? null)
  }

  // Gestori attivi
  const { data: gestori } = await supabase
    .from('gestori')
    .select('nome, email, telefono')
    .eq('attivo', true)

  for (const g of gestori ?? []) {
    aggiungi(g.nome ?? 'Gestore', g.email ?? null, g.telefono ?? null)
  }

  let inviate = 0
  let saltati = 0
  let whatsappRiusciti = 0
  let whatsappFalliti = 0
  const erroriDettaglio: { destinatario: string; messaggio: string }[] = []

  for (const dest of destinatari.values()) {
    if (giaInviatiSet.has(dest.email)) {
      saltati++
      continue
    }

    const canali: Record<string, string> = {}

    // 1. Email: se fallisce questa, l'avviso non e' partito.
    let emailOk = false
    try {
      await inviaEmail(
        chiaveResend,
        dest.email,
        `Codice cassetta — ${mese}`,
        corpoEmail(dest.nome, mese, codiceCassetta)
      )
      canali.email = 'inviato'
      emailOk = true
      inviate++
    } catch (e) {
      const messaggio = e instanceof Error ? e.message : 'Errore sconosciuto'
      canali.email = `errore: ${messaggio}`
      erroriDettaglio.push({ destinatario: dest.email, messaggio })
    }

    // 2. WhatsApp: un di piu'. Il suo esito si registra a parte, altrimenti un
    //    canale morto resterebbe invisibile dietro un'email riuscita.
    if (!whatsappConfigurato) {
      canali.whatsapp = 'saltato: canale non configurato'
    } else if (!dest.telefono) {
      canali.whatsapp = 'saltato: nessun numero'
    } else {
      try {
        // Template approvato: "Ciao {{1}}! Aggiornamento {{2}}: la cassetta
        // delle chiavi della palestra è impostata su {{3}}"
        await sendWhatsApp(accountSid!, authToken!, from!, dest.telefono, contentSid!, {
          '1': dest.nome,
          '2': mese,
          '3': codiceCassetta,
        })
        canali.whatsapp = 'inviato'
        whatsappRiusciti++
      } catch (e) {
        const messaggio = e instanceof Error ? e.message : 'Errore sconosciuto'
        canali.whatsapp = `errore: ${messaggio}`
        whatsappFalliti++
      }
    }

    await supabase.from('invii_codice_cassetta').upsert({
      periodo,
      destinatario: dest.email,
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
      destinatariErrori: erroriDettaglio,
      totale: destinatari.size,
      whatsapp: { configurato: whatsappConfigurato, riusciti: whatsappRiusciti, falliti: whatsappFalliti },
    }),
    { headers: { 'Content-Type': 'application/json' } }
  )
})
