import type { BudgetLimit, Category, Tag, Transaction } from '../../../domain/types'

/**
 * Base interface for all Firefly clients
 */
export interface BaseFireflyService {
  /**
   * Получает список счетов из финансового сервиса
   */
  fetchAndSetDefaultAccount: () => Promise<void>
}

/**
 * Interface for transaction management
 */
export interface TransactionManager {
  /**
   * Получает список категорий из финансового сервиса
   */
  getCategories: () => Promise<Category[]>

  /**
   * Получает список тегов (меток) из финансового сервиса
   */
  getTags: () => Promise<Tag[]>

  /**
   * Отправляет транзакцию в финансовый сервис
   */
  sendTransaction: (transaction: Transaction) => Promise<boolean>

  /**
   * Отправляет несколько транзакций в финансовый сервис
   */
  sendTransactions: (transactions: Transaction[]) => Promise<boolean>
}

/**
 * Interface for budget management
 */
export interface BudgetManager {
  /**
   * Получает список лимитов бюджетов из финансового сервиса
   */
  getBudgetLimits: () => Promise<BudgetLimit[]>
}

/**
 * Main interface for financial service client
 * Extends from original interface to ensure compatibility
 */
export interface FinancialServiceClient extends BaseFireflyService, TransactionManager, BudgetManager {}