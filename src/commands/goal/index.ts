import type { Command } from '../../commands.js'

const goal = {
  type: 'local-jsx',
  name: 'goal',
  description: 'Set and track a persistent goal for this session',
  argumentHint: '[<objective>|status|complete|pause|resume]',
  load: () => import('./goal.js'),
} satisfies Command

export default goal
