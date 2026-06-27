'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
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
  if (!abbonamentiId) return { ok: false, error: 'ID abbonamento mancante.' }

  // Fetch abbonamento completo
  const { data: ab, error: abErr } = await supabase
    .from('abbonamenti_soci')
    .select(`
      id, stato_pagamento, importo_tesseramento_uisp, metodo_pagamento, data_acquisto,
      catalogo_attivita(nome_attivita, prezzo_base),
      soci(id, nome, cognome, email, cf)
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

  // Numero ricevuta sequenziale per anno, generato atomicamente lato DB
  const anno = new Date().getFullYear()
  const { data: numeroRicevuta, error: numeroErr } = await supabase
    .rpc('genera_numero_ricevuta', { p_anno: anno })

  if (numeroErr || !numeroRicevuta) {
    // Rilascia il claim per non lasciare l'abbonamento bloccato su "pagato" senza ricevuta
    await supabase.from('abbonamenti_soci').update({ stato_pagamento: 'da_saldare' }).eq('id', abbonamentiId)
    return { ok: false, error: `Generazione numero ricevuta fallita: ${numeroErr?.message ?? 'errore sconosciuto'}` }
  }

  const socio = Array.isArray(ab.soci) ? ab.soci[0] : (ab.soci as { nome?: string; cognome?: string; email?: string; cf?: string } | null)
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

  // Causale
  page.drawText(`Causale: tesseramento e abbonamento stagione sportiva ${annoSportivo}`, {
    x: 30, y: secY - 66, size: 9, font, color: gray,
  })

  // Dettaglio
  const detY = height - 200
  page.drawText('DETTAGLIO', { x: 30, y: detY, size: 8, font: fontBold, color: gold })
  page.drawLine({ start: { x: 30, y: detY - 4 }, end: { x: width - 30, y: detY - 4 }, thickness: 0.5, color: lineGray })

  page.drawText('Descrizione', { x: 30, y: detY - 18, size: 8, font: fontBold, color: gray })
  page.drawText('Importo', { x: width - 90, y: detY - 18, size: 8, font: fontBold, color: gray })

  let rowY = detY - 36
  page.drawText(attivita?.nome_attivita ?? 'Abbonamento', { x: 30, y: rowY, size: 11, font, color: dark })
  page.drawText(`€ ${prezzoBase.toFixed(2)}`, { x: width - 90, y: rowY, size: 11, font, color: dark })

  if (uisp > 0) {
    rowY -= 20
    page.drawText('Tessera UISP', { x: 30, y: rowY, size: 11, font, color: dark })
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
