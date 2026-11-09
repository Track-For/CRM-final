import { ArrowUpRight, CheckSquare, MessageCircle, Users } from "lucide-react"
import { Logo } from "@/components/layout/logo"

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(340px,0.85fr)_1.15fr]">
      <aside className="crm-sidebar relative hidden flex-col justify-between overflow-hidden bg-sidebar p-12 lg:flex xl:p-16">
        <div aria-hidden="true" className="pointer-events-none absolute -right-32 -bottom-48 size-[600px] rounded-full border border-white/5 shadow-[0_0_0_80px_#ffffff03,0_0_0_160px_#ffffff02]" />
        <Logo />
        <div className="relative my-16 max-w-md space-y-8">
          <div className="space-y-4"><p className="text-xs font-medium tracking-[0.2em] text-blue-300 uppercase">Mais clareza para o seu dia</p><h2 className="font-heading text-4xl leading-tight font-semibold tracking-tight xl:text-5xl">Seu negócio,<br />conectado.</h2><p className="max-w-sm text-sm leading-7 text-slate-300">As conversas, as oportunidades e o trabalho da sua equipe em um só lugar.</p></div>
          <div className="space-y-3">{[{ icon: Users, title: "Relacionamentos que avançam", description: "Do primeiro contato ao próximo projeto." }, { icon: MessageCircle, title: "Atendimento com contexto", description: "WhatsApp e histórico sempre por perto." }, { icon: CheckSquare, title: "Operação organizada", description: "Tarefas, entregas e resultados conectados." }].map(item => <div key={item.title} className="flex gap-4 rounded-xl border border-white/10 bg-white/[0.03] p-4"><span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/5"><item.icon className="size-4 text-blue-300" /></span><div><p className="text-sm font-medium text-white">{item.title}</p><p className="mt-1 text-xs leading-relaxed text-slate-400">{item.description}</p></div></div>)}</div>
        </div>
        <p className="relative flex items-center gap-2 text-xs text-slate-400">Nexo CRM <ArrowUpRight className="size-3.5" /> Inteligência que move seu negócio.</p>
      </aside>
      <div className="flex min-w-0 flex-col items-center justify-center bg-background px-5 py-10 sm:px-10">
        <div className="w-full max-w-[420px]">
          <Logo className="mb-10 justify-center lg:hidden" />
          <p className="mb-3 hidden text-xs font-medium text-muted-foreground lg:block">Nexo CRM · Espaço da equipe</p>
          <main className="rounded-2xl border bg-card p-6 shadow-[0_12px_40px_#17243b05] sm:p-8">{children}</main>
          <p className="mt-6 text-center text-xs leading-relaxed text-muted-foreground">Acesso restrito à sua equipe.</p>
        </div>
      </div>
    </div>
  )
}
