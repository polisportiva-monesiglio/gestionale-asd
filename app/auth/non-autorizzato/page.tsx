import Link from 'next/link'

/**
 * Si arriva qui per due motivi diversi, e dirlo cambia cosa fa la persona.
 *
 * Senza distinzione, un link scaduto veniva annunciato come "email non
 * riconosciuta": chi lo leggeva pensava di non essere a sistema e scriveva
 * alla segreteria, quando gli sarebbe bastato chiedere un altro link.
 */
export default async function NonAutorizzatoPage({
  searchParams,
}: {
  searchParams: Promise<{ [chiave: string]: string | string[] | undefined }>
}) {
  const motivo = (await searchParams).motivo

  const linkNonValido = motivo === 'link'

  const titolo = linkNonValido
    ? 'Link non più valido'
    : 'Email non riconosciuta'

  const spiegazione = linkNonValido
    ? "Il link di accesso è scaduto, è già stato usato, oppure è stato aperto su un dispositivo diverso da quello da cui l'hai richiesto. Richiedine uno nuovo e aprilo sullo stesso browser."
    : 'Non abbiamo trovato un socio o un membro dello staff con questa email. Contatta la segreteria per maggiori informazioni.'

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm bg-white rounded-xl shadow p-8 text-center">
        <h1 className="text-xl font-bold text-gray-900 mb-2">{titolo}</h1>
        <p className="text-sm text-gray-500 mb-6">{spiegazione}</p>
        <Link
          href="/login"
          className="inline-block rounded-lg bg-yellow-400 hover:bg-yellow-500 text-gray-900 font-semibold px-4 py-2 transition-colors"
        >
          {linkNonValido ? 'Richiedi un nuovo link' : 'Torna al login'}
        </Link>
      </div>
    </main>
  )
}
