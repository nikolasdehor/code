export const DESCRIPTION =
  'Update the status of the current session goal after meaningful progress or completion'

export const PROMPT = `Use this tool to update the persistent goal created with /goal.

## Goal status rules

- Mark a goal complete only after its objective has actually been achieved.
- Mark a goal paused only when the user explicitly asks to pause it.
- Mark a goal blocked only when the same blocker has prevented meaningful progress for three consecutive user turns. Give a concise, specific reason. The tool records the repeated blocker and will reject blocked status until that threshold is met; one turn can count only once.
- Do not update a goal owned by a different session or a subagent. The user can resume a paused or blocked goal with /goal resume.
`
