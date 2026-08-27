import { PDFDocument, StandardFonts, type PDFFont } from 'pdf-lib'
import fs from 'fs'
import path from 'path'

// Intervallo Unicode dei segni diacritici combinanti (costruito da codePoint
// per evitare ambiguità con sequenze di escape nei letterali regex)
const SEGNO_DIACRITICO_INIZIO = String.fromCharCode(0x0300)
const SEGNO_DIACRITICO_FINE = String.fromCharCode(0x036f)
const SEGNI_DIACRITICI = new RegExp(`[${SEGNO_DIACRITICO_INIZIO}-${SEGNO_DIACRITICO_FINE}]`, 'g')

// Helvetica (StandardFonts) usa la codifica WinAnsi: copre gli accenti
// italiani/europei comuni (à, è, ç, ñ...) ma non script più ampi (es.
// turco ğ/ş, romeno ț/ș, polacco ł, cirillico, ecc). Senza questo controllo
// pdf-lib lancia un errore e l'intera generazione del documento fallisce
// per un singolo carattere non rappresentabile in un nome o un comune.
const TRASLITTERAZIONI: Record<string, string> = {
  'Ł': 'L', 'ł': 'l', 'Đ': 'D', 'đ': 'd', 'Ð': 'D', 'ð': 'd',
  'Ø': 'O', 'ø': 'o', 'Þ': 'Th', 'þ': 'th', 'ß': 'ss',
  'Æ': 'AE', 'æ': 'ae', 'Œ': 'OE', 'œ': 'oe', 'ı': 'i', 'Ŋ': 'N', 'ŋ': 'n',
}

function testoCompatibile(font: PDFFont, valore: unknown): string {
  const testo = valore == null ? '' : String(valore)
  if (!testo) return testo
  try {
    font.widthOfTextAtSize(testo, 10)
    return testo
  } catch {
    return testo
      .normalize('NFKD')
      .replace(SEGNI_DIACRITICI, '')
      // NFKD scompone le lettere accentate, non quelle che il tratto ce
      // l'hanno dentro: ł, đ, ø non sono "l con segno sopra", sono lettere a
      // sé. Senza questa riga finivano nel '?' qui sotto, e un cognome come
      // Kowalski scritto "?ukasz" su un documento che serve a provare chi ha
      // firmato è un difetto, non un dettaglio tipografico.
      .replace(/[ŁłĐđÐðØøÞþßÆæŒœıŊŋ]/g, c => TRASLITTERAZIONI[c] ?? c)
      .replace(/[^\x00-\x7F]/g, '?')
  }
}

const CAMPI_TESTO_PDF = [
  'nome', 'cognome', 'dataNascita', 'luogoNascita', 'provinciaNascita',
  'codiceFiscale', 'cittadinanza', 'indirizzoResidenza', 'cittaResidenza',
  'provinciaResidenza', 'email', 'telefono', 'tel', 'cellulare',
  'genitoreNome', 'genitoreCognome', 'genitoreEmail',
  'genitoreContattoScelta', 'genitoreContatto',
] as const

// Il server esegue in UTC: senza fissare il fuso, il modulo stamperebbe un
// orario di firma diverso da quello dell'orologio di chi ha firmato (due ore
// indietro in estate, una in inverno). Sul documento probatorio deve comparire
// l'ora italiana.
const FUSO_ITALIA = 'Europe/Rome'

function dataItaliana(d: Date): string {
  return d.toLocaleDateString('it-IT', { timeZone: FUSO_ITALIA })
}

