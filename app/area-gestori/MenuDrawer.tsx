'use client'

import { useState } from 'react'
import Link from 'next/link'
import { CodiceCassettaForm } from './CodiceCassettaForm'

export function MenuDrawer({ codiceAttuale, isAdmin }: { codiceAttuale: string | null; isAdmin: boolean }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-xs font-semibold text-gray-500 hover:text-gray-800 transition-colors px-3 py-1.5 border border-gray-200 rounded-xl"
      >
        ☰ Menu
      </button>

      {/* Overlay */}
      <div
        onClick={() => setOpen(false)}
        className={`fixed inset-0 bg-black/30 z-40 transition-opacity ${
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* Panel */}
      <div
        className={`fixed top-0 right-0 h-full w-full max-w-sm bg-white z-50 shadow-2xl transition-transform duration-300 ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="p-6 sm:p-7 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-extrabold text-gray-900">Menu</h2>
            <button
              onClick={() => setOpen(false)}
              className="text-gray-400 hover:text-gray-700 text-xl leading-none"
              aria-label="Chiudi"
            >
              ×
            </button>
          </div>

          <nav className="flex flex-col gap-2">
            <Link
              href="/area-gestori/soci"
              onClick={() => setOpen(false)}
              className="text-sm font-semibold text-gray-700 hover:bg-gray-50 px-3 py-2.5 rounded-xl border border-gray-100 transition-colors"
            >
              Lista soci →
            </Link>
            <Link
              href="/area-gestori/catalogo"
              onClick={() => setOpen(false)}
              className="text-sm font-semibold text-gray-700 hover:bg-gray-50 px-3 py-2.5 rounded-xl border border-gray-100 transition-colors"
            >
              Catalogo abbonamenti →
            </Link>
            {isAdmin && (
              <Link
                href="/area-gestori/admin"
                onClick={() => setOpen(false)}
                className="text-sm font-semibold text-gray-700 hover:bg-gray-50 px-3 py-2.5 rounded-xl border border-gray-100 transition-colors"
              >
                Gestori →
              </Link>
            )}
          </nav>

          <div className="pt-4 border-t border-gray-100">
            <h3 className="text-sm font-bold text-gray-900 mb-1">Codice cassetta chiavi</h3>
            <p className="text-xs text-gray-400 mb-4">
              Viene inviato automaticamente il 5 di ogni mese ai soci con abbonamento attivo.
            </p>
            <CodiceCassettaForm codiceAttuale={codiceAttuale} />
          </div>

          <div className="pt-4 border-t border-gray-100">
            <form action="/auth/logout" method="post">
              <button className="text-xs font-semibold text-gray-400 hover:text-gray-700 transition-colors">
                Esci
              </button>
            </form>
          </div>
        </div>
      </div>
    </>
  )
}
