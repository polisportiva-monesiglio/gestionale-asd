'use server'

import { after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { notificaPagamentoConfermato, notificaRichiestaRifiutata } from '@/lib/notifiche'
import { formattaGiorno } from '@/lib/abbonamento'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { getAnnoSportivo } from '@/lib/stagione'
import fs from 'fs'
import path from 'path'

const ASSOCIAZIONE = {
  nome: 'ASD Polisportiva Monesiglio',
  cf: '93058330049',
  piva: '04040870042',
  sede: 'Piazza XX Settembre 2, 12077 Monesiglio (CN)',
}

export type GestoreResult =
  | { ok: true; message: string; ricevutaPath?: string }
  | { ok: false; error: string }

async function getGestore(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from('gestori')
    .select('id, nome')
    .eq('user_id', user.id)
    .eq('attivo', true)
    .maybeSingle()
  return data ? { ...data, email: user.email } : null
}

export async function confermaPagamento(
  _prev: GestoreResult | null,
  formData: FormData
): Promise<GestoreResult> {
  const supabase = await createClient()
  const gestore = await getGestore(supabase)
  if (!gestore) return { ok: false, error: 'Accesso non autorizzato.' }

  const abbonamentiId = formData.get('abbonamento_id') as string
  if (!abbonamentiId) return { ok: false, error: 'Richiesta non indicata.' }

  // Fetch abbonamento completo
  const { data: ab, error: abErr } = await supabase
    .from('abbonamenti_soci')
    .select(`
      id, stato_pagamento, importo_tesseramento_uisp, metodo_pagamento, data_acquisto,
      numero_ricevuta_riservato, inizio_scelto, data_inizio_validita, data_fine_validita,
      catalogo_attivita(nome_attivita, prezzo_base),
      soci(id, nome, cognome, email, cf, minorenne, genitore_email)
    `)
    .eq('id', abbonamentiId)
    .eq('stato_pagamento', 'da_saldare')
    .single()

  if (abErr || !ab) return { ok: false, error: 'Richiesta non trovata o già confermata.' }

  // Claim atomico: solo chi riesce ad aggiornare lo stato procede.
  // Evita doppie conferme/ricevute duplicate se due gestori agiscono in contemporanea.
  const { data: claimed, error: claimErr } = await supabase
    .from('abbonamenti_soci')
    .update({ stato_pagamento: 'pagato' })
    .eq('id', abbonamentiId)
    .eq('stato_pagamento', 'da_saldare')
    .select('id')
    .maybeSingle()

  if (claimErr) return { ok: false, error: `Aggiornamento stato fallito: ${claimErr.message}` }
  if (!claimed) return { ok: false, error: 'Richiesta già confermata da un altro gestore.' }

  // Numero ricevuta sequenziale per anno, generato atomicamente lato DB.
  //
  // Se un tentativo precedente su questo stesso abbonamento aveva gia' estratto
  // un numero senza arrivare a salvare la ricevuta, si riusa quello: sotto quel
  // numero non e' mai stato emesso nulla, e prenderne un altro lascerebbe un
  // salto permanente nella numerazione. La conferma e' esclusiva per
  // abbonamento (vedi il claim qui sopra), quindi non c'e' modo che due
  // ricevute diverse finiscano sullo stesso numero.
  const anno = new Date().getFullYear()
  const riservato = ab.numero_ricevuta_riservato as string | null

  // Il numero riservato vale solo dentro il proprio anno. Una conferma iniziata
  // il 31 dicembre e ripresa il 2 gennaio riuserebbe altrimenti un numero del
  // 2025 su una ricevuta datata 2026, archiviata sotto la cartella del 2026:
  // il contatore e' per anno, e mescolarli disfa proprio la sequenza che serve
  // a tenere. In quel caso il salto nell'anno abbandonato e' il male minore.
  let numeroRicevuta = riservato && riservato.startsWith(`RIC-${anno}-`) ? riservato : null

  if (!numeroRicevuta) {
    const { data: nuovoNumero, error: numeroErr } = await supabase
      .rpc('genera_numero_ricevuta', { p_anno: anno })

    if (numeroErr || !nuovoNumero) {
      // Rilascia il claim per non lasciare l'abbonamento bloccato su "pagato" senza ricevuta
      await supabase.from('abbonamenti_soci').update({ stato_pagamento: 'da_saldare' }).eq('id', abbonamentiId)
      return { ok: false, error: `Generazione numero ricevuta fallita: ${numeroErr?.message ?? 'errore sconosciuto'}` }
    }

    numeroRicevuta = nuovoNumero as string

    // Annotato subito: se il salvataggio si interrompe da qui in poi, il
    // prossimo tentativo ritrova questo numero invece di bruciarne un altro.
    //
    // L'esito si controlla, perche' e' l'annotazione stessa a reggere la
    // promessa: se fallisse in silenzio e poi fallisse anche l'archiviazione,
    // il tentativo successivo non troverebbe nulla da riusare e brucerebbe un
    // numero — cioe' esattamente il difetto che questa riserva esiste per
    // evitare, solo piu' difficile da notare.
    const { error: riservaErr } = await supabase
      .from('abbonamenti_soci')
      .update({ numero_ricevuta_riservato: numeroRicevuta })
      .eq('id', abbonamentiId)

    if (riservaErr) {
      await supabase.from('abbonamenti_soci').update({ stato_pagamento: 'da_saldare' }).eq('id', abbonamentiId)
      return { ok: false, error: `Riserva del numero di ricevuta fallita: ${riservaErr.message}` }
    }
  }

  type SocioRicevuta = { nome?: string; cognome?: string; email?: string; cf?: string; minorenne?: boolean; genitore_email?: string | null }
  const socio = Array.isArray(ab.soci) ? (ab.soci[0] as SocioRicevuta) : (ab.soci as SocioRicevuta | null)
  const attivita = Array.isArray(ab.catalogo_attivita) ? ab.catalogo_attivita[0] : (ab.catalogo_attivita as { nome_attivita?: string; prezzo_base?: number } | null)
  const prezzoBase = Number(attivita?.prezzo_base ?? 0)
  const uisp = Number(ab.importo_tesseramento_uisp ?? 0)
  const totale = prezzoBase + uisp
  const metodo = ab.metodo_pagamento ?? 'contanti'

  // Genera PDF ricevuta
  const annoSportivo = getAnnoSportivo()
  const pdfDoc = await PDFDocument.create()
  const page = pdfDoc.addPage([595, 460])
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const logoBytes = fs.readFileSync(path.join(process.cwd(), 'public', 'logo-asd-monesiglio.png'))
  const logoImg = await pdfDoc.embedPng(logoBytes)
  const { width, height } = page.getSize()
  const black = rgb(0.13, 0.13, 0.13)
  const gold = rgb(0.78, 0.62, 0.13)
  const lightGold = rgb(0.92, 0.85, 0.6)
  const gray = rgb(0.45, 0.45, 0.45)
  const dark = rgb(0.1, 0.1, 0.1)
  const lineGray = rgb(0.85, 0.85, 0.85)

  // Header nero con filo oro
  page.drawRectangle({ x: 0, y: height - 72, width, height: 72, color: black })
  page.drawRectangle({ x: 0, y: height - 75, width, height: 3, color: gold })
  const logoSize = 38
  page.drawImage(logoImg, { x: 30, y: height - 55, width: logoSize, height: logoSize })
  page.drawText(ASSOCIAZIONE.nome, { x: 30 + logoSize + 10, y: height - 28, size: 15, font: fontBold, color: rgb(1, 1, 1) })
  page.drawText('RICEVUTA DI PAGAMENTO', { x: 30 + logoSize + 10, y: height - 48, size: 10, font, color: lightGold })
  page.drawText(numeroRicevuta, { x: width - 160, y: height - 32, size: 13, font: fontBold, color: gold })
  page.drawText(`Data: ${new Date().toLocaleDateString('it-IT')}`, { x: width - 160, y: height - 52, size: 9, font, color: rgb(0.85, 0.85, 0.85) })

  // Dati associazione
  const assY = height - 88
  page.drawText(
    `C.F. ${ASSOCIAZIONE.cf}  ·  P.IVA ${ASSOCIAZIONE.piva}  ·  ${ASSOCIAZIONE.sede}`,
    { x: 30, y: assY, size: 8, font, color: gray }
  )

  // Dati socio
  const secY = height - 116
  page.drawText('SOCIO', { x: 30, y: secY, size: 8, font: fontBold, color: gold })
  page.drawLine({ start: { x: 30, y: secY - 4 }, end: { x: 280, y: secY - 4 }, thickness: 0.5, color: gold })
  page.drawText(`${socio?.nome ?? ''} ${socio?.cognome ?? ''}`, { x: 30, y: secY - 18, size: 13, font: fontBold, color: dark })
  if (socio?.cf) page.drawText(`C.F.: ${socio.cf}`, { x: 30, y: secY - 34, size: 9, font, color: gray })
  if (socio?.email) page.drawText(`Email: ${socio.email}`, { x: 30, y: secY - 48, size: 9, font, color: gray })

  // Causale, con le voci del bilancio approvato dal commercialista: le "quote
  // associative" sono i 20 euro di tesseramento, i "corrispettivi mensili" la
  // frequenza della sala pesi. "Corrispettivi specifici" no: quella voce il
  // bilancio la tiene per i corsi, che qui non si vendono.
  const causale = uisp > 0
    ? `Causale: quota associativa e corrispettivo mensile - stagione ${annoSportivo}`
    : `Causale: corrispettivo mensile - stagione ${annoSportivo}`
  page.drawText(causale, { x: 30, y: secY - 66, size: 9, font, color: gray })

  // Dettaglio
  const detY = height - 200
  page.drawText('DETTAGLIO', { x: 30, y: detY, size: 8, font: fontBold, color: gold })
  page.drawLine({ start: { x: 30, y: detY - 4 }, end: { x: width - 30, y: detY - 4 }, thickness: 0.5, color: lineGray })

  page.drawText('Descrizione', { x: 30, y: detY - 18, size: 8, font: fontBold, color: gray })
  page.drawText('Importo', { x: width - 90, y: detY - 18, size: 8, font: fontBold, color: gray })

  let rowY = detY - 36
  page.drawText(attivita?.nome_attivita ?? 'Periodo di frequenza', { x: 30, y: rowY, size: 11, font, color: dark })
  page.drawText(`€ ${prezzoBase.toFixed(2)}`, { x: width - 90, y: rowY, size: 11, font, color: dark })

  if (uisp > 0) {
    rowY -= 20
    page.drawText('Quota annuale di tesseramento', { x: 30, y: rowY, size: 11, font, color: dark })
    page.drawText(`€ ${uisp.toFixed(2)}`, { x: width - 90, y: rowY, size: 11, font, color: dark })
  }

  // Totale
  rowY -= 16
  page.drawLine({ start: { x: 30, y: rowY }, end: { x: width - 30, y: rowY }, thickness: 0.5, color: lineGray })
  rowY -= 20
  page.drawText('TOTALE', { x: 30, y: rowY, size: 12, font: fontBold, color: dark })
  page.drawText(`€ ${totale.toFixed(2)}`, { x: width - 110, y: rowY, size: 15, font: fontBold, color: black })

  rowY -= 18
  page.drawText(`Metodo: ${metodo.charAt(0).toUpperCase() + metodo.slice(1)}`, { x: 30, y: rowY, size: 9, font, color: gray })

  // Il periodo di validita' e' il motivo per cui il socio tiene la ricevuta:
  // gli dice fino a quando puo' entrare. Sta sotto il metodo, dove c'e' spazio
  // libero fino al piede, cosi' non sposta niente di quello che c'e' sopra.
  const dataInizio = ab.data_inizio_validita as string | null
  const dataFine = ab.data_fine_validita as string | null
  if (dataInizio) {
    rowY -= 14
    page.drawText(
      `Periodo di validità: dal ${formattaGiorno(dataInizio)} al ${formattaGiorno(dataFine)}`,
      { x: 30, y: rowY, size: 9, font, color: gray }
    )
  }

  // Footer
  page.drawLine({ start: { x: 30, y: 45 }, end: { x: width - 30, y: 45 }, thickness: 0.3, color: lineGray })
  page.drawText(`Emessa da: ${gestore.nome ?? gestore.email ?? 'Gestore'}  ·  ${new Date().toLocaleString('it-IT')}`, {
    x: 30, y: 28, size: 8, font, color: gray,
  })
  page.drawText('Documento non fiscale – Ricevuta interna ASD', {
    x: width - 255, y: 28, size: 8, font, color: gray,
  })

  const pdfBytes = await pdfDoc.save()

  // Upload storage
  const storagePath = `${anno}/${abbonamentiId}-${Date.now()}.pdf`
  const { error: uploadErr } = await supabase.storage
    .from('ricevute')
    .upload(storagePath, pdfBytes, { contentType: 'application/pdf' })

  if (uploadErr) {
    await supabase.from('abbonamenti_soci').update({ stato_pagamento: 'da_saldare' }).eq('id', abbonamentiId)
    return { ok: false, error: `Upload ricevuta fallito: ${uploadErr.message}` }
  }

  // Salva in pagamenti_ricevute
  const { error: insertErr } = await supabase
    .from('pagamenti_ricevute')
    .insert({
      abbonamento_id: abbonamentiId,
      importo_pagato: totale,
      metodo_pagamento: metodo,
      operatore: gestore.nome ?? gestore.email,
      url_ricevuta_pdf: storagePath,
      numero_ricevuta: numeroRicevuta,
    })

  if (insertErr) {
    await supabase.storage.from('ricevute').remove([storagePath])
    await supabase.from('abbonamenti_soci').update({ stato_pagamento: 'da_saldare' }).eq('id', abbonamentiId)
    return { ok: false, error: `Salvataggio ricevuta fallito: ${insertErr.message}` }
  }

  // La conferma e' fatta e la ricevuta e' archiviata: da qui in poi non c'e'
  // piu' niente che possa farla fallire. L'email parte dopo la risposta, cosi'
  // il gestore non aspetta il postino, e se il postino non parte il pagamento
  // resta confermato lo stesso.
  after(async () => {
    await notificaPagamentoConfermato({
      emailSocio: socio?.email,
      // Per un minorenne ha firmato e pagato un genitore: la ricevuta va anche
      // a lui, non solo alla casella del ragazzo.
      emailGenitore: socio?.minorenne ? socio?.genitore_email : null,
      nomeSocio: `${socio?.nome ?? ''} ${socio?.cognome ?? ''}`.trim(),
      attivita: attivita?.nome_attivita ?? 'Periodo di frequenza',
      importoAttivita: prezzoBase,
      importoUisp: uisp,
      metodo: metodo.charAt(0).toUpperCase() + metodo.slice(1),
      numeroRicevuta,
      annoSportivo,
      dataInizio,
      dataFine,
      ricevutaPdf: Buffer.from(pdfBytes),
    })
  })

  revalidatePath('/area-gestori')
  return { ok: true, message: `Pagamento confermato – ${numeroRicevuta}`, ricevutaPath: storagePath }
}

export async function aggiornaCodiceCassetta(
  _prev: GestoreResult | null,
  formData: FormData
): Promise<GestoreResult> {
  const supabase = await createClient()
  const gestore = await getGestore(supabase)
  if (!gestore) return { ok: false, error: 'Accesso non autorizzato.' }

  const codice = (formData.get('codice') as string | null)?.trim()
  if (!codice) return { ok: false, error: 'Inserisci un codice.' }

  const { error } = await supabase
    .from('impostazioni')
    .upsert({ chiave: 'codice_cassetta', valore: codice, aggiornato_il: new Date().toISOString() })

  if (error) return { ok: false, error: `Salvataggio fallito: ${error.message}` }

  revalidatePath('/area-gestori')
  return { ok: true, message: 'Codice cassetta aggiornato.' }
}

const MAX_MOTIVO = 500

/**
 * Rifiuta una richiesta di pagamento, con la motivazione scritta dal gestore.
 *
 * Serve perche' ora la decorrenza la sceglie il socio, e un socio puo'
 * sbagliarla: chiedere di partire dal mese in corso quando intendeva il
 * successivo, o viceversa. Senza una via d'uscita l'unico rimedio sarebbe
 * confermare una cosa sbagliata e poi rimediare a mano nel database.
 *
 * La motivazione non e' facoltativa: e' l'unica cosa che il socio legge, e un
 * rifiuto muto lo lascerebbe ad aspettare una conferma che non arrivera' mai.
 * Il vincolo che la impone sta anche sulla tabella, non solo qui.
 */
export async function rifiutaPagamento(
  _prev: GestoreResult | null,
  formData: FormData
): Promise<GestoreResult> {
  const supabase = await createClient()
  const gestore = await getGestore(supabase)
  if (!gestore) return { ok: false, error: 'Accesso non autorizzato.' }

  const abbonamentoId = formData.get('abbonamento_id') as string
  if (!abbonamentoId) return { ok: false, error: 'Richiesta non indicata.' }

  const motivo = ((formData.get('motivo') as string | null) ?? '').trim()
  if (!motivo) return { ok: false, error: 'Scrivi il motivo del rifiuto: lo legge il socio.' }
  if (motivo.length > MAX_MOTIVO) {
    return { ok: false, error: `Il motivo non può superare i ${MAX_MOTIVO} caratteri.` }
  }

  // Serve per avvisare il socio, e va letto prima: dopo l'aggiornamento la
  // riga non e' piu' fra le richieste in attesa.
  const { data: ab, error: abErr } = await supabase
    .from('abbonamenti_soci')
    .select(`
      id, anno_sportivo,
      catalogo_attivita(nome_attivita),
      soci(nome, cognome, email, minorenne, genitore_email)
    `)
    .eq('id', abbonamentoId)
    .eq('stato_pagamento', 'da_saldare')
    .maybeSingle()

  if (abErr) return { ok: false, error: `Lettura della richiesta fallita: ${abErr.message}` }
  if (!ab) return { ok: false, error: 'Richiesta non trovata o già decisa.' }

  // Stessa presa in carico esclusiva della conferma: due gestori che agiscono
  // insieme non possono decidere due volte la stessa richiesta.
  const { data: preso, error: updErr } = await supabase
    .from('abbonamenti_soci')
    .update({
      stato_pagamento: 'rifiutato',
      motivo_rifiuto: motivo,
      rifiutato_il: new Date().toISOString(),
    })
    .eq('id', abbonamentoId)
    .eq('stato_pagamento', 'da_saldare')
    .select('id')
    .maybeSingle()

  if (updErr) return { ok: false, error: `Rifiuto fallito: ${updErr.message}` }
  if (!preso) return { ok: false, error: 'Richiesta già decisa da un altro gestore.' }

  type SocioRifiuto = { nome?: string; cognome?: string; email?: string; minorenne?: boolean; genitore_email?: string | null }
  const socio = Array.isArray(ab.soci) ? (ab.soci[0] as SocioRifiuto) : (ab.soci as SocioRifiuto | null)
  const attivita = Array.isArray(ab.catalogo_attivita)
    ? ab.catalogo_attivita[0]
    : (ab.catalogo_attivita as { nome_attivita?: string } | null)

  // Come per la conferma: il rifiuto e' gia' registrato, l'avviso parte dopo
  // la risposta e un guasto del postino non lo annulla.
  after(async () => {
    await notificaRichiestaRifiutata({
      emailSocio: socio?.email,
      emailGenitore: socio?.minorenne ? socio?.genitore_email : null,
      nomeSocio: `${socio?.nome ?? ''} ${socio?.cognome ?? ''}`.trim(),
      attivita: attivita?.nome_attivita ?? 'Periodo di frequenza',
      motivo,
      annoSportivo: String(ab.anno_sportivo ?? ''),
    })
  })

  revalidatePath('/area-gestori')
  return { ok: true, message: 'Richiesta rifiutata. Il socio è stato avvisato.' }
}
