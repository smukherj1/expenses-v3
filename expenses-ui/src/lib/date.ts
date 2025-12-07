export function DateFromString(dateStr: string): Date | undefined {
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) {
    return
  }
  return CannonicalizeDate(d)
}

export function CannonicalizeDate(d: Date): Date {
  d.setUTCHours(0, 0, 0, 0)
  return d
}

export function DateAsString(d: Date): string {
  const year = d.getUTCFullYear()
  const month = (d.getUTCMonth() + 1).toString().padStart(2, '0') // Add 1 as months are 0-indexed
  const day = d.getUTCDate().toString().padStart(2, '0')

  return `${year}-${month}-${day}`
}
