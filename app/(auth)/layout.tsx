import { Logo } from "@/components/layout/logo"

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-[400px]">
        <Logo className="mb-8 justify-center" />
        <main className="rounded-xl border bg-card p-5 sm:p-7">{children}</main>
        <p className="mt-6 text-center text-xs text-muted-foreground">Acesso restrito à equipe Track For.</p>
      </div>
    </div>
  )
}
