import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Il token di accesso di Supabase dura un'ora; il token di rinnovo no, e con
 * quello la sessione puo' durare indefinitamente. Chi entra resta dentro
 * finche' non esce, purche' il risultato di ogni rinnovo torni davvero al
 * browser: e' l'unico punto in cui questa promessa si puo' rompere.
 *
 * Il client del server non rinnova da solo in sottofondo (`autoRefreshToken`
 * e' false in @supabase/ssr): rinnova solo qui, dentro `getUser()`, quando il
 * token e' gia' scaduto. Quindi ogni richiesta che passa di qua e' l'unica
 * occasione di tenere viva la sessione, e i cookie che ne escono non possono
 * andare persi.
 */
export async function updateSession(request: NextRequest) {
  // I cookie che Supabase vuole riscrivere in questa richiesta: i token
  // rinnovati, oppure la loro cancellazione se il rinnovo e' fallito. Si
  // raccolgono qui invece di attaccarli subito a una risposta, perche' la
  // risposta finale puo' essere un'altra — il redirect al login — e attaccarli
  // alla risposta sbagliata equivale a buttarli via. Era cosi' che una
  // sessione ancora buona veniva persa: rinnovata sul server, mai consegnata
  // al browser, che al giro dopo tornava a presentare un token gia' bruciato.
  const daScrivere: { name: string; value: string; options: Record<string, unknown> }[] = []

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            // Sulla richiesta, perche' la pagina renderizzata subito dopo
            // legga il token nuovo e non quello appena scaduto.
            request.cookies.set(name, value)
            daScrivere.push({ name, value, options: options as Record<string, unknown> })
          })
        },
      },
    }
  )

  // Attacca i cookie della sessione a qualunque risposta stiamo per dare.
  function conSessione<T extends NextResponse>(response: T): T {
    for (const { name, value, options } of daScrivere) {
      response.cookies.set(name, value, options)
    }
    return response
  }

  const { data: { user } } = await supabase.auth.getUser()

  const path = request.nextUrl.pathname
  const isAreaProtetta = path.startsWith('/area-socio') || path.startsWith('/area-gestori')

  if (isAreaProtetta && !user) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    // Anche qui la sessione va consegnata: se il rinnovo e' fallito, quello
    // che c'e' da scrivere e' la cancellazione dei cookie ormai invalidi.
    // Perderla lascerebbe nel browser un token morto che ad ogni richiesta
    // fallisce di nuovo, e il login non si riaggancerebbe mai.
    return conSessione(NextResponse.redirect(url))
  }

  return conSessione(NextResponse.next({ request }))
}
