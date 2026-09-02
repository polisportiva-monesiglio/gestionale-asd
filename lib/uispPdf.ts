import 'server-only'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import {
  formattaDataItaliana,
  separaIndirizzo,
  type IntestazioneUisp,
  type RigaUisp,
} from '@/lib/uisp'

/**
 * Il modulo della UISP in PDF, disegnato da zero.
 *
 * Non e' una conversione del foglio Excel: convertire richiederebbe LibreOffice
 * o Excel, che su Vercel non ci sono. Il modulo viene ridisegnato con pdf-lib,
 * riprendendo dal foglio originale il logo, le diciture e le proporzioni delle
 * colonne, cosi' che chi lo riceve veda la stessa cosa di sempre.
 *
 * La differenza che conta rispetto al foglio: qui le righe sono esattamente
 * quelle dei soci e si impaginano da sole, ripetendo l'intestazione della
 * tabella a ogni pagina.
 */

const CARTELLA = path.join(process.cwd(), 'lib', 'uisp')

/** A4 orizzontale: il modulo e' largo, in verticale non ci sta. */
const PAGINA = { larghezza: 842, altezza: 595 }
const MARGINE = 18

const NERO = rgb(0, 0, 0)
const FILO = 0.5

const ALTEZZA_RIGA = 19
const ALTEZZA_INTESTAZIONE_TABELLA = 20

/**
 * Le colonne, con le larghezze del foglio originale (in "caratteri" di Excel).
 * Vengono riscalate sulla pagina, cosi' le proporzioni restano quelle note.
 * `parti` sono le sotto-colonne divise da un filo interno: comune e provincia
 * di nascita, via e civico.
 */
const COLONNE = [
  { chiave: 'nominativo', titolo: 'COGNOME E NOME', peso: 17.88 },
  { chiave: 'sesso', titolo: 'M/F', peso: 3.2 },
  { chiave: 'nascita', titolo: 'DATA DI NASCITA', peso: 8.0 },
  { chiave: 'luogo', titolo: 'LUOGO DI NASCITA', peso: 15.75, parti: [11.5, 4.25] },
  { chiave: 'cf', titolo: 'C.F.', peso: 15.13 },
  { chiave: 'via', titolo: 'VIA', peso: 20.51, parti: [17.88, 2.63] },
  { chiave: 'citta', titolo: 'COMUNE DI RESIDENZA', peso: 15.25 },
  { chiave: 'email', titolo: 'E-MAIL', peso: 22.51 },
  { chiave: 'telefono', titolo: 'TELEFONO CELLULARE', peso: 9.5 },
  { chiave: 'tipo', titolo: 'T', peso: 3.38 },
  { chiave: 'firma', titolo: 'FIRMA', peso: 33.75 },
] as const

/**
 * I font standard del PDF parlano WinAnsi: un carattere fuori tabella fa
 * fallire il disegno invece di uscire storto. Le virgolette e i trattini
 * tipografici del testo UISP si normalizzano, il resto si scarta.
 */
function winAnsi(testo: string): string {
  return testo
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/ /g, ' ')
    .replace(/[^\x20-\x7E¡-ÿ]/g, '')
}

/** Scrive dentro una larghezza data, rimpicciolendo prima di troncare. */
function scriviAdattato(
  pagina: PDFPage,
  testo: string,
  opzioni: { x: number; y: number; larghezza: number; font: PDFFont; dimensione: number; minima?: number }
) {
  const pulito = winAnsi(testo)
  if (!pulito) return

  const { font, larghezza } = opzioni
  const minima = opzioni.minima ?? 4.5
  let dimensione = opzioni.dimensione

  while (dimensione > minima && font.widthOfTextAtSize(pulito, dimensione) > larghezza) {
    dimensione -= 0.25
  }

  let finale = pulito
  if (font.widthOfTextAtSize(finale, dimensione) > larghezza) {
    while (finale.length > 1 && font.widthOfTextAtSize(`${finale}…`, dimensione) > larghezza) {
      finale = finale.slice(0, -1)
    }
    finale = `${finale}…`
  }

  pagina.drawText(winAnsi(finale), { x: opzioni.x, y: opzioni.y, size: dimensione, font, color: NERO })
}

