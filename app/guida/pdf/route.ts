import { NextResponse } from 'next/server'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import { GUIDA, pezzi } from '@/lib/guida'

// pdf-lib e il logo dal disco: runtime Node, non edge.
export const runtime = 'nodejs'

/**
 * La guida per i soci in PDF, da stampare e appendere in bacheca.
 *
 * Il testo e' lo stesso della pagina `/guida`: viene da `lib/guida.ts`, cosi'
 * correggere una frase la corregge in tutti e due i posti. Qui c'e' solo
 * l'impaginazione.
 */

const A4 = { larghezza: 595, altezza: 842 }
const MARGINE = 46

const INK = rgb(0.086, 0.082, 0.059)
const GRIGIO = rgb(0.42, 0.41, 0.36)
const GIALLO = rgb(0.98, 0.8, 0.08)
const GIALLO_TENUE = rgb(0.996, 0.973, 0.867)
const FILO = rgb(0.894, 0.882, 0.839)

/** I font standard parlano WinAnsi: gli apostrofi tipografici vanno normalizzati. */
function winAnsi(t: string): string {
  return t
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/[^\x20-\x7E¡-ÿ]/g, '')
}

type Caratteri = { piano: PDFFont; forte: PDFFont }

/**
 * Un'unita' non spezzabile: una parola, oppure il nome intero di un pulsante.
 *
 * I nomi dei pulsanti restano interi apposta. Trattandoli come parole sciolte
 * il riquadro giallo veniva disegnato attorno a ogni pezzo — "Nuova" e
 * "iscrizione" in due cornici separate — e a capo si spaccavano in due.
 */
/** Segni che non vogliono lo spazio davanti. */
const ATTACCATA = /^[.,;:!?)\]»%]/

type Unita = { testo: string; font: PDFFont; pulsante: boolean }

function unita(frase: string, caratteri: Caratteri): Unita[] {
  const fuori: Unita[] = []
  for (const pezzo of pezzi(frase)) {
    const testo = winAnsi(pezzo.testo)
    if (pezzo.tipo === 'pulsante') {
      fuori.push({ testo: testo.trim(), font: caratteri.forte, pulsante: true })
      continue
    }
    const font = pezzo.tipo === 'forte' ? caratteri.forte : caratteri.piano
    for (const parola of testo.split(/\s+/)) {
      if (parola) fuori.push({ testo: parola, font, pulsante: false })
    }
  }
  return fuori
}

/**
 * Scrive una frase andando a capo da sola, con l'enfasi e i riquadri dei
 * pulsanti. Restituisce la linea di base dell'ultima riga scritta.
 */
function scriviFrase(
  pagina: PDFPage,
  frase: string,
  o: {
    x: number; y: number; larghezza: number; dimensione: number
    interlinea: number; caratteri: Caratteri; colore?: ReturnType<typeof rgb>
  }
): number {
  const colore = o.colore ?? GRIGIO
  const spazio = o.caratteri.piano.widthOfTextAtSize(' ', o.dimensione)

  let x = o.x
  let y = o.y
  let primaDellaRiga = true

  const elenco = unita(frase, o.caratteri)

  for (let i = 0; i < elenco.length; i++) {
    const u = elenco[i]
    const larghezza = u.font.widthOfTextAtSize(u.testo, o.dimensione)
    // La punteggiatura si attacca alla parola che la precede: spezzando la
    // frase sull'enfasi, il punto dopo *sei socio* diventa un'unita' a se' e
    // senza questo controllo verrebbe scritto staccato, "sei socio .".
    const attaccata = ATTACCATA.test(u.testo)
    const avanzo = primaDellaRiga || attaccata ? 0 : spazio

    if (!primaDellaRiga && x + avanzo + larghezza > o.x + o.larghezza) {
      x = o.x
      y -= o.interlinea
      primaDellaRiga = true
    }
    if (!primaDellaRiga && !attaccata) x += spazio
    // Il riquadro sborda di 2pt oltre il testo: senza un po' d'aria toccherebbe
    // la parola prima e quella dopo.
    if (u.pulsante && !primaDellaRiga) x += 2

    if (u.pulsante) {
      pagina.drawRectangle({
        x: x - 2, y: y - 2.5, width: larghezza + 4, height: o.dimensione + 3.5,
        color: GIALLO_TENUE, borderColor: GIALLO, borderWidth: 0.5,
      })
    }

    pagina.drawText(u.testo, {
      x, y, size: o.dimensione, font: u.font, color: u.pulsante ? INK : colore,
    })

    // L'aria dopo il riquadro non va messa se subito dopo c'e' un segno di
    // punteggiatura: "personale :" invece di "personale:".
    const seguePunteggiatura = !!elenco[i + 1] && ATTACCATA.test(elenco[i + 1].testo)
    x += larghezza + (u.pulsante && !seguePunteggiatura ? 2 : 0)
    primaDellaRiga = false
  }

  return y
}

