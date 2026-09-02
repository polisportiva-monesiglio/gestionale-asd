import Link from 'next/link'
import type { Metadata } from 'next'
import { GUIDA, pezzi } from '@/lib/guida'

export const metadata: Metadata = {
  title: 'Come iscriversi · ASD Polisportiva Monesiglio',
  description:
    'In breve: come tesserarsi, come scegliere il periodo di frequenza e le quattro cose che fanno perdere tempo.',
}

/** Rende una frase della guida rispettando i due segni: enfasi e nomi di pulsanti. */
function Frase({ testo }: { testo: string }) {
  return (
    <>
      {pezzi(testo).map((p, i) => {
        if (p.tipo === 'forte') {
          return <strong key={i} className="font-bold text-gray-900">{p.testo}</strong>
        }
        if (p.tipo === 'pulsante') {
          return (
            <span
              key={i}
              className="font-bold text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-md px-1.5 py-0.5 whitespace-nowrap"
            >
              {p.testo}
            </span>
          )
        }
        return <span key={i}>{p.testo}</span>
      })}
    </>
  )
}

export default function GuidaPage() {
  return (
    <main className="min-h-screen bg-[#FAFAFA] py-10 px-4">
      <div className="max-w-3xl mx-auto space-y-6">

        <header className="text-center space-y-3">
          <img
            src="/logo-asd-monesiglio.png"
            alt=""
            className="w-24 h-24 object-contain mx-auto"
          />
          <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400">
            {GUIDA.ente}
          </p>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight">
            {GUIDA.titolo}
          </h1>
          <p className="text-gray-500 max-w-xl mx-auto leading-relaxed">
            {GUIDA.sottotitolo}
          </p>
        </header>

        {/* Cosa serve avere sottomano */}
        <div className="rounded-2xl bg-yellow-50 border-l-4 border-yellow-400 px-5 py-4">
          <p className="text-[11px] font-extrabold uppercase tracking-widest text-yellow-700 mb-1.5">
            {GUIDA.serveTitolo}
          </p>
          <p className="text-sm text-gray-800 font-medium">
            {GUIDA.serve.join(' · ')}
          </p>
        </div>

        {/* Le due fasi, affiancate quando c'e' spazio */}
        <div className="grid gap-4 sm:grid-cols-2">
          {GUIDA.fasi.map(fase => (
            <section
              key={fase.titolo}
              className="bg-white rounded-3xl border border-gray-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-5 sm:p-6 flex flex-col gap-4"
            >
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400">
                  {fase.quando}
                </p>
                <h2 className="text-xl font-extrabold text-gray-900 tracking-tight mt-0.5">
                  {fase.titolo}
                </h2>
              </div>

              <ol className="space-y-2.5">
                {fase.passi.map((passo, i) => (
                  <li key={i} className="flex gap-2.5 items-start">
                    <span className="shrink-0 w-6 h-6 rounded-lg bg-yellow-400 text-gray-900 text-xs font-extrabold flex items-center justify-center mt-0.5">
                      {i + 1}
                    </span>
                    <span className="text-sm text-gray-600 leading-relaxed">
                      <Frase testo={passo} />
                    </span>
                  </li>
                ))}
              </ol>

              <p className="text-sm text-gray-500 border-t border-dashed border-gray-200 pt-3 mt-auto">
                <Frase testo={fase.esito} />
              </p>
            </section>
          ))}
        </div>

        {/* Gli inciampi */}
        <section className="bg-white rounded-3xl border border-gray-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-5 sm:p-6">
          <h2 className="text-lg font-extrabold text-gray-900 tracking-tight mb-4">
            {GUIDA.inciampiTitolo}
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {GUIDA.inciampi.map((voce, i) => (
              <li key={i} className="flex gap-2.5 items-start">
                <span className="shrink-0 w-2 h-2 rounded-full bg-yellow-400 mt-[0.45rem]" />
                <span className="text-sm text-gray-600 leading-relaxed">
                  <Frase testo={voce} />
                </span>
              </li>
            ))}
          </ul>
        </section>

        <footer className="space-y-4">
          <p className="text-sm text-gray-600 leading-relaxed">
            <Frase testo={GUIDA.rinnovo} />
          </p>
          <p className="text-sm text-gray-500">
            {GUIDA.contatto}{' '}
            <a
              href={`mailto:${GUIDA.email}`}
              className="text-yellow-600 font-semibold underline underline-offset-2 hover:text-yellow-700"
            >
              {GUIDA.email}
            </a>
            , o chiedi in sede.
          </p>

          <div className="flex flex-wrap gap-3 pt-2 border-t border-gray-200">
            <a
              href="/guida/pdf"
              className="mt-4 text-sm font-bold text-gray-700 hover:text-gray-900 px-4 py-2.5 rounded-xl border border-gray-200 hover:border-gray-300 transition-colors"
            >
              ↓ Scarica in PDF
            </a>
            <Link
              href="/iscrizione"
              className="mt-4 text-sm font-bold text-gray-900 bg-yellow-400 hover:bg-yellow-500 px-4 py-2.5 rounded-xl transition-colors shadow-sm"
            >
              Comincia l&apos;iscrizione →
            </Link>
            <Link
              href="/"
              className="mt-4 text-sm font-semibold text-gray-400 hover:text-gray-600 px-4 py-2.5 transition-colors"
            >
              Torna alla home
            </Link>
          </div>
        </footer>

      </div>
    </main>
  )
}
