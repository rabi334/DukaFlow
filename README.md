# DukaFlow

Smart Business Management System for Small and Medium-Sized Businesses in Ethiopia.

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