export async function GET() {
  const pdf = await PDFDocument.create()
  const piano = await pdf.embedFont(StandardFonts.Helvetica)
  const forte = await pdf.embedFont(StandardFonts.HelveticaBold)
  const caratteri: Caratteri = { piano, forte }

  const pagina = pdf.addPage([A4.larghezza, A4.altezza])
  const utile = A4.larghezza - MARGINE * 2
  let y = A4.altezza - MARGINE

  // ── Testata ────────────────────────────────────────────────────────
  try {
    const logo = await pdf.embedPng(
      await readFile(path.join(process.cwd(), 'public', 'logo-asd-monesiglio.png'))
    )
    const h = 46
    const w = (logo.width / logo.height) * h
    pagina.drawImage(logo, { x: MARGINE + (utile - w) / 2, y: y - h, width: w, height: h })
    y -= h + 12
  } catch {
    // Il logo e' un ornamento: se manca, la guida vale lo stesso.
    y -= 6
  }

  const ente = winAnsi(GUIDA.ente.toUpperCase())
  const larghezzaEnte = forte.widthOfTextAtSize(ente, 7)
  pagina.drawText(ente, {
    x: MARGINE + (utile - larghezzaEnte) / 2, y, size: 7, font: forte, color: GRIGIO,
  })

  y -= 24
  const titolo = winAnsi(GUIDA.titolo)
  const larghezzaTitolo = forte.widthOfTextAtSize(titolo, 24)
  pagina.drawText(titolo, {
    x: MARGINE + (utile - larghezzaTitolo) / 2, y, size: 24, font: forte, color: INK,
  })

  y -= 20
  y = scriviFrase(pagina, GUIDA.sottotitolo, {
    x: MARGINE + 40, y, larghezza: utile - 80, dimensione: 9.5, interlinea: 13, caratteri,
  })

  // ── Cosa serve ─────────────────────────────────────────────────────
  y -= 26
  const altezzaServe = 36
  pagina.drawRectangle({
    x: MARGINE, y: y - altezzaServe + 12, width: utile, height: altezzaServe,
    color: GIALLO_TENUE,
  })
  pagina.drawRectangle({
    x: MARGINE, y: y - altezzaServe + 12, width: 3, height: altezzaServe, color: GIALLO,
  })
  pagina.drawText(winAnsi(GUIDA.serveTitolo.toUpperCase()), {
    x: MARGINE + 12, y: y + 1, size: 7, font: forte, color: rgb(0.478, 0.353, 0),
  })
  pagina.drawText(winAnsi(GUIDA.serve.join('   ·   ')), {
    x: MARGINE + 12, y: y - 13, size: 9.5, font: piano, color: INK,
  })
  y -= altezzaServe + 14

  // ── Le due fasi, affiancate ────────────────────────────────────────
  const colonna = (utile - 16) / 2
  const cimaFasi = y
  let piuBasso = y

  GUIDA.fasi.forEach((fase, indice) => {
    const x = MARGINE + indice * (colonna + 16)
    let yc = cimaFasi

    pagina.drawText(winAnsi(fase.quando.toUpperCase()), {
      x, y: yc, size: 6.5, font: forte, color: GRIGIO,
    })
    yc -= 15
    pagina.drawText(winAnsi(fase.titolo), { x, y: yc, size: 14, font: forte, color: INK })
    yc -= 18

    fase.passi.forEach((passo, i) => {
      pagina.drawRectangle({ x, y: yc - 2, width: 13, height: 13, color: GIALLO })
      const n = String(i + 1)
      const wn = forte.widthOfTextAtSize(n, 7.5)
      pagina.drawText(n, { x: x + (13 - wn) / 2, y: yc + 1.5, size: 7.5, font: forte, color: INK })

      const finale = scriviFrase(pagina, passo, {
        x: x + 19, y: yc + 3, larghezza: colonna - 19, dimensione: 9, interlinea: 12, caratteri,
      })
      yc = finale - 16
    })

    yc -= 2
    pagina.drawLine({
      start: { x, y: yc + 6 }, end: { x: x + colonna, y: yc + 6 },
      thickness: 0.5, color: FILO,
    })
    yc -= 6
    const finale = scriviFrase(pagina, fase.esito, {
      x, y: yc, larghezza: colonna, dimensione: 9, interlinea: 12, caratteri,
    })
    piuBasso = Math.min(piuBasso, finale)
  })

  y = piuBasso - 30

  // ── Gli inciampi ───────────────────────────────────────────────────
  pagina.drawText(winAnsi(GUIDA.inciampiTitolo), { x: MARGINE, y, size: 13, font: forte, color: INK })
  y -= 18

  for (const voce of GUIDA.inciampi) {
    pagina.drawCircle({ x: MARGINE + 3, y: y + 3, size: 2.2, color: GIALLO })
    const finale = scriviFrase(pagina, voce, {
      x: MARGINE + 12, y, larghezza: utile - 12, dimensione: 9.5, interlinea: 12.5, caratteri,
    })
    y = finale - 13
  }

  // ── Piede ──────────────────────────────────────────────────────────
  y -= 8
  pagina.drawLine({
    start: { x: MARGINE, y }, end: { x: MARGINE + utile, y }, thickness: 0.5, color: FILO,
  })
  y -= 18

  y = scriviFrase(pagina, GUIDA.rinnovo, {
    x: MARGINE, y, larghezza: utile, dimensione: 9.5, interlinea: 12.5, caratteri, colore: INK,
  })

  y -= 20
  const chiusura = `${GUIDA.contatto} ${GUIDA.email}, o chiedi in sede.`
  scriviFrase(pagina, chiusura, {
    x: MARGINE, y, larghezza: utile, dimensione: 9, interlinea: 12, caratteri,
  })

  const file = Buffer.from(await pdf.save())

  return new NextResponse(new Uint8Array(file), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="Come-iscriversi-Polisportiva-Monesiglio.pdf"',
      // La guida cambia di rado: un giorno di cache al bordo, e la revalida
      // silenziosa evita che qualcuno legga una versione vecchia a lungo.
      'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
    },
  })
}
