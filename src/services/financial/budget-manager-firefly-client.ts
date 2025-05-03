import type { BudgetLimit } from '../../domain/types'
import type { FireflyBudgetsResponse } from './interfaces/firefly-types'
import type { BudgetManager } from './interfaces/service-interfaces'

import { createLogger } from '../../utils/logger'
import { BaseFireflyClient } from './base-firefly-client'

const logger = createLogger('BudgetManagerFireflyClient')

/**
 * Client for managing budgets in Firefly III
 */
export class BudgetManagerFireflyClient extends BaseFireflyClient implements BudgetManager {
  constructor(baseUrl: string, personalAccessToken: string) {
    super(baseUrl, personalAccessToken)
    logger.debug('BudgetManagerFireflyClient initialized')
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

      logger.debug(`Fetching budgets from ${startDateString} to ${endDateString}`)

      const queryParams = {
        end: endDateString,
        start: startDateString,
      }

      const data = await this.get<FireflyBudgetsResponse>('budgets', queryParams)
      logger.debug(`Retrieved ${data.data?.length || 0} budget limits`)

      return (data.data || []).map((budget): BudgetLimit => {
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
