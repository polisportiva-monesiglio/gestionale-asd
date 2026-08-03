// Funzione diagnostica per il canale WhatsApp: interroga in sola lettura l'API
// Twilio per lo stato del sender e degli ultimi messaggi inviati, con relativo
// codice di errore. È quella che il 2026-07-28 ha isolato l'errore 63051
// (WABA bloccato da Meta) escludendo problemi di configurazione.
//
// NON è deployata: finché il canale WhatsApp resta fermo non ha senso tenere
// un endpoint vivo, ma il codice serve se il problema si ripresenta. Per
// rimetterla su: supabase functions deploy diagnostica-whatsapp
Deno.serve(async (req: Request) => {
  const cronSecret = Deno.env.get('CRON_SECRET')
  if (!cronSecret || req.headers.get('x-cron-secret') !== cronSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID')!
  const authToken  = Deno.env.get('TWILIO_AUTH_TOKEN')!
  const from       = Deno.env.get('TWILIO_WHATSAPP_FROM')
  const sidCassetta   = Deno.env.get('TWILIO_CONTENT_SID_CODICE_CASSETTA')
  const sidCertificato = Deno.env.get('TWILIO_CONTENT_SID_SCADENZA_CERTIFICATO')

  const auth = 'Basic ' + btoa(`${accountSid}:${authToken}`)

  async function get(url: string) {
    try {
      const res = await fetch(url, { headers: { Authorization: auth } })
      const body = await res.json()
      return { status: res.status, body }
    } catch (e) {
      return { status: 0, body: { error: e instanceof Error ? e.message : 'fetch fallita' } }
    }
  }

  // Ultimi messaggi con stato ed eventuale codice errore
  const messaggi = await get(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json?PageSize=10`
  )
  const ultimiMessaggi = (messaggi.body?.messages ?? []).map((m: Record<string, unknown>) => ({
    to: m.to,
    status: m.status,
    error_code: m.error_code,
    error_message: m.error_message,
    date_sent: m.date_sent,
  }))

  // Stato dei sender WhatsApp registrati
  const senders = await get('https://messaging.twilio.com/v2/channels/senders')

  return new Response(
    JSON.stringify({
      config: {
        from,
        content_sid_cassetta: sidCassetta,
        content_sid_certificato: sidCertificato,
        account_sid_prefix: accountSid?.slice(0, 6),
      },
      ultimiMessaggi,
      senders: { status: senders.status, body: senders.body },
    }, null, 2),
    { headers: { 'Content-Type': 'application/json' } }
  )
})
