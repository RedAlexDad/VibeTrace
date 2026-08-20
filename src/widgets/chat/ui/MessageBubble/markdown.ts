/** Minimal markdown pass (fixed font size, italic disabled) */
export function renderMarkdown(text: string): string {
  if (!text) return ''
  return (
    text
      // fenced code
      .replace(
        /```(\w*)\n([\s\S]*?)```/g,
        '<pre style="background:var(--color-bg-soft);padding:8px;border-radius:4px;margin:6px 0;font-family:IBM Plex Mono,monospace;font-size:11px"><code>$2</code></pre>',
      )
      // inline code
      .replace(
        /`([^`]+)`/g,
        '<code style="background:var(--color-bg-soft);padding:1px 3px;border-radius:2px;font-family:IBM Plex Mono,monospace;font-size:11px">$1</code>',
      )
      // Tables
      .replace(/(\|.+\|)\n(\|[-:| ]+\|)\n((?:\|.+\|\n?)*)/g, (_match, header, _divider, rows) => {
        const headerCells = header.split('|').filter((c: string) => c.trim())
        const rowLines = rows.trim().split('\n')
        const bodyCells = rowLines.map((row: string) =>
          row.split('|').filter((c: string) => c.trim()),
        )
        let html = '<table style="border-collapse:collapse;margin:8px 0;font-size:11px">'
        html +=
          '<thead><tr>' +
          headerCells
            .map(
              (c: string) =>
                `<th style="border:1px solid var(--color-border-light);padding:4px 8px;background:var(--color-bg-soft);font-weight:600">${c}</th>`,
            )
            .join('') +
          '</tr></thead>'
        html += '<tbody>'
        bodyCells.forEach((cells: string[]) => {
          html +=
            '<tr>' +
            cells
              .map(
                (c: string) =>
                  `<td style="border:1px solid var(--color-border-light);padding:4px 8px">${c}</td>`,
              )
              .join('') +
            '</tr>'
        })
        html += '</tbody></table>'
        return html
      })
      // **bold** -> strong
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      // *italic* -> just text (no italic)
      .replace(/\*(.+?)\*/g, '$1')
      // Headers collapse to bold
      .replace(/^#{1,6} (.+)$/gm, '<strong>$1</strong>')
      // bullet lists
      .replace(/^- (.+)$/gm, '<div style="margin-left:16px">• $1</div>')
      // numbered lists
      .replace(/^\d+\. (.+)$/gm, '<div style="margin-left:16px">$1</div>')
      // Paragraph breaks
      .replace(/\n\n/g, '</p><p style="margin:6px 0">')
      // Soft line breaks
      .replace(/\n/g, '<br/>')
  )
}