/** Spezza un paragrafo lungo nelle righe che stanno nella larghezza data. */
function aCapo(testo: string, font: PDFFont, dimensione: number, larghezza: number): string[] {
  const parole = winAnsi(testo).split(/\s+/).filter(Boolean)
  const righe: string[] = []
  let corrente = ''

  for (const parola of parole) {
    const prova = corrente ? `${corrente} ${parola}` : parola
    if (font.widthOfTextAtSize(prova, dimensione) <= larghezza) {
      corrente = prova
    } else {
      if (corrente) righe.push(corrente)
      corrente = parola
    }
  }
  if (corrente) righe.push(corrente)
  return righe
}

function rettangolo(pagina: PDFPage, x: number, y: number, w: number, h: number) {
  pagina.drawRectangle({ x, y, width: w, height: h, borderColor: NERO, borderWidth: FILO })
}

type Geometria = { x: number; larghezza: number; parti?: number[] }

function geometrie(larghezzaUtile: number): Geometria[] {
  const totale = COLONNE.reduce((s, c) => s + c.peso, 0)
  const unita = larghezzaUtile / totale
  let x = MARGINE
  return COLONNE.map(c => {
    const larghezza = c.peso * unita
    const g: Geometria = { x, larghezza }
    if ('parti' in c && c.parti) {
      g.parti = c.parti.map(p => p * unita)
    }
    x += larghezza
    return g
  })
}

function disegnaIntestazioneTabella(
  pagina: PDFPage,
  y: number,
  geo: Geometria[],
  grassetto: PDFFont
): number {
  const alto = y - ALTEZZA_INTESTAZIONE_TABELLA
  COLONNE.forEach((col, i) => {
    const g = geo[i]
    rettangolo(pagina, g.x, alto, g.larghezza, ALTEZZA_INTESTAZIONE_TABELLA)
    const righe = aCapo(col.titolo, grassetto, 5.5, g.larghezza - 4)
    righe.slice(0, 2).forEach((riga, r) => {
      const larghezzaTesto = grassetto.widthOfTextAtSize(riga, 5.5)
      pagina.drawText(riga, {
        x: g.x + (g.larghezza - larghezzaTesto) / 2,
        y: alto + ALTEZZA_INTESTAZIONE_TABELLA - 8 - r * 6.5,
        size: 5.5,
        font: grassetto,
        color: NERO,
      })
    })
  })
  return alto
}

function disegnaRiga(
  pagina: PDFPage,
  y: number,
  geo: Geometria[],
  riga: RigaUisp,
  font: PDFFont
): number {
  const alto = y - ALTEZZA_RIGA
  const baseTesto = alto + 6

  const { via, civico } = separaIndirizzo(riga.indirizzo)
  const valori: Record<string, string> = {
    nominativo: [riga.cognome, riga.nome].map(v => (v ?? '').trim()).filter(Boolean).join(' '),
    sesso: (riga.sesso ?? '').toUpperCase().slice(0, 1),
    nascita: formattaDataItaliana(riga.dataNascita),
    cf: (riga.cf ?? '').toUpperCase().trim(),
    citta: (riga.citta ?? '').trim(),
    email: (riga.email ?? '').trim(),
    telefono: (riga.telefono ?? '').trim(),
    tipo: '',
    firma: '',
  }

  COLONNE.forEach((col, i) => {
    const g = geo[i]
    rettangolo(pagina, g.x, alto, g.larghezza, ALTEZZA_RIGA)

    if (col.chiave === 'luogo' && g.parti) {
      pagina.drawLine({
        start: { x: g.x + g.parti[0], y: alto },
        end: { x: g.x + g.parti[0], y: alto + ALTEZZA_RIGA },
        thickness: FILO,
        color: NERO,
      })
      scriviAdattato(pagina, riga.luogoNascita ?? '', {
        x: g.x + 2, y: baseTesto, larghezza: g.parti[0] - 4, font, dimensione: 7,
      })
      scriviAdattato(pagina, (riga.provinciaNascita ?? '').toUpperCase(), {
        x: g.x + g.parti[0] + 2, y: baseTesto, larghezza: g.parti[1] - 4, font, dimensione: 7,
      })
      return
    }

    if (col.chiave === 'via' && g.parti) {
      pagina.drawLine({
        start: { x: g.x + g.parti[0], y: alto },
        end: { x: g.x + g.parti[0], y: alto + ALTEZZA_RIGA },
        thickness: FILO,
        color: NERO,
      })
      scriviAdattato(pagina, via, {
        x: g.x + 2, y: baseTesto, larghezza: g.parti[0] - 4, font, dimensione: 7,
      })
      scriviAdattato(pagina, civico, {
        x: g.x + g.parti[0] + 2, y: baseTesto, larghezza: g.parti[1] - 4, font, dimensione: 7,
      })
      return
    }

    const valore = valori[col.chiave] ?? ''
    if (!valore) return

    if (col.chiave === 'sesso') {
      const w = font.widthOfTextAtSize(valore, 7)
      pagina.drawText(valore, { x: g.x + (g.larghezza - w) / 2, y: baseTesto, size: 7, font, color: NERO })
      return
    }

    scriviAdattato(pagina, valore, {
      x: g.x + 2, y: baseTesto, larghezza: g.larghezza - 4, font, dimensione: 7,
    })
  })

  return alto
}

