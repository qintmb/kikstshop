import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Keep runtime alive, UI will show missing env warning.
  console.warn("Supabase environment variables are missing.");
}

export const supabase = createClient(
  supabaseUrl ?? "https://missing-project.supabase.co",
  supabaseAnonKey ?? "missing-anon-key",
  {
    auth: {
      persistSession: false,
    },
  },
);

export const hasSupabaseEnv = Boolean(supabaseUrl && supabaseAnonKey);
