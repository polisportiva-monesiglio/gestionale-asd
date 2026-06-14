import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function AreaGestoriPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: gestore } = await supabase
    .from('gestori')
    .select('nome, email')
    .eq('user_id', user.id)
    .maybeSingle()

  return (
    <main className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto bg-white rounded-xl shadow p-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold text-gray-900">
            Ciao {gestore?.nome ?? user.email}
          </h1>
          <form action="/auth/logout" method="post">
            <button className="text-sm text-gray-500 hover:text-gray-800 underline">
              Esci
            </button>
          </form>
        </div>

        <p className="text-sm text-gray-500">
          Da qui potrai presto gestire le scadenze dei certificati, confermare i pagamenti
          dei soci e aggiornare il codice della cassetta chiavi.
        </p>
      </div>
    </main>
  )
}
