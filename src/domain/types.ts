// domain/types.ts
export interface User {
  firstName?: string
  lastName?: string
  telegramId: string
  username?: string
}

export interface Category {
  id: string
  name: string
}

export interface Tag {
  description?: string
  id: string
  name: string
}

export interface Transaction {
  amount: number
  budgetId?: string
  budgetName?: string
  budgetRemaining?: number
  category: Category
  date: Date
  description: string
  destination?: string
  groupTitle?: string
  tags?: string[]
}

// Define the BudgetLimit type
export interface BudgetLimit {
  amount: string // The limit amount (as a string to handle potential large numbers/precision)
  currencyCode: string // e.g., "USD", "EUR"
  endDate: Date
  id: string
  name: string // Name of the budget this limit applies to
  spent?: string // Optional: Total amount spent within the budget period (as a string)
  startDate: Date
}
