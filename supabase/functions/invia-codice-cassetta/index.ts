import { createClient } from 'npm:@supabase/supabase-js@2'
import { Resend } from 'npm:resend@4'

function getAnnoSportivo(date: Date = new Date()): string {
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()
  const isNuovaStagione = month > 8 || (month === 8 && day >= 15)
  if (isNuovaStagione) return `${year}/${year + 1}`
  return `${year - 1}/${year}`
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
  const resend = new Resend(Deno.env.get('RESEND_API_KEY'))

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

  const { data: abbonamenti, error: errAbbonamenti } = await supabase
    .from('abbonamenti_soci')
    .select('soci(nome, cognome, email)')
    .eq('stato_pagamento', 'pagato')
    .eq('anno_sportivo', annoSportivo)

  if (errAbbonamenti) {
    return new Response(JSON.stringify({ error: errAbbonamenti.message }), { status: 500 })
  }

  type Socio = { nome: string; cognome: string; email: string | null }
  const destinatari = new Map<string, Socio>()
  for (const row of abbonamenti ?? []) {
    const socio = row.soci as unknown as Socio | null
    if (socio?.email) destinatari.set(socio.email, socio)
  }

  let inviate = 0
  let errori = 0
  for (const socio of destinatari.values()) {
    try {
      const { error } = await resend.emails.send({
        from: 'Polisportiva Monesiglio <onboarding@resend.dev>',
        to: socio.email!,
        subject: 'Codice cassetta chiavi - ASD Monesiglio',
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
            <h2 style="color: #2563eb;">Polisportiva Monesiglio</h2>
            <p>Ciao ${socio.nome},</p>
            <p>Il codice della cassetta chiavi per questo mese è:</p>
            <div style="background-color: #2563eb; font-size: 32px; font-weight: bold; text-align: center; padding: 20px; border-radius: 10px; color: #ffffff;">
              ${codiceCassetta}
            </div>
          </div>
        `,
      })
      if (error) errori++
      else inviate++
    } catch {
      errori++
    }
  }

  return new Response(JSON.stringify({ inviate, errori, totale: destinatari.size }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
