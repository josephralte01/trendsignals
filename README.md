# CryptoGuard

## Overview
CryptoGuard is a SaaS platform for tracking cryptocurrency signals, providing users with real-time insights and alerts.

## Tech Stack
- Next.js (with App Router)
- Tailwind CSS
- TypeScript
- Clerk or NextAuth.js for authentication
- Razorpay for one-time and subscription payments
- PostgreSQL via Prisma for data persistence

## Setup
1. Clone the repository.
2. Install dependencies: `npm install`.
3. Set up your `.env.local` file (create one if it doesn't exist) with the required environment variables:
   ```
   # For Razorpay Integration
   RAZORPAY_KEY_ID=your_razorpay_key_id
   RAZORPAY_KEY_SECRET=your_razorpay_key_secret
   RAZORPAY_WEBHOOK_SECRET=your_razorpay_webhook_secret # Create this in Razorpay dashboard and add here

   # Add other environment variables required by the project below
   # e.g., DATABASE_URL, NEXTAUTH_SECRET, etc.
   ```
4. Run the development server: `npm run dev`.