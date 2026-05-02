import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Lock, Sparkles, UserPlus, X } from "lucide-react";
import { authApi } from "@/lib/api";

export function FeatureAuthModal({
  open,
  onClose,
  title,
  subtitle,
  onAuthed,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle: string;
  onAuthed: (token: string) => void;
}) {
  const [authMode, setAuthMode] = useState<"signup" | "login">("signup");
  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupError, setSignupError] = useState("");
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSignupError("");
    setWorking(false);
  }, [open]);

  const doAuth = useCallback(async () => {
    if (!signupEmail.trim()) return;
    setSignupError("");
    setWorking(true);
    try {
      const response =
        authMode === "signup"
          ? await authApi.signup(signupEmail, signupPassword, signupName)
          : await authApi.login(signupEmail, signupPassword);
      onAuthed(response.token);
    } catch (err) {
      setSignupError(err instanceof Error ? err.message : authMode === "signup" ? "Signup failed" : "Login failed");
    } finally {
      setWorking(false);
    }
  }, [authMode, onAuthed, signupEmail, signupName, signupPassword]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center px-6">
      <button
        type="button"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close signup"
      />
      <div className="relative w-full max-w-xl rounded-3xl border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),transparent_24%),rgba(255,255,255,0.03)] p-6 shadow-2xl shadow-black/60 backdrop-blur-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-white">{title}</p>
            <p className="mt-1 text-xs text-white/45">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white/70 hover:bg-white/[0.06] hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {signupError ? (
          <div className="mt-5 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {signupError}
          </div>
        ) : null}

        <div className="mt-5 space-y-3">
          <a
            href={authApi.googleLoginUrl()}
            target="_blank"
            rel="noreferrer"
            className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-2xl border border-white/15 hover:border-violet-500/40 hover:bg-white/5 transition-all text-sm font-semibold cursor-pointer"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </a>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/10" />
            </div>
            <div className="relative flex justify-center text-xs text-white/30">
              <span className="px-3 py-0.5 rounded bg-black/30 border border-white/10 backdrop-blur">
                {authMode === "signup" ? "Or sign up with email" : "Or continue with email"}
              </span>
            </div>
          </div>

          {authMode === "signup" ? (
            <input
              value={signupName}
              onChange={(e) => setSignupName(e.target.value)}
              placeholder="Full name"
              className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400/30"
            />
          ) : null}

          <input
            value={signupEmail}
            onChange={(e) => setSignupEmail(e.target.value)}
            placeholder="Email"
            type="email"
            className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400/30"
          />

          <input
            value={signupPassword}
            onChange={(e) => setSignupPassword(e.target.value)}
            placeholder={authMode === "signup" ? "Password (min 6 chars)" : "Password"}
            type="password"
            className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400/30"
          />

          <button
            type="button"
            onClick={doAuth}
            disabled={!signupEmail.trim() || (authMode === "signup" ? signupPassword.length < 6 : signupPassword.length < 1) || working}
            className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-purple-500 px-4 py-3 text-sm font-semibold text-white hover:from-violet-500 hover:to-purple-400 disabled:opacity-50"
          >
            {authMode === "signup" ? <UserPlus className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
            {working ? (authMode === "signup" ? "Creating account…" : "Logging in…") : (authMode === "signup" ? "Sign up and continue" : "Log in and continue")}
          </button>

          <button
            type="button"
            onClick={() => {
              setSignupError("");
              setAuthMode((mode) => (mode === "signup" ? "login" : "signup"));
            }}
            className="w-full inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-semibold text-white/75 hover:bg-white/[0.06] hover:text-white"
          >
            {authMode === "signup" ? "Already have an account? Log in" : "New here? Create a free account"}
          </button>

          <div className="mt-2 flex items-center justify-between text-xs text-white/40">
            <span className="inline-flex items-center gap-2">
              <Lock className="w-4 h-4 text-emerald-200" />
              No credit card required
            </span>
            <span className="inline-flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-violet-200" />
              Takes under 30 seconds
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

