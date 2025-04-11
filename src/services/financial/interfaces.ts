// services/financial/interfaces.ts
import type { BudgetLimit, Category, Tag, Transaction } from '../../domain/types'

export interface FinancialServiceClient {
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
   * Получает список счетов из финансового сервиса
   */
  fetchAndSetDefaultAccount: () => Promise<void>

  /**
   * Отправляет несколько транзакций в финансовый сервис
   */
  sendTransactions: (transactions: Transaction[]) => Promise<boolean>

  /**
   * Проверяет соединение с финансовым сервисом
   */
  checkConnection: () => Promise<boolean>

  /**
   * Получает список лимитов бюджетов из финансового сервиса
   */
  getBudgetLimits: () => Promise<BudgetLimit[]>
}
