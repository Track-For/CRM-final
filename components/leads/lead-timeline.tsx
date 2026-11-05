import type { LucideIcon } from "lucide-react"
import { CalendarDays, CheckSquare, FileText, FormInput, Handshake, MessageCircle, Phone, RefreshCw, StickyNote } from "lucide-react"
import { UserAvatar } from "@/components/shared/user-avatar"
import { formatDateTime } from "@/lib/format"
import type { Activity, ActivityType } from "@/types"

const ICON: Record<ActivityType, LucideIcon> = {
  nota: StickyNote,
  ligacao: Phone,
  whatsapp: MessageCircle,
  reuniao: CalendarDays,
  status: RefreshCw,
  negocio: Handshake,
  orcamento: FileText,
  tarefa: CheckSquare,
  formulario: FormInput,
}

const COLOR: Record<ActivityType, string> = {
  nota: "text-warning",
  ligacao: "text-info",
  whatsapp: "text-success",
  reuniao: "text-info",
  status: "text-muted-foreground",
  negocio: "text-primary",
  orcamento: "text-primary",
  tarefa: "text-[#c084fc]",
  formulario: "text-muted-foreground",
}

export function LeadTimeline({ activities }: { activities: Activity[] }) {
  if (activities.length === 0) return <p className="text-xs text-muted-foreground">Nenhuma atividade registrada.</p>
  return (
    <ol className="relative space-y-4">
      <span className="absolute top-2 bottom-2 left-[15px] w-px bg-border" aria-hidden />
      {activities.map((a) => {
        const Icon = ICON[a.type]
        return (
          <li key={a.id} className="relative flex gap-3">
            <span className="z-10 flex size-8 shrink-0 items-center justify-center rounded-full border bg-card">
              <Icon className={`size-3.5 ${COLOR[a.type]}`} />
            </span>
            <div className="min-w-0 flex-1 pt-1">
              <p className="text-sm">{a.title}</p>
              {a.description && <p className="mt-0.5 text-xs break-words text-muted-foreground">{a.description}</p>}
              <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                <UserAvatar userId={a.authorId} size="xs" showName />
                <span className="num">{formatDateTime(a.createdAt)}</span>
              </div>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
