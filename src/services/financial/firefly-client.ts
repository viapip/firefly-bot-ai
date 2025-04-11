// services/financial/firefly-client.ts
import type { BudgetLimit, Category, Tag, Transaction } from '../../domain/types'
import type { FinancialServiceClient } from './interfaces'

// Interfaces for Firefly-III API based on OpenAPI spec
interface FireflyCategory {
  attributes: {
    name: string
  }
  id: string
}

interface FireflyCategoriesResponse {
  data: FireflyCategory[]
}

// Add interface for Tags
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

// Add interfaces for Accounts
interface FireflyAccountAttributes {
  account_role: null | string // e.g., 'defaultAsset', null
  name: string
  type: string // e.g., 'asset', 'expense', etc.
  // Add other relevant attributes if needed based on the OpenAPI spec
}

interface FireflyAccount {
  attributes: FireflyAccountAttributes
  id: string
}

interface FireflyAccountsResponse {
  data: FireflyAccount[]
  // Add meta and links if pagination is needed
}

// Interfaces for Budgets (/api/v1/budgets)
interface FireflyBudgetSpent {
  currency_code?: string
  currency_decimal_places?: number
  currency_id?: string
  currency_symbol?: string
  sum: string // Represented as string like "123.45"
}

interface FireflyBudgetAttributes {
  active: boolean
  // 'limit' might not exist directly on /budgets, 'amount' usually represents the budget value for the period
  auto_budget_amount?: null | string
  auto_budget_currency_code?: null | string
  auto_budget_currency_id?: null | string
  auto_budget_period?: null | string // e.g., 'monthly', 'yearly'
  auto_budget_type?: null | string // e.g., 'reset', 'rollover', 'none'
  created_at?: string // ISO 8601 Date string
  currency_code?: string
  currency_decimal_places?: number
  currency_id?: string
  currency_symbol?: string
  end_date?: string // End date of the budget period queried (ISO 8601)
  name: string
  notes?: null | string
  order?: number
  spent?: FireflyBudgetSpent[] // Array summarizing spent amounts in different currencies
  start_date?: string // Start date of the budget period queried (ISO 8601)
  updated_at?: string // ISO 8601 Date string
}

interface FireflyBudget {
  attributes: FireflyBudgetAttributes
  id: string
  type: 'budgets' // Or the relevant type string
  // links?: FireflyLinks; // Optional links object if needed
}

interface FireflyBudgetsResponse {
  data: FireflyBudget[]
  // meta?: FireflyMeta; // Optional meta for pagination
  // links?: FireflyLinks; // Optional links for pagination
}

export class FireflyFinancialServiceClient implements FinancialServiceClient {
  private baseUrl: string
  private defaultSourceAccountId: null | string = null // Store the default source account ID
  private initialized = false
  private personalAccessToken: string

  constructor(baseUrl: string, personalAccessToken: string) {
    this.baseUrl = baseUrl
    this.personalAccessToken = personalAccessToken
  }

  /**
   * Fetches accounts and sets the default source account ID.
   * @returns Promise<void>
   * @throws Error if fetching fails or no default source account is found.
   */
  async fetchAndSetDefaultAccount(): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/api/v1/accounts?type=asset`, { // Fetch only asset accounts
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
        // Fallback: If no account is explicitly marked as default, maybe use the first asset account?
        // Or throw an error as it might indicate a configuration issue in Firefly III.
        // Let's throw an error for now to enforce explicit default account setting.
        console.warn('No default source account (account_role="defaultAsset") found in Firefly III.')
        // Optional: Use the first asset account as a fallback
        // if (data.data.length > 0) {
        //   this.defaultSourceAccountId = data.data[0].id;
        //   console.log(`Using first asset account found as default: ${data.data[0].attributes.name} (ID: ${this.defaultSourceAccountId})`);
        // } else {
        //   throw new Error('No asset accounts found.');
        // }
        throw new Error('Default source account not found. Please configure a default asset account in Firefly III.')
      }

      this.defaultSourceAccountId = defaultAccount.id
      console.log(`Default source account set: ${defaultAccount.attributes.name} (ID: ${this.defaultSourceAccountId})`)
    }
    catch (error) {
      console.error('Error fetching or setting default account from Firefly-III:', error)
      this.defaultSourceAccountId = null // Reset on error
      throw new Error(`Failed to get or set default account: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Проверяет соединение с Firefly API и настраивает клиент (включая дефолтный счет)
   * @returns Promise<boolean> - успешна ли проверка и настройка
   */
  async checkConnection(): Promise<boolean> {
    try {
      // Проверяем соединение с API путем получения списка категорий
      await this.getCategories()
      // Получаем и устанавливаем ID счета по умолчанию
      await this.fetchAndSetDefaultAccount()
      this.initialized = true

      return true
    }
    catch (error) {
      console.error('Ошибка соединения или настройки Firefly API клиента:', error)
      this.initialized = false

      return false
    }
  }

  /**
   * Проверяет, инициализирован ли клиент (включая наличие дефолтного счета)
   * @throws Error если клиент не инициализирован или нет дефолтного счета
   */
  private checkInitialized(): void {
    if (!this.initialized) {
      throw new Error('Firefly client not initialized or connection failed')
    }
    if (!this.defaultSourceAccountId) {
      // This check might be redundant if checkConnection throws, but adds safety
      throw new Error('Firefly client initialized, but default source account ID is missing.')
    }
  }

