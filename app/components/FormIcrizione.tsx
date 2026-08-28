"use client"

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { normalizzaTelefono } from '@/lib/telefono'
import { Spinner } from '@/app/components/Spinner'

export default function FormIscrizione() {
  const [step, setStep] = useState(1)
  const [formData, setFormData] = useState({
    nome: '',
    cognome: '',
    sesso: '',
    dataNascita: '',
    luogoNascita: '',
    provinciaNascita: '',
    cittadinanza: 'Italiana',
    codiceFiscale: '',
    indirizzoResidenza: '',
    cittaResidenza: '',
    capResidenza: '',
    provinciaResidenza: '',
    email: '',
    telefono: '',
    
    // Dati genitore (se minorenne)
    genitoreNome: '',
    genitoreCognome: '',
    genitoreEmail: '',
    genitoreContattoScelta: 'whatsapp',
    genitoreContatto: '',

    // Certificato
    dataCertificato: '',
    fileCertificato: null as File | null,

    // Consensi separati
    consensoSalute: false,
    consensoRegolamento: false,
    consensoVideosorveglianza: false,
    consensoInformativaPrivacy: false, // GDPR Obbligatorio
    consensoImmagini: false, // facoltativo: pubblicazione di foto e video
  })

  const [touched, setTouched] = useState<Record<string, boolean>>({})
  
  // Stati per OTP e invio
  const [otpInviato, setOtpInviato] = useState(false)
  const [codiceOtpInserito, setCodiceOtpInserito] = useState('')
  const [otpToken, setOtpToken] = useState('')
  // Fotografia dei dati al momento dell'invio del codice: serve ad accorgersi
  // se l'utente torna indietro e corregge qualcosa, perché in quel caso il
  // codice ricevuto non vale più per il nuovo contenuto.
  const [datiAllInvioOtp, setDatiAllInvioOtp] = useState('')
  const [isInviandoOtp, setIsInviandoOtp] = useState(false)
  const [iscrizioneCompletata, setIscrizioneCompletata] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Calcolo Minorenne
  const isMinorenne = () => {
    if (!formData.dataNascita || formData.dataNascita.length !== 10) return false
    const nascita = new Date(formData.dataNascita)
    const oggi = new Date()
    let eta = oggi.getFullYear() - nascita.getFullYear()
    const m = oggi.getMonth() - nascita.getMonth()
    if (m < 0 || (m === 0 && oggi.getDate() < nascita.getDate())) {
      eta--
    }
    return eta < 18
  }

  // Validazione Step 1
  const getErrors = () => {
    const errs: Record<string, string> = {}
    const cfRegex = /^[A-Z]{6}[0-9LMNPQRSTUV]{2}[ABCDEHLMPRST][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$/i

    if (!formData.nome) errs.nome = "Obbligatorio"
    if (!formData.cognome) errs.cognome = "Obbligatorio"
    if (!formData.sesso) errs.sesso = "Seleziona"
    if (!formData.dataNascita) errs.dataNascita = "Obbligatorio"
    if (!formData.luogoNascita) errs.luogoNascita = "Obbligatorio"
    if (!formData.cittadinanza) errs.cittadinanza = "Obbligatorio"
    if (!formData.indirizzoResidenza) errs.indirizzoResidenza = "Obbligatorio"
    if (!formData.cittaResidenza) errs.cittaResidenza = "Obbligatorio"
    if (!formData.telefono) errs.telefono = "Obbligatorio"
    else if (!normalizzaTelefono(formData.telefono)) errs.telefono = "Numero non valido"
    
    if (formData.codiceFiscale && !cfRegex.test(formData.codiceFiscale)) {
        errs.codiceFiscale = "Codice errato"
    }

    if (formData.provinciaNascita && formData.provinciaNascita.length !== 2) errs.provinciaNascita = "Es. CN"
    if (formData.provinciaResidenza && formData.provinciaResidenza.length !== 2) errs.provinciaResidenza = "Es. CN"
    if (formData.capResidenza && !/^\d{5}$/.test(formData.capResidenza)) errs.capResidenza = "5 numeri"
    if (formData.email && !/^\S+@\S+\.\S+$/.test(formData.email)) errs.email = "Email non valida"

    if (isMinorenne()) {
      if (!formData.genitoreNome) errs.genitoreNome = "Obbligatorio"
      if (!formData.genitoreCognome) errs.genitoreCognome = "Obbligatorio"
      // Obbligatoria: e' l'indirizzo a cui arriva il codice con cui il
      // genitore firma. Senza, firmerebbe il ragazzo.
      if (!formData.genitoreEmail) errs.genitoreEmail = "Obbligatorio"
      else if (!/^\S+@\S+\.\S+$/.test(formData.genitoreEmail)) errs.genitoreEmail = "Email non valida"
      if (!formData.genitoreContatto) errs.genitoreContatto = "Obbligatorio"
      else if (formData.genitoreContattoScelta === 'email' && !/^\S+@\S+\.\S+$/.test(formData.genitoreContatto)) {
        errs.genitoreContatto = "Email non valida"
      }
    }

    return errs
  }

  const errors = getErrors()
  const under18 = isMinorenne()

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target
    if (type === 'checkbox') {
      return setFormData(prev => ({ ...prev, [name]: checked }))
    }

    let finalValue = value
    if (['codiceFiscale', 'provinciaNascita', 'provinciaResidenza'].includes(name)) {
        finalValue = value.toUpperCase().replace(/[^A-Z0-9]/g, '')
    }

    setFormData(prev => ({ ...prev, [name]: finalValue }))
  }

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    setTouched(prev => ({ ...prev, [e.target.name]: true }))
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFormData(prev => ({ ...prev, fileCertificato: e.target.files![0] }))
    }
  }

  const nextStep = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
    setStep(prev => prev + 1)
  }
  const prevStep = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
    setStep(prev => prev - 1)
  }

  // Email a cui viene inviato (e con cui viene verificato) il codice OTP
  const getEmailOtp = () => {
    // Per un minorenne firma il genitore, sempre: il canale preferito per le
    // comunicazioni non c'entra con dove va spedito il codice della firma.
    // Il server applica la stessa regola in autonomia (lib/firmatario.ts);
    // questa serve solo a mostrare l'indirizzo giusto a schermo.
    return under18 ? formData.genitoreEmail : formData.email
  }

  // Snapshot dei dati che costituiscono il contenuto dichiarato/firmato
  // (anagrafica + consensi). Il server ne calcola l'hash e lo lega all'OTP:
  // se qualcosa cambia prima della conferma, la firma non è più valida.
  const buildDatiFirma = () => ({
    nome: formData.nome,
    cognome: formData.cognome,
    sesso: formData.sesso,
    dataNascita: formData.dataNascita,
    luogoNascita: formData.luogoNascita,
    provinciaNascita: formData.provinciaNascita,
    cittadinanza: formData.cittadinanza,
    codiceFiscale: formData.codiceFiscale,
    indirizzoResidenza: formData.indirizzoResidenza,
    cittaResidenza: formData.cittaResidenza,
    capResidenza: formData.capResidenza,
    provinciaResidenza: formData.provinciaResidenza,
    email: formData.email,
    telefono: formData.telefono,
    genitoreNome: formData.genitoreNome,
    genitoreCognome: formData.genitoreCognome,
    genitoreEmail: formData.genitoreEmail,
    genitoreContattoScelta: formData.genitoreContattoScelta,
    genitoreContatto: formData.genitoreContatto,
    consensoSalute: formData.consensoSalute,
    consensoRegolamento: formData.consensoRegolamento,
    consensoVideosorveglianza: formData.consensoVideosorveglianza,
    consensoInformativaPrivacy: formData.consensoInformativaPrivacy,
    consensoImmagini: formData.consensoImmagini,
  })

  // Se dopo l'invio del codice l'utente torna indietro e modifica un dato
  // firmato, il codice ricevuto non vale più: il server lo rifiuterebbe perché
  // l'impronta non corrisponde. Meglio accorgersene qui e offrire la via
  // d'uscita, invece di lasciarlo davanti a un errore senza rimedio.
  const datiCambiatiDopoOtp =
    otpInviato && datiAllInvioOtp !== '' && datiAllInvioOtp !== JSON.stringify(buildDatiFirma())

  // Riporta il riquadro allo stato iniziale, così si può chiedere un altro codice
  const richiediNuovoCodice = () => {
    setOtpInviato(false)
    setOtpToken('')
    setCodiceOtpInserito('')
    setDatiAllInvioOtp('')
  }

  // INVIO OTP
  const handleInviaOtp = async () => {
    setIsInviandoOtp(true)

    const emailDestinatario = getEmailOtp()

    if (!emailDestinatario || !emailDestinatario.includes('@')) {
      alert("Attenzione: Inserisci un'email valida nello Step 1 prima di richiedere il codice.")
      setIsInviandoOtp(false)
      return
    }

    try {
      const response = await fetch('/api/invia-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Destinatario e nome non si mandano piu': li ricava il server dai
        // dati firmati. Se li scegliesse il browser, basterebbe cambiarli per
        // far recapitare altrove il codice che vale come firma.
        body: JSON.stringify({ dati: buildDatiFirma() }),
      })

      const data = await response.json()

      if (response.ok) {
        setOtpToken(data.token)
        setDatiAllInvioOtp(JSON.stringify(buildDatiFirma()))
        setCodiceOtpInserito('')
        setOtpInviato(true)
        alert(`Un codice di 6 cifre è stato inviato a ${emailDestinatario}`)
      } else {
        alert(`Errore nell'invio: ${data.error}`)
      }
    } catch (error) {
      console.error(error)
      alert("Si è verificato un errore di connessione. Riprova.")
    } finally {
      setIsInviandoOtp(false)
    }
  }

  // CONFERMA FIRMA E SALVATAGGIO
  //
  // Il browser non scrive più nulla nel database: si limita a caricare il
  // certificato e a consegnare al server codice OTP e dati. È il server a
  // verificare l'OTP, stabilire IP e orario della firma, registrare
  // l'iscrizione e archiviare il modulo, tutto dentro un'unica richiesta.
  const handleConfermaFirma = async () => {
    setIsSubmitting(true)
    try {

        // 1. Il certificato va direttamente all'archivio: un PDF fino a 10 MB
        //    non passerebbe dai limiti di corpo di una funzione server.
        let certificatoPath: string | null = null
        if (formData.fileCertificato) {
          // Nome casuale: il percorso di un documento sanitario non deve
          // contenere nome e cognome dell'interessato.
          const estensione = formData.fileCertificato.name.split('.').pop()?.toLowerCase() || 'pdf'
          const nomeFile = `iscrizioni/${crypto.randomUUID()}.${estensione}`

          const { data, error } = await supabase.storage
            .from('certificati-medici')
            .upload(nomeFile, formData.fileCertificato)

          if (error) throw new Error(`Errore certificato: ${error.message}`)
          certificatoPath = data.path
        }

        // 2. Unica chiamata al server: verifica dell'OTP, registrazione
        //    dell'iscrizione e firma del modulo avvengono insieme, senza che
        //    il browser possa intervenire fra un passaggio e l'altro.
        const datiFirma: Record<string, unknown> = { ...formData }
        delete datiFirma.fileCertificato

        const risposta = await fetch('/api/iscrizione', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token: otpToken,
            codice: codiceOtpInserito,
            certificatoPath,
            dati: datiFirma,
          }),
        })

        const esito = await risposta.json()

        if (!risposta.ok || !esito.ok) {
          alert(esito.error || "Non è stato possibile completare l'iscrizione. Riprova.")
          setIsSubmitting(false)
          return
        }

        // 3. Scarica il modulo firmato archiviato dal server
        if (esito.urlDownload) {
          const a = document.createElement('a')
          a.href = esito.urlDownload
          a.rel = 'noopener'
          document.body.appendChild(a)
          a.click()
          a.remove()
        } else {
          console.error('Modulo firmato non disponibile per il download.')
        }

        setIscrizioneCompletata(true)
    } catch (error: any) {
        alert(error.message || "Si è verificato un errore.")
    } finally {
        setIsSubmitting(false)
    }
  }

  // Utility Grafiche
  const getInputClass = (name: string) => {
    const isError = touched[name] && errors[name]
    return `w-full p-3.5 rounded-xl border border-gray-200 shadow-sm transition-all focus:outline-none focus:ring-2 ${
      isError 
        ? 'border-red-400 bg-red-50 focus:border-red-500 focus:ring-red-200 text-red-900' 
        : 'bg-white focus:border-yellow-400 focus:ring-yellow-200 text-gray-800 hover:border-gray-300'
    }`
  }

  const ErrorMsg = ({ name }: { name: string }) => {
    return touched[name] && errors[name] ? (
      <p className="text-red-500 text-xs mt-1.5 font-medium pl-1">{errors[name]}</p>
    ) : null
  }

  const renderProgressBar = () => (
    <div className="mb-12 px-2 sm:px-6 max-w-xl mx-auto">
      <div className="flex items-center justify-between relative">
        <div className="absolute left-0 top-1/2 transform -translate-y-1/2 w-full h-1 bg-gray-200 rounded-full z-0"></div>
        <div 
          className="absolute left-0 top-1/2 transform -translate-y-1/2 h-1 bg-yellow-400 rounded-full z-0 transition-all duration-500 ease-in-out"
          style={{ width: `${((step - 1) / 2) * 100}%` }}
        ></div>
        {[
          { num: 1, label: 'Anagrafica' },
          { num: 2, label: 'Certificato' },
          { num: 3, label: 'Firma' }
        ].map((s) => (
          <div key={s.num} className="relative z-10 flex flex-col items-center">
            <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center font-bold text-base sm:text-lg transition-all duration-300 border-2 ${
              step >= s.num 
                ? 'bg-yellow-400 border-yellow-400 text-gray-900 shadow-md' 
                : 'bg-white border-gray-300 text-gray-400'
            }`}>
              {step > s.num ? '✓' : s.num}
            </div>
            <span className={`absolute -bottom-8 text-xs font-bold uppercase tracking-wider whitespace-nowrap ${
              step >= s.num ? 'text-gray-800' : 'text-gray-400'
            }`}>{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  )

  if (iscrizioneCompletata) {
    return (
      <div className="min-h-screen bg-[#FAFAFA] py-12 px-4 flex items-start justify-center">
        <div className="bg-white shadow-xl rounded-2xl p-10 text-center max-w-2xl w-full border-t-8 border-yellow-400">
           <div className="w-20 h-20 bg-yellow-50 text-yellow-500 rounded-full flex items-center justify-center mx-auto mb-6 text-4xl">
              ✓
           </div>
          <h2 className="text-3xl font-extrabold text-gray-900 mb-4 tracking-tight">Iscrizione Completata!</h2>
          <p className="text-lg text-gray-600 mb-8 leading-relaxed font-medium">
            Grazie <strong>{formData.nome}</strong>, abbiamo registrato la tua iscrizione e firmato digitalmente il modulo.<br/>
            Riceverai a breve una copia PDF del tesseramento firmato.
          </p>
          <button 
            onClick={() => window.location.reload()}
            className="bg-yellow-400 text-gray-900 px-8 py-4 rounded-xl font-bold text-lg hover:bg-yellow-500 transition-all shadow-md hover:shadow-lg"
          >
            Torna alla Home
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      
      <div className="min-h-screen w-full bg-[#FAFAFA] py-10 font-sans text-gray-800">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          
          {/* HEADER */}
          <div className="text-center mb-12">
              <img 
                src="/logo-asd-monesiglio.png" 
                alt="Logo ASD Polisportiva Monesiglio" 
                className="w-36 sm:w-44 h-auto mx-auto object-contain mb-5"
              />
            <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight mb-2">
              ASD Polisportiva Monesiglio
            </h1>
            <p className="text-gray-500 font-bold uppercase tracking-widest text-xs sm:text-sm">
              Modulo di Iscrizione e Tesseramento
            </p>
          </div>

          {renderProgressBar()}

          {/* IL FORM */}
          <div className="bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-3xl p-6 sm:p-10 border border-gray-100 border-t-8 border-t-yellow-400 mt-16 relative z-10">
            
            {/* STEP 1 */}
            <div className={`animate-fade-in ${step === 1 ? 'block' : 'hidden'}`}>
              
              <div className="flex items-center mb-8 border-b border-gray-100 pb-4">
                 <div className="w-2 h-6 bg-yellow-400 rounded-full mr-3"></div>
                 <h2 className="text-2xl font-extrabold text-gray-900 tracking-tight">Dati Anagrafici</h2>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Nome</label>
                  <input type="text" name="nome" value={formData.nome} onChange={handleChange} onBlur={handleBlur} className={getInputClass('nome')} />
                  <ErrorMsg name="nome" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Cognome</label>
                  <input type="text" name="cognome" value={formData.cognome} onChange={handleChange} onBlur={handleBlur} className={getInputClass('cognome')} />
                  <ErrorMsg name="cognome" />
                </div>

                {/* BOTTONI SESSO */}
                <div className="md:col-span-2 my-2">
                  <label className="block text-sm font-bold text-gray-700 mb-3 tracking-wide">Genere</label>
                  <div className={`flex w-full gap-4 ${touched.sesso && errors.sesso ? 'p-2 bg-red-50 rounded-xl border border-red-200' : ''}`}>
                    <label className="flex-1 cursor-pointer relative">
                      <input type="radio" name="sesso" value="M" checked={formData.sesso === 'M'} onChange={handleChange} onBlur={() => setTouched(prev => ({ ...prev, sesso: true }))} className="peer sr-only" />
                      <div className="w-full text-center py-4 px-2 rounded-xl border border-gray-200 font-bold transition-all peer-checked:bg-yellow-400 peer-checked:border-yellow-400 peer-checked:text-gray-900 bg-white text-gray-500 hover:border-yellow-300 hover:bg-yellow-50 shadow-sm cursor-pointer">
                        Maschio
                      </div>
                    </label>
                    <label className="flex-1 cursor-pointer relative">
                      <input type="radio" name="sesso" value="F" checked={formData.sesso === 'F'} onChange={handleChange} onBlur={() => setTouched(prev => ({ ...prev, sesso: true }))} className="peer sr-only" />
                      <div className="w-full text-center py-4 px-2 rounded-xl border border-gray-200 font-bold transition-all peer-checked:bg-yellow-400 peer-checked:border-yellow-400 peer-checked:text-gray-900 bg-white text-gray-500 hover:border-yellow-300 hover:bg-yellow-50 shadow-sm cursor-pointer">
                        Femmina
                      </div>
                    </label>
                  </div>
                  <ErrorMsg name="sesso" />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Data di Nascita</label>
                  <input type="date" name="dataNascita" value={formData.dataNascita} onChange={handleChange} onBlur={handleBlur} className={getInputClass('dataNascita')} />
                  <ErrorMsg name="dataNascita" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Codice Fiscale</label>
                  <input type="text" name="codiceFiscale" value={formData.codiceFiscale} onChange={handleChange} onBlur={handleBlur} maxLength={16} placeholder="Es. RSSMRA80A01H501U" className={getInputClass('codiceFiscale')} />
                  <ErrorMsg name="codiceFiscale" />
                </div>
              </div>

              {/* BLOCCO LUOGO DI NASCITA E CITTADINANZA */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
                 <div className="md:col-span-2">
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Comune di Nascita</label>
                  <input type="text" name="luogoNascita" value={formData.luogoNascita} onChange={handleChange} onBlur={handleBlur} className={getInputClass('luogoNascita')} />
                  <ErrorMsg name="luogoNascita" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Prov. <span className="font-normal text-gray-400">(o EE)</span></label>
                  <input type="text" name="provinciaNascita" value={formData.provinciaNascita} onChange={handleChange} onBlur={handleBlur} maxLength={2} placeholder="CN" className={getInputClass('provinciaNascita')} />
                  <ErrorMsg name="provinciaNascita" />
                </div>
                <div className="md:col-span-3">
                   <label className="block text-sm font-semibold text-gray-700 mb-1.5">Cittadinanza</label>
                   <input type="text" name="cittadinanza" value={formData.cittadinanza} onChange={handleChange} onBlur={handleBlur} className={getInputClass('cittadinanza')} placeholder="Es. Italiana" />
                   <ErrorMsg name="cittadinanza" />
                </div>
              </div>

              <div className="flex items-center mb-6 border-b border-gray-100 pb-4">
                 <div className="w-2 h-6 bg-yellow-400 rounded-full mr-3"></div>
                 <h3 className="text-xl font-extrabold text-gray-900 tracking-tight">Residenza e Contatti</h3>
              </div>
              
              <div className="bg-gray-50/50 p-6 rounded-2xl border border-gray-100 mb-8">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
                  <div className="md:col-span-4">
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">Indirizzo (Via e civico)</label>
                    <input type="text" name="indirizzoResidenza" value={formData.indirizzoResidenza} onChange={handleChange} onBlur={handleBlur} className={getInputClass('indirizzoResidenza')} />
                    <ErrorMsg name="indirizzoResidenza" />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">Città</label>
                    <input type="text" name="cittaResidenza" value={formData.cittaResidenza} onChange={handleChange} onBlur={handleBlur} className={getInputClass('cittaResidenza')} />
                    <ErrorMsg name="cittaResidenza" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">CAP</label>
                    <input type="text" name="capResidenza" value={formData.capResidenza} onChange={handleChange} onBlur={handleBlur} maxLength={5} className={getInputClass('capResidenza')} />
                    <ErrorMsg name="capResidenza" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">Prov.</label>
                    <input type="text" name="provinciaResidenza" value={formData.provinciaResidenza} onChange={handleChange} onBlur={handleBlur} maxLength={2} className={getInputClass('provinciaResidenza')} />
                    <ErrorMsg name="provinciaResidenza" />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">Email</label>
                    <input type="email" name="email" value={formData.email} onChange={handleChange} onBlur={handleBlur} className={getInputClass('email')} />
                    <ErrorMsg name="email" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">Cellulare (WhatsApp)</label>
                    <input type="tel" name="telefono" value={formData.telefono} onChange={handleChange} onBlur={handleBlur} className={getInputClass('telefono')} />
                    <ErrorMsg name="telefono" />
                  </div>
                </div>
              </div>

              {under18 && (
                <div className="p-6 bg-yellow-50/50 border border-yellow-200 rounded-2xl mb-8">
                  <h3 className="text-lg font-bold text-gray-900 mb-5 flex items-center tracking-tight">
                    <span className="mr-2">🛡️</span> Dati Genitore / Tutore
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1.5">Nome</label>
                      <input type="text" name="genitoreNome" value={formData.genitoreNome} onChange={handleChange} onBlur={handleBlur} className={getInputClass('genitoreNome')} />
                      <ErrorMsg name="genitoreNome" />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1.5">Cognome</label>
                      <input type="text" name="genitoreCognome" value={formData.genitoreCognome} onChange={handleChange} onBlur={handleBlur} className={getInputClass('genitoreCognome')} />
                      <ErrorMsg name="genitoreCognome" />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-sm font-semibold text-gray-700 mb-1">
                        Email del genitore/tutore <span className="text-red-500">*</span>
                      </label>
                      <p className="text-xs text-gray-500 mb-1">
                        A questo indirizzo inviamo il codice con cui firmare l&apos;iscrizione: per un socio minorenne il modulo lo sottoscrive chi esercita la responsabilit&agrave; genitoriale.
                      </p>
                      <input type="email" name="genitoreEmail" value={formData.genitoreEmail} onChange={handleChange} onBlur={handleBlur} className={getInputClass('genitoreEmail')} placeholder="mario.rossi@email.it" />
                      <ErrorMsg name="genitoreEmail" />
                    </div>
                    
                    <div className="md:col-span-2 mt-2">
                      <label className="block text-sm font-semibold text-gray-700 mb-3">Canale preferito per comunicazioni e avvisi</label>
                      <div className="flex gap-4">
                        <label className="flex-1 cursor-pointer relative">
                          <input type="radio" name="genitoreContattoScelta" value="email" checked={formData.genitoreContattoScelta === 'email'} onChange={handleChange} className="peer sr-only" />
                          <div className="text-center py-3 rounded-xl border border-gray-200 font-semibold transition-all peer-checked:bg-yellow-400 peer-checked:border-yellow-400 peer-checked:text-gray-900 bg-white text-gray-500 hover:bg-gray-50 shadow-sm cursor-pointer">Email</div>
                        </label>
                        <label className="flex-1 cursor-pointer relative">
                          <input type="radio" name="genitoreContattoScelta" value="whatsapp" checked={formData.genitoreContattoScelta === 'whatsapp'} onChange={handleChange} className="peer sr-only" />
                          <div className="text-center py-3 rounded-xl border border-gray-200 font-semibold transition-all peer-checked:bg-yellow-400 peer-checked:border-yellow-400 peer-checked:text-gray-900 bg-white text-gray-500 hover:bg-gray-50 shadow-sm cursor-pointer">WhatsApp</div>
                        </label>
                      </div>
                       <p className="text-xs text-yellow-700 mt-3 font-medium bg-yellow-100/50 p-2 rounded-lg border border-yellow-200">
                          <span className="font-bold">Nota:</span> Indipendentemente dalla scelta, il codice di sicurezza OTP per la firma finale verrà inviato all'indirizzo Email indicato sopra.
                      </p>
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-sm font-semibold text-gray-700 mb-1.5">Contatto</label>
                      <input 
                        type={formData.genitoreContattoScelta === 'email' ? 'email' : 'tel'} 
                        name="genitoreContatto" 
                        value={formData.genitoreContatto} 
                        onChange={handleChange} 
                        onBlur={handleBlur} 
                        className={getInputClass('genitoreContatto')} 
                        placeholder={formData.genitoreContattoScelta === 'email' ? 'mario.rossi@email.it' : 'Es. 3331234567'} 
                      />
                      <ErrorMsg name="genitoreContatto" />
                    </div>
                  </div>
                </div>
              )}

              {/* BLOCCO PULSANTE E NOTA ASTERISCO */}
              <div className="flex flex-col md:flex-row justify-between items-center pt-8 border-t border-gray-100 mt-4 gap-4">
                 {/* Nota Asterisco posizionata qui */}
                <div className="text-sm font-medium text-gray-500 text-center md:text-left w-full md:w-auto">
                  I campi contrassegnati con l'asterisco (<span className="text-red-500 font-bold">*</span>) sono obbligatori.
                </div>
                <button 
                  onClick={nextStep} 
                  disabled={Object.keys(errors).length > 0} 
                  className={`px-10 py-4 rounded-xl font-bold transition-all w-full md:w-auto shadow-sm ${
                    Object.keys(errors).length === 0 
                      ? 'bg-gray-900 text-white hover:bg-gray-800 hover:shadow-lg hover:-translate-y-0.5' 
                      : 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200'
                  }`}
                >
                  Vai al Certificato →
                </button>
              </div>
            </div>

            {/* STEP 2 */}
            <div className={`animate-fade-in ${step === 2 ? 'block' : 'hidden'}`}>
              <div className="flex items-center mb-8 border-b border-gray-100 pb-4">
                 <div className="w-2 h-6 bg-yellow-400 rounded-full mr-3"></div>
                 <h2 className="text-2xl font-extrabold text-gray-900 tracking-tight">Certificato Medico</h2>
              </div>

              <div className="mb-10 bg-gray-50 p-6 md:p-8 rounded-2xl border border-gray-100 relative overflow-hidden">
                 <div className="absolute top-0 left-0 w-1.5 h-full bg-yellow-400"></div>
                <h3 className="text-lg font-bold text-gray-900 mb-6 flex items-center ml-2">
                  <span className="text-xl mr-2">📄</span> Il tuo Certificato Medico
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 ml-2">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Data della Visita Medica</label>
                    <input 
                      type="date" 
                      name="dataCertificato" 
                      value={formData.dataCertificato} 
                      onChange={handleChange} 
                      className="w-full p-3.5 border border-gray-300 rounded-xl bg-white shadow-sm focus:ring-2 focus:ring-yellow-200 focus:border-yellow-400 outline-none transition-all text-gray-700 hover:border-gray-400"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Carica Foto o PDF</label>
                    <input 
                      type="file" 
                      accept="image/*,.pdf" 
                      onChange={handleFileChange} 
                      className="w-full p-2 border border-dashed border-gray-300 rounded-xl bg-white shadow-sm file:mr-4 file:py-2 file:px-5 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-gray-100 file:text-gray-900 hover:file:bg-gray-200 cursor-pointer transition-all text-gray-500 hover:border-gray-400" 
                    />
                  </div>
                </div>
              </div>

              <div className="flex flex-col-reverse md:flex-row justify-between items-center pt-8 border-t border-gray-100 gap-4">
                <button onClick={prevStep} className="text-gray-500 font-semibold hover:text-gray-900 transition-colors w-full md:w-auto py-3">← Indietro</button>
                <button 
                  onClick={nextStep} 
                  disabled={!formData.dataCertificato || !formData.fileCertificato} 
                  className="px-10 py-4 rounded-xl font-bold bg-gray-900 text-white hover:bg-gray-800 disabled:bg-gray-100 disabled:text-gray-400 disabled:border disabled:border-gray-200 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all disabled:shadow-none w-full md:w-auto"
                >
                  Vai alla Firma →
                </button>
              </div>
            </div>

            {/* STEP 3 */}
            <div className={`animate-fade-in ${step === 3 ? 'block' : 'hidden'}`}>
              <div className="flex items-center mb-6 border-b border-gray-100 pb-4">
                 <div className="w-2 h-6 bg-yellow-400 rounded-full mr-3"></div>
                 <h2 className="text-2xl font-extrabold text-gray-900 tracking-tight">Firma Elettronica</h2>
              </div>
              
              <div className="bg-yellow-50 border border-yellow-200 p-5 mb-8 rounded-xl shadow-sm flex gap-4">
                <span className="text-yellow-600 text-xl hidden sm:block">⚖️</span>
                <div className="text-sm text-gray-800 leading-relaxed font-medium">
                  <strong className="text-gray-900">Valore legale:</strong> la firma tramite codice OTP (One Time Password) è una firma elettronica ai sensi del Regolamento UE 910/2014. Il modulo che sottoscrivi è valido e utilizzabile come prova della tua richiesta di ammissione.<br/><br/>
                  <span className="text-xs text-gray-600">
                    Per rendere la firma verificabile nel tempo, il sistema registra l&apos;impronta del codice ricevuto, la data e l&apos;ora della firma, l&apos;indirizzo IP da cui viene apposta e un&apos;impronta del documento firmato. Questi dati servono a dimostrare che il modulo è stato sottoscritto da te e non è stato modificato successivamente.
                  </span>
                </div>
              </div>

              <div className="space-y-4 mb-10">
                <h3 className="font-semibold text-gray-500 uppercase tracking-wide text-sm mb-3">Dichiarazioni Obbligatorie</h3>
                
                <label className="flex items-start cursor-pointer group p-4 bg-gray-50 hover:bg-yellow-50/50 rounded-xl transition-colors border border-gray-200 hover:border-yellow-400 shadow-sm">
                  <input type="checkbox" name="consensoSalute" checked={formData.consensoSalute} onChange={handleChange} className="mt-0.5 h-5 w-5 accent-yellow-400 border-gray-300 rounded cursor-pointer" />
                  <span className="ml-3.5 text-sm text-gray-600 leading-relaxed font-medium"><strong className="text-gray-900 font-bold block mb-0.5">Stato di Salute</strong> Dichiaro sotto la mia responsabilità di essere di sana e robusta costituzione fisica per svolgere attività sportiva non agonistica.</span>
                </label>
                
                <label className="flex items-start cursor-pointer group p-4 bg-gray-50 hover:bg-yellow-50/50 rounded-xl transition-colors border border-gray-200 hover:border-yellow-400 shadow-sm">
                  <input type="checkbox" name="consensoRegolamento" checked={formData.consensoRegolamento} onChange={handleChange} className="mt-0.5 h-5 w-5 accent-yellow-400 border-gray-300 rounded cursor-pointer" />
                  <span className="ml-3.5 text-sm text-gray-600 leading-relaxed font-medium">
                    <strong className="text-gray-900 font-bold block mb-0.5">Regolamento e Statuto</strong> 
                    Dichiaro di aver preso visione dello <a href="/statuto.pdf" target="_blank" onClick={(e) => e.stopPropagation()} className="text-yellow-600 font-bold hover:text-yellow-700 hover:underline transition-all">Statuto</a> e del <a href="/regolamento.pdf" target="_blank" onClick={(e) => e.stopPropagation()} className="text-yellow-600 font-bold hover:text-yellow-700 hover:underline transition-all">Regolamento</a> dell'ASD, di accettarli integralmente e di chiedere l'ammissione in qualità di socio.
                  </span>
                </label>

                {/* VIDEOSORVEGLIANZA: presa d'atto, non consenso. L'impianto e' del
                    Comune di Monesiglio, unico titolare: l'Associazione non tratta le
                    immagini. Qui si informa e si indirizza a chi risponde davvero. */}
                <label className="flex items-start cursor-pointer group p-4 bg-gray-50 hover:bg-yellow-50/50 rounded-xl transition-colors border border-gray-200 hover:border-yellow-400 shadow-sm">
                  <input type="checkbox" name="consensoVideosorveglianza" checked={formData.consensoVideosorveglianza} onChange={handleChange} className="mt-0.5 h-5 w-5 accent-yellow-400 border-gray-300 rounded cursor-pointer" />
                  <span className="ml-3.5 text-sm text-gray-600 leading-relaxed font-medium"><strong className="text-gray-900 font-bold block mb-0.5">Videosorveglianza dei locali</strong> Dichiaro di essere informato che nei locali in cui si svolge l'attività è attivo un impianto di videosorveglianza del Comune di Monesiglio, unico titolare del trattamento delle immagini. L'Associazione non vi accede e non le conserva: finalità, tempi di conservazione e modalità per esercitare i propri diritti sono indicati nei cartelli e nell'informativa esposti nei locali.</span>
                </label>

                {/* BLOCCO OBBLIGATORIO GDPR (Separato) */}
                <label className="flex items-start cursor-pointer group p-4 bg-gray-50 hover:bg-yellow-50/50 rounded-xl transition-colors border border-gray-200 hover:border-yellow-400 shadow-sm">
                  <input 
                    type="checkbox" 
                    name="consensoInformativaPrivacy" 
                    checked={formData.consensoInformativaPrivacy} 
                    onChange={handleChange} 
                    className="mt-0.5 h-5 w-5 accent-yellow-400 border-gray-300 rounded cursor-pointer" 
                  />
                  <span className="ml-3.5 text-sm text-gray-600 leading-relaxed font-medium">
                    <strong className="text-gray-900 font-bold block mb-0.5">Informativa sulla Privacy (GDPR)</strong>
                    Dichiaro di aver letto e compreso l'<a href="/privacy-policy.pdf" target="_blank" onClick={(e) => e.stopPropagation()} className="text-yellow-600 font-bold hover:text-yellow-700 hover:underline transition-all">Informativa sul trattamento dei dati personali</a> ai sensi del Regolamento UE 2016/679.
                  </span>
                </label>

                {/* BLOCCO FACOLTATIVO (Immagini) */}
                <h3 className="font-semibold text-gray-500 uppercase tracking-wide text-sm mt-8 mb-3">Consensi Facoltativi</h3>
                
                <label className="flex items-start cursor-pointer group p-4 bg-gray-50 hover:bg-yellow-50/50 rounded-xl transition-colors border border-gray-200 hover:border-yellow-400 shadow-sm">
                  <input 
                    type="checkbox" 
                    name="consensoImmagini" 
                    checked={formData.consensoImmagini} 
                    onChange={handleChange} 
                    className="mt-0.5 h-5 w-5 accent-yellow-400 border-gray-300 rounded cursor-pointer" 
                  />
                  <span className="ml-3.5 text-sm text-gray-600 leading-relaxed font-medium">
                    <strong className="text-gray-900 font-bold block mb-0.5">Uso Immagini Promozionali (Facoltativo)</strong>
                    Acconsento alla pubblicazione di foto/video che mi ritraggono sulle bacheche e sui canali social dell'Associazione per fini istituzionali e promozionali.
                  </span>
                </label>
              </div>

              <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6 sm:p-8 text-center shadow-inner relative overflow-hidden">
                {!otpInviato ? (
                  <div>
                    <p className="text-gray-600 mb-6 font-medium">
                      Invieremo un codice di sicurezza gratuito per firmare all'indirizzo email:<br/>
                      <strong className="text-2xl text-gray-900 font-extrabold block mt-2 break-all">
                        {getEmailOtp()}
                      </strong>
                    </p>
                    <button 
                      onClick={handleInviaOtp} 
                      disabled={!formData.consensoSalute || !formData.consensoRegolamento || !formData.consensoVideosorveglianza || !formData.consensoInformativaPrivacy || isInviandoOtp} 
                      className="bg-yellow-400 text-gray-900 px-10 py-4 rounded-xl font-bold text-lg hover:bg-yellow-500 disabled:bg-gray-200 disabled:text-gray-400 disabled:border disabled:border-gray-200 transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5 disabled:shadow-none disabled:transform-none w-full md:w-auto inline-flex items-center justify-center gap-2"
                    >
                      {isInviandoOtp && <Spinner className="h-5 w-5" />}
                      {isInviandoOtp ? 'Invio in corso...' : 'Invia Codice OTP'}
                    </button>
                    <p className="text-xs text-gray-400 mt-4 font-medium">
                      Accetta i 4 consensi obbligatori per sbloccare il pulsante.
                    </p>
                  </div>
                ) : datiCambiatiDopoOtp ? (
                  <div className="animate-fade-in">
                    <div className="rounded-2xl bg-yellow-50 border border-yellow-200 px-5 py-6 mb-6 text-left">
                      <p className="text-sm font-extrabold text-yellow-800 mb-1.5">
                        Hai modificato i dati: serve un nuovo codice
                      </p>
                      <p className="text-sm text-yellow-700 leading-relaxed">
                        Il codice che hai ricevuto firma il contenuto del modulo, non solo il tuo
                        indirizzo email: poiché qualcosa è cambiato dopo la richiesta, quel codice
                        non è più valido. Richiedine uno nuovo per firmare i dati aggiornati.
                      </p>
                    </div>
                    <button
                      onClick={richiediNuovoCodice}
                      className="bg-yellow-400 text-gray-900 px-10 py-4 rounded-xl font-bold text-lg hover:bg-yellow-500 transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5 w-full md:w-auto"
                    >
                      Richiedi un nuovo codice
                    </button>
                  </div>
                ) : (
                  <div className="animate-fade-in">
                    <h3 className="text-xl font-bold text-gray-900 mb-2">Inserisci il Codice</h3>
                    <p className="text-gray-500 text-sm mb-8 font-medium">Abbiamo inviato un codice a 6 cifre al contatto indicato.<br/>Inseriscilo qui sotto per firmare.</p>
                    <div className="max-w-[260px] mx-auto mb-8">
                      <input 
                        type="text" 
                        maxLength={6} 
                        value={codiceOtpInserito} 
                        onChange={(e) => setCodiceOtpInserito(e.target.value.replace(/\D/g, ''))} 
                        className="w-full text-center text-3xl tracking-[0.3em] pl-[0.3em] font-mono p-4 border-2 border-gray-300 rounded-xl focus:border-yellow-400 focus:ring-4 focus:ring-yellow-100 focus:outline-none bg-white transition-all font-bold text-gray-900 shadow-inner placeholder:opacity-30" 
                        placeholder="------"
                      />
                    </div>
                    <p className="text-sm text-gray-600 leading-relaxed max-w-lg mx-auto mb-6 font-medium">
                      Firmando dichiari che <strong className="text-gray-900">i dati inseriti
                      corrispondono al vero</strong>. La dichiarazione viene riportata sul modulo
                      che stai per sottoscrivere.
                    </p>

                    <button
                      onClick={handleConfermaFirma}
                      disabled={codiceOtpInserito.length !== 6 || isSubmitting}
                      className="bg-gray-900 text-white px-10 py-4 rounded-xl font-bold text-lg hover:bg-gray-800 disabled:bg-gray-200 disabled:text-gray-400 transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5 disabled:shadow-none disabled:transform-none w-full md:w-auto inline-flex items-center justify-center gap-2"
                    >
                      {isSubmitting && <Spinner className="h-5 w-5" />}
                      {isSubmitting ? 'Salvataggio in corso...' : 'Firma e Concludi'}
                    </button>

                    <p className="text-xs text-gray-400 mt-5 font-medium">
                      Non hai ricevuto il codice, o è scaduto?{' '}
                      <button
                        type="button"
                        onClick={richiediNuovoCodice}
                        disabled={isSubmitting}
                        className="text-gray-600 font-bold underline underline-offset-2 hover:text-gray-900 disabled:opacity-50 disabled:no-underline transition-colors"
                      >
                        Richiedine uno nuovo
                      </button>
                    </p>
                  </div>
                )}
              </div>

              <div className="mt-8 flex justify-center md:justify-start">
                 <button onClick={prevStep} className="text-gray-500 font-semibold hover:text-gray-900 transition-colors">← Torna al Certificato</button>
              </div>
            </div>

          </div>
        </div>
      </div>
    </>
  )
}