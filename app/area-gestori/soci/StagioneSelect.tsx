'use client'

import { useRouter } from 'next/navigation'

export function StagioneSelect({
  stagioni,
  selezionata,
}: {
  stagioni: string[]
  selezionata: string
}) {
  const router = useRouter()

  return (
    <div className="bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-3xl border border-gray-100 p-4 sm:p-5 flex items-center gap-3">
      <label htmlFor="stagione" className="text-xs font-bold text-gray-500 shrink-0">
        Stagione
      </label>
      <select
        id="stagione"
        value={selezionata}
        onChange={e => router.push(`/area-gestori/soci?stagione=${encodeURIComponent(e.target.value)}`)}
        className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {stagioni.map(s => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
    </div>
  )
}
