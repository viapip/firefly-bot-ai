# Firefly Finance Bot

A Telegram bot that processes receipt images and payment screenshots, extracting transaction details and sending them to an external financial service.

## Features

- Process photos of receipts and payment confirmations
- Extract transaction details using AI/CV
- Categorize transactions based on available categories from financial service
- Request user confirmation before saving transactions
- Send confirmed transactions to external financial service

## Development Setup

### Prerequisites

- Node.js (v18 or later)
- Yarn package manager

### Installation

1. Clone the repository
2. Install dependencies:
   ```
   yarn install
   ```
3. Create a `.env` file in the project root with:
   ```
   BOT_TOKEN=your_telegram_bot_token
   ```

### Running the Bot

Development mode:
```
yarn dev
```

Production mode:
```
yarn build
yarn start
```

## License

MIT
