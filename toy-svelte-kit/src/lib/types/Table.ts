export type Column<T> = {
  key: keyof T
  header: string | (() => string)
  sortable?: boolean
  editable?: boolean
  cell?: (row: T) => unknown
}

export type SortDirection = 'asc' | 'desc'

export type SortingState = {
  key: string
  direction: SortDirection
} | null
