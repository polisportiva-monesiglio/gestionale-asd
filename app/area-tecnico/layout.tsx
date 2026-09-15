import { MantieniSessione } from '../area-gestori/MantieniSessione'

// Stesso battito dell'area gestori: il tecnico lascia la pagina aperta in
// palestra, e al ritorno la sessione deve essere ancora in piedi.
export default function AreaTecnicoLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <MantieniSessione />
    </>
  )
}
