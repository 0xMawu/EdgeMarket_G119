# EdgeMarket

EdgeMarket is a mobile app that lets you track prediction market traders on Polymarket, follow their trades, and copy them using paper trading.

## What the app does

- **Leaderboard** – shows the top 20 traders ranked by profit
- **Following** – the traders you are following
- **Signals** – live feed of trades from traders you follow
- **Discover** – browse active Polymarket prediction markets
- **Profile** – your account, wallet, P&L stats, and subscription settings

## Tech stack

- React Native + Expo (frontend)
- Spring Boot + PostgreSQL on Neon (backend)
- Paystack for payments
- SendGrid for email verification

## Running locally

### Prerequisites

- Node.js 18+
- Java 17+
- An Android emulator or physical device

### Start the backend

```bash
cd spring-server
# Set your environment variables first (see below)
./mvnw spring-boot:run
```

### Start the frontend

```bash
npm install
npx expo start --android
```

### Environment variables

Create a `.env` file in the project root:

```
DB_PASSWORD=your_neon_db_password
JWT_SECRET=your_jwt_secret_base64
SENDGRID_API_KEY=your_sendgrid_key
SENDGRID_FROM_EMAIL=your_from_email
PAYSTACK_SECRET_KEY=sk_test_your_key
PAYSTACK_PLAN_CODE=PLN_your_plan_code
```

## How to use the app

1. Sign up with your email and verify it with the 6-digit code
2. Browse the Leaderboard to find traders you want to follow
3. Tap **Follow** on a trader to add them to your Following list
4. Go to **Signals** to see their trades in real time
5. On any open position, tap **Copy** to paper trade it
6. View your paper portfolio and P&L on the **Profile** screen
7. Upgrade to Premium ($15/month via Paystack) for up to 50 positions per trader and full copy trading access

## Project structure

```
App.tsx                        # app entry point
src/
  screens/                     # one file per screen
  components/                  # reusable UI components
  hooks/                       # data fetching and state logic
  context/                     # auth state (login, logout, JWT)
  navigation/                  # tab and stack navigators
  theme/                       # colors, fonts, spacing tokens
  utils/                       # helper functions
  config/api.ts                # backend URL config
spring-server/                 # Spring Boot backend
  src/main/java/com/edgemarket/
    controller/                # REST endpoints
    service/                   # business logic
    config/                    # JWT filter, CORS
    exception/                 # custom exceptions
    model/                     # DTOs
  src/main/resources/
    schema.sql                 # database schema
    application.properties     # server config
```
