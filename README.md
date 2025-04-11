# Firefly Finance Bot

A Telegram bot for processing financial receipts and payment screenshots using AI (OpenRouter/Claude-3) and integrating with Firefly-III for personal finance management.

## Key Features

- 📸 Process receipt photos via Telegram
- 🤖 AI-powered transaction extraction (OpenRouter/Claude-3)
- 🔄 Firefly-III integration
- 🖼️ Multi-photo support
- ✅ Transaction confirmation flow
- ✏️ Transaction refinement capability

## Technologies Used

- **Backend**: TypeScript, Node.js
- **Telegram**: Telegraf framework
- **AI**: OpenRouter with Claude-3 model
- **Finance**: Firefly-III API
- **Validation**: Zod schema validation

## Usage Examples

### Basic Workflow

1. Start the bot with `/start` command
2. Send a photo of your receipt
3. Add optional comments about the transaction
4. Review AI-extracted transaction details
5. Confirm or refine the transaction

```plaintext
User: /start
Bot: Hello! Send me a photo of a receipt...

User: [sends receipt photo]
Bot: I received your receipt photo. Add a comment or type "next"...

User: Grocery shopping at Whole Foods
Bot: Processing the receipt(s), please wait...

Bot: [shows extracted transaction details]
- Amount: $125.50
- Category: Groceries
- Description: Whole Foods Market #123
[Confirm] [Refine] [Cancel]
```

### Multi-Photo Handling

1. Send multiple photos in a single message (media group)
2. Bot will process all photos together
3. AI will combine information from all receipts

```plaintext
User: [sends 3 receipt photos in one message]
Bot: I received 3 photos. Processing them together...
```

### Transaction Refinement

1. If details are incorrect, click "Refine"
2. Provide corrections in text
3. Bot will reprocess with your input

```plaintext
Bot: [shows extracted transaction]
- Amount: $25.00
- Category: Dining
[Confirm] [Refine] [Cancel]

User: [clicks Refine]
Bot: Okay, please provide corrections...

User: Amount should be $28.50, category should be Bars
Bot: Processing your refinement...
```

### Error Handling

- If processing fails, bot will:
  - Automatically retry (up to 3 times)
  - Provide error details
  - Allow restarting the process

## Installation & Configuration

1. Clone the repository
2. Install dependencies: `yarn install`
3. Configure environment variables (see `.env.example`)
4. Start the bot: `yarn dev`

Required environment variables:

- `TELEGRAM_TOKEN` - Your Telegram bot token
- `FIREFLY_API_URL` - Firefly-III instance URL
- `FIREFLY_ACCESS_TOKEN` - Firefly-III access token
- `OPENROUTER_API_KEY` - OpenRouter API key

## Architecture Overview

The bot follows a modular architecture:

```
src/
├── bot/          # Telegram bot handlers
├── config/       # Configuration types
├── domain/       # Core domain types
├── services/     # External service integrations
│   ├── ai/       # OpenRouter AI service
│   └── financial/ # Firefly-III service
└── utils/        # Utility functions
```

Key components:

- **FinanceBot**: Main bot class handling Telegram interactions
- **ReceiptProcessor**: Coordinates AI and financial service integration
- **AISDKClient**: OpenRouter AI service implementation
- **FireflyFinancialServiceClient**: Firefly-III API client

## Development

- Build: `yarn build`
- Lint: `yarn lint`
- Type checking: `yarn typecheck`

## License

MIT
