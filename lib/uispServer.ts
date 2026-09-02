import 'server-only'
import path from 'node:path'
import ExcelJS from 'exceljs'
import {
  PRIMA_RIGA,
  ULTIMA_RIGA,
  RIGHE_MODELLO,
  MASSIMO_RAGIONEVOLE,
  formattaDataItaliana,
  separaIndirizzo,
  type RigaUisp,
} from '@/lib/uisp'

/**
 * Compilazione del "Modulo Richiesta Tesseramento" della UISP.
 *
 * Il file non lo disegniamo noi: e' il modulo che la UISP distribuisce, con la
 * sua intestazione, il suo logo e il testo del consenso in fondo. Lo teniamo in
 * `lib/uisp/` e ci scriviamo dentro soltanto le righe dei soci, cosi' se un anno
 * la UISP cambia il modulo basta sostituire il file.
 *
 * Il modulo esce con esattamente una riga per socio: le righe in piu' del
 * modello si tolgono, e se i soci sono piu' delle 54 righe disponibili se ne
 * aggiungono altre.
 *
 * L'intestazione (cognome e nome del presidente, denominazione, codice di
 * affiliazione) resta vuota di proposito: negli invii degli anni scorsi era
 * sempre compilata a mano, e inventarsi un codice di affiliazione sarebbe
 * peggio che lasciare il campo bianco.
 */

const MODELLO = path.join(process.cwd(), 'lib', 'uisp', 'modulo-uisp-2026-2027.xlsx')

/** Le colonne che scriviamo. La O ("T") e la P (firma) le riempie il socio a penna. */
const COLONNE_DATI = ['A', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'N'] as const

/** Larghezza del modulo: A..P. */
const COLONNE = 16

/** Le due unioni che ogni riga dei soci porta con se'. */
const UNIONI_RIGA = [
  ['A', 'C'],
  ['L', 'M'],
] as const

type Foglio = ExcelJS.Worksheet

function pezzi(intervallo: string) {
  const forma = /^([A-Z]+)(\d+)$/
  const [da, a] = intervallo.split(':')
  const [, c1, r1] = forma.exec(da)!
  const [, c2, r2] = forma.exec(a)!
  return { c1, r1: Number(r1), c2, r2: Number(r2) }
}

function testo(valore: string | null | undefined): string {
  return (valore ?? '').toString().trim()
}

/**
 * Allunga il blocco dei soci oltre le righe che il modello mette a
 * disposizione.
 *
 * exceljs non sposta le celle unite che stanno sotto il punto di inserimento:
 * inserendo righe a meta' foglio, l'unione che tiene insieme il testo del
 * consenso resterebbe dov'era e finirebbe sopra una riga di soci. Per questo il
 * piede si stacca prima, si cresce su un foglio che sotto non ha piu' nulla, e
 * lo si riattacca al punto giusto.
 *
 * `duplicateRow` inoltre copia male gli stili delle celle unite - perde il
 * bordo destro - quindi gli stili della riga modello vengono riapplicati a mano.
 */
