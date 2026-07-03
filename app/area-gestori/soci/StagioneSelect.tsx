'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { Spinner } from '@/app/components/Spinner'

export function StagioneSelect({
  stagioni,
  selezionata,
}: {
  stagioni: string[]
  selezionata: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  return (
    <div className="bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-3xl border border-gray-100 p-4 sm:p-5 flex items-center gap-3">
      <label htmlFor="stagione" className="text-xs font-bold text-gray-500 shrink-0">
        Stagione
      </label>
      <select
        id="stagione"
        value={selezionata}
        disabled={isPending}
        onChange={e =>
          startTransition(() => {
            router.push(`/area-gestori/soci?stagione=${encodeURIComponent(e.target.value)}`)
          })
        }
        className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
      >
        {stagioni.map(s => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
      {isPending && <Spinner className="h-4 w-4 text-blue-600 shrink-0" />}
    </div>
  )
}
