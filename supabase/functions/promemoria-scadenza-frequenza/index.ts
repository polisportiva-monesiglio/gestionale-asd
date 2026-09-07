import { createClient } from 'npm:@supabase/supabase-js@2'

/**
 * Il promemoria che avvisa un socio che il suo periodo di frequenza sta per
 * finire.
 *
 * Nasce da un conto vero: al 7 settembre 2026, nove periodi su quattordici
 * finivano tutti lo stesso giorno — il 30 settembre — perché erano i mensili
 * comprati nella prima settimana di apertura. Senza un avviso, il 1° ottobre
 * nove persone si sarebbero presentate in palestra senza potervi entrare.
 *
 * È il fratello di `notifica-scadenza-certificato` e ne ricalca la forma: la
 * posta è il canale su cui si regge l'avviso, l'esito si registra per non
 * riscrivere due volte, e chi non ha un indirizzo viene contato come saltato
 * invece di sparire in silenzio.
 *
 * **WhatsApp qui non c'è.** Non per dimenticanza: un messaggio iniziato
 * dall'associazione fuori dalla finestra di 24 ore richiede un modello
 * approvato da Meta, e quello approvato parla del certificato medico. Usarlo
 * per la frequenza direbbe la cosa sbagliata. Quando ce ne sarà uno per la
 * scadenza del periodo, si aggiunge qui come secondo canale.
 */

/**
 * Quanti giorni prima si avvisa.
 *
 * Cinque perché i periodi finiscono a fine mese: cinque giorni prima del 30
 * cade il 25, che è il momento in cui un socio può ancora passare in palestra
 * a pagare il rinnovo senza restare scoperto nemmeno un giorno.
 *
 * Il lavoro programmato gira **ogni giorno** e non il 25 di ogni mese: legarsi
 * a un giorno del calendario funziona finché tutti i periodi finiscono a fine
 * mese, e smetterebbe di funzionare in silenzio il giorno in cui uno non ci
 * finisce più.
 */
const GIORNI_DI_PREAVVISO = 5

const TIPO = '5_giorni'
const MITTENTE = 'Polisportiva Monesiglio <info@polisportiva-monesiglio.it>'