function dataOraItaliana(d: Date): string {
  return d.toLocaleString('it-IT', {
    timeZone: FUSO_ITALIA,
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

export type ProvaFirma = {
  /** Impronta dell'OTP, calcolata dal server dopo la verifica */
  otpHash: string
  /** Indirizzo IP rilevato dal server al momento della firma */
  ip: string
  /** Istante della firma secondo l'orologio del server */
  firmatoIl: Date
  /** Stagione sportiva calcolata dal server */
  annoSportivo: string
  /** Chi ha sottoscritto il modulo, come determinato dal server */
  firmatario?: {
    email: string
    minorenne: boolean
    nome: string | null
    cognome: string | null
  }
}

/**
 * Compone il modulo di iscrizione firmato.
 *
 * Gli elementi probatori (impronta OTP, IP, data e ora) arrivano da `prova` e
 * sono determinati dal server: il chiamante non può iniettarli tramite `dati`.
 */
export async function componiModuloFirmato(
  datiOriginali: Record<string, any>,
  prova: ProvaFirma
): Promise<Uint8Array> {
  const dati: Record<string, any> = { ...datiOriginali }

  const templatePath = path.join(process.cwd(), 'public', 'template_iscrizione.pdf')
  const existingPdfBytes = fs.readFileSync(templatePath)
  const pdfDoc = await PDFDocument.load(existingPdfBytes)

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const fontObl = await pdfDoc.embedFont(StandardFonts.HelveticaOblique)
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  // Sanitizza i campi testuali prima di disegnarli, così un singolo
  // carattere non supportato degrada elegantemente invece di far
  // fallire tutta la generazione del PDF.
  for (const campo of CAMPI_TESTO_PDF) {
    if (dati[campo] != null) dati[campo] = testoCompatibile(font, dati[campo])
  }

  const pages = pdfDoc.getPages()
  const firstPage = pages[0]
  const textSize = 12

  // --- INTESTAZIONE (Anno Sportivo) ---
  firstPage.drawText(prova.annoSportivo, { x: 320, y: 539, size: 17, font })
  firstPage.drawText(prova.annoSportivo, { x: 230, y: 490, size: 12, font: fontObl })

  // --- SEZIONE 1: DATI ANAGRAFICI ---
  const nomeCognome = `${dati.nome || ''} ${dati.cognome || ''}`.trim()
  firstPage.drawText(nomeCognome, { x: 210, y: 468, size: textSize, font })

  let dataNascitaFormattata = dati.dataNascita || ''
  if (dataNascitaFormattata.includes('-')) {
    const [anno, mese, giorno] = dataNascitaFormattata.split('-')
    dataNascitaFormattata = `${giorno}/${mese}/${anno}`
  }
  const luogoDataNascita = `${dataNascitaFormattata}, ${dati.luogoNascita || ''} (${dati.provinciaNascita || ''})`
  firstPage.drawText(luogoDataNascita, { x: 240, y: 451, size: textSize, font })

  firstPage.drawText(dati.codiceFiscale || '', { x: 191, y: 434, size: textSize, font })
  firstPage.drawText(dati.cittadinanza || 'Italiana', { x: 182, y: 418, size: textSize, font })

  // --- SEZIONE 2: RESIDENZA E CONTATTI ---
  firstPage.drawText(dati.indirizzoResidenza || '', { x: 247, y: 401, size: textSize, font })
  const cittaCompleta = `${dati.cittaResidenza || ''} (${dati.provinciaResidenza || ''})`
  firstPage.drawText(cittaCompleta, { x: 140, y: 385, size: textSize, font })
  firstPage.drawText(dati.email || '', { x: 145, y: 369, size: textSize, font })
  const numeroTel = dati.telefono || dati.tel || dati.cellulare || ''
  firstPage.drawText(numeroTel, { x: 447, y: 369, size: textSize, font })

  // --- SEZIONE 3: DATI GENITORE (SOLO SE MINORENNE) ---
  if (dati.genitoreNome && dati.genitoreCognome) {
    firstPage.drawText('TESSERATO MINORENNE', { x: 109, y: 340, size: 10, font: fontBold })
    const datiGenitore = `Genitore/Tutore: ${dati.genitoreNome} ${dati.genitoreCognome}`
    firstPage.drawText(datiGenitore, { x: 109, y: 325, size: 11, font: fontBold })
    if (dati.genitoreEmail) {
      firstPage.drawText(`Email Genitore: ${dati.genitoreEmail}`, { x: 109, y: 310, size: textSize, font })
    }
    if (dati.genitoreContatto) {
      const contattoGenitore = `Recapito Genitore (${dati.genitoreContattoScelta || 'Email'}): ${dati.genitoreContatto}`
      firstPage.drawText(contattoGenitore, { x: 109, y: 296, size: textSize, font })
    }
  }

  // Dichiarazione di veridicità: in coda alle altre "Il sottoscritto dichiara"
  // del modello, quindi *sopra* la firma, che è ciò che per convenzione la
  // firma copre. Una riga sola: lo spazio disponibile è di 21 punti.
  // Il socio la legge anche nel form, sopra il pulsante che appone la firma.
  firstPage.drawText(
    'Il sottoscritto dichiara inoltre che i dati riportati nel presente modulo corrispondono al vero.',
    { x: 71, y: 184, size: 8.5, font: fontObl }
  )

  // --- SEZIONE 4: PRIVACY, DATA E FIRME ---
  const haAcconsentito =
    dati.consensoImmagini === true ||
    dati.consensoImmagini === 'true' ||
    dati.consensoImmagini === 'on'

  const testoConsenso = haAcconsentito
    ? "ACCONSENTE all'uso delle immagini"
    : "NON ACCONSENTE all'uso delle immagini"
  firstPage.drawText(testoConsenso, { x: 71, y: 140, size: 10, font: fontBold })

  const luogoCompilazione = dati.cittaResidenza || 'Monesiglio'
  const luogoData = `${luogoCompilazione}, ${dataItaliana(prova.firmatoIl)}`
  firstPage.drawText(luogoData, { x: 148, y: 118, size: textSize, font })

  // Firma elettronica: tutti gli elementi provengono dal server.
  //
  // Per un socio minorenne il modulo lo sottoscrive chi esercita la
  // responsabilità genitoriale, e il codice viene spedito al suo indirizzo: il
  // documento deve dirlo. Dalla sola riga della firma, altrimenti, non si
  // capisce né chi l'abbia apposta né a che titolo — che è esattamente ciò che
  // rende opponibile una sottoscrizione fatta per conto di un minore.
  const righeFirma = [
    `Firma elettronica validata tramite codice OTP (rif. ${prova.otpHash.slice(0, 16)})`,
    `Apposta il: ${dataOraItaliana(prova.firmatoIl)} (ora italiana)`,
    `Indirizzo IP: ${prova.ip}`,
  ]

  if (prova.firmatario?.minorenne) {
    // Anche questi passano dalla ripulitura WinAnsi. Arrivano da `prova`, non
    // da `dati`, quindi il giro fatto sopra su CAMPI_TESTO_PDF non li tocca:
    // le stringhe sono immutabili e `firmatario` è un altro oggetto. Senza,
    // un cognome con ł, ș o ğ farebbe lanciare pdf-lib — e succederebbe dopo
    // che l'OTP è stato consumato, quindi con un codice ormai bruciato e la
    // stessa iscrizione destinata a fallire a ogni nuovo tentativo.
    const nome = testoCompatibile(font, prova.firmatario.nome)
    const cognome = testoCompatibile(font, prova.firmatario.cognome)
    const email = testoCompatibile(font, prova.firmatario.email)
    const chi = [nome, cognome].filter(Boolean).join(' ')
    righeFirma.push(
      `Sottoscritto da ${chi || 'il genitore'}, in qualità di esercente la`,
      `responsabilità genitoriale sul socio minorenne.`,
      `Codice inviato a: ${email}`
    )
  }

  firstPage.drawText(righeFirma.join('\n'), { x: 230, y: 102, size: 9, font, lineHeight: 12 })

  return pdfDoc.save()
}
