import { $ZodIssue, $ZodError } from 'zod/v4/core'

function formatZodIssue(i: $ZodIssue): string {
  return `${i.code} for field '${i.path.join('.')}', got '${i.input}'`
}

export function formatZodError(e: $ZodError) {
  const issues = e.issues.length > 5 ? e.issues.slice(0, 5) : e.issues
  return issues.map((i) => formatZodIssue(i)).join(', ')
}
