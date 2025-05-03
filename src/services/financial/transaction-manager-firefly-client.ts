import type { Category, Tag, Transaction } from '../../domain/types'
import type {
  FireflyAccountsResponse,
  FireflyCategoriesResponse,
  FireflyTagsResponse,
  FireflyTransactionRequest,
  FireflyTransactionRequestData,
} from './interfaces/firefly-types'
import type { TransactionManager } from './interfaces/service-interfaces'

import { createLogger } from '../../utils/logger'
import { BaseFireflyClient } from './base-firefly-client'

const logger = createLogger('TransactionManagerFireflyClient')

/**
 * Client for managing transactions in Firefly III
 */
export class TransactionManagerFireflyClient extends BaseFireflyClient implements TransactionManager {
  private defaultSourceAccountId: null | string = null

  constructor(baseUrl: string, personalAccessToken: string) {
    super(baseUrl, personalAccessToken)
    logger.debug('TransactionManagerFireflyClient initialized')
  }

  /**
   * Sets the default source account ID
   */
  setDefaultSourceAccountId(accountId: string): void {
    this.defaultSourceAccountId = accountId
    logger.info(`Default source account ID set: ${accountId}`)
  }

  /**
   * Gets the default source account ID or throws an error if not set
   */
  getDefaultSourceAccountId(): string {
    if (!this.defaultSourceAccountId) {
      logger.error('Default source account ID not set')
      throw new Error('Default source account ID is not set. Call fetchAndSetDefaultAccount first.')
    }

    return this.defaultSourceAccountId
  }

  /**
   * Initializes the client by fetching accounts and identifying the default asset account
   * designated by the 'defaultAsset' role in Firefly III.
   * @throws Error if fetching fails or no account with `account_role === 'defaultAsset'` is found.
   */
  async fetchAndSetDefaultAccount(): Promise<void> {
    logger.debug('Fetching default account')
    try {
      const data = await this.get<FireflyAccountsResponse>('accounts', { type: 'asset' })
      const defaultAccount = data.data.find(
        (account) => {
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
      const data = await this.get<FireflyCategoriesResponse>('categories')
      logger.debug(`Retrieved ${data.data.length} categories`)

      return data.data.map((category) => {
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
      const json = await this.get<FireflyTagsResponse>('tags')
      logger.debug(`Retrieved ${json.data.length} tags`)

      return json.data.map((tag) => {
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

    try {
      const sourceId = this.getDefaultSourceAccountId()

      const transactionsData: FireflyTransactionRequestData[] = transactions.map((transaction) => {
        const transactionData: FireflyTransactionRequestData = {
          amount: transaction.amount.toString(),
          category_name: transaction.category.name,
          date: transaction.date.toISOString(),
          description: `[BOT] ${transaction.description}`,
          source_id: sourceId,
          type: 'withdrawal',
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
      let requestBody: FireflyTransactionRequest
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

      // Use the POST method from BaseFireflyClient
      await this.post('transactions', requestBody)
      logger.info(`Successfully sent ${transactions.length} transaction(s)`)

      return true
    }
    catch (error) {
      logger.error('Error sending transactions to Firefly-III:', error)

      return false
    }
  }
}