  /**
   * Получает список категорий из Firefly API
   * @returns Promise<Category[]> - массив категорий
   */
  async getCategories(): Promise<Category[]> {
    // No changes needed here, but ensure headers/fetch logic is consistent
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
      // Don't reset initialized status here unless connection is the issue
      throw new Error('Failed to get categories')
    }
  }

  /**
   * Получает список меток (тегов) из Firefly API
   * @returns Promise<Tag[]> - массив тегов
   */
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
   * Отправляет одну транзакцию в Firefly API
   * @param transaction - объект транзакции для отправки
   * @returns Promise<boolean> - успешна ли отправка
   */
  async sendTransaction(transaction: Transaction): Promise<boolean> {
    // Для обратной совместимости вызываем отправку массива транзакций
    return this.sendTransactions([transaction])
  }

  /**
   * Отправляет несколько транзакций в Firefly API как split-транзакцию
   * @param transactions - массив транзакций для отправки
   * @returns Promise<boolean> - успешна ли отправка
   */
  async sendTransactions(transactions: Transaction[]): Promise<boolean> {
    if (transactions.length === 0) {
      console.error('No transactions to send')

      return false
    }

    // this.checkInitialized() // Ensure client is initialized AND default account ID is set

    // Use the guaranteed non-null ID after checkInitialized()
    const sourceId = this.defaultSourceAccountId!

    try {
      let requestBody: object // Use a generic object type for the body

      // Преобразуем транзакции в формат Firefly API, добавляя source_id
      const transactionsData = transactions.map((transaction) => {
        const transactionData: any = {
          amount: transaction.amount.toString(),
          category_name: transaction.category.name, // Using name is fine if Firefly can resolve it
          // category_id: transaction.category.id, // Alternatively, use ID if available and preferred
          date: transaction.date.toISOString(), // Use full ISO 8601 date-time string
          description: transaction.description,
          source_id: sourceId, // Add the default source account ID
          type: 'withdrawal' as const,
        }

        // Add budget_id if provided
        if (transaction.budgetId) {
          transactionData.budget_id = transaction.budgetId
        }

        // Add destination_name if provided
        if (transaction.destination) {
          transactionData.destination_name = transaction.destination
        }

        // Add tags if provided
        if (transaction.tags && transaction.tags.length) {
          transactionData.tags = transaction.tags
        }

        return transactionData
      })

      // Структура запроса остается той же, только payload транзакций изменился
      if (transactions.length === 1) {
        requestBody = {
          transactions: transactionsData,
        }
        console.log('Sending single transaction:', JSON.stringify(requestBody, null, 2))
      }
      else {
        // Используем свойство groupTitle, если оно доступно у первой транзакции
        const groupTitle = (transactions[0] as any).groupTitle || `Split: ${transactions[0]?.description || 'Grouped Transaction'}`

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
   * Получает список лимитов бюджетов из Firefly API
   * @returns Promise<BudgetLimit[]> - массив лимитов бюджетов
   */
  async getBudgetLimits(): Promise<BudgetLimit[]> {
    // this.checkInitialized() // Ensure client is initialized

    try {
      // Calculate start and end dates for the current month
      const now = new Date()
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0) // Day 0 of next month is the last day of current month

      // Format dates as YYYY-MM-DD for the API query
      const startDateString = startOfMonth.toISOString()
        .split('T')[0]
      const endDateString = endOfMonth.toISOString()
        .split('T')[0]

      // Construct the URL with query parameters
      const url = new URL(`${this.baseUrl}/api/v1/budgets`)
      url.searchParams.append('start', startDateString)
      url.searchParams.append('end', endDateString)

      const response = await fetch(url.toString(), { // Use the constructed URL
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${this.personalAccessToken}`,
          'Content-Type': 'application/json',
        },
        method: 'GET',
      })

      if (!response.ok) {
        // Consider logging the URL that failed:
        console.error(`Firefly API error getting budgets: ${response.status} from ${url.toString()}`)
        const errorBody = await response.text()
        console.error('Error Body:', errorBody)
        throw new Error(`Firefly API error getting budgets: ${response.status}`)
      }

      const data = await response.json() as FireflyBudgetsResponse // Use the new interface

      // Map the response data using the defined interfaces

      console.log('Firefly budgets', JSON.stringify(data.data, null, 2))

      return (data.data || []).map((budget: FireflyBudget): BudgetLimit => { // Use FireflyBudget type
        // Calculate total spent from the 'spent' array if available
        let totalSpent: string | undefined
        if (budget.attributes.spent && Array.isArray(budget.attributes.spent) && budget.attributes.spent.length > 0) {
          // Sum all 'sum' values from the spent array
          totalSpent = budget.attributes.spent.reduce((sum, currentSpent) => {
            // Use parseFloat to handle string numbers, default to 0 if sum is undefined or NaN
            const currentSumValue = Number.parseFloat(currentSpent?.sum ?? '0')

            return (sum + (Number.isNaN(currentSumValue) ? 0 : currentSumValue))
          }, 0)
            .toString() // Start reduction with 0 and convert final sum back to string
        }
        else {
          // If spent is empty or not present, default spent amount to '0'
          totalSpent = '0'
        }

        // Use attributes defined in FireflyBudgetAttributes
        return {
          amount: budget.attributes.auto_budget_amount || '0', // Use 'amount' from attributes
          currencyCode: budget.attributes.currency_code ?? '', // Use currency details from attributes, fallback to empty string
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
