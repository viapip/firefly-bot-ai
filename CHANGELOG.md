# Changelog


## v0.0.5


### 🚀 Enhancements

- **package.json): add ai-sdk/openai, ai, zod-to-json-schema dependencies feat(package.json:** Add zod-to-json-schema to pkgroll external option (f268a90)
- Enhance bot to process text-based transactions and improve message handling (5581c11)
- Add Cursor AI rules for project structure and task lists (cb43afd)
- **docker-compose:** Add image field to firefly-bot service to specify the image to use (1ab07d8)

### 🩹 Fixes

- **package.json): update package version to 0.0.2 feat(bot:** Add refinement next keyboard to handleNextCommand (b83e35c)

### 💅 Refactors

- **ai-sdk-client:** Reformat system prompt template for improved readability (dbdbca8)
- **bot:** Refactor callback query handling to use a map of handlers (0309540)
- Improve code structure and add logging (dc0f3a9)
- **services:** Restructure AI and Financial services for modularity (2db454d)

### 🏡 Chore

- **package.json:** Update package version from 0.0.2 to 0.0.3 (4287979)
- **package.json:** Bump version to 0.0.4 (d8f7be3)
- Update gitignore to ignore all files in .claude directory chore: add newline at the end of changelogen.config.json (8ae8d1c)

### 🎨 Styles

- Change double quotes to single quotes in index.ts refactor(firefly-client): remove unused interfaces and comments refactor(firefly-client): improve default account fetching logic refactor(firefly-client): remove checkConnection method and related checks refactor(firefly-client): simplify sendTransaction and sendTransactions methods refactor(firefly-client): improve getBudgetLimits method and data mapping refactor(interfaces): remove checkConnection method from FinancialServiceClient interface (78fc4d7)

### 🤖 CI

- Add GitHub Actions workflow for Docker build and publish (c37744f)

### ❤️ Contributors

- Aleksandr <starcev.sash@gmail.com>