/**
 * Costruisce il modulo. Le pagine si aggiungono da sole: la prima porta
 * l'intestazione completa, le altre solo quella della tabella, e il piede con
 * il consenso finisce dopo l'ultimo socio.
 */
export async function compilaModuloUispPdf(
  righe: RigaUisp[],
  intestazione: IntestazioneUisp,
  annoSportivo: string
): Promise<Buffer> {
  if (righe.length === 0) throw new Error('Nessun socio da scrivere sul modulo.')

  const [logoBytes, consensoGrezzo] = await Promise.all([
    readFile(path.join(CARTELLA, 'logo-uisp.jpg')),
    readFile(path.join(CARTELLA, 'consenso.json'), 'utf8'),
  ])
  const { consenso } = JSON.parse(consensoGrezzo) as { consenso: string }

  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const grassetto = await pdf.embedFont(StandardFonts.HelveticaBold)
  const logo = await pdf.embedJpg(logoBytes)

  const larghezzaUtile = PAGINA.larghezza - MARGINE * 2
  const geo = geometrie(larghezzaUtile)

  const pagine: PDFPage[] = []
  const nuovaPagina = () => {
    const p = pdf.addPage([PAGINA.larghezza, PAGINA.altezza])
    pagine.push(p)
    return p
  }

  let pagina = nuovaPagina()
  let y = PAGINA.altezza - MARGINE

  // ── Intestazione della prima pagina ────────────────────────────────
  const altezzaLogo = 34
  const larghezzaLogo = (logo.width / logo.height) * altezzaLogo
  pagina.drawImage(logo, { x: MARGINE, y: y - altezzaLogo, width: larghezzaLogo, height: altezzaLogo })

  const riservatoX = MARGINE + larghezzaUtile * 0.62
  const riservatoW = larghezzaUtile * 0.38
  rettangolo(pagina, riservatoX, y - 16, riservatoW, 16)
  scriviAdattato(pagina, 'RISERVATO COMITATO TERRITORIALE UISP PER CONVALIDA', {
    x: riservatoX + 4, y: y - 11, larghezza: riservatoW - 8, font: grassetto, dimensione: 6.5,
  })
  rettangolo(pagina, riservatoX, y - 34, riservatoW, 18)
  scriviAdattato(pagina, 'COD.N.  ____________     DATA  ____________', {
    x: riservatoX + 4, y: y - 27, larghezza: riservatoW - 8, font: grassetto, dimensione: 6.5,
  })

  // Sotto il riquadro "riservato al comitato", che e' piu' basso del logo:
  // il titolo e' centrato sulla pagina e altrimenti ci passa attraverso.
  y -= altezzaLogo + 14
  const titolo = `MODULO RICHIESTA TESSERAMENTO ${annoSportivo.replace('/', '-')}`
  const larghezzaTitolo = grassetto.widthOfTextAtSize(titolo, 10)
  pagina.drawText(titolo, {
    x: MARGINE + (larghezzaUtile - larghezzaTitolo) / 2, y, size: 10, font: grassetto, color: NERO,
  })

  y -= 14
  pagina.drawText('IL SOTTOSCRITTO:', { x: MARGINE, y, size: 7, font: grassetto, color: NERO })

  // Cognome / Nome / qualifica
  y -= 16
  const campo = (
    etichetta: string,
    valore: string,
    x: number,
    larghezzaEtichetta: number,
    larghezzaValore: number
  ) => {
    rettangolo(pagina, x, y, larghezzaEtichetta, 14)
    scriviAdattato(pagina, etichetta, {
      x: x + 3, y: y + 4.5, larghezza: larghezzaEtichetta - 6, font: grassetto, dimensione: 6.5,
    })
    rettangolo(pagina, x + larghezzaEtichetta, y, larghezzaValore, 14)
    scriviAdattato(pagina, valore, {
      x: x + larghezzaEtichetta + 3, y: y + 4.5, larghezza: larghezzaValore - 6, font, dimensione: 7.5,
    })
    return x + larghezzaEtichetta + larghezzaValore
  }

  let x = campo('Cognome', intestazione.presidenteCognome, MARGINE, 46, 130)
  x = campo('Nome', intestazione.presidenteNome, x, 34, 130)
  rettangolo(pagina, x, y, MARGINE + larghezzaUtile - x, 14)
  scriviAdattato(
    pagina,
    'in qualità di Presidente - Legale Rappresentante dell’Associazione, Società Sportiva, Circolo:',
    { x: x + 3, y: y + 4.5, larghezza: MARGINE + larghezzaUtile - x - 6, font, dimensione: 6.5 }
  )

  y -= 15
  x = campo('Denominazione', intestazione.denominazione, MARGINE, 66, larghezzaUtile * 0.55)
  rettangolo(pagina, x, y, 96, 14)
  scriviAdattato(pagina, 'Codice Affiliazione Uisp n.', {
    x: x + 3, y: y + 4.5, larghezza: 90, font: grassetto, dimensione: 6.5,
  })
  rettangolo(pagina, x + 96, y, MARGINE + larghezzaUtile - x - 96, 14)
  scriviAdattato(pagina, intestazione.codiceAffiliazione, {
    x: x + 99, y: y + 4.5, larghezza: MARGINE + larghezzaUtile - x - 102, font, dimensione: 7.5,
  })

  y -= 13
  pagina.drawText('CHIEDE IL RILASCIO DEL TESSERAMENTO PER:', {
    x: MARGINE, y, size: 7, font: grassetto, color: NERO,
  })

  y -= 4
  y = disegnaIntestazioneTabella(pagina, y, geo, grassetto)

  // Il piede si misura prima di impaginare: l'ultima riga deve finire su una
  // pagina che ci sta anche lui, altrimenti il consenso e la firma restano
  // orfani su un foglio bianco.
  const righeConsenso = aCapo(consenso, font, 5.5, larghezzaUtile - 8)
  const altezzaPiede = righeConsenso.length * 7 + 40

  // ── Le righe dei soci ──────────────────────────────────────────────
  righe.forEach((riga, i) => {
    const ultima = i === righe.length - 1
    const serve = ALTEZZA_RIGA + (ultima ? altezzaPiede : 0)
    if (y - serve < MARGINE) {
      pagina = nuovaPagina()
      y = PAGINA.altezza - MARGINE
      y = disegnaIntestazioneTabella(pagina, y, geo, grassetto)
    }
    y = disegnaRiga(pagina, y, geo, riga, font)
  })

  // ── Piede: consenso e firma ────────────────────────────────────────
  y -= 6
  righeConsenso.forEach((riga, i) => {
    pagina.drawText(riga, { x: MARGINE + 2, y: y - i * 7, size: 5.5, font, color: NERO })
  })
  y -= righeConsenso.length * 7 + 12

  for (const [etichetta, offset] of [
    ['LUOGO', 0],
    ['DATA', larghezzaUtile * 0.3],
    ['FIRMA', larghezzaUtile * 0.6],
  ] as const) {
    pagina.drawText(etichetta, {
      x: MARGINE + (offset as number), y, size: 7, font: grassetto, color: NERO,
    })
    pagina.drawLine({
      start: { x: MARGINE + (offset as number) + 34, y: y - 1 },
      end: { x: MARGINE + (offset as number) + larghezzaUtile * 0.24, y: y - 1 },
      thickness: FILO,
      color: NERO,
    })
  }

  return Buffer.from(await pdf.save())
}
