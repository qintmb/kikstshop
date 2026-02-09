"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Loader2, Mail, Lock, Eye, EyeOff } from "lucide-react";
import Image from "next/image";
import { supabase, hasSupabaseEnv } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasSupabaseEnv) {
      setError("Supabase not configured");
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    if (mode === "login") {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setError(signInError.message);
        setLoading(false);
        return;
      }

      router.push("/dashboard");
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm"
      >
        {/* Logo & Header */}
        <div className="text-center mb-8">
          <Image
            src="/kikstshop_icon.webp"
            alt="Kikstshop Logo"
            width={100}
            height={100}
            className="h-24 w-24 object-contain mx-auto mb-4"
          />
          <h1 className="text-2xl font-bold text-foreground">KIKSTSHOP</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {mode === "login" ? "Masuk ke akun Anda" : ""}
          </p>
        </div>

        {/* Form Card */}
        <div className="card p-6">
          {!hasSupabaseEnv && (
            <div className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-700">
              Database belum dikonfigurasi.
            </div>
          )}

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700"
            >
              {error}
            </motion.div>
          )}

          {success && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4 rounded-lg bg-sky-50 p-3 text-sm text-sky-700"
            >
              {success}
            </motion.div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">
                Email
              </label>
              <div className="relative">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input-base pl-10"
                  placeholder="email@kikst.com"
                  required
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-base pl-10 pr-10"
                  placeholder="••••••••"
                  required
                  minLength={6}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="btn-primary mt-2"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {mode === "login" ? "Masuk..." : "Mendaftar..."}
                </>
              ) : mode === "login" ? (
                "Masuk"
              ) : (
                "Daftar"
              )}
            </button>
          </form>
        </div>
        {/* Footer */}
        <p className="mt-8 text-center text-xs text-muted-foreground">
          © 2026 Kikstshop. All rights reserved.
        </p>
      </motion.div>
    </div>
  );
}
