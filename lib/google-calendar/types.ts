export interface GoogleCalendar {
  id: string
  summary: string
  timeZone?: string
  accessRole: string
  primary?: boolean
}
export interface GoogleEvent {
  id: string
  etag?: string
  status?: string
  summary?: string
  description?: string
  location?: string
  htmlLink?: string
  hangoutLink?: string
  visibility?: string
  eventType?: string
  recurringEventId?: string
  start?: { dateTime?: string; date?: string; timeZone?: string }
  end?: { dateTime?: string; date?: string; timeZone?: string }
  reminders?: { useDefault?: boolean; overrides?: { method: string; minutes: number }[] }
  conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] }
  extendedProperties?: { private?: Record<string, string> }
}
