# Macky Oil & Gas POS

A modern Point of Sale system for gas stations built with React, Vite, and Supabase.

## Features

- **Admin Dashboard** - Overview of sales, cashiers, and fuel prices
- **POS Interface** - Full-screen cashier interface for fuel and product sales
- **Daily Reports** - Comprehensive daily sales reporting
- **Inventory Management** - Track products and fuel stock
- **Customer Management** - Manage customer accounts and purchase orders
- **Multi-branch Support** - Handle multiple gas station branches
- **QR Code Authentication** - Cashier login via QR code scanning
- **Audit Logging** - Track all system actions

## Tech Stack

- **Frontend**: React 18, Vite, TailwindCSS
- **Backend**: Supabase (PostgreSQL, Auth, Realtime)
- **Icons**: Lucide React
- **Date Handling**: date-fns
- **State Management**: Zustand

## Local Development

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file with your Supabase credentials:
   ```
   VITE_SUPABASE_URL=your_supabase_project_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```
4. Start the development server:
   ```bash
   npm run dev
   ```

## Vercel Deployment

### Environment Variables

Set these environment variables in your Vercel project settings:

| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | Your Supabase project URL (e.g., `https://xxxxx.supabase.co`) |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase anonymous/public key |

### Deploy Steps

1. Push your code to GitHub
2. Import the repository in Vercel
3. Add the environment variables above
4. Deploy!

### Build Settings (Auto-detected)

- **Framework Preset**: Vite
- **Build Command**: `npm run build`
- **Output Directory**: `dist`

## Supabase Setup

Make sure your Supabase project has the following tables:
- `profiles` - Admin user profiles
- `branches` - Gas station branches
- `cashiers` - Cashier accounts
- `fuel_types` - Fuel type definitions and prices
- `cash_sales` - Fuel cash sales records
- `purchase_orders` - Credit/PO transactions
- `products` - Store products inventory
- `product_sales` - Product sales records
- `attendance` - Cashier attendance logs
- `audit_logs` - System audit trail
- `daily_reports` - Daily report summaries
- `expenses` - Expense records

## License

Private - Macky Oil & Gas
