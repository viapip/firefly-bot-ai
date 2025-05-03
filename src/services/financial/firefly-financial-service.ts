import type { BudgetLimit, Category, Tag, Transaction } from '../../domain/types'
import type { FinancialServiceClient } from './interfaces/service-interfaces'

import { createLogger } from '../../utils/logger'
import { BaseFireflyClient } from './base-firefly-client'
import { BudgetManagerFireflyClient } from './budget-manager-firefly-client'
import { TransactionManagerFireflyClient } from './transaction-manager-firefly-client'

const logger = createLogger('FireflyFinancialService')

/**
 * Facade class that combines all Firefly specialized clients
 * Implements the FinancialServiceClient interface to ensure compatibility with existing code
 */
export class FireflyFinancialService implements FinancialServiceClient {
  private budgetManager: BudgetManagerFireflyClient
  private transactionManager: TransactionManagerFireflyClient

  constructor(baseUrl: string, personalAccessToken: string) {
    this.transactionManager = new TransactionManagerFireflyClient(baseUrl, personalAccessToken)
    this.budgetManager = new BudgetManagerFireflyClient(baseUrl, personalAccessToken)
    logger.debug('FireflyFinancialService initialized')
  }

  /**
   * Initialize both specialized clients
   */
  async fetchAndSetDefaultAccount(): Promise<void> {
    // Only need to initialize transaction manager since that's where the account ID is stored
    await this.transactionManager.fetchAndSetDefaultAccount()
  }

  /**
   * Delegate to transaction manager
   */
  async getCategories(): Promise<Category[]> {
    return this.transactionManager.getCategories()
  }

  /**
   * Delegate to transaction manager
   */
  async getTags(): Promise<Tag[]> {
    return this.transactionManager.getTags()
  }

  /**
   * Delegate to transaction manager
   */
  async sendTransaction(transaction: Transaction): Promise<boolean> {
    return this.transactionManager.sendTransaction(transaction)
  }

  /**
   * Delegate to transaction manager
   */
  async sendTransactions(transactions: Transaction[]): Promise<boolean> {
    return this.transactionManager.sendTransactions(transactions)
  }

  /**
   * Delegate to budget manager
   */
  async getBudgetLimits(): Promise<BudgetLimit[]> {
    return this.budgetManager.getBudgetLimits()
  }
}
