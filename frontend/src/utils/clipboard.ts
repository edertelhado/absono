/**
 * Copia texto para a área de transferência.
 * No Electron usa a bridge nativa (navigator.clipboard falha sem foco);
 * na web tenta a Clipboard API e cai para execCommand como último recurso.
 */
export async function copyToClipboard(text: string): Promise<void> {
  const desktop = (window as any).absonoDesktop
  if (desktop?.copyText) {
    await desktop.copyText(text)
    return
  }

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return
    }
  } catch {
    // segue pro fallback
  }

  // Fallback legado: textarea temporária + execCommand
  const ta = document.createElement('textarea')
  ta.value = text
  ta.style.position = 'fixed'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.select()
  try {
    const ok = document.execCommand('copy')
    if (!ok) throw new Error('execCommand falhou')
  } finally {
    document.body.removeChild(ta)
  }
}
