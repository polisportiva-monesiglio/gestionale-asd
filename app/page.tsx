import Link from 'next/link'
import { getAnnoSportivo } from '@/lib/stagione'

export default function Home() {
  const stagione = getAnnoSportivo()

  return (
    <>

      <main className="relative min-h-screen bg-gradient-to-br from-gray-50 via-[#FAFAFA] to-gray-100 flex flex-col items-center justify-center px-4 overflow-hidden">

<div className="relative w-full max-w-sm space-y-8">

          {/* Logo + intestazione */}
          <div className="text-center space-y-4">
            <img
              src="/logo-asd-monesiglio.png"
              alt="ASD Polisportiva Monesiglio"
              className="w-44 h-44 object-contain mx-auto"
            />
            <div>
              <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">
                ASD Polisportiva Monesiglio
              </h1>
              <p className="text-sm text-gray-400 mt-1">
                Stagione {stagione}
              </p>
            </div>
          </div>

          {/* CTA */}
          <div className="grid grid-cols-2 gap-4">
            <Link
              href="/iscrizione"
              className="flex flex-col items-center justify-center gap-3 px-4 py-8 bg-yellow-400 hover:bg-yellow-500 text-gray-900 font-bold text-sm rounded-3xl shadow-[0_8px_24px_rgba(250,204,21,0.4)] hover:shadow-[0_12px_32px_rgba(250,204,21,0.5)] transition-all text-center"
            >
              <span className="text-3xl">📋</span>
              <span className="leading-tight">Nuova<br/>iscrizione</span>
            </Link>

            <Link
              href="/login"
              className="flex flex-col items-center justify-center gap-3 px-4 py-8 bg-white hover:bg-gray-50 text-gray-800 font-bold text-sm rounded-3xl border border-gray-200 shadow-[0_8px_24px_rgba(0,0,0,0.08)] hover:shadow-[0_12px_32px_rgba(0,0,0,0.12)] transition-all text-center"
            >
              <span className="text-3xl">👤</span>
              <span className="leading-tight">Accedi all&apos;area<br/>personale</span>
            </Link>
          </div>

          {/* Chi non sa da dove cominciare: la guida sta prima del footer,
              non sepolta in fondo insieme ai dati fiscali. */}
          <p className="text-center text-sm">
            <Link
              href="/guida"
              className="font-semibold text-gray-500 underline underline-offset-4 decoration-gray-300 hover:text-gray-800 hover:decoration-gray-500 transition-colors"
            >
              Come funziona, in breve
            </Link>
          </p>

          {/* Il Regolamento in prima pagina, non solo dentro il modulo di
              iscrizione: chi lo ha accettato deve poterlo rileggere senza
              ricominciare un'iscrizione per arrivarci.

              Lo Statuto qui non c'e' per scelta e in via temporanea. Resta
              raggiungibile dal modulo di iscrizione, dove lo si accetta: non e'
              stato tolto dal sito, solo dalla vetrina. Per rimetterlo basta un
              secondo <a> come quello sotto, verso /statuto.pdf. */}
          <p className="text-center text-xs text-gray-400 -mt-3">
            <a
              href="/regolamento.pdf"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-gray-600 transition-colors"
            >
              Regolamento
            </a>
          </p>

          {/* Footer */}
          <div className="space-y-5">
            <p className="text-center text-xs text-gray-300">
              Area riservata ai gestori:{' '}
              <Link href="/login" className="underline underline-offset-2 hover:text-gray-400 transition-colors">
                accedi
              </Link>
            </p>

            {/* Dati identificativi dell'ente: permettono a chiunque (soci, enti,
                verifiche dei provider) di risalire all'associazione reale */}
            <address className="border-t border-gray-200/70 pt-5 text-center text-[11px] not-italic leading-relaxed text-gray-400">
              {/* Denominazione nella forma registrata sul certificato dell'Agenzia
                  delle Entrate: deve combaciare con i documenti dell'ente */}
              <span className="font-semibold text-gray-500">Associazione Sportiva Dilettantistica Polisportiva Monesiglio</span>
              {' · '}Piazza XX Settembre 2, 12077 Monesiglio (CN)
              {' · '}C.F. 93058330049
              {' · '}P.IVA 04040870042
              {' · '}
              <a
                href="mailto:info@polisportiva-monesiglio.it"
                className="underline underline-offset-2 hover:text-gray-500 transition-colors"
              >
                info@polisportiva-monesiglio.it
              </a>
              {' · '}
              <Link
                href="/privacy"
                className="underline underline-offset-2 hover:text-gray-500 transition-colors"
              >
                Informativa privacy
              </Link>
            </address>
          </div>

        </div>
      </main>

    </>
  )
}
