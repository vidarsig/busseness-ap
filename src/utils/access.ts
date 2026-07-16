import { AppUser, UserPermissions, View } from '../types';

export interface SessionLike {
  email: string;
}

/**
 * Resolve which permissions to enforce for the logged-in user.
 *
 * Returns `null` when access should be UNRESTRICTED:
 *   - no team is configured (solo mode), or
 *   - the logged-in account is not a listed team member (the account owner
 *     who set up sync but isn't in the Users list).
 *
 * Returns a UserPermissions object only for an explicitly listed team
 * member, whose nav is then constrained by those permissions.
 */
export function resolvePermissions(
  sessionUser: SessionLike | null | undefined,
  appUsers: AppUser[],
): UserPermissions | null {
  if (!appUsers || appUsers.length === 0) return null; // solo mode → full access
  if (!sessionUser?.email) return null;
  const me = appUsers.find(
    au => au.email.toLowerCase() === sessionUser.email.toLowerCase(),
  );
  if (!me) return null; // account owner not in team list → full access
  return me.permissions;
}

/**
 * Whether a given screen is visible/reachable for the resolved permissions.
 * `perms === null` means unrestricted (everything allowed).
 */
export function canAccessView(view: View, perms: UserPermissions | null): boolean {
  if (perms === null) return true;
  // An explicit per-screen override always wins over the grouped flags below.
  const override = perms.viewOverrides?.[view];
  if (override !== undefined) return override;
  switch (view) {
    // Always available
    case 'dashboard':
    case 'tasks':
    case 'upgrade':
    case 'reviews':
      return true;

    // Financials: transactions, accounting, VAT, reports, AI
    case 'transactions':
    case 'recurring':
    case 'bankimport':
    case 'rules':
    case 'accounts':
    case 'budget':
    case 'vat':
    case 'vatreturn':
    case 'reports':
    case 'annual':
    case 'ai':
      return perms.canViewFinancials;

    case 'invoices':
      return perms.canViewInvoices;
    case 'jobs':
      return perms.canViewJobs;
    case 'stock':
    case 'suppliers':
      return perms.canViewStock;
    case 'contacts':
      return perms.canViewInvoices || perms.canViewStock;
    case 'payroll':
      return perms.canViewPayroll;

    // Admin-only screens
    case 'settings':
    case 'users':
      return perms.canViewSettings;

    default:
      return true;
  }
}
