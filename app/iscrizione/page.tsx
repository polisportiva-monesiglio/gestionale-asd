import FormIscrizione from '../components/FormIcrizione'

export default function IscrizionePage() {
  return (
    <main className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        {/* La guida sta sopra il modulo, non sotto: serve a chi non ha ancora
            cominciato, e in fondo a una pagina lunga cosi' non la vedrebbe.
            Si apre in una scheda nuova perche' uscire di qui a meta'
            compilazione vuol dire perdere tutto quello che si e' scritto. */}
        <p className="mb-6 text-center text-sm">
          <a
            href="/guida"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-gray-500 underline underline-offset-4 decoration-gray-300 hover:text-gray-800 hover:decoration-gray-500 transition-colors"
          >
            Prima volta? Come funziona, in breve
          </a>
        </p>
        <FormIscrizione />
      </div>
    </main>
  )
}
