import { after, type NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { ipDellaRichiesta } from '@/lib/ip'
import { eMinorenne, firmatarioDi } from '@/lib/firmatario'
import { verificaOtp, consumaOtp } from '@/lib/otp'
import { componiModuloFirmato } from '@/lib/moduloPdf'
import { partiRomane } from '@/lib/dataRoma'
import { notificaNuovaIscrizione } from '@/lib/notifiche'
import {
  datiRinnovo,
  leggiConsensi,
  leggiModifiche,
  consensiCompleti,
  aggiornamentoSocio,
} from '@/lib/rinnovo'
import { socioCheRinnova, certificatoAncoraValido } from '@/lib/rinnovoServer'

// Le versioni dei testi le decide il server, come nella prima iscrizione: se
// le dichiarasse il browser, un socio potrebbe risultare vincolato a una
// versione del regolamento diversa da quella che gli e' stata mostrata.
const VERSIONE_REGOLAMENTO = 'v1.0_2026'
const VERSIONE_STATUTO = 'v1.0_2026'
const VERSIONE_PRIVACY = 'v1.0_2026'

function scadenzaDaEmissione(dataEmissione: string): string | null {
  const d = new Date(dataEmissione)
  if (Number.isNaN(d.getTime())) return null
  d.setFullYear(d.getFullYear() + 1)
  return d.toISOString().split('T')[0]
}

function oggiRomano(adesso: Date): string {
  const { anno, mese, giorno } = partiRomane(adesso)
  return `${anno}-${String(mese).padStart(2, '0')}-${String(giorno).padStart(2, '0')}`
}

/**
 * Il rinnovo del tesseramento per la stagione nuova.
 *
 * Gemella di /api/iscrizione, con una differenza sola ma decisiva: il socio
 * esiste gia'. Qui non si crea nessuno, si scrive la dichiarazione dell'anno
 * per una persona che il database conosce, e l'identita' si legge da li'.
 *
 * L'ordine dei passaggi e' lo stesso della prima iscrizione, e per gli stessi
 * motivi: si verifica il codice, si controlla tutto quello che puo' ancora far
 * fallire l'operazione, e **solo alla fine** si spende il codice. Un codice e'
 * monouso: bruciarlo per un errore che il socio deve solo correggere lo
 * costringerebbe a chiederne un altro senza capire perche'.
 */
export async function POST(req: NextRequest) {
  let corpo: Record<string, any>
  try {
    corpo = await req.json()
  } catch {
    return NextResponse.json({ error: 'Richiesta non valida' }, { status: 400 })
  }

  const token = String(corpo?.token ?? '')
  const codice = String(corpo?.codice ?? '')
  if (!token || !codice) {
    return NextResponse.json({ error: 'Codice OTP mancante' }, { status: 400 })
  }

  const accesso = await socioCheRinnova(corpo?.socioId)
  if (!accesso.ok) {
    return NextResponse.json({ error: accesso.errore }, { status: accesso.stato })
  }
  const { socio, annoSportivo } = accesso

  const consensi = leggiConsensi(corpo?.consensi)
  if (!consensiCompleti(consensi)) {
    return NextResponse.json(
      { error: 'Per rinnovare devi accettare tutte le dichiarazioni obbligatorie.' },
      { status: 400 }
    )
  }

  const firmatoIl = new Date()
  const dati = datiRinnovo(socio, leggiModifiche(corpo?.modifiche), consensi, firmatoIl)
  const firmatario = firmatarioDi(dati)
  const emailFirma = firmatario.email

  if (!emailFirma) {
    return NextResponse.json(
      { error: "Manca l'email di chi sottoscrive il modulo" },
      { status: 400 }
    )
  }

  // 1. Verifica del codice, senza spenderlo.
  const esito = await verificaOtp({ email: emailFirma, codice, token, dati })
  if (!esito.valido) {
    return NextResponse.json({ error: esito.errore }, { status: esito.stato })
  }

  const supabase = createAdminClient()
  const oggi = oggiRomano(firmatoIl)

  // 2. Il certificato: o si riusa quello che il socio ha gia' in archivio, o
  //    se ne allega uno nuovo. La tabella pretende comunque una scadenza.
  let certificatoPath: string | null = null
  let scadenzaCertificato: string

  if (corpo?.certificato?.riusa === true) {
    const valido = await certificatoAncoraValido(socio.id, oggi)
    if (!valido) {
      return NextResponse.json(
        { error: 'Non risulta un certificato medico ancora valido: caricane uno nuovo.' },
        { status: 400 }
      )
    }
    certificatoPath = valido.percorso
    scadenzaCertificato = valido.scadenza
  } else {
    const percorso = corpo?.certificato?.path ? String(corpo.certificato.path) : null
    const emissione = corpo?.certificato?.dataCertificato
      ? String(corpo.certificato.dataCertificato)
      : null

    if (!percorso || !emissione) {
      return NextResponse.json(
        { error: 'Carica il certificato medico e indica la data di emissione.' },
        { status: 400 }
      )
    }

    // Stessa forma ammessa dalla prima iscrizione: il caricamento pubblico puo'
    // scrivere solo sotto `iscrizioni/`, con un nome casuale. Fuori da li' il
    // riferimento punta a qualcosa che questo percorso non ha il diritto di
    // indicare.
    if (!/^iscrizioni\/[A-Za-z0-9._-]{1,120}$/.test(percorso)) {
      return NextResponse.json({ error: 'Riferimento del certificato non valido' }, { status: 400 })
    }

    // Unicita': senza, chi chiama l'API a mano puo' indicare il certificato di
    // un altro socio e farselo attribuire.
    const [{ data: suTess, error: errTess }, { data: suStorico, error: errStorico }] =
      await Promise.all([
        supabase.from('tesseramenti_annuali').select('id').eq('url_certificato_pdf', percorso).limit(1),
        supabase.from('certificati_medici_storico').select('id').eq('url_certificato_pdf', percorso).limit(1),
      ])

    // Un guasto non e' un'autorizzazione: con `data` a null il conteggio
    // sarebbe zero e il controllo si lascerebbe attraversare proprio quando il
    // database ha un problema.
    if (errTess || errStorico) {
      console.error('Controllo unicita del certificato fallito:', errTess?.message ?? errStorico?.message)
      return NextResponse.json({ error: 'Errore interno del server' }, { status: 500 })
    }
    if ((suTess?.length ?? 0) > 0 || (suStorico?.length ?? 0) > 0) {
      return NextResponse.json({ error: 'Riferimento del certificato non valido' }, { status: 400 })
    }

    const scadenza = scadenzaDaEmissione(emissione)
    if (!scadenza) {
      return NextResponse.json({ error: 'Data del certificato non valida' }, { status: 400 })
    }
    certificatoPath = percorso
    scadenzaCertificato = scadenza
  }

  // 3. Solo ora il codice viene speso.
  if (!(await consumaOtp(esito.tokenHash))) {
    return NextResponse.json(
      { error: 'Questo codice è già stato utilizzato per una firma. Richiedine uno nuovo.' },
      { status: 409 }
    )
  }

  // 4. Il PDF si compone prima di scrivere: se fallisce, non resta nulla a meta'.
  const ip = ipDellaRichiesta(req)
  const minorenne = eMinorenne(socio.data_nascita, firmatoIl)
  const tesseramentoId = crypto.randomUUID()

  let pdfBytes: Uint8Array
  try {
    pdfBytes = await componiModuloFirmato(dati, {
      otpHash: esito.otpHash,
      ip,
      firmatoIl,
      annoSportivo,
      firmatario: {
        email: emailFirma,
        minorenne: firmatario.minorenne,
        nome: firmatario.nome,
        cognome: firmatario.cognome,
      },
    })
  } catch (e) {
    console.error('Composizione del modulo di rinnovo fallita:', e)
    return NextResponse.json({ error: 'Generazione del documento fallita' }, { status: 500 })
  }

  const hashModulo = crypto.createHash('sha256').update(pdfBytes).digest('hex')

  // 5. Il tesseramento dell'anno. L'indice unico su (socio, stagione) e' la
  //    rete: due invii nello stesso istante non producono due rinnovi.
  const { error: tessErr } = await supabase.from('tesseramenti_annuali').insert({
    id: tesseramentoId,
    socio_id: socio.id,
    anno_sportivo: annoSportivo,
    data_scadenza_certificato: scadenzaCertificato,
    url_certificato_pdf: certificatoPath,
    stato_firma: 'firmato',
    otp_generato: esito.otpHash,
    ip_firma: ip,
    timestamp_firma: firmatoIl.toISOString(),
    consensi: {
      dichiarazione_salute: dati.dichiarazioneSalute,
      accettazione_statuto_regolamento: dati.accettazioneStatutoRegolamento,
      versione_regolamento: VERSIONE_REGOLAMENTO,
      versione_statuto: VERSIONE_STATUTO,
      presa_atto_videosorveglianza: dati.presaAttoVideosorveglianza,
      presa_atto_informativa: dati.presaAttoInformativa,
      versione_privacy: VERSIONE_PRIVACY,
      consenso_immagini_facoltativo: dati.consensoImmagini,
    },
  })

  if (tessErr) {
    console.error('Inserimento del tesseramento di rinnovo fallito:', tessErr.message)
    if (tessErr.code === '23505') {
      return NextResponse.json(
        { error: `Il tesseramento per la stagione ${annoSportivo} risulta già firmato.` },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: 'Salvataggio del tesseramento fallito' }, { status: 500 })
  }

  // 6. Anagrafica aggiornata con quello che il socio ha corretto, e minorenne
  //    ricalcolato: chi ha compiuto diciotto anni smette di essere seguito dal
  //    genitore, qui e nelle email.
  const { error: socioErr } = await supabase
    .from('soci')
    .update(aggiornamentoSocio(dati, minorenne))
    .eq('id', socio.id)
  if (socioErr) console.error('Aggiornamento anagrafica al rinnovo fallito:', socioErr.message)

  // 7. Il certificato nuovo entra anche nello storico, come quando lo si carica
  //    dall'area personale: e' li' che la cancellazione automatica lo cerca.
  if (corpo?.certificato?.riusa !== true) {
    const { error: storicoErr } = await supabase.from('certificati_medici_storico').insert({
      socio_id: socio.id,
      tesseramento_id: tesseramentoId,
      anno_sportivo: annoSportivo,
      url_certificato_pdf: certificatoPath,
      data_scadenza_certificato: scadenzaCertificato,
    })
    if (storicoErr) console.error('Storico certificato al rinnovo fallito:', storicoErr.message)
  }

  // 8. Archiviazione del modulo firmato.
  const storagePath = `${annoSportivo}/${tesseramentoId}.pdf`
  const { error: uploadErr } = await supabase.storage
    .from('moduli-firmati')
    .upload(storagePath, pdfBytes, { contentType: 'application/pdf' })

  if (uploadErr) {
    // Il rinnovo e' valido comunque: si segnala senza farlo fallire.
    console.error('Archiviazione del modulo di rinnovo fallita:', uploadErr.message)
  } else {
    const { error: aggiornaErr } = await supabase
      .from('tesseramenti_annuali')
      .update({ url_modulo_firmato_pdf: storagePath, hash_modulo_pdf: hashModulo })
      .eq('id', tesseramentoId)
    if (aggiornaErr) console.error('Collegamento del modulo di rinnovo fallito:', aggiornaErr.message)
  }

  // 9. Collegamento temporaneo per far scaricare il documento all'interessato.
  let urlDownload: string | null = null
  if (!uploadErr) {
    const nomeFile = `Rinnovo_${socio.cognome ?? 'Socio'}_${socio.nome ?? ''}_${annoSportivo.replace('/', '-')}.pdf`.replace(/\s+/g, '')
    const { data } = await supabase.storage
      .from('moduli-firmati')
      .createSignedUrl(storagePath, 3600, { download: nomeFile })
    urlDownload = data?.signedUrl ?? null
  }

  after(async () => {
    await notificaNuovaIscrizione({
      nome: String(dati.nome ?? ''),
      cognome: String(dati.cognome ?? ''),
      emailSocio: String(dati.email ?? ''),
      annoSportivo,
      minorenne,
      scadenzaCertificato,
      rinnovo: true,
    })
  })

  return NextResponse.json({ ok: true, tesseramentoId, annoSportivo, urlDownload, hashModulo })
}
