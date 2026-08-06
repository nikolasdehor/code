import type { Command } from '../../commands.js'

export default {
  type: 'local-jsx',
  name: 'claude',
  description: 'Desbloquear modelos Claude nativos adicionais no Verboo Code',
  argumentHint: '[login|status|logout]',
  load: () => import('./claude.js'),
} satisfies Command
