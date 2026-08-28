import { MantieniSessione } from './MantieniSessione'

export default function AreaGestoriLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      {children}
      <MantieniSessione />
    </>
  )
}
