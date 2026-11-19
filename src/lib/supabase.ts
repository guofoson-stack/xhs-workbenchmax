import "server-only";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/** 服务端专用客户端（service_role），只能在服务端代码里用 */
export function db(): SupabaseClient {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("缺少 SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY 环境变量");
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}
