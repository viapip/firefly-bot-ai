import { createLogger } from '../../utils/logger'

const logger = createLogger('BaseFireflyClient')

/**
 * Base client for interacting with the Firefly III API
 * Contains common functionality for all Firefly III interactions
 */
export class BaseFireflyClient {
  protected baseUrl: string
  protected personalAccessToken: string

  constructor(baseUrl: string, personalAccessToken: string) {
    this.baseUrl = baseUrl
    this.personalAccessToken = personalAccessToken
    logger.debug('BaseFireflyClient initialized')
  }

  /**
   * Creates standard headers for Firefly API requests
   */
  protected getHeaders(): HeadersInit {
    return {
      'Accept': 'application/json',
      'Authorization': `Bearer ${this.personalAccessToken}`,
      'Content-Type': 'application/json',
    }
  }

  /**
   * Handles API errors uniformly
   */
  protected async handleApiError(response: Response, operation: string): Promise<never> {
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
   * Performs a GET request to the Firefly III API
   */
  protected async get<T>(endpoint: string, queryParams: Record<string, string> = {}): Promise<T> {
    try {
      const url = new URL(`${this.baseUrl}/api/v1/${endpoint}`)

      // Add query parameters if any
      for (const [key, value] of Object.entries(queryParams)) {
        url.searchParams.append(key, value)
      }

      logger.debug(`GET request to ${url.toString()}`)

      const response = await fetch(url.toString(), {
        headers: this.getHeaders(),
        method: 'GET',
      })

      if (!response.ok) {
        await this.handleApiError(response, `GET ${endpoint}`)
      }

      return await response.json() as T
    }
    catch (error) {
      logger.error(`Error in GET request to ${endpoint}:`, error)
      throw new Error(`Failed GET request to ${endpoint}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Performs a POST request to the Firefly III API
   */
  protected async post<T, R>(endpoint: string, data: T): Promise<R> {
    try {
      const url = `${this.baseUrl}/api/v1/${endpoint}`
      logger.debug(`POST request to ${url}`)

      const response = await fetch(url, {
        body: JSON.stringify(data),
        headers: this.getHeaders(),
        method: 'POST',
      })

      if (!response.ok) {
        await this.handleApiError(response, `POST ${endpoint}`)
      }

      return await response.json() as R
    }
    catch (error) {
      logger.error(`Error in POST request to ${endpoint}:`, error)
      throw new Error(`Failed POST request to ${endpoint}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Performs a PUT request to the Firefly III API
   */
  protected async put<T, R>(endpoint: string, data: T): Promise<R> {
    try {
      const url = `${this.baseUrl}/api/v1/${endpoint}`
      logger.debug(`PUT request to ${url}`)

      const response = await fetch(url, {
        body: JSON.stringify(data),
        headers: this.getHeaders(),
        method: 'PUT',
      })

      if (!response.ok) {
        await this.handleApiError(response, `PUT ${endpoint}`)
      }

      return await response.json() as R
    }
    catch (error) {
      logger.error(`Error in PUT request to ${endpoint}:`, error)
      throw new Error(`Failed PUT request to ${endpoint}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Performs a DELETE request to the Firefly III API
   */
  protected async delete(endpoint: string): Promise<boolean> {
    try {
      const url = `${this.baseUrl}/api/v1/${endpoint}`
      logger.debug(`DELETE request to ${url}`)

      const response = await fetch(url, {
        headers: this.getHeaders(),
        method: 'DELETE',
      })

      if (!response.ok) {
        await this.handleApiError(response, `DELETE ${endpoint}`)
      }

      return true
    }
    catch (error) {
      logger.error(`Error in DELETE request to ${endpoint}:`, error)
      throw new Error(`Failed DELETE request to ${endpoint}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}
