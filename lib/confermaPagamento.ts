import 'server-only'
import { after } from 'next/server'
import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import fs from 'fs'
import path from 'path'
import { notificaPagamentoConfermato } from '@/lib/notifiche'
import { formattaGiorno } from '@/lib/abbonamento'
import { testoCompatibile } from '@/lib/moduloPdf'
import { getAnnoSportivo } from '@/lib/stagione'
import { partiRomane, FUSO } from '@/lib/dataRoma'

/**
 * La conferma di un pagamento, con la ricevuta, in un posto solo.
 *
 * Stava dentro l'azione dei gestori. Dal 15 settembre 2026 confermano anche i
 * tecnici, per i propri corsi, e due copie di questo codice sarebbero due
 * modi di numerare, comporre e archiviare una ricevuta: alla prima correzione
 * fatta da una parte sola, le ricevute dell'associazione smetterebbero di
 * essere una sequenza coerente.
 *
 * Chi chiama decide solo tre cose, dopo aver verificato di poterlo fare:
 * - `db`: il client con cui leggere e scrivere. Il gestore usa il proprio, e
 *   decidono le sue policy; il tecnico non ha permessi su quelle tabelle, e
 *   il server usa il client di servizio dopo aver controllato che la
 *   richiesta sia di un suo corso.
 * - `numera`: come si ottiene il numero. Resta sempre una funzione del
 *   database chiamata con l'identita' vera di chi conferma, cosi' il controllo
 *   su chi puo' emettere una ricevuta lo rifa' il database e non solo il sito.
 * - `operatore`: chi firma la ricevuta e finisce nello storico.
 */

const ASSOCIAZIONE = {
  nome: 'ASD Polisportiva Monesiglio',
  cf: '93058330049',
  piva: '04040870042',
  sede: 'Piazza XX Settembre 2, 12077 Monesiglio (CN)',
}

export type Operatore = {
  tipo: 'gestore' | 'tecnico'
  id: string
  nome: string
}

export type EsitoConferma =
  | { ok: true; message: string; ricevutaPath?: string }
  | { ok: false; error: string }

