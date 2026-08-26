import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Informativa privacy — ASD Polisportiva Monesiglio',
  description:
    'Come la ASD Polisportiva Monesiglio tratta i dati personali dei soci: finalità, basi giuridiche, conservazione, destinatari e diritti dell’interessato.',
}

const VERSIONE = 'v1.0_2026'
const ULTIMO_AGGIORNAMENTO = '13 agosto 2026'

function Sezione({
  numero,
  titolo,
  children,
}: {
  numero: number
  titolo: string
  children: React.ReactNode
}) {
  return (
    <section className="scroll-mt-8" id={`sezione-${numero}`}>
      <div className="flex items-baseline gap-3 mb-3">
        <span className="text-xs font-extrabold text-yellow-500 tabular-nums">
          {String(numero).padStart(2, '0')}
        </span>
        <h2 className="text-lg font-extrabold text-gray-900 tracking-tight">{titolo}</h2>
      </div>
      <div className="space-y-3 text-sm text-gray-600 leading-relaxed pl-8">{children}</div>
    </section>
  )
}

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#FAFAFA] py-10 px-4 text-gray-800">
      <div className="max-w-3xl mx-auto space-y-5">

        {/* Intestazione */}
        <div className="bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-3xl border border-gray-100 border-t-[6px] border-t-yellow-400 p-6 sm:p-9">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">
            ASD Polisportiva Monesiglio
          </p>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
            Informativa sul trattamento dei dati personali
          </h1>
          <p className="text-sm text-gray-500 mt-3 leading-relaxed">
            Resa ai sensi degli articoli 13 e 14 del Regolamento UE 2016/679 (GDPR) alle persone
            che si iscrivono all&apos;Associazione e utilizzano questo sito.
          </p>
          <p className="text-xs text-gray-400 mt-4">
            Versione {VERSIONE} · Ultimo aggiornamento: {ULTIMO_AGGIORNAMENTO}
          </p>
        </div>

        {/* Corpo */}
        <div className="bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-3xl border border-gray-100 p-6 sm:p-9 space-y-9">

          <Sezione numero={1} titolo="Chi tratta i tuoi dati">
            <p>
              Il titolare del trattamento è l&apos;<strong className="text-gray-900">Associazione
              Sportiva Dilettantistica Polisportiva Monesiglio</strong>, con sede in Piazza XX
              Settembre 2, 12077 Monesiglio (CN), C.F. 93058330049, P.IVA 04040870042.
            </p>
            <p>
              Per qualsiasi questione relativa ai tuoi dati puoi scrivere a{' '}
              <a
                href="mailto:info@polisportiva-monesiglio.it"
                className="text-yellow-600 font-semibold hover:underline"
              >
                info@polisportiva-monesiglio.it
              </a>
              .
            </p>
            <p>
              L&apos;Associazione non ha nominato un Responsabile della protezione dei dati (DPO),
              non ricorrendone i presupposti di legge.
            </p>
          </Sezione>

          <Sezione numero={2} titolo="Quali dati raccogliamo">
            <p>Raccogliamo soltanto i dati che ci servono per tesserarti e gestire il rapporto associativo.</p>
            <ul className="list-disc pl-5 space-y-2 marker:text-yellow-400">
              <li>
                <strong className="text-gray-900">Dati anagrafici e di contatto:</strong> nome,
                cognome, codice fiscale, sesso, data e luogo di nascita, cittadinanza, indirizzo di
                residenza, telefono, indirizzo email.
              </li>
              <li>
                <strong className="text-gray-900">Dati relativi alla salute:</strong> il certificato
                medico di idoneità all&apos;attività sportiva non agonistica e la sua data di
                scadenza. Sono <em>categorie particolari di dati</em> ai sensi dell&apos;art. 9 del
                GDPR e ricevono la protezione più elevata prevista dalla legge.
              </li>
              <li>
                <strong className="text-gray-900">Dati dei minori e di chi ne fa le veci:</strong> se
                il socio è minorenne, raccogliamo nome, cognome e un recapito del genitore o di chi
                esercita la responsabilità genitoriale.
              </li>
              <li>
                <strong className="text-gray-900">Dati su quote e pagamenti:</strong> abbonamenti
                richiesti, importi, metodo di pagamento, ricevute emesse.
              </li>
              <li>
                <strong className="text-gray-900">Dati tecnici della firma elettronica:</strong> al
                momento della sottoscrizione del modulo di iscrizione registriamo l&apos;indirizzo
                IP, la data e l&apos;ora, e un codice cifrato che lega il codice OTP ricevuto via
                email al contenuto del modulo firmato. Servono a dimostrare che la firma è tua e che
                il documento non è stato modificato dopo.
              </li>
            </ul>
          </Sezione>

          <Sezione numero={3} titolo="Perché li trattiamo e in base a quale norma">
            <div className="overflow-x-auto -mx-2">
              <table className="w-full text-xs sm:text-sm border-collapse min-w-[34rem]">
                <thead>
                  <tr className="text-left text-gray-400 uppercase tracking-wide text-[10px]">
                    <th className="pb-2 pr-4 font-bold">Finalità</th>
                    <th className="pb-2 font-bold">Base giuridica</th>
                  </tr>
                </thead>
                <tbody className="align-top">
                  {[
                    [
                      'Iscrizione, tesseramento e gestione del rapporto associativo',
                      'Esecuzione del rapporto associativo e delle misure precontrattuali richieste dall’interessato (art. 6.1.b)',
                    ],
                    [
                      'Verifica dell’idoneità sportiva tramite certificato medico',
                      'Obbligo di legge in capo all’Associazione (art. 6.1.c, D.M. 24 aprile 2013) e consenso esplicito dell’interessato per i dati sulla salute (art. 9.2.a)',
                    ],
                    [
                      'Emissione di ricevute e adempimenti fiscali e contabili',
                      'Obbligo di legge (art. 6.1.c)',
                    ],
                    [
                      'Comunicazioni di servizio: promemoria di scadenza del certificato, codice di accesso ai locali',
                      'Esecuzione del rapporto associativo (art. 6.1.b)',
                    ],
                    [
                      'Prova della sottoscrizione del modulo di iscrizione (firma elettronica)',
                      'Legittimo interesse dell’Associazione a poter dimostrare la manifestazione di volontà del socio (art. 6.1.f)',
                    ],
                    [
                      'Pubblicazione di foto e video sulle bacheche e sui canali social dell’Associazione',
                      'Consenso libero e facoltativo, revocabile in ogni momento (art. 6.1.a)',
                    ],
                  ].map(([finalita, base]) => (
                    <tr key={finalita} className="border-t border-gray-100">
                      <td className="py-3 pr-4 text-gray-900 font-semibold">{finalita}</td>
                      <td className="py-3 text-gray-600">{base}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="pt-2">
              Il consenso facoltativo all&apos;uso delle immagini è indipendente dall&apos;iscrizione:
              puoi negarlo o revocarlo senza alcuna conseguenza sul tesseramento.
            </p>
          </Sezione>

          <Sezione numero={4} titolo="Se il socio è minorenne">
            <p>
              L&apos;iscrizione di una persona minorenne è effettuata dal genitore o da chi esercita
              la responsabilità genitoriale, che presta anche i consensi previsti e può esercitare
              in ogni momento i diritti elencati più avanti per conto del minore.
            </p>
            <p>
              Trattiamo i dati dei minori con particolare cautela: sono accessibili unicamente alle
              persone incaricate dall&apos;Associazione e non sono mai diffusi né usati per finalità
              diverse da quelle indicate.
            </p>
          </Sezione>

          <Sezione numero={5} titolo="Chi può vedere i tuoi dati">
            <p>
              All&apos;interno dell&apos;Associazione i dati sono accessibili solo alle persone
              autorizzate alla gestione dei tesseramenti, che accedono con un account personale.
            </p>
            <p>
              All&apos;esterno i dati sono trattati da fornitori di servizi tecnologici, nominati
              responsabili del trattamento ai sensi dell&apos;art. 28 del GDPR:
            </p>
            <div className="overflow-x-auto -mx-2">
              <table className="w-full text-xs sm:text-sm border-collapse min-w-[34rem]">
                <thead>
                  <tr className="text-left text-gray-400 uppercase tracking-wide text-[10px]">
                    <th className="pb-2 pr-4 font-bold">Fornitore</th>
                    <th className="pb-2 pr-4 font-bold">Servizio</th>
                    <th className="pb-2 font-bold">Dove</th>
                  </tr>
                </thead>
                <tbody className="align-top">
                  {[
                    ['Supabase', 'Database e archiviazione dei documenti', 'Unione Europea (Francoforte)'],
                    ['Vercel', 'Hosting del sito', 'Vedi la sezione sui trasferimenti'],
                    ['Resend', 'Invio delle email di accesso e di conferma', 'Unione Europea (Irlanda)'],
                    ['ImprovMX', 'Inoltro della posta indirizzata al dominio dell’Associazione', 'Vedi la sezione sui trasferimenti'],
                  ].map(([nome, servizio, dove]) => (
                    <tr key={nome} className="border-t border-gray-100">
                      <td className="py-3 pr-4 text-gray-900 font-semibold">{nome}</td>
                      <td className="py-3 pr-4 text-gray-600">{servizio}</td>
                      <td className="py-3 text-gray-600">{dove}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="pt-2">
              Comunichiamo inoltre i dati anagrafici necessari all&apos;<strong className="text-gray-900">UISP</strong>,
              l&apos;ente di promozione sportiva a cui l&apos;Associazione è affiliata, per
              l&apos;emissione della tessera assicurativa annuale. UISP tratta questi dati in qualità
              di titolare autonomo, secondo la propria informativa.
            </p>
            <p>
              I tuoi dati non sono mai venduti, ceduti a terzi per finalità commerciali, né diffusi
              pubblicamente.
            </p>
          </Sezione>

          <Sezione numero={6} titolo="Videosorveglianza dei locali">
            <p>
              Nei locali in cui si svolge l&apos;attività è attivo un impianto di videosorveglianza
              di proprietà del Comune di Monesiglio, alle cui immagini accedono sia il Comune sia
              l&apos;Associazione.
            </p>
            <p>
              Si tratta di un trattamento <strong className="text-gray-900">distinto</strong> da
              quelli descritti in questa pagina, che riguarda chi entra nei locali e non chi usa
              questo sito. Le informazioni che lo riguardano — finalità, tempi di conservazione delle
              immagini e modalità per esercitare i tuoi diritti — sono riportate nei cartelli affissi
              prima delle aree riprese e nell&apos;informativa esposta nei locali.
            </p>
          </Sezione>

          <Sezione numero={7} titolo="Trasferimenti fuori dall'Unione Europea">
            <p>
              Il database e i documenti che carichi restano su server situati nell&apos;Unione
              Europea. Alcuni fornitori sono società con sede negli Stati Uniti: in tal caso il
              trasferimento avviene sulla base delle clausole contrattuali standard approvate dalla
              Commissione Europea e, ove applicabile, dell&apos;adesione del fornitore al{' '}
              <em>EU-U.S. Data Privacy Framework</em>.
            </p>
          </Sezione>

          <Sezione numero={8} titolo="Per quanto tempo li conserviamo">
            <ul className="list-disc pl-5 space-y-2 marker:text-yellow-400">
              <li>
                <strong className="text-gray-900">Dati anagrafici e del rapporto associativo:</strong>{' '}
                per tutta la durata del rapporto e per i 10 anni successivi, termine previsto dalla
                legge per la conservazione delle scritture contabili e per la difesa in giudizio.
              </li>
              <li>
                <strong className="text-gray-900">Certificati medici:</strong> fino al termine della
                stagione sportiva di riferimento e per l&apos;anno successivo, dopodiché vengono
                cancellati.
              </li>
              <li>
                <strong className="text-gray-900">Ricevute e documenti fiscali:</strong> 10 anni,
                come previsto dalla normativa tributaria.
              </li>
              <li>
                <strong className="text-gray-900">Foto e video pubblicati:</strong> fino alla revoca
                del consenso.
              </li>
            </ul>
          </Sezione>

          <Sezione numero={9} titolo="Cookie">
            <p>
              Questo sito <strong className="text-gray-900">non utilizza cookie di profilazione,
              strumenti di analisi statistica o pixel pubblicitari</strong>, e non traccia la tua
              navigazione. A chi visita il sito senza autenticarsi non viene rilasciato alcun cookie.
            </p>
            <p>
              Quando accedi alla tua area riservata vengono impostati cookie <em>tecnici</em> di
              sessione, necessari a mantenerti autenticato durante la visita. Sono indispensabili per
              erogare il servizio che hai richiesto e, ai sensi dell&apos;art. 122 del Codice Privacy
              e delle Linee guida del Garante del 10 giugno 2021, non richiedono il tuo consenso.
              Puoi comunque eliminarli in ogni momento dalle impostazioni del browser: in tal caso
              dovrai autenticarti di nuovo.
            </p>
            <p>
              I caratteri tipografici usati dal sito sono ospitati sui nostri stessi server: nessuna
              richiesta viene inoltrata a fornitori esterni durante la navigazione.
            </p>
          </Sezione>

          <Sezione numero={10} titolo="I tuoi diritti">
            <p>
              In ogni momento puoi chiederci di accedere ai tuoi dati, correggerli, cancellarli,
              limitarne il trattamento, opporti al trattamento fondato sul legittimo interesse, e
              ricevere i dati che ci hai fornito in un formato leggibile da un altro sistema
              (articoli da 15 a 22 del GDPR). Dove il trattamento si fonda sul consenso, puoi
              revocarlo quando vuoi, senza che questo pregiudichi la liceità di quanto fatto prima.
            </p>
            <p>
              Per esercitare questi diritti scrivi a{' '}
              <a
                href="mailto:info@polisportiva-monesiglio.it"
                className="text-yellow-600 font-semibold hover:underline"
              >
                info@polisportiva-monesiglio.it
              </a>
              . Ti risponderemo entro un mese.
            </p>
            <p>
              Se ritieni che il trattamento dei tuoi dati violi la normativa, hai diritto di proporre
              reclamo al Garante per la protezione dei dati personali (
              <a
                href="https://www.garanteprivacy.it"
                target="_blank"
                rel="noopener noreferrer"
                className="text-yellow-600 font-semibold hover:underline"
              >
                garanteprivacy.it
              </a>
              ).
            </p>
          </Sezione>

          <Sezione numero={11} titolo="Modifiche a questa informativa">
            <p>
              Se cambieremo il modo in cui trattiamo i dati aggiorneremo questa pagina, indicando una
              nuova versione e la data. Nel modulo di iscrizione resta registrata la versione
              dell&apos;informativa che hai accettato al momento del tesseramento.
            </p>
          </Sezione>

        </div>

        <div className="text-center pb-4">
          <Link
            href="/"
            className="text-xs font-semibold text-gray-400 hover:text-gray-700 transition-colors"
          >
            ← Torna alla home
          </Link>
        </div>

      </div>
    </main>
  )
}
