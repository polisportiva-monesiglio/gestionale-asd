import Link from 'next/link'

export default function NonAutorizzatoPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm bg-white rounded-xl shadow p-8 text-center">
        <h1 className="text-xl font-bold text-gray-900 mb-2">Email non riconosciuta</h1>
        <p className="text-sm text-gray-500 mb-6">
          Non abbiamo trovato un socio o un membro dello staff con questa email.
          Contatta la segreteria per maggiori informazioni.
        </p>
        <Link
          href="/login"
          className="inline-block rounded-lg bg-yellow-400 hover:bg-yellow-500 text-gray-900 font-semibold px-4 py-2 transition-colors"
        >
          Torna al login
        </Link>
      </div>
    </main>
  )
}