function allungaFoglio(ws: Foglio, quante: number) {
  const fine = ws.rowCount

  const stiliRiga: Partial<ExcelJS.Style>[] = []
  for (let c = 1; c <= COLONNE; c++) stiliRiga.push(ws.getRow(ULTIMA_RIGA).getCell(c).style)
  const altezzaRiga = ws.getRow(ULTIMA_RIGA).height

  // Il piede messo da parte, come scarto dall'ultima riga dei soci.
  const piede = []
  for (let r = ULTIMA_RIGA + 1; r <= fine; r++) {
    const celle = []
    for (let c = 1; c <= COLONNE; c++) {
      const cella = ws.getRow(r).getCell(c)
      celle.push({ c, valore: cella.value, stile: cella.style })
    }
    piede.push({ scarto: r - ULTIMA_RIGA, altezza: ws.getRow(r).height, celle })
  }

  const unioniPiede = ws.model.merges
    .filter(m => pezzi(m).r1 > ULTIMA_RIGA)
    .map(m => {
      const { c1, r1, c2, r2 } = pezzi(m)
      return { c1, c2, s1: r1 - ULTIMA_RIGA, s2: r2 - ULTIMA_RIGA }
    })

  // Le unioni vanno sciolte esplicitamente: spliceRows toglie le righe ma le
  // lascia nel modello, e poi si scontrano con quelle da ricreare.
  for (const m of ws.model.merges.filter(m => pezzi(m).r1 > ULTIMA_RIGA)) ws.unMergeCells(m)
  ws.spliceRows(ULTIMA_RIGA + 1, fine - ULTIMA_RIGA)

  ws.duplicateRow(ULTIMA_RIGA, quante, true)
  for (let r = ULTIMA_RIGA + 1; r <= ULTIMA_RIGA + quante; r++) {
    for (const [da, a] of UNIONI_RIGA) ws.mergeCells(`${da}${r}:${a}${r}`)
    if (altezzaRiga) ws.getRow(r).height = altezzaRiga
    for (let c = 1; c <= COLONNE; c++) ws.getRow(r).getCell(c).style = stiliRiga[c - 1]
  }

  const base = ULTIMA_RIGA + quante
  for (const riga of piede) {
    const r = base + riga.scarto
    if (riga.altezza) ws.getRow(r).height = riga.altezza
    for (const { c, valore, stile } of riga.celle) {
      const cella = ws.getRow(r).getCell(c)
      cella.value = valore
      cella.style = stile
    }
  }
  for (const u of unioniPiede) {
    ws.mergeCells(`${u.c1}${base + u.s1}:${u.c2}${base + u.s2}`)
  }
}

/**
 * Riempie il modello e restituisce il file pronto da spedire.
 *
 * Non tocca nient'altro del foglio: l'intestazione, il testo del consenso, le
 * larghezze delle colonne e il logo restano quelli del modello.
 */
export async function compilaModuloUisp(righe: RigaUisp[]): Promise<Buffer> {
  if (righe.length === 0) throw new Error('Nessun socio da scrivere sul modulo.')
  if (righe.length > MASSIMO_RAGIONEVOLE) {
    throw new Error(`Richieste ${righe.length} righe: oltre ${MASSIMO_RAGIONEVOLE} c'e' un errore, non un invio.`)
  }

  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(MODELLO)
  const ws = wb.worksheets[0]

  // Il modello arriva con un socio d'esempio nella prima riga.
  for (let r = PRIMA_RIGA; r <= ULTIMA_RIGA; r++) {
    for (const col of COLONNE_DATI) ws.getCell(`${col}${r}`).value = null
  }

  if (righe.length > RIGHE_MODELLO) {
    allungaFoglio(ws, righe.length - RIGHE_MODELLO)
  } else if (righe.length < RIGHE_MODELLO) {
    // Qui basta togliere: sotto non c'e' niente da ricostruire, e le unioni
    // delle righe rimaste exceljs le sposta da solo.
    ws.spliceRows(PRIMA_RIGA + righe.length, RIGHE_MODELLO - righe.length)
  }

  righe.forEach((riga, i) => {
    const r = PRIMA_RIGA + i
    const { via, civico } = separaIndirizzo(riga.indirizzo)

    ws.getCell(`A${r}`).value = [testo(riga.cognome), testo(riga.nome)].filter(Boolean).join(' ')
    ws.getCell(`D${r}`).value = testo(riga.sesso).toUpperCase().slice(0, 1)
    ws.getCell(`E${r}`).value = formattaDataItaliana(riga.dataNascita)
    ws.getCell(`F${r}`).value = testo(riga.luogoNascita)
    ws.getCell(`G${r}`).value = testo(riga.provinciaNascita).toUpperCase()
    ws.getCell(`H${r}`).value = testo(riga.cf).toUpperCase()
    ws.getCell(`I${r}`).value = via
    ws.getCell(`J${r}`).value = civico
    ws.getCell(`K${r}`).value = testo(riga.citta)
    ws.getCell(`L${r}`).value = testo(riga.email)
    ws.getCell(`N${r}`).value = testo(riga.telefono)
  })

  return Buffer.from(await wb.xlsx.writeBuffer())
}
