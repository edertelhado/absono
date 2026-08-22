import MarkdownIt from 'markdown-it'
import DOMPurify from 'dompurify'

const md = new MarkdownIt({
  html: true,     // permitimos HTML mínimo (ex.: <u> gerado abaixo); sanitizado depois
  linkify: true,
  breaks: true,
})

// links abrem em nova aba com noopener
const defaultLinkOpen =
  md.renderer.rules.link_open ||
  ((tokens: any[], idx: number, options: any, _env: any, self: any) => self.renderToken(tokens, idx, options))
md.renderer.rules.link_open = (tokens: any[], idx: number, options: any, env: any, self: any) => {
  tokens[idx].attrSet('target', '_blank')
  tokens[idx].attrSet('rel', 'noopener noreferrer')
  return defaultLinkOpen(tokens, idx, options, env, self)
}

/**
 * Sublinhado estilo Discord: __texto__ vira <u> antes do parse.
 * (O markdown-it trata __x__ como bold por padrão.)
 */
function preprocess(text: string): string {
  return String(text ?? '').replace(
    /(^|[\s(])__([^_\n]+)__(?=$|[\s).,!?:;])/g,
    '$1<u>$2</u>'
  )
}

/**
 * Renderiza a mensagem como HTML seguro:
 * markdown + sublinhado + links autodetectados, sempre passando pelo DOMPurify.
 */
export function renderRichMessage(content: string): string {
  const html = md.render(preprocess(content))
  return DOMPurify.sanitize(html)
}
