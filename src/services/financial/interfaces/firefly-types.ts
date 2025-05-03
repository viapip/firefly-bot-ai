/**
 * Types for Firefly III API responses
 */

export interface FireflyCategory {
  attributes: {
    name: string
  }
  id: string
}

export interface FireflyCategoriesResponse {
  data: FireflyCategory[]
}

export interface FireflyTag {
  attributes: {
    tag: string
    description?: string
  }
  id: string
}

export interface FireflyTagsResponse {
  data: FireflyTag[]
}

export interface FireflyAccountAttributes {
  account_role: null | string
  name: string
  type: string
}

export interface FireflyAccount {
  attributes: FireflyAccountAttributes
  id: string
}

export interface FireflyAccountsResponse {
  data: FireflyAccount[]
}

export interface FireflyBudgetSpent {
  currency_code?: string
  currency_decimal_places?: number
  currency_id?: string
  currency_symbol?: string
  sum: string
}

export interface FireflyBudgetAttributes {
  active: boolean
  auto_budget_amount?: null | string
  auto_budget_currency_code?: null | string
  auto_budget_currency_id?: null | string
  auto_budget_period?: null | string
  auto_budget_type?: null | string
  created_at?: string
  currency_code?: string
  currency_decimal_places?: number
  currency_id?: string
  currency_symbol?: string
  end_date?: string
  name: string
  notes?: null | string
  order?: number
  spent?: FireflyBudgetSpent[]
  start_date?: string
  updated_at?: string
}

export interface FireflyBudget {
  attributes: FireflyBudgetAttributes
  id: string
  type: 'budgets'
}

export interface FireflyBudgetsResponse {
  data: FireflyBudget[]
}

export interface FireflyTransactionAttributes {
  user_id: string
  transaction_journal_id: string
  type: string
  date: string
  order: number
  currency_id: string
  currency_code: string
  currency_symbol: string
  currency_decimal_places: number
  foreign_currency_id: string | null
  foreign_currency_code: string | null
  foreign_currency_symbol: string | null
  foreign_currency_decimal_places: number | null
  amount: string
  foreign_amount: string | null
  description: string
  source_id: string
  source_name: string
  destination_id: string
  destination_name: string
  budget_id: string | null
  budget_name: string | null
  category_id: string | null
  category_name: string | null
  bill_id: string | null
  bill_name: string | null
  reconciled: boolean
  notes: string | null
  tags: string[]
  internal_reference: string | null
  external_id: string | null
  original_source: string
  recurrence_id: string | null
  recurrence_total: number | null
  recurrence_count: number | null
  bunq_payment_id: string | null
  import_hash_v2: string | null
  sepa_cc: string | null
  sepa_ct_id: string | null
  sepa_ct_op: string | null
  sepa_db: string | null
  sepa_country: string | null
  sepa_ep: string | null
  sepa_ci: string | null
  sepa_batch_id: string | null
  interest_date: string | null
  book_date: string | null
  process_date: string | null
  due_date: string | null
  payment_date: string | null
  invoice_date: string | null
  longitude: number | null
  latitude: number | null
  zoom_level: number | null
  has_attachments: boolean
}

export interface FireflyTransaction {
  id: string
  type: 'transactions'
  attributes: FireflyTransactionAttributes
}

export interface FireflyTransactionResponse {
  data: FireflyTransaction
}

export interface FireflyTransactionsResponse {
  data: FireflyTransaction[]
}

export interface FireflyTransactionRequestData {
  amount: string
  category_name?: string
  date: string
  description: string
  destination_name?: string
  source_id: string
  type: 'withdrawal' | 'deposit' | 'transfer'
  budget_id?: string
  tags?: string[]
}

export interface FireflyTransactionRequest {
  transactions: FireflyTransactionRequestData[]
  group_title?: string
}