import type { AcademicYear } from '../types'

export interface AcademicYearDefinition {
  value: AcademicYear
  label: string
}

export const ACADEMIC_YEARS: readonly AcademicYearDefinition[] = [
  { value: '1st', label: '1st Year' },
  { value: '2nd', label: '2nd Year' },
  { value: '3rd', label: '3rd Year' },
  { value: 'Final', label: 'Final Year' }
] as const

export const ACADEMIC_YEAR_VALUES: readonly AcademicYear[] = ['1st', '2nd', '3rd', 'Final'] as const

export function getAcademicYearLabel(value: AcademicYear | string): string {
  const match = ACADEMIC_YEARS.find((y) => y.value === value)
  return match ? match.label : value
}

