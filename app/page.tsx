import FormIscrizione from '../app/components/FormIcrizione'

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        {/* Qui richiama il Form */}
        <FormIscrizione />
        
      </div>
    </main>
  )
}
