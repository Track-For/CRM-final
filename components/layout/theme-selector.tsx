"use client"

import { useSyncExternalStore } from "react"
import { useTheme } from "next-themes"
import { Moon, Sun } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DropdownMenuRadioGroup, DropdownMenuRadioItem } from "@/components/ui/dropdown-menu"

const subscribe = () => () => {}
const clientSnapshot = () => true
const serverSnapshot = () => false
const themes = [{ value: "light", label: "Claro", icon: Sun }, { value: "dark", label: "Escuro", icon: Moon }] as const

function useSelectedTheme() {
  const { resolvedTheme, setTheme } = useTheme()
  const mounted = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot)
  return { selected: mounted ? resolvedTheme : undefined, setTheme, mounted }
}

export function ThemeSelector() {
  const { selected, setTheme, mounted } = useSelectedTheme()
  return <div role="group" aria-label="Modo de aparência" className="grid grid-cols-2 gap-3">{themes.map(({ value, label, icon: Icon }) => <Button key={value} variant={selected === value ? "default" : "outline"} disabled={!mounted} aria-pressed={selected === value} onClick={() => setTheme(value)}><Icon />{label}</Button>)}</div>
}

export function ThemeMenuItems() {
  const { selected, setTheme, mounted } = useSelectedTheme()
  return <DropdownMenuRadioGroup aria-label="Modo de aparência" value={selected || ""} onValueChange={value => { if (value === "light" || value === "dark") setTheme(value) }}>{themes.map(({ value, label, icon: Icon }) => <DropdownMenuRadioItem key={value} value={value} disabled={!mounted}><Icon className="size-4" />{label}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup>
}
