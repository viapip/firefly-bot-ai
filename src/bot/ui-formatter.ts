import { Markup } from 'telegraf'

import type { Transaction } from '../domain/types'

import { CALLBACK_DATA_CANCEL, CALLBACK_DATA_CONFIRM, CALLBACK_DATA_NEXT, CALLBACK_DATA_REFINE, CALLBACK_DATA_RETRY } from '../constants'

const NO_TAGS_PLACEHOLDER = 'No tags'
const DATE_NOT_AVAILABLE_PLACEHOLDER = 'N/A'

export class UIFormatter {
  public getConfirmationKeyboard() {
    return {
      reply_markup: {
        inline_keyboard: [
          [
            { callback_data: CALLBACK_DATA_CONFIRM, text: '✅ Confirm' },
            { callback_data: CALLBACK_DATA_REFINE, text: '🔄 Refine' },
            { callback_data: CALLBACK_DATA_CANCEL, text: '❌ Cancel' },
          ],
        ],
      },
    }
  }

  public getRetryKeyboard() {
    return {
      reply_markup: {
        inline_keyboard: [
          [
            { callback_data: CALLBACK_DATA_RETRY, text: '🔄 Retry' },
            { callback_data: CALLBACK_DATA_CANCEL, text: '❌ Cancel' },
          ],
        ],
      },
    }
  }

  public getRefinementNextKeyboard() {
    return Markup.inlineKeyboard([Markup.button.callback('Next', CALLBACK_DATA_NEXT)])
  }

  public formatSingleTransaction(transaction: Transaction): string {
    let output = `Amount: ${transaction.amount}
Date: ${transaction.date.toLocaleString()}
Category: ${transaction.category.name}
Description: ${transaction.description}
Destination: ${transaction.destination || 'N/A'}`

    if (transaction.budgetName) {
      output += `\nBudget: ${transaction.budgetName}`
      if (transaction.budgetRemaining !== undefined) {
        output += ` (Remaining: ${transaction.budgetRemaining.toFixed(2)})`
      }
    }

    output += `\nTags: ${transaction.tags?.join(', ') || NO_TAGS_PLACEHOLDER}`

    return output
  }

  public calculateTotalAmount(transactions: Transaction[]): number {
    return transactions.reduce((total, currentTransaction) => {
      return total + currentTransaction.amount
    }, 0)
  }

  public generateAIResponseMessage(transactions: Transaction[]): string {
    if (transactions.length === 1) {
      return `I analyzed the receipt:\n${this.formatSingleTransaction(transactions[0])}`
    }

    return `I analyzed the receipt and found ${transactions.length} different categories:\n\n${
      transactions.map((transaction, index) => {
        return `Transaction ${index + 1}:\n${this.formatSingleTransaction(transaction)}`
      })
        .join('\n\n')}`
  }

  public formatSingleTransactionConfirmation(transaction: Transaction): string {
    return `
Receipt processing result:
${this.formatSingleTransaction(transaction)}

Is everything correct? Confirm to save, Refine to add details, or Cancel.
    `
  }

  public formatMultipleTransactionsConfirmation(transactions: Transaction[]): string {
    const totalAmount = this.calculateTotalAmount(transactions)

    const transactionsDescription = transactions.map((t, index) => {
      return `${index + 1} ------ \n${this.formatSingleTransaction(t)}`
    })
      .join('\n\n')

    return `
Receipt processed into ${transactions.length} separate transactions:
${transactionsDescription}

Total amount: ${totalAmount}
Group title: ${transactions[0]?.groupTitle || 'N/A'}
Date: ${transactions[0]?.date?.toLocaleString() || DATE_NOT_AVAILABLE_PLACEHOLDER}

Is everything correct? Confirm to save all, Refine to add details, or Cancel.
    `
  }

  public formatSuccessMessage(transactions: Transaction[]): string {
    if (transactions.length === 1) {
      const [transaction] = transactions

      return `Transaction successfully sent! 🎉
Amount: ${transaction.amount}
Category: ${transaction.category.name}`
    }

    const totalAmount = this.calculateTotalAmount(transactions)
    const categoriesSummary = transactions
      .map((t) => {
        return `- ${t.category.name}: ${t.amount}`
      })
      .join('\n')

    return `${transactions.length} transactions successfully sent! 🎉
${categoriesSummary}
Total amount: ${totalAmount}`
  }
}