function testoSicuroHtml(valore: unknown): string {
  return String(valore ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function getAnnoSportivo(date: Date = new Date()): string {
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()
  const isNuovaStagione = month > 8 || (month === 8 && day >= 15)
  return isNuovaStagione ? `${year}/${year + 1}` : `${year - 1}/${year}`
}

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

function corpoEmail(nome: string, attivita: string, scadenza: string, giorni: number): string {
  const quando = giorni === 1 ? 'domani' : `fra ${giorni} giorni`
  return `
    <div style="font-family: Arial, Helvetica, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #eee; border-radius: 10px; color: #111827;">
      <h2 style="color: #b89f21; margin: 0 0 4px;">Polisportiva Monesiglio</h2>
      <p style="margin: 0 0 20px; font-size: 13px; color: #6b7280;">Il periodo di frequenza sta per finire</p>
      <p style="font-size: 15px;">Ciao ${testoSicuroHtml(nome)},</p>
      <p style="font-size: 15px;">
        il tuo periodo di frequenza <strong>${testoSicuroHtml(attivita)}</strong> finisce
        ${quando}, il <strong>${testoSicuroHtml(scadenza)}</strong>.
      </p>
      <p style="font-size: 15px;">
        Se vuoi continuare ad allenarti, puoi chiedere il nuovo periodo dalla tua area
        personale e pagarlo a un consigliere. Facendolo in questi giorni non resti scoperto
        nemmeno un giorno.
      </p>
      <p style="font-size: 15px;">Se invece non intendi rinnovare, non devi fare nulla.</p>
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

  // Modalità anteprima: dice **chi riceverebbe cosa senza spedire niente e
  // senza scrivere niente**. Esiste perché un promemoria automatico si prova
  // una volta sola nel modo sbagliato: quando è già nella posta di venti
  // persone.
  const parametri = new URL(req.url).searchParams
  const anteprima = parametri.get('anteprima') === '1'

  // In anteprima si puo' chiedere "chi lo riceverebbe il tal giorno?".
  //
  // Un lavoro che parte a una data si prova male: per sapere se il 25 fa la
  // cosa giusta bisognerebbe aspettare il 25. Il parametro **vale solo in
  // anteprima** - fuori viene ignorato - quindi non puo' far partire un invio
  // vero con una data finta.
  const giornoFinto = anteprima ? parametri.get('giorno') : null

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const chiaveResend = Deno.env.get('RESEND_API_KEY')
  if (!chiaveResend && !anteprima) {
    return new Response(
      JSON.stringify({ error: 'Secret RESEND_API_KEY non configurato: nessun canale garantito' }),
      { status: 500 }
    )
  }

  const oggi = giornoFinto ? new Date(`${giornoFinto}T09:00:00Z`) : new Date()
  if (Number.isNaN(oggi.getTime())) {
    return new Response(JSON.stringify({ error: 'Parametro giorno non valido' }), { status: 400 })
  }
  const oggiIso = oggi.toISOString().split('T')[0]
  const limite = new Date(oggi)
  limite.setDate(limite.getDate() + GIORNI_DI_PREAVVISO)
  const limiteIso = limite.toISOString().split('T')[0]
  const annoSportivo = getAnnoSportivo(oggi)

  // Solo i periodi pagati: uno ancora da confermare non è una frequenza che
  // scade, è una richiesta in attesa, e chi l'ha fatta non capirebbe un
  // promemoria per qualcosa che non ha ancora.
  const { data: abbonamenti, error } = await supabase
    .from('abbonamenti_soci')
    .select(`
      id, socio_id, data_fine_validita,
      catalogo_attivita(nome_attivita),
      soci(nome, email, minorenne, genitore_email)
    `)
    .eq('anno_sportivo', annoSportivo)
    .eq('stato_pagamento', 'pagato')
    .gte('data_fine_validita', oggiIso)
    .lte('data_fine_validita', limiteIso)

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  const { data: giaAvvisati } = await supabase
    .from('invii_promemoria_frequenza')
    .select('abbonamento_id')
    .eq('tipo', TIPO)
    .eq('esito', 'inviato')
  const giaAvvisatiSet = new Set(
    (giaAvvisati ?? []).map((r: { abbonamento_id: string }) => r.abbonamento_id)
  )

  let inviate = 0
  let saltati = 0
  const errori: { abbonamento_id: string; messaggio: string }[] = []
  const destinatari: { socio: string; a: string[]; scade: string; giorni: number; attivita: string }[] = []

  for (const a of abbonamenti ?? []) {
    if (giaAvvisatiSet.has(a.id)) {
      saltati++
      continue
    }

    const socio = a.soci as unknown as {
      nome: string
      email: string | null
      minorenne: boolean | null
      genitore_email: string | null
    } | null
    const att = a.catalogo_attivita as unknown as { nome_attivita: string } | null

    // Per un minorenne l'avviso va anche a chi ha firmato per lui: a pagare il
    // rinnovo è un genitore, e la casella del ragazzo può essere una che
    // nessun adulto guarda.
    const indirizzi = [...new Set(
      [socio?.email, socio?.minorenne ? socio?.genitore_email : null]
        .filter((x): x is string => typeof x === 'string' && x.includes('@'))
        .map(x => x.trim().toLowerCase())
    )]

    const scadenza = a.data_fine_validita as string
    // Sulle date, non sulle ore: la differenza in millisecondi farebbe dire
    // numeri diversi a seconda dell'ora in cui gira il lavoro.
    const giorni = Math.round(
      (new Date(`${scadenza}T12:00:00Z`).getTime() - new Date(`${oggiIso}T12:00:00Z`).getTime()) / 86400000
    )
    const nomeAttivita = att?.nome_attivita ?? 'Periodo di frequenza'
    const scadenzaIt = new Date(`${scadenza}T12:00:00Z`).toLocaleDateString('it-IT')

    destinatari.push({
      socio: socio?.nome ?? 'Socio',
      a: indirizzi,
      scade: scadenzaIt,
      giorni,
      attivita: nomeAttivita,
    })

    if (anteprima) continue

    const canali: Record<string, string> = {}
    let emailOk = false

    if (indirizzi.length === 0) {
      canali.email = 'saltato: nessun indirizzo'
    } else {
      try {
        await inviaEmail(
          chiaveResend!,
          indirizzi,
          giorni === 1
            ? 'Il tuo periodo di frequenza finisce domani'
            : `Il tuo periodo di frequenza finisce fra ${giorni} giorni`,
          corpoEmail(socio?.nome ?? 'Socio', nomeAttivita, scadenzaIt, giorni)
        )
        canali.email = 'inviato'
        emailOk = true
        inviate++
      } catch (e) {
        const messaggio = e instanceof Error ? e.message : 'Errore sconosciuto'
        canali.email = `errore: ${messaggio}`
        errori.push({ abbonamento_id: a.id, messaggio })
      }
    }

    // L'esito si scrive **sempre**, riuscito o no. Registrando solo i successi
    // non si saprebbe mai che a qualcuno l'avviso non è arrivato; registrando
    // l'errore, il giro del giorno dopo riprova (la lettura dei già avvisati
    // filtra su `esito = 'inviato'`).
    await supabase.from('invii_promemoria_frequenza').upsert({
      abbonamento_id: a.id,
      tipo: TIPO,
      esito: emailOk ? 'inviato' : 'errore',
      errore_messaggio: emailOk ? null : canali.email,
      canali,
      aggiornato_il: new Date().toISOString(),
    })
  }

  return new Response(
    JSON.stringify({
      anteprima,
      giornoSimulato: giornoFinto,
      preavvisoGiorni: GIORNI_DI_PREAVVISO,
      finestra: { da: oggiIso, a: limiteIso },
      trovati: (abbonamenti ?? []).length,
      giaAvvisati: saltati,
      inviate,
      errori: errori.length,
      erroriDettaglio: errori,
      destinatari,
    }, null, 2),
    { headers: { 'Content-Type': 'application/json' } }
  )
})
