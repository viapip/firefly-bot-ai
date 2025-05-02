import type { BudgetLimit, Category, Tag, Transaction } from '../../domain/types'
import type { FinancialServiceClient } from './interfaces'

interface FireflyCategory {
  attributes: {
    name: string
  }
  id: string
}

interface FireflyCategoriesResponse {
  data: FireflyCategory[]
}

interface FireflyTag {
  attributes: {
    tag: string
    description?: string
  }
  id: string
}

interface FireflyTagsResponse {
  data: FireflyTag[]
}

interface FireflyAccountAttributes {
  account_role: null | string
  name: string
  type: string
}

interface FireflyAccount {
  attributes: FireflyAccountAttributes
  id: string
}

interface FireflyAccountsResponse {
  data: FireflyAccount[]
}

interface FireflyBudgetSpent {
  currency_code?: string
  currency_decimal_places?: number
  currency_id?: string
  currency_symbol?: string
  sum: string
}

interface FireflyBudgetAttributes {
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

interface FireflyBudget {
  attributes: FireflyBudgetAttributes
  id: string
  type: 'budgets'
}

interface FireflyBudgetsResponse {
  data: FireflyBudget[]
}

export class FireflyFinancialServiceClient implements FinancialServiceClient {
  private baseUrl: string
  private defaultSourceAccountId: null | string = null
  private initialized = false
  private personalAccessToken: string

  constructor(baseUrl: string, personalAccessToken: string) {
    this.baseUrl = baseUrl
    this.personalAccessToken = personalAccessToken
  }

