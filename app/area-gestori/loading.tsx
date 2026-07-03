import { Spinner } from '@/app/components/Spinner'

// Mostrato durante la navigazione tra le pagine dell'area gestori
// (dashboard, lista soci, catalogo, admin).
export default function Loading() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-gradient-to-b from-gray-50 to-gray-100">
      <Spinner className="h-8 w-8 text-blue-600" />
      <p className="text-sm font-medium text-gray-400">Caricamento…</p>
    </div>
  )
}
