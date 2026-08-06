import type { Command } from '../../commands.js'

export default {
  type: 'local-jsx',
  name: 'codex',
  description: 'Desbloquear modelos Codex adicionais no Verboo Code',
  argumentHint: '[login|status|logout]',
  load: () => import('./codex.js'),
} satisfies Command
