export interface ValidationFlag {
  severity: 'error' | 'warning'
  rule: string
  message: string
}

export interface ValidationResult {
  passed: boolean
  flags: ValidationFlag[]
}

export interface AIExplanation {
  explanation: string
  fixSuggestion: string
  source: 'cache' | 'ai'
}
