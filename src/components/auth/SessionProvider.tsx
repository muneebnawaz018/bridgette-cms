'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { Role, Permission } from '@/modules/auth/rbac';

export interface ClientSession {
  userId: string;
  role: Role;
  email: string;
  permissions: Permission[];
}

const SessionContext = createContext<ClientSession | null>(null);

export function SessionProvider({
  value,
  children,
}: {
  value: ClientSession;
  children: ReactNode;
}) {
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): ClientSession {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within a SessionProvider');
  return ctx;
}

/** FE permission check — mirrors the server RBAC so UI can hide/disable actions. */
export function useCan(permission: Permission): boolean {
  const { permissions } = useSession();
  return permissions.includes(permission);
}
