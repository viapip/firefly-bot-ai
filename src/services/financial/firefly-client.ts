import type { BudgetLimit, Category, Tag, Transaction } from '../../domain/types'
import type { FinancialServiceClient } from './interfaces'

import { createLogger } from '../../utils/logger'

const logger = createLogger('FireflyClient')

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

/**
 * Client for interacting with the Firefly III API
 */
export class FireflyFinancialServiceClient implements FinancialServiceClient {
  private baseUrl: string
  private defaultSourceAccountId: null | string = null
  private personalAccessToken: string

  constructor(baseUrl: string, personalAccessToken: string) {
    this.baseUrl = baseUrl
    this.personalAccessToken = personalAccessToken
    logger.debug('FireflyFinancialServiceClient initialized')
  }

  /**
   * Creates standard headers for Firefly API requests
   */
  private getHeaders(): HeadersInit {
    return {
      'Accept': 'application/json',
      'Authorization': `Bearer ${this.personalAccessToken}`,
      'Content-Type': 'application/json',
    }
  }

  /**
   * Handles API errors uniformly
   */
  private async handleApiError(response: Response, operation: string): Promise<never> {
    let errorDetails = ''
    try {
      errorDetails = await response.text()
    }
    catch (textError) {
      logger.error(`Failed to get error details for ${operation}:`, textError)
    }

    const errorMessage = `Firefly API error ${operation}: ${response.status} - ${response.statusText}`
    logger.error(errorMessage, { details: errorDetails })
    throw new Error(`${errorMessage}${errorDetails ? `: ${errorDetails}` : ''}`)
  }

  /**
   * Initializes the client by fetching accounts and identifying the default asset account
   * designated by the 'defaultAsset' role in Firefly III.
   * @throws Error if fetching fails or no account with `account_role === 'defaultAsset'` is found.
   */
  async fetchAndSetDefaultAccount(): Promise<void> {
    logger.debug('Fetching default account')
    try {
      const response = await fetch(`${this.baseUrl}/api/v1/accounts?type=asset`, {
        headers: this.getHeaders(),
        method: 'GET',
      })

      if (!response.ok) {
        await this.handleApiError(response, 'fetching accounts')
      }

      const data = await response.json() as FireflyAccountsResponse
      const defaultAccount = data.data.find(
        (account: FireflyAccount) => {
          return account.attributes.account_role === 'defaultAsset'
        },
      )

      if (!defaultAccount) {
        logger.warn('No default source account (account_role="defaultAsset") found in Firefly III.')
        throw new Error('Default source account not found. Please configure a default asset account in Firefly III.')
      }

      this.defaultSourceAccountId = defaultAccount.id
      logger.info(`Default source account set: ${defaultAccount.attributes.name} (ID: ${this.defaultSourceAccountId})`)
    }
    catch (error) {
      logger.error('Error fetching or setting default account from Firefly-III:', error)
      this.defaultSourceAccountId = null
      throw new Error(`Failed to get or set default account: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Fetches all categories from Firefly III
   */
  async getCategories(): Promise<Category[]> {
    logger.debug('Fetching categories')
    try {
      const response = await fetch(`${this.baseUrl}/api/v1/categories`, {
        headers: this.getHeaders(),
        method: 'GET',
      })

      if (!response.ok) {
        await this.handleApiError(response, 'getting categories')
      }

      const data = await response.json() as FireflyCategoriesResponse
      logger.debug(`Retrieved ${data.data.length} categories`)

      return data.data.map((category: FireflyCategory) => {
        return {
          id: category.id,
          name: category.attributes.name,
        }
      })
    }
    catch (error) {
      logger.error('Error getting categories from Firefly-III:', error)
      throw new Error(`Failed to get categories: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Fetches all tags from Firefly III
   */
  async getTags(): Promise<Tag[]> {
    logger.debug('Fetching tags')
    try {
      const response = await fetch(`${this.baseUrl}/api/v1/tags`, {
        headers: this.getHeaders(),
        method: 'GET',
      })

      if (!response.ok) {
        await this.handleApiError(response, 'getting tags')
      }

      const json = await response.json() as FireflyTagsResponse
      logger.debug(`Retrieved ${json.data.length} tags`)

      return json.data.map((tag: FireflyTag) => {
        return {
          description: tag.attributes.description,
          id: tag.id,
          name: tag.attributes.tag,
        }
      })
    }
    catch (error) {
      logger.error('Error getting tags from Firefly-III:', error)
      throw new Error(`Failed to get tags: ${error instanceof Error ? error.message : String(error)}`)
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
    if (!transactions.length) {
      logger.error('No transactions to send')

      return false
    }

    if (!this.defaultSourceAccountId) {
      logger.error('Cannot send transactions: default source account ID not set')

      return false
    }

    const sourceId = this.defaultSourceAccountId

    try {
      const transactionsData = transactions.map((transaction) => {
        const transactionData: Record<string, any> = {
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
      let requestBody: Record<string, any>
      if (transactions.length === 1) {
        requestBody = {
          transactions: transactionsData,
        }
        logger.info('Sending single transaction')
        logger.debug('Transaction data:', requestBody)
      }
      else {
        const groupTitle = (transactions[0] as any).groupTitle
          || `[BOT] Split: ${transactions[0]?.description || 'Grouped Transaction'}`

        requestBody = {
          group_title: groupTitle,
          transactions: transactionsData,
        }
        logger.info(`Sending split transaction with ${transactions.length} items`)
        logger.debug('Split transaction data:', requestBody)
      }

      const response = await fetch(`${this.baseUrl}/api/v1/transactions`, {
        body: JSON.stringify(requestBody),
        headers: this.getHeaders(),
        method: 'POST',
      })

      if (!response.ok) {
        const errorData = await response.text()
        logger.error(`Firefly API error: ${response.status}`, {
          errorData,
          requestBody: JSON.stringify(requestBody),
        })

        return false
      }

      logger.info(`Successfully sent ${transactions.length} transaction(s)`)

      return true
    }
    catch (error) {
      logger.error('Error sending transactions to Firefly-III:', error)

      return false
    }
  }

  /**
   * Fetches budget limits for the current calendar month from Firefly III.
   * @returns Promise<BudgetLimit[]> - Array of budget limits for the current month.
   */
  async getBudgetLimits(): Promise<BudgetLimit[]> {
    logger.debug('Fetching budget limits')
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

      logger.debug(`Fetching budgets from ${startDateString} to ${endDateString}`)

      const response = await fetch(url.toString(), {
        headers: this.getHeaders(),
        method: 'GET',
      })

      if (!response.ok) {
        await this.handleApiError(response, 'getting budgets')
      }

      const data = await response.json() as FireflyBudgetsResponse
      logger.debug(`Retrieved ${data.data?.length || 0} budget limits`)

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
      logger.error('Error getting budgets from Firefly-III:', error)
      throw new Error(`Failed to get budgets: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}
