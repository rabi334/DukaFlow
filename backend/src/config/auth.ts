import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { organization, bearer } from 'better-auth/plugins';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET || 'dukaflow_super_secret_auth_key_2026_very_secure_string_min_32_chars',
  baseURL: process.env.BETTER_AUTH_URL || 'http://localhost:5000',
  database: prismaAdapter(prisma, {
    provider: 'postgresql',
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },
  plugins: [
    organization({
      allowUserToCreateOrganization: true,
    }),
    bearer(),
  ],
});
