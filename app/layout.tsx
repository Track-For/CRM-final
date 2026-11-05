import type { Metadata } from "next"
import { JetBrains_Mono, Space_Grotesk } from "next/font/google"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import "./globals.css"

const spaceGrotesk = Space_Grotesk({ variable: "--font-space-grotesk", subsets: ["latin"] })
const jetbrainsMono = JetBrains_Mono({ variable: "--font-jetbrains-mono", subsets: ["latin"] })

export const metadata: Metadata = {
  title: { default: "Track For CRM", template: "%s · Track For CRM" },
  description: "CRM da Track For: leads, vendas, orçamentos, financeiro e operação.",
  icons: { icon: "/brand/solid-tech.svg" },
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${spaceGrotesk.variable} ${jetbrainsMono.variable} h-full antialiased`}>
      <body className="min-h-full">
        <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
        <Toaster position="bottom-right" />
      </body>
    </html>
  )
}
