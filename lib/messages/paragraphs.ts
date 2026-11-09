export const MAX_WHATSAPP_PARTS = 20

/** Linhas simples ficam no mesmo balão; uma linha em branco separa as mensagens. */
export function whatsappMessageParts(text: string, separateParagraphs: boolean) {
  const content = text.trim()
  if (!content) return []
  if (!separateParagraphs) return [content]
  return content.replace(/\r\n?/g, "\n").split(/\n[\t ]*\n(?:[\t ]*\n)*/).map(part => part.trim()).filter(Boolean)
}
