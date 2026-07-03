import { Spinner } from './components/Spinner'

// Mostrato automaticamente da Next.js durante la navigazione verso
// qualsiasi pagina che sta ancora caricando i dati lato server.
export default function Loading() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-gradient-to-b from-gray-50 to-gray-100">
      <Spinner className="h-8 w-8 text-gray-400" />
      <p className="text-sm font-medium text-gray-400">Caricamento…</p>
    </div>
  )
}
