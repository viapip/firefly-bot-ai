# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build/Lint Commands

- Build: `yarn build`
- Lint: `yarn lint`
- Type check: `yarn typecheck`
- Development: `yarn dev`
- Start production: `yarn start`

## Code Style Guidelines

- Use single quotes for strings
- Follow TypeScript strict mode guidelines
- Define types with interfaces in appropriate files under domain/types.ts
- Use explicit typing for all properties (avoid any)
- Mark optional properties with ? suffix
- Use ES modules import format
- Use kebab-case for file naming
- Use Zod for schema validation
- Organize imports: external dependencies first, then internal modules
- Handle errors with appropriate try/catch blocks and logging
- Follow functional programming principles where appropriate
- Keep functions small and focused on a single responsibility

## Project Structure

- `/src/bot`: Telegram bot implementation
  - `factory.ts`: Bot instance creation
  - `finance-bot.ts`: Main bot functionality for financial operations
  - `index.ts`: Entry point for bot setup
  - `media-group-handler.ts`: Handles media group messages
  - `receipt-processor.ts`: Processes receipt images and extracts data
  - `ui-formatter.ts`: Formats UI elements for Telegram
- `/src/config`: Configuration handling
  - `types.ts`: Configuration type definitions
- `/src/domain`: Type definitions and domain models
  - `types.ts`: Core domain types
- `/src/services`: External service integrations
  - `/ai`: AI service integration
    - `ai-sdk-client.ts`: Client for AI service
    - `interfaces.ts`: AI service interfaces
    - `schemas.ts`: AI request/response schemas
  - `/conversation`: Conversation management
    - `interfaces.ts`: Conversation interfaces
    - `manager.ts`: Conversation state management
  - `/financial`: Financial service integration
    - `firefly-client.ts`: Client for Firefly III API
    - `interfaces.ts`: Financial service interfaces
- `/src/utils`: Shared utility functions
  - `file.ts`: File handling utilities
  - `index.ts`: General utilities
