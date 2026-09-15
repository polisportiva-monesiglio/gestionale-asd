'use client'

import { useState } from 'react'
import { creaAttivita } from './actions'
import { AttivitaForm, type TecnicoOpzione } from './AttivitaForm'

export function NuovaAttivita({ tecnici, puoAssegnare }: { tecnici: TecnicoOpzione[]; puoAssegnare: boolean }) {
  const [open, setOpen] = useState(false)

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-colors"
      >
        + Aggiungi voce catalogo
      </button>
    )
  }

  return (
    <div>
      <AttivitaForm
        action={creaAttivita}
        tecnici={tecnici}
        puoAssegnare={puoAssegnare}
        submitLabel="Crea voce"
        onSuccess={() => setOpen(false)}
      />
      <button
        onClick={() => setOpen(false)}
        className="mt-2 text-xs font-semibold text-gray-400 hover:text-gray-700"
      >
        Annulla
      </button>
    </div>
  )
}
