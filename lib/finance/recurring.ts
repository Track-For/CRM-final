import type { Subscription } from "@/types"

export function subscriptionActiveAt(subscription: Subscription, date: Date) {
  const time = date.getTime()
  const start = new Date(subscription.startDate).getTime()
  if (!Number.isFinite(start) || start > time || subscription.conversionReverted || subscription.status === "pausada" || subscription.status === "aguardando") return false
  if (subscription.status === "cancelada" && !subscription.canceledAt) return false
  return !subscription.canceledAt || new Date(subscription.canceledAt).getTime() > time
}
export function recurringRevenueAt(subscriptions: Subscription[], date: Date) {
  return subscriptions.filter(s => subscriptionActiveAt(s, date)).reduce((sum, s) => sum + Math.round(s.amount * 100), 0) / 100
}
