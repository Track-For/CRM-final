/** PDF de texto paginado, com fonte WinAnsi e offsets calculados em bytes. */
export function textPdf(lines: string[]): Uint8Array {
  const wrapped = lines.flatMap(line => {
    const words = line.replace(/[–—]/g, "-").split(/\s+/).flatMap(word => word.match(/.{1,88}/g) || [""])
    const result: string[] = []; let current = ""
    for (const word of words) { if ((current + word).length > 88 && current) { result.push(current); current = "" } current += (current ? " " : "") + word }
    result.push(current); return result
  })
  const pages: string[][] = []
  for (let i = 0; i < wrapped.length; i += 45) pages.push(wrapped.slice(i, i + 45))
  if (!pages.length) pages.push([])
  const objects: string[] = ["<< /Type /Catalog /Pages 2 0 R >>", "", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"]
  const ids: number[] = []
  for (const lines of pages) {
    const pageId = objects.length + 1; const contentId = pageId + 1; ids.push(pageId)
    const escape = (line: string) => line.replace(/[^\x20-\x7e\xa0-\xff]/g, "?").replace(/[\\()]/g, "\\$&")
    const content = `BT /F1 11 Tf 16 TL 50 790 Td\n${lines.map(line => `(${escape(line)}) Tj T*`).join("\n")}\nET`
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`, `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`)
  }
  objects[1] = `<< /Type /Pages /Count ${pages.length} /Kids [${ids.map(id => `${id} 0 R`).join(" ")}] >>`
  let body = "%PDF-1.4\n"; const offsets = [0]
  objects.forEach((object, i) => { offsets.push(Buffer.byteLength(body, "latin1")); body += `${i + 1} 0 obj\n${object}\nendobj\n` })
  const xref = Buffer.byteLength(body, "latin1")
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(body, "latin1")
}
