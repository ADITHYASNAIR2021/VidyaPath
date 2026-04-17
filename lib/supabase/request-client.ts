import { getSupabaseAccessTokenFromRequest } from '@/lib/auth/supabase-auth';
import {
  getServiceClient,
  getUserClient,
  isSupabasePublicConfigured,
  isSupabaseServiceConfigured,
} from '@/lib/supabase-rest';

type AnyClient = ReturnType<typeof getServiceClient>;

export type RequestClientPreference =
  | 'user-first'
  | 'service-first'
  | 'user-only'
  | 'service-only';

export interface RequestSupabaseClientResolution {
  client: AnyClient;
  mode: 'user' | 'service';
}

function resolveUserClient(req: Request): AnyClient | null {
  if (!isSupabasePublicConfigured()) return null;
  const accessToken = getSupabaseAccessTokenFromRequest(req);
  if (!accessToken) return null;
  try {
    return getUserClient(accessToken);
  } catch {
    return null;
  }
}

function resolveServiceClient(): AnyClient | null {
  if (!isSupabaseServiceConfigured()) return null;
  try {
    return getServiceClient();
  } catch {
    return null;
  }
}

export function resolveRequestSupabaseClient(
  req: Request,
  preference: RequestClientPreference = 'user-first'
): RequestSupabaseClientResolution | null {
  const userClient = resolveUserClient(req);
  const serviceClient = resolveServiceClient();

  if (preference === 'user-only') {
    return userClient ? { client: userClient, mode: 'user' } : null;
  }
  if (preference === 'service-only') {
    return serviceClient ? { client: serviceClient, mode: 'service' } : null;
  }
  if (preference === 'service-first') {
    if (serviceClient) return { client: serviceClient, mode: 'service' };
    if (userClient) return { client: userClient, mode: 'user' };
    return null;
  }
  if (userClient) return { client: userClient, mode: 'user' };
  if (serviceClient) return { client: serviceClient, mode: 'service' };
  return null;
}
