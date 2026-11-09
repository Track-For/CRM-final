"use client"

import { toast as notifications } from "sonner"
import { flushPendingWrites, hasPendingWrites } from "@/lib/data/api"

/** Uma confirmação de sucesso só aparece depois das gravações iniciadas pela ação. */
export const toast: typeof notifications = new Proxy(notifications, {
  get(target, key) {
    if (key !== "success") return Reflect.get(target, key)
    return (...args: Parameters<typeof notifications.success>) => {
      if (!hasPendingWrites()) return notifications.success(...args)
      const id = args[1]?.id ?? `save-${Date.now()}-${Math.random()}`
      void flushPendingWrites().then(() => notifications.success(args[0], { ...args[1], id })).catch(() => {})
      return id
    }
  },
})
