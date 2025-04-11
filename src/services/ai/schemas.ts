import { z } from 'zod'

const DATE_TIME_REGEX = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/
const DATE_TIME_FORMAT_DESC = 'YYYY-MM-DD HH:mm format'
// Zod schema descriptions
const transactionAmountDesc = 'Transaction amount'
const budgetIdDesc = 'Budget ID to which this transaction belongs (required)'
const categoryIdDesc = 'Category ID for this transaction'
const dateTimeDesc = `Transaction date and time in ${DATE_TIME_FORMAT_DESC}. If the time is not specified in the receipt, use the current time.`
const transactionDesc = 'Brief description of the transaction'
const destinationDesc = 'Name of the payee/store (if known)'
const tagsDesc = `Array of tags for the transaction. At least {{minTags}} tags are required.`
const commonDateTimeDesc = `Common date and time for all transactions in ${DATE_TIME_FORMAT_DESC}. If the time is not specified in the receipt, use the current time.`
const groupTitleDesc = 'Common title for a group of transactions if they are split by category'
const requiresSplitDesc = 'Whether the receipt needs to be split into multiple transactions for different categories, budgets, or with different evaluation tags'
const transactionsArrayDesc = `Array of transactions. If splitting is required, include all necessary transactions with the correct categories, budgets, and tags. Each transaction should have at least {{minTags}} tags.`

/**
 * Creates a schema for a single transaction with date field
 * @param minTags Minimum number of tags required for each transaction
 */
export function createSingleTransactionSchema(minTags: number) {
  return z.object({
    amount: z.number()
      .describe(transactionAmountDesc),
    budgetId: z.string()
      .describe(budgetIdDesc),
    categoryId: z.string()
      .describe(categoryIdDesc),
    date: z
      .string()
      .regex(DATE_TIME_REGEX, `Date and time must be in ${DATE_TIME_FORMAT_DESC}`)
      .describe(dateTimeDesc),
    description: z.string()
      .describe(transactionDesc),
    destination: z.string()
      .optional()
      .describe(destinationDesc),
    tags: z.array(z.string())
      .min(minTags)
      .describe(tagsDesc.replace('{{minTags}}', String(minTags))),
  })
}

/**
 * Creates a base transaction schema without date field (for use in multi-transaction contexts)
 * @param minTags Minimum number of tags required for each transaction
 */
export function createTransactionSchema(minTags: number) {
  return z.object({
    amount: z.number()
      .describe(transactionAmountDesc),
    budgetId: z.string()
      .describe(budgetIdDesc),
    categoryId: z.string()
      .describe(categoryIdDesc),
    description: z.string()
      .describe(transactionDesc),
    destination: z.string()
      .optional()
      .describe(destinationDesc),
    tags: z.array(z.string())
      .min(minTags)
      .describe(tagsDesc.replace('{{minTags}}', String(minTags))),
  })
}

/**
 * Creates a schema for multiple transactions with a common date
 * @param minTags Minimum number of tags required for each transaction
 */
export function createMultipleTransactionsSchema(minTags: number) {
  return z.object({
    date: z
      .string()
      .regex(DATE_TIME_REGEX, `Date and time must be in ${DATE_TIME_FORMAT_DESC}`)
      .describe(commonDateTimeDesc),
    groupTitle: z.string()
      .optional()
      .describe(groupTitleDesc),
    requiresSplit: z.boolean()
      .describe(requiresSplitDesc),
    transactions: z.array(createTransactionSchema(minTags))
      .describe(transactionsArrayDesc.replace('{{minTags}}', String(minTags))),
  })
}
