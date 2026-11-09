"use client"

import { createContext, useContext } from "react"

type FieldAccessibility = { id: string; labelId: string; descriptionId?: string; invalid?: boolean; required?: boolean }
export const FieldAccessibilityContext = createContext<FieldAccessibility | undefined>(undefined)
export const useFieldAccessibility = () => useContext(FieldAccessibilityContext)
