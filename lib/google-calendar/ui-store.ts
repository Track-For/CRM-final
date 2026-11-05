"use client"

import { create } from "zustand"
import { useCrmStore } from "@/lib/store/crm-store"
import type { getGoogleCalendarState } from "./actions"

export type GoogleCalendarState = Awaited<ReturnType<typeof getGoogleCalendarState>>
export const useGoogleCalendarStore = create<{ data: GoogleCalendarState | null }>(() => ({ data: null }))
export function applyGoogleCalendarState(data: GoogleCalendarState) {
  useGoogleCalendarStore.setState({ data })
  const store = useCrmStore.getState()
  store.replace("events", data.events)
  if (!store.users.some(user => user.id === data.owner.id)) store.replace("users", [...store.users, data.owner])
}
