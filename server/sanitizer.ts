/**
 * User Sanitizer Module
 * Strictly enforces that passwords, hashes, and internal security fields
 * are completely omitted from API responses across all endpoints.
 */

export interface PublicUser {
  id: string;
  username: string;
  fullName: string;
  phoneNumber: string;
  role: string;
  agentCode: string | null;
  shippingCompanyId: string | null;
  isEnabled: boolean;
  isOnline?: boolean;
  lastSeenAt?: string | null;
  mustChangePassword?: boolean;
}

/**
 * Sanitizes a raw database user record into a safe PublicUser object.
 * Uses a strict allowlist of public fields so no passwords, hashes,
 * tokens, or internal security fields can ever leak.
 */
export function sanitizeUser(rawUser: any, extra?: { isOnline?: boolean; lastSeenAt?: string | null }): PublicUser {
  if (!rawUser || typeof rawUser !== "object") {
    return {
      id: "",
      username: "",
      fullName: "",
      phoneNumber: "",
      role: "GUEST",
      agentCode: null,
      shippingCompanyId: null,
      isEnabled: false
    };
  }

  const sanitized: PublicUser = {
    id: String(rawUser.id || ""),
    username: String(rawUser.username || ""),
    fullName: String(rawUser.fullName || rawUser.username || ""),
    phoneNumber: String(rawUser.phoneNumber || ""),
    role: String(rawUser.role || "GUEST"),
    agentCode: rawUser.agentCode ? String(rawUser.agentCode) : null,
    shippingCompanyId: rawUser.shippingCompanyId ? String(rawUser.shippingCompanyId) : null,
    isEnabled: Boolean(rawUser.isEnabled),
    mustChangePassword: rawUser.mustChangePassword !== undefined ? Boolean(rawUser.mustChangePassword) : undefined
  };

  const lastSeen = extra?.lastSeenAt !== undefined ? extra.lastSeenAt : rawUser.lastSeenAt;
  if (lastSeen !== undefined && lastSeen !== null) {
    sanitized.lastSeenAt = String(lastSeen);
  }

  if (extra?.isOnline !== undefined) {
    sanitized.isOnline = Boolean(extra.isOnline);
  } else if (rawUser.isOnline !== undefined) {
    sanitized.isOnline = Boolean(rawUser.isOnline);
  }

  return sanitized;
}

/**
 * Sanitizes an array of user objects.
 */
export function sanitizeUsers(users: any[], getExtra?: (user: any) => { isOnline?: boolean; lastSeenAt?: string | null }): PublicUser[] {
  if (!Array.isArray(users)) return [];
  return users.map(user => sanitizeUser(user, getExtra ? getExtra(user) : undefined));
}
