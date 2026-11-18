# GatiiFlow

> **Your Business. In Flow With Gatii**  
> *Smart Business Management Platform*

*Formerly named DukaFlow. The product was rebranded to GatiiFlow on November 18, 2026.*

GatiiFlow helps retailers manage sales, inventory, purchases, expenses, staff, and business performance from one connected platform. Engineered for small and medium-sized businesses in Ethiopia with native ETB currency support, dual tax systems (15% VAT inclusive & exclusive), Africa/Addis_Ababa business timezone reconciliation, atomic inventory deductions, and multi-tenant security.

## Architecture

- **`backend/`**: NestJS, TypeScript, Better Auth, Prisma ORM, PostgreSQL
- **`frontend/`**: Next.js 14 App Router, TypeScript, Tailwind CSS, Lucide icons, Recharts

## Setup Instructions

### Prerequisites
- Node.js >= 20
- PostgreSQL >= 15
- pnpm or npm

### Backend Setup
```bash
cd backend
npm install
npx prisma db push
npm run seed
npm run start:dev
```

### Frontend Setup
```bash
cd frontend
npm install
npm run dev
```