export async function eseguiConfermaPagamento({
  db,
  numera,
  abbonamentoId: abbonamentiId,
  operatore,
}: {
  db: SupabaseClient
  numera: (anno: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>
  abbonamentoId: string
  operatore: Operatore
}): Promise<EsitoConferma> {

  // Fetch abbonamento completo
  const { data: ab, error: abErr } = await db
    .from('abbonamenti_soci')
    .select(`
      id, stato_pagamento, importo_tesseramento_uisp, metodo_pagamento, data_acquisto,
      numero_ricevuta_riservato, inizio_scelto, data_inizio_validita, data_fine_validita,
      catalogo_attivita(nome_attivita, prezzo_base, tipo),
      soci(id, nome, cognome, email, cf, minorenne, genitore_email)
    `)
    .eq('id', abbonamentiId)
    .eq('stato_pagamento', 'da_saldare')
    .single()

  if (abErr || !ab) return { ok: false, error: 'Richiesta non trovata o già confermata.' }

  // Claim atomico: solo chi riesce ad aggiornare lo stato procede.
  // Evita doppie conferme/ricevute duplicate se due gestori agiscono in contemporanea.
  const { data: claimed, error: claimErr } = await db
    .from('abbonamenti_soci')
    .update({ stato_pagamento: 'pagato' })
    .eq('id', abbonamentiId)
    .eq('stato_pagamento', 'da_saldare')
    .select('id')
    .maybeSingle()

  if (claimErr) return { ok: false, error: `Aggiornamento stato fallito: ${claimErr.message}` }
  if (!claimed) return { ok: false, error: 'Richiesta già confermata da qualcun altro.' }

  // Numero ricevuta sequenziale per anno, generato atomicamente lato DB.
  //
  // Se un tentativo precedente su questo stesso abbonamento aveva gia' estratto
  // un numero senza arrivare a salvare la ricevuta, si riusa quello: sotto quel
  // numero non e' mai stato emesso nulla, e prenderne un altro lascerebbe un
  // salto permanente nella numerazione. La conferma e' esclusiva per
  // abbonamento (vedi il claim qui sopra), quindi non c'e' modo che due
  // ricevute diverse finiscano sullo stesso numero.
  // L'anno della ricevuta e' quello di Monesiglio, non quello del server: su
  // Vercel il fuso e' UTC, e una conferma fatta alle 00:30 del 1° gennaio
  // prendeva l'anno appena finito. Numero e cartella d'archivio finivano
  // sotto un anno che sul documento non compare.
  const adesso = new Date()
  const anno = partiRomane(adesso).anno
  const riservato = ab.numero_ricevuta_riservato as string | null

  // Il numero riservato vale solo dentro il proprio anno. Una conferma iniziata
  // il 31 dicembre e ripresa il 2 gennaio riuserebbe altrimenti un numero del
  // 2025 su una ricevuta datata 2026, archiviata sotto la cartella del 2026:
  // il contatore e' per anno, e mescolarli disfa proprio la sequenza che serve
  // a tenere. In quel caso il salto nell'anno abbandonato e' il male minore.
  let numeroRicevuta = riservato && riservato.startsWith(`RIC-${anno}-`) ? riservato : null

  if (!numeroRicevuta) {
    const { data: nuovoNumero, error: numeroErr } = await numera(anno)

    if (numeroErr || !nuovoNumero) {
      // Rilascia il claim per non lasciare l'abbonamento bloccato su "pagato" senza ricevuta
      await db.from('abbonamenti_soci').update({ stato_pagamento: 'da_saldare' }).eq('id', abbonamentiId)
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
    const { error: riservaErr } = await db
      .from('abbonamenti_soci')
      .update({ numero_ricevuta_riservato: numeroRicevuta })
      .eq('id', abbonamentiId)

    if (riservaErr) {
      await db.from('abbonamenti_soci').update({ stato_pagamento: 'da_saldare' }).eq('id', abbonamentiId)
      return { ok: false, error: `Riserva del numero di ricevuta fallita: ${riservaErr.message}` }
    }
  }

  type SocioRicevuta = { nome?: string; cognome?: string; email?: string; cf?: string; minorenne?: boolean; genitore_email?: string | null }
  const socio = Array.isArray(ab.soci) ? (ab.soci[0] as SocioRicevuta) : (ab.soci as SocioRicevuta | null)
  const attivita = Array.isArray(ab.catalogo_attivita) ? ab.catalogo_attivita[0] : (ab.catalogo_attivita as { nome_attivita?: string; prezzo_base?: number; tipo?: string } | null)
  const prezzoBase = Number(attivita?.prezzo_base ?? 0)
  const uisp = Number(ab.importo_tesseramento_uisp ?? 0)
  const totale = prezzoBase + uisp
  const metodo = ab.metodo_pagamento ?? 'contanti'

  const dataInizio = ab.data_inizio_validita as string | null
  const dataFine = ab.data_fine_validita as string | null

  // Da qui il claim e' gia' preso: ogni uscita deve rilasciarlo, o la richiesta
  // resta "pagata" senza ricevuta e sparisce dall'elenco delle cose da fare.
  const rilasciaClaim = async () => {
    await db.from('abbonamenti_soci')
      .update({ stato_pagamento: 'da_saldare' })
      .eq('id', abbonamentiId)
  }

  // La composizione sta dentro un try perche' puo' fallire per il contenuto e
  // non per un guasto: i font standard di pdf-lib codificano in WinAnsi, e un
  // nome fuori dal Latin-1 fa lanciare drawText. Senza questo, l'eccezione
  // scavalcava tutti i rilasci scritti piu' sotto e lasciava l'abbonamento a
  // meta', con un numero di ricevuta gia' bruciato.
  const annoSportivo = getAnnoSportivo()

  let pdfBytes: Uint8Array
  try {
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
    page.drawText(`Data: ${adesso.toLocaleDateString('it-IT', { timeZone: FUSO })}`, { x: width - 160, y: height - 52, size: 9, font, color: rgb(0.85, 0.85, 0.85) })

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
    page.drawText(testoCompatibile(fontBold, `${socio?.nome ?? ''} ${socio?.cognome ?? ''}`), { x: 30, y: secY - 18, size: 13, font: fontBold, color: dark })
    if (socio?.cf) page.drawText(testoCompatibile(font, `C.F.: ${socio.cf}`), { x: 30, y: secY - 34, size: 9, font, color: gray })
    if (socio?.email) page.drawText(testoCompatibile(font, `Email: ${socio.email}`), { x: 30, y: secY - 48, size: 9, font, color: gray })

    // Causale, con le voci del bilancio approvato dal commercialista: le "quote
    // associative" sono i 20 euro di tesseramento, i "corrispettivi mensili" la
    // frequenza della sala pesi, i "corrispettivi specifici" i corsi. Dal 15
    // settembre 2026 i corsi si chiedono anche dal sito: una loro ricevuta con
    // scritto "corrispettivo mensile" finirebbe nella voce di bilancio sbagliata.
    const voce = attivita?.tipo === 'corso' ? 'corrispettivo specifico' : 'corrispettivo mensile'
    const causale = uisp > 0
      ? `Causale: quota associativa e ${voce} - stagione ${annoSportivo}`
      : `Causale: ${voce} - stagione ${annoSportivo}`
    page.drawText(testoCompatibile(font, causale), { x: 30, y: secY - 66, size: 9, font, color: gray })

    // Dettaglio
    const detY = height - 200
    page.drawText('DETTAGLIO', { x: 30, y: detY, size: 8, font: fontBold, color: gold })
    page.drawLine({ start: { x: 30, y: detY - 4 }, end: { x: width - 30, y: detY - 4 }, thickness: 0.5, color: lineGray })

    page.drawText('Descrizione', { x: 30, y: detY - 18, size: 8, font: fontBold, color: gray })
    page.drawText('Importo', { x: width - 90, y: detY - 18, size: 8, font: fontBold, color: gray })

    let rowY = detY - 36
    page.drawText(testoCompatibile(font, attivita?.nome_attivita ?? 'Periodo di frequenza'), { x: 30, y: rowY, size: 11, font, color: dark })
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
    page.drawText(testoCompatibile(font, `Metodo: ${metodo.charAt(0).toUpperCase() + metodo.slice(1)}`), { x: 30, y: rowY, size: 9, font, color: gray })

    // Il periodo di validita' e' il motivo per cui il socio tiene la ricevuta:
    // gli dice fino a quando puo' entrare. Sta sotto il metodo, dove c'e' spazio
    // libero fino al piede, cosi' non sposta niente di quello che c'e' sopra.
    if (dataInizio) {
      rowY -= 14
      page.drawText(
        `Periodo di validità: dal ${formattaGiorno(dataInizio)} al ${formattaGiorno(dataFine)}`,
        { x: 30, y: rowY, size: 9, font, color: gray }
      )
    }

    // Footer
    page.drawLine({ start: { x: 30, y: 45 }, end: { x: width - 30, y: 45 }, thickness: 0.3, color: lineGray })
    page.drawText(testoCompatibile(font, `Emessa da: ${operatore.nome}  ·  ${adesso.toLocaleString('it-IT', { timeZone: FUSO })}`), {
      x: 30, y: 28, size: 8, font, color: gray,
    })
    page.drawText('Documento non fiscale – Ricevuta interna ASD', {
      x: width - 255, y: 28, size: 8, font, color: gray,
    })

    pdfBytes = await pdfDoc.save()
  } catch (e) {
    console.error('Composizione della ricevuta fallita:', e)
    await rilasciaClaim()
    return { ok: false, error: 'Generazione della ricevuta fallita. La richiesta resta da confermare.' }
  }


  // Upload storage
  const storagePath = `${anno}/${abbonamentiId}-${Date.now()}.pdf`
  const { error: uploadErr } = await db.storage
    .from('ricevute')
    .upload(storagePath, pdfBytes, { contentType: 'application/pdf' })

  if (uploadErr) {
    await db.from('abbonamenti_soci').update({ stato_pagamento: 'da_saldare' }).eq('id', abbonamentiId)
    return { ok: false, error: `Upload ricevuta fallito: ${uploadErr.message}` }
  }

  // Salva in pagamenti_ricevute
  const { error: insertErr } = await db
    .from('pagamenti_ricevute')
    .insert({
      abbonamento_id: abbonamentiId,
      importo_pagato: totale,
      metodo_pagamento: metodo,
      // `operatore` resta il nome scritto per esteso, `gestore_id` e' il
      // riferimento: il primo sopravvive a un gestore cancellato, il secondo
      // serve a raggruppare le decisioni per persona nello storico.
      operatore: operatore.nome,
      gestore_id: operatore.tipo === 'gestore' ? operatore.id : null,
      // Quando conferma il tecnico del corso: il riferimento sta in una colonna
      // sua, perche' un tecnico non e' una riga di `gestori`.
      tecnico_id: operatore.tipo === 'tecnico' ? operatore.id : null,
      // `data_incasso` e' una `date` e dice solo il giorno. Per rispondere a
      // "chi ha deciso cosa e quando" serve l'ora, come gia' l'aveva il
      // rifiuto.
      confermato_il: new Date().toISOString(),
      url_ricevuta_pdf: storagePath,
      numero_ricevuta: numeroRicevuta,
    })

  if (insertErr) {
    await db.storage.from('ricevute').remove([storagePath])
    await db.from('abbonamenti_soci').update({ stato_pagamento: 'da_saldare' }).eq('id', abbonamentiId)
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
  revalidatePath('/area-tecnico')
  return { ok: true, message: `Pagamento confermato – ${numeroRicevuta}`, ricevutaPath: storagePath }
}
