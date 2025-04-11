import * as fs from 'node:fs'
import * as path from 'node:path'

import { PROMPT_TEMPLATE_FILE } from '../constants'

export function loadPromptTemplate(projectRoot: string): string {
  const promptFilePath = path.join(projectRoot, PROMPT_TEMPLATE_FILE)

  try {
    // Проверяем наличие файла
    if (fs.existsSync(promptFilePath)) {
      // Читаем содержимое файла
      return fs.readFileSync(promptFilePath, 'utf8')
    }

    console.warn(`Файл шаблона промпта не найден: ${promptFilePath}. Используем шаблон по умолчанию.`)

    return ''
  }
  catch (error) {
    console.error(`Ошибка при чтении файла шаблона промпта: ${error}`)

    return ''
  }
}
