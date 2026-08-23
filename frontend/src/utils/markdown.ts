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
function preprocessMentions(text: string, usernames?: Set<string>): string {
  if (!usernames || usernames.size === 0) return text
  const escaped = [...usernames]
    .sort((a, b) => b.length - a.length)
    .map((u) => u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  if (escaped.length === 0) return text
  const re = new RegExp('(^|[\\s>(])@(' + escaped.join('|') + ')(?=$|[\\s).,!?:;<])', 'gi')
  return text.replace(re, '$1<span class="mention">@$2</span>')
}

function preprocess(text: string, usernames?: Set<string>): string {
  return preprocessMentions(String(text ?? ''), usernames)
    .replace(
      /(^|[\s(])__([^_\n]+)__(?=$|[\s).,!?:;])/g,
      '$1<u>$2</u>'
    )
}

/**
 * Renderiza a mensagem como HTML seguro:
 * markdown + sublinhado + links autodetectados, sempre passando pelo DOMPurify.
 */
export function renderRichMessage(content: string, mentionUsernames?: Set<string>): string {
  const html = md.render(preprocess(content, mentionUsernames))
  return DOMPurify.sanitize(html)
}
