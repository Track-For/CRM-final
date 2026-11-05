"use client"

import { useEntity } from "@/lib/data"
import { initials } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { ID } from "@/types"

const palette = ["#008bd2", "#3b82f6", "#22c55e", "#a855f7", "#f97316", "#14b8a6", "#ec4899"]

function colorFor(id: string) {
  let h = 0
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return palette[h % palette.length]
}

type AvatarSize = "xs" | "sm" | "md" | "lg"
const sizeClass: Record<AvatarSize, string> = { xs: "size-5 text-[9px]", sm: "size-6 text-[10px]", md: "size-8 text-xs", lg: "size-11 text-sm" }

export function InitialsAvatar({ name, id, size = "sm", className }: { name: string; id?: string; size?: AvatarSize; className?: string }) {
  const color = colorFor(id ?? name)
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full border bg-[#111] font-semibold", sizeClass[size], className)}
      style={{ color, borderColor: color }}
      title={name}
    >
      {initials(name)}
    </span>
  )
}

/** Avatar + nome de um usuário da equipe a partir do id. */
export function UserAvatar({ userId, size = "sm", showName, className }: { userId?: ID; size?: AvatarSize; showName?: boolean; className?: string }) {
  const user = useEntity("users", userId)
  if (!user) return <span className="text-xs text-muted-foreground">—</span>
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2", className)}>
      <InitialsAvatar name={user.name} id={user.id} size={size} />
      {showName && <span className="truncate text-sm">{user.name.split(" ")[0]}</span>}
    </span>
  )
}
