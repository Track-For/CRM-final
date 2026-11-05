"use client"

import { useParams } from "next/navigation"
import { PublicFormPage } from "@/components/lead-forms/public-form-page"

export default function PublicForm() {
  const { slug } = useParams<{ slug: string }>()
  return <PublicFormPage slug={slug} />
}
