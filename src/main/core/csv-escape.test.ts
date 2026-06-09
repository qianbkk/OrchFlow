// @vitest-environment node
import { describe, it, expect } from 'vitest'

/** Tests for csvEscape in ipc.ts.
 *  Re-implemented here to test independently (not exported from ipc). */
function csvEscape(v: unknown): string {
  const s = String(v)
  const needsQuoting = /[",\r\n\t]/.test(s)
  const isFormula = /^[=+\-@\t\r]/.test(s)
  const escaped = isFormula ? `'${s}` : s
  return needsQuoting || isFormula ? `"${escaped.replace(/"/g, '""')}"` : escaped
}

describe('csvEscape', () => {
  it('passes safe strings unchanged', () => {
    expect(csvEscape('hello')).toBe('hello')
    expect(csvEscape('abc123')).toBe('abc123')
    expect(csvEscape(42)).toBe('42')
  })

  it('quotes strings with commas', () => {
    expect(csvEscape('hello, world')).toBe('"hello, world"')
  })

  it('quotes strings with double quotes and escapes them', () => {
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""')
  })

  it('quotes strings with newlines', () => {
    expect(csvEscape('line1\nline2')).toBe('"line1\nline2"')
  })

  it('quotes strings with carriage returns', () => {
    expect(csvEscape('line1\rline2')).toBe('"line1\rline2"')
  })

  it('quotes strings with tabs', () => {
    expect(csvEscape('col1\tcol2')).toBe('"col1\tcol2"')
  })

  // Formula injection protection
  it('prefixes = with single quote', () => {
    const result = csvEscape('=SUM(A1:A10)')
    expect(result).toBe('"\'=SUM(A1:A10)"')
  })

  it('prefixes + with single quote', () => {
    const result = csvEscape('+CMD|\'/C calc\'!A0')
    expect(result).toContain("'+")
  })

  it('prefixes - with single quote', () => {
    const result = csvEscape('-1+1')
    expect(result).toContain("'-")
  })

  it('prefixes @ with single quote', () => {
    const result = csvEscape('@SUM(A1)')
    expect(result).toContain("'@")
  })

  it('handles empty string', () => {
    expect(csvEscape('')).toBe('')
  })

  it('handles null/undefined', () => {
    expect(csvEscape(null)).toBe('null')
    expect(csvEscape(undefined)).toBe('undefined')
  })

  it('handles numbers', () => {
    expect(csvEscape(0)).toBe('0')
    expect(csvEscape(-1)).toBe('"\'-1"')  // negative number starts with -
    expect(csvEscape(3.14)).toBe('3.14')
  })
})
