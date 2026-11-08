import { NextResponse, type NextRequest } from "next/server"
import { isLoginPaused } from "@/lib/auth/development"

/**
 * Checagem otimista: só verifica a presença do cookie de sessão.
 * A validação real (banco) acontece em `requireUser()` no layout de app/(crm).
 */
const SESSION_COOKIE = "crm_session"
// O webhook do Asaas não tem cookie: a rota valida o header asaas-access-token.
const PUBLIC_EXACT = new Set(["/recuperar-acesso", "/login", "/login/verificar", "/primeiro-acesso", "/icon", "/apple-icon", "/api/webhooks/asaas", "/api/webhooks/evolution", "/api/whatsapp/ai/context"])
const PUBLIC_PREFIXES = ["/f/", "/convite/", "/api/v1/"]

function isPublic(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (isLoginPaused()) {
    if (["/login", "/login/verificar", "/primeiro-acesso"].includes(pathname)) {
      return NextResponse.redirect(new URL("/dashboard", request.url))
    }
    return NextResponse.next()
  }
  if (isPublic(pathname)) return NextResponse.next()
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next()

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  }
  return NextResponse.redirect(new URL("/login", request.url))
}

export const config = {
  matcher: [
    // Ignora arquivos internos do Next, imagens otimizadas e assets estáticos com extensão.
    "/((?!_next/static|_next/image|favicon\\.ico|sitemap\\.xml|robots\\.txt|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|css|js|map|txt|woff2?)$).*)",
  ],
}
