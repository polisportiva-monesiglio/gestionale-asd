import { after, type NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { ipDellaRichiesta } from '@/lib/ip'
import { eMinorenne, firmatarioDi } from '@/lib/firmatario'
import { verificaOtp, consumaOtp } from '@/lib/otp'
import { componiModuloFirmato } from '@/lib/moduloPdf'
import { getAnnoSportivo } from '@/lib/stagione'
import { normalizzaTelefono } from '@/lib/telefono'
import { codiceFiscaleValido } from '@/lib/codiceFiscale'
import { notificaNuovaIscrizione } from '@/lib/notifiche'
import { VERSIONE_REGOLAMENTO, VERSIONE_STATUTO, VERSIONE_PRIVACY } from '@/lib/versioniTesti'


function scadenzaCertificato(dataEmissione: string): string | null {
  const d = new Date(dataEmissione)
  if (Number.isNaN(d.getTime())) return null
  d.setFullYear(d.getFullYear() + 1)
  return d.toISOString().split('T')[0]
}

export async function POST(req: NextRequest) {
  let dati: Record<string, any>
  let token: string
  let codice: string
  let certificatoPath: string | null

  try {
    const body = await req.json()
    dati = body?.dati ?? {}
    token = String(body?.token ?? '')
    codice = String(body?.codice ?? '')
    certificatoPath = body?.certificatoPath ? String(body.certificatoPath) : null
  } catch {
    return NextResponse.json({ error: 'Richiesta non valida' }, { status: 400 })
  }

  if (!token || !codice) {
    return NextResponse.json({ error: 'Codice OTP mancante' }, { status: 400 })
  }

  const obbligatori = ['nome', 'cognome', 'codiceFiscale', 'dataNascita', 'email', 'dataCertificato']
  const mancanti = obbligatori.filter(c => !dati?.[c])
  if (mancanti.length > 0) {
    return NextResponse.json(
      { error: `Dati incompleti: ${mancanti.join(', ')}` },
      { status: 400 }
    )
  }

  // I consensi obbligatori si controllano anche qui, non solo nel modulo. Il
  // browser puo' non spuntarli e chiamare l'API lo stesso: senza questo, si
  // creerebbe un tesseramento con il consenso ai dati sulla salute a false,
  // cioe' un certificato medico conservato senza una base giuridica che lo
  // regga. Il rinnovo lo fa gia'; qui mancava.
  const OBBLIGATORI = [
    'dichiarazioneSalute',
    'accettazioneStatutoRegolamento',
    'presaAttoVideosorveglianza',
    'presaAttoInformativa',
    'consensoCertificatoMedico',
  ] as const
  if (OBBLIGATORI.some(campo => dati?.[campo] !== true)) {
    return NextResponse.json(
      { error: 'Per iscriverti devi accettare tutte le dichiarazioni obbligatorie.' },
      { status: 400 }
    )
  }

  // Il carattere di controllo si verifica anche qui, non solo nel modulo.
  // Il browser non e' un controllo: chi chiama l'API a mano lo ignora, e
  // soprattutto un codice inventato cambiando una lettera a uno vero passa
  // l'unicita' della tabella e crea una seconda persona.
  if (!codiceFiscaleValido(dati.codiceFiscale)) {
    return NextResponse.json(
      { error: 'Il codice fiscale non è valido. Ricopialo dalla tessera sanitaria.' },
      { status: 400 }
    )
  }

  // Chi firma: per un minorenne e' il genitore, e il codice e' stato spedito a
  // lui. La regola e' la stessa usata da /api/invia-otp per scegliere dove
  // spedire, perche' viene dalla stessa funzione: se qui si verificasse contro
  // un indirizzo diverso, nessun minorenne riuscirebbe a firmare.
  const firmatario = firmatarioDi(dati)
  const emailFirma = firmatario.email

  if (!emailFirma) {
    return NextResponse.json(
      { error: "Manca l'email di chi sottoscrive il modulo" },
      { status: 400 }
    )
  }

  // 0. Il client di servizio si crea per primo: se la configurazione fosse
  //    incompleta, verificare l'OTP prima significherebbe consumarlo — è
  //    monouso — per poi fallire comunque, obbligando il socio a chiederne
  //    un altro senza capire perché.
  let supabase
  try {
    supabase = createAdminClient()
  } catch (e) {
    console.error('Client di servizio non disponibile:', e)
    return NextResponse.json({ error: 'Configurazione del server incompleta' }, { status: 500 })
  }

  // 1. Verifica dell'OTP dentro la stessa richiesta che scriverà l'iscrizione.
  //    Nulla può inserirsi fra il controllo e la scrittura.
  const esito = await verificaOtp({ email: emailFirma, codice, token, dati })
  if (!esito.valido) {
    return NextResponse.json({ error: esito.errore }, { status: esito.stato })
  }

  // 1-bis. Il codice fiscale è unico in tabella. Il controllo sta qui, dopo la
  //    verifica dell'OTP ma prima di consumarlo: prima renderebbe l'endpoint un
  //    modo per scoprire chi è iscritto, dopo brucerebbe il codice del socio per
  //    un errore che deve solo correggere.
  // Codice fiscale e indirizzi si normalizzano qui una volta sola, e da qui in
  // poi si usano solo questi. Prima il controllo confrontava la versione
  // maiuscola mentre l'inserimento scriveva quella arrivata dal browser: a
  // tenerli allineati era solo il modulo, che alza le maiuscole mentre si
  // scrive. Chiamando l'API a mano con il codice in minuscolo il controllo non
  // trovava nulla, e `soci_cf_key` — che indicizza il valore grezzo — nemmeno:
  // due righe per la stessa persona, due tesseramenti, due quote UISP.
  //
  // L'email va in minuscolo perche' Supabase normalizza cosi' quella
  // dell'account, e il callback di accesso le confronta esatte: un indirizzo
  // salvato con una maiuscola riceve il link, apre la sessione e poi non
  // aggancia nessuna riga.
  //
  // Non si tocca invece `emailFirma`, che e' l'indirizzo con cui il token OTP
  // e' stato firmato: normalizzarlo qui farebbe fallire la verifica.
  const cfNormalizzato = String(dati.codiceFiscale).trim().toUpperCase()
  const emailSocio = String(dati.email).trim().toLowerCase()

  const { data: giaIscritto, error: verificaCfErr } = await supabase
    .from('soci')
    .select('id, email')
    .eq('cf', cfNormalizzato)
    .maybeSingle()

  if (verificaCfErr) {
    console.error('Controllo codice fiscale fallito:', verificaCfErr.message)
    return NextResponse.json({ error: 'Errore interno del server' }, { status: 500 })
  }
  if (giaIscritto) {
    // Due situazioni molto diverse, che dette allo stesso modo mandano la
    // persona sbagliata a inventarsi un codice fiscale.
    //
    // Se l'indirizzo coincide, l'iscrizione l'ha gia' fatta lei: e' successo
    // il 2 settembre 2026, quando una richiesta era andata a buon fine ma la
    // risposta non era tornata al browser. Chi aveva firmato ha riprovato, si
    // e' visto dire "codice fiscale gia' registrato" come se fosse di un
    // altro, e ha cambiato una lettera per farlo passare — due righe in
    // archivio per la stessa persona.
    //
    // Se invece l'indirizzo e' diverso non si dice di chi e': chi chiede non
    // ha diritto di sapere che quel codice fiscale appartiene a un socio.
    const eLaStessaPersona =
      typeof giaIscritto.email === 'string' &&
      giaIscritto.email.toLowerCase() === emailSocio

    return NextResponse.json(
      {
        error: eLaStessaPersona
          ? 'La tua iscrizione risulta già registrata: era andata a buon fine anche se non hai ricevuto conferma. Non rifarla e non cambiare il codice fiscale — entra dalla pagina di accesso con questo indirizzo email, e lì trovi il modulo firmato.'
          : 'Risulta già un socio registrato con questo codice fiscale. Se sei tu, accedi alla tua area personale dalla pagina di accesso; se pensi sia un errore, contatta la segreteria.',
        codice: 'cf_duplicato',
      },
      { status: 409 }
    )
  }

  // 1-ter. Il percorso del certificato arriva dal browser e non è coperto
  //    dall'impronta che lega l'OTP ai dati: va quindi verificato qui.
  //    Due controlli, perché servono a due cose diverse.
  if (certificatoPath !== null) {
    // Forma: il caricamento pubblico può scrivere solo sotto `iscrizioni/`, e
    // il nome è un identificativo casuale. Fuori da lì il riferimento punta a
    // qualcosa che questo percorso non ha il diritto di indicare.
    if (!/^iscrizioni\/[A-Za-z0-9._-]{1,120}$/.test(certificatoPath)) {
      return NextResponse.json({ error: 'Riferimento del certificato non valido' }, { status: 400 })
    }

    // Unicità: senza questo, chi chiama l'API a mano può indicare il
    // certificato già allegato a un altro socio e farsi attribuire il suo
    // documento sanitario. Il gestore che poi lo apre valuterebbe l'idoneità
    // sul certificato della persona sbagliata.
    const [
      { data: suTesseramenti, error: errTesseramenti },
      { data: suStorico, error: errStorico },
    ] = await Promise.all([
      supabase.from('tesseramenti_annuali').select('id').eq('url_certificato_pdf', certificatoPath).limit(1),
      supabase.from('certificati_medici_storico').select('id').eq('url_certificato_pdf', certificatoPath).limit(1),
    ])

    // Se la verifica non si è potuta fare, non è passata: con `data` a null il
    // conteggio sarebbe zero e il controllo si lascerebbe attraversare proprio
    // quando il database ha un problema. Un guasto non è un'autorizzazione.
    if (errTesseramenti || errStorico) {
      console.error('Controllo unicità del certificato fallito:', errTesseramenti?.message ?? errStorico?.message)
      return NextResponse.json({ error: 'Errore interno del server' }, { status: 500 })
    }

    if ((suTesseramenti?.length ?? 0) > 0 || (suStorico?.length ?? 0) > 0) {
      return NextResponse.json({ error: 'Riferimento del certificato non valido' }, { status: 400 })
    }
  }

  // 1-quater. Solo ora il codice viene speso.
  if (!(await consumaOtp(esito.tokenHash))) {
    return NextResponse.json(
      { error: 'Questo codice è già stato utilizzato per una firma. Richiedine uno nuovo.' },
      { status: 409 }
    )
  }

  // 2. Elementi probatori: li stabilisce il server.
  const firmatoIl = new Date()
  const ip = ipDellaRichiesta(req)
  const annoSportivo = getAnnoSportivo(firmatoIl)
  const minorenne = eMinorenne(String(dati.dataNascita), firmatoIl)

  const scadenza = scadenzaCertificato(String(dati.dataCertificato))
  if (!scadenza) {
    return NextResponse.json({ error: 'Data del certificato non valida' }, { status: 400 })
  }

  const socioId = crypto.randomUUID()
  const tesseramentoId = crypto.randomUUID()

  // 3. Il PDF si compone prima di scrivere: se fallisce, non resta nulla a metà.
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
    console.error('Composizione del modulo fallita:', e)
    return NextResponse.json({ error: 'Generazione del documento fallita' }, { status: 500 })
  }

  const hashModulo = crypto.createHash('sha256').update(pdfBytes).digest('hex')

  // 4. Scrittura delle due righe.
  const { error: socioErr } = await supabase.from('soci').insert({
    id: socioId,
    nome: dati.nome,
    cognome: dati.cognome,
    sesso: dati.sesso,
    cf: cfNormalizzato,
    data_nascita: dati.dataNascita,
    luogo_nascita: dati.luogoNascita,
    provincia_nascita: dati.provinciaNascita,
    cittadinanza: dati.cittadinanza,
    indirizzo: dati.indirizzoResidenza,
    cap: dati.capResidenza,
    citta: dati.cittaResidenza,
    provincia_residenza: dati.provinciaResidenza,
    telefono: normalizzaTelefono(dati.telefono),
    // L'email del socio resta la sua, anche quando a firmare e' il genitore:
    // l'indirizzo di chi ha firmato si conserva a parte, in genitore_email.
    email: emailSocio,
    minorenne,
    genitore_nome: minorenne ? dati.genitoreNome : null,
    genitore_cognome: minorenne ? dati.genitoreCognome : null,
    genitore_email: minorenne ? emailFirma.trim().toLowerCase() : null,
    genitore_contatto_preferito: minorenne ? dati.genitoreContattoScelta : null,
    genitore_recapito: minorenne ? dati.genitoreContatto : null,
  })

  if (socioErr) {
    console.error('Inserimento socio fallito:', socioErr.message)
    // Rete di sicurezza: il controllo sopra non copre due iscrizioni identiche
    // inviate nello stesso istante, che si incontrerebbero solo qui.
    if (socioErr.code === '23505') {
      return NextResponse.json(
        {
          error: 'Risulta già un socio registrato con questo codice fiscale. Se sei tu, accedi alla tua area personale dalla pagina di accesso; se pensi sia un errore, contatta la segreteria.',
          codice: 'cf_duplicato',
        },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: 'Salvataggio dei dati fallito' }, { status: 500 })
  }

  const { error: tessErr } = await supabase.from('tesseramenti_annuali').insert({
    id: tesseramentoId,
    socio_id: socioId,
    anno_sportivo: annoSportivo,
    data_scadenza_certificato: scadenza,
    url_certificato_pdf: certificatoPath,
    stato_firma: 'firmato',
    otp_generato: esito.otpHash,
    ip_firma: ip,
    timestamp_firma: firmatoIl.toISOString(),
    // Un solo nome per ogni casella, e il nome dice che cosa il socio ha fatto.
    // Prima esisteva anche `consenso_privacy`, che però conteneva il consenso
    // facoltativo alle immagini: chi lo avesse letto per sapere se il socio
    // aveva accettato l'informativa avrebbe ottenuto l'esatto contrario del
    // vero per ogni socio che ha rifiutato le foto.
    //
    // Quattro caselle su cinque non raccolgono un consenso, e chiamarle
    // «consenso» diceva il falso su che cosa il socio ha sottoscritto: la
    // salute è una dichiarazione sotto la propria responsabilità, statuto e
    // regolamento si accettano, informativa e videosorveglianza si prendono
    // in atto — un'informativa non si consente, si legge. L'unico consenso
    // vero è quello alle immagini, che infatti è l'unico facoltativo e
    // l'unico revocabile.
    consensi: {
      dichiarazione_salute: dati.dichiarazioneSalute,
      accettazione_statuto_regolamento: dati.accettazioneStatutoRegolamento,
      versione_regolamento: VERSIONE_REGOLAMENTO,
      versione_statuto: VERSIONE_STATUTO,
      presa_atto_videosorveglianza: dati.presaAttoVideosorveglianza,
      presa_atto_informativa: dati.presaAttoInformativa,
      versione_privacy: VERSIONE_PRIVACY,
      consenso_dati_salute: dati.consensoCertificatoMedico,
      consenso_immagini_facoltativo: dati.consensoImmagini,
    },
  })

  if (tessErr) {
    console.error('Inserimento tesseramento fallito:', tessErr.message)
    // Il socio appena creato resterebbe orfano: lo rimuovo.
    await supabase.from('soci').delete().eq('id', socioId)
    return NextResponse.json({ error: 'Salvataggio del tesseramento fallito' }, { status: 500 })
  }

  // 5. Archiviazione del modulo firmato e impronta del documento.
  const storagePath = `${annoSportivo}/${tesseramentoId}.pdf`
  const { error: uploadErr } = await supabase.storage
    .from('moduli-firmati')
    .upload(storagePath, pdfBytes, { contentType: 'application/pdf' })

  if (uploadErr) {
    // L'iscrizione è valida comunque: si segnala senza farla fallire.
    console.error('Archiviazione del modulo fallita:', uploadErr.message)
  } else {
    const { error: aggiornaErr } = await supabase
      .from('tesseramenti_annuali')
      .update({ url_modulo_firmato_pdf: storagePath, hash_modulo_pdf: hashModulo })
      .eq('id', tesseramentoId)
    if (aggiornaErr) console.error('Collegamento del modulo fallito:', aggiornaErr.message)
  }

  // 6. Collegamento temporaneo per far scaricare il documento all'interessato.
  let urlDownload: string | null = null
  if (!uploadErr) {
    const nomeFile = `Iscrizione_${dati.cognome ?? 'Socio'}_${dati.nome ?? ''}.pdf`.replace(/\s+/g, '')
    const { data } = await supabase.storage
      .from('moduli-firmati')
      // `download` imposta il Content-Disposition: il collegamento firmato sta
      // su un altro dominio, dove l'attributo download del link viene ignorato.
      .createSignedUrl(storagePath, 3600, { download: nomeFile })
    urlDownload = data?.signedUrl ?? null
  }

  // 7. La segreteria va avvisata, ma non a spese dell'iscritto: se il postino
  //    fallisse dentro la risposta, un tesseramento gia' scritto e archiviato
  //    tornerebbe indietro come errore. Parte dopo, e se non parte resta solo
  //    una riga nel registro.
  after(async () => {
    await notificaNuovaIscrizione({
      nome: String(dati.nome ?? ''),
      cognome: String(dati.cognome ?? ''),
      emailSocio,
      annoSportivo,
      minorenne,
      scadenzaCertificato: scadenza,
    })
  })

  return NextResponse.json({
    ok: true,
    tesseramentoId,
    annoSportivo,
    urlDownload,
    hashModulo,
  })
}