  /**
   * Initializes the client by fetching accounts and identifying the default asset account
   * designated by the 'defaultAsset' role in Firefly III.
   * @throws Error if fetching fails or no account with `account_role === 'defaultAsset'` is found.
   */
  async fetchAndSetDefaultAccount(): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/api/v1/accounts?type=asset`, {
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${this.personalAccessToken}`,
          'Content-Type': 'application/json',
        },
        method: 'GET',
      })

      if (!response.ok) {
        throw new Error(`Firefly API error fetching accounts: ${response.status}`)
      }

      const data = await response.json() as FireflyAccountsResponse
      const defaultAccount = data.data.find(
        (account: FireflyAccount) => {
          return account.attributes.account_role === 'defaultAsset'
        },
      )

      if (!defaultAccount) {
        console.warn('No default source account (account_role="defaultAsset") found in Firefly III.')

        throw new Error('Default source account not found. Please configure a default asset account in Firefly III.')
      }

      this.defaultSourceAccountId = defaultAccount.id
      console.log(`Default source account set: ${defaultAccount.attributes.name} (ID: ${this.defaultSourceAccountId})`)
    }
    catch (error) {
      console.error('Error fetching or setting default account from Firefly-III:', error)
      this.defaultSourceAccountId = null
      throw new Error(`Failed to get or set default account: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async getCategories(): Promise<Category[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/v1/categories`, {
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${this.personalAccessToken}`,
          'Content-Type': 'application/json',
        },
        method: 'GET',
      })

      if (!response.ok) {
        throw new Error(`Firefly API error getting categories: ${response.status}`)
      }

      const data = await response.json() as FireflyCategoriesResponse

      return data.data.map((category: FireflyCategory) => {
        return {
          id: category.id,
          name: category.attributes.name,
        }
      })
    }
    catch (error) {
      console.error('Error getting categories from Firefly-III:', error)
      throw new Error('Failed to get categories')
    }
  }

  async getTags(): Promise<Tag[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/v1/tags`, {
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${this.personalAccessToken}`,
          'Content-Type': 'application/json',
        },
        method: 'GET',
      })

      if (!response.ok) {
        throw new Error(`Firefly API error getting tags: ${response.status}`)
      }

      const json = await response.json() as FireflyTagsResponse

      return json.data.map((tag: FireflyTag) => {
        return {
          description: tag.attributes.description,
          id: tag.id,
          name: tag.attributes.tag,
        }
      })
    }
    catch (error) {
      console.error('Error getting tags from Firefly-III:', error)
      throw new Error('Failed to get tags')
    }
  }

  /**
   * Sends a single transaction. Wraps `sendTransactions`.
   */
  async sendTransaction(transaction: Transaction): Promise<boolean> {
    return this.sendTransactions([transaction])
  }

  /**
   * Sends one or more transactions to Firefly III.
   * If multiple transactions are provided, they are sent as a single split transaction.
   * If only one is provided, it's sent as a standard transaction.
   * @param transactions - Array of transactions to send.
   * @returns Promise<boolean> - True if the request was successful (HTTP 2xx), false otherwise.
   */
  async sendTransactions(transactions: Transaction[]): Promise<boolean> {
    if (transactions.length === 0) {
      console.error('No transactions to send')

      return false
    }

    const sourceId = this.defaultSourceAccountId!

    try {
      let requestBody: object

      const transactionsData = transactions.map((transaction) => {
        const transactionData: any = {
          amount: transaction.amount.toString(),
          category_name: transaction.category.name,
          date: transaction.date.toISOString(),
          description: `[BOT] ${transaction.description}`,
          source_id: sourceId,
          type: 'withdrawal' as const,
        }

        if (transaction.budgetId) {
          transactionData.budget_id = transaction.budgetId
        }

        if (transaction.destination) {
          transactionData.destination_name = transaction.destination
        }

        if (transaction.tags && transaction.tags.length) {
          transactionData.tags = transaction.tags
        }

        return transactionData
      })

      // Structure the request body differently for single vs. split transactions
      if (transactions.length === 1) {
        requestBody = {
          transactions: transactionsData,
        }
        console.log('Sending single transaction:', JSON.stringify(requestBody, null, 2))
      }
      else {
        const groupTitle = (transactions[0] as any).groupTitle || `[BOT] Split: ${transactions[0]?.description || 'Grouped Transaction'}`

        requestBody = {
          group_title: groupTitle,
          transactions: transactionsData,
        }
        console.log('Sending split transaction:', JSON.stringify(requestBody, null, 2))
      }

      const response = await fetch(`${this.baseUrl}/api/v1/transactions`, {
        body: JSON.stringify(requestBody),
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${this.personalAccessToken}`,
          'Content-Type': 'application/json',
        },
        method: 'POST',
      })

      if (!response.ok) {
        const errorData = await response.text()
        console.error(`Firefly API error: ${response.status} ${errorData}`)
        console.error('Failed request body:', JSON.stringify(requestBody, null, 2))

        return false
      }

      return true
    }
    catch (error) {
      console.error('Error sending transactions to Firefly-III:', error)

      return false
    }
  }

  /**
   * Fetches budget limits for the current calendar month from Firefly III.
   * @returns Promise<BudgetLimit[]> - Array of budget limits for the current month.
   */
  async getBudgetLimits(): Promise<BudgetLimit[]> {
    try {
      // Calculate start and end dates for the current month
      const now = new Date()
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0) // Day 0 of next month is the last day of current month

      // Format dates as YYYY-MM-DD for the API query
      const [startDateString] = startOfMonth.toISOString()
        .split('T')
      const [endDateString] = endOfMonth.toISOString()
        .split('T')

      const url = new URL(`${this.baseUrl}/api/v1/budgets`)
      url.searchParams.append('start', startDateString)
      url.searchParams.append('end', endDateString)

      const response = await fetch(url.toString(), {
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${this.personalAccessToken}`,
          'Content-Type': 'application/json',
        },
        method: 'GET',
      })

      if (!response.ok) {
        console.error(`Firefly API error getting budgets: ${response.status} from ${url.toString()}`)
        const errorBody = await response.text()
        console.error('Error Body:', errorBody)
        throw new Error(`Firefly API error getting budgets: ${response.status}`)
      }

      const data = await response.json() as FireflyBudgetsResponse

      console.log('Firefly budgets', JSON.stringify(data.data, null, 2))

      return (data.data || []).map((budget: FireflyBudget): BudgetLimit => {
        // Calculate total spent across potentially multiple currencies
        let totalSpent: string | undefined
        if (budget.attributes.spent && Array.isArray(budget.attributes.spent) && budget.attributes.spent.length > 0) {
          totalSpent = budget.attributes.spent.reduce((sum, currentSpent) => {
            const currentSumValue = Number.parseFloat(currentSpent?.sum ?? '0')

            return (sum + (Number.isNaN(currentSumValue) ? 0 : currentSumValue))
          }, 0)
            .toString()
        }
        else {
          totalSpent = '0'
        }

        return {
          amount: budget.attributes.auto_budget_amount || '0',
          currencyCode: budget.attributes.currency_code ?? '',
          endDate: budget.attributes.end_date ? new Date(budget.attributes.end_date) : endOfMonth,
          id: budget.id,
          name: budget.attributes.name,
          spent: totalSpent,
          startDate: budget.attributes.start_date ? new Date(budget.attributes.start_date) : startOfMonth,
        }
      })
    }
    catch (error) {
      console.error('Error getting budgets from Firefly-III:', error)
      throw new Error(`Failed to get budgets: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}
