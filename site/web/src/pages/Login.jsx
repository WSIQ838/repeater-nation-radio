import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogIn, Mail, Lock, Loader2 } from "lucide-react";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import AuthLayout from "@/components/AuthLayout";
import GoogleIcon from "@/components/GoogleIcon";
import FacebookIcon from "@/components/FacebookIcon";
import AppleIcon from "@/components/AppleIcon";
import MicrosoftIcon from "@/components/MicrosoftIcon";
import VerifyEmailHelp from "@/components/VerifyEmailHelp";
import { toast } from "@/components/ui/use-toast";
import { safeReturnTo } from "@/lib/authReturnTo";

// Base44 won't log in an account whose email was never verified ("Please verify
// your email before logging in..."), and it doesn't send a new code when it says
// so. Anyone who closed the sign-up page before entering their code would be stuck,
// so that error switches this page to its own code screen instead.
const NEEDS_VERIFY = /verify your email/i;

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(() => new URLSearchParams(window.location.search).get("error") || "");
  const [loading, setLoading] = useState(false);
  const [showOtp, setShowOtp] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  // Seconds until "Resend" can be pressed again (only the newest code works).
  const [resendIn, setResendIn] = useState(0);
  useEffect(() => {
    if (resendIn <= 0) return undefined;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);
  // Post-login destination (e.g. the MCP OAuth consent page sends users here
  // with returnTo so the grant flow can resume). Same-origin paths only.
  const returnTo = safeReturnTo();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await base44.auth.loginViaEmailPassword(email, password);
      window.location.href = returnTo;
    } catch (err) {
      if (NEEDS_VERIFY.test(err.message || "")) await sendCode();
      else setError(err.message || "Invalid email or password");
    } finally {
      setLoading(false);
    }
  };

  // Sends a fresh email code and shows the code screen.
  const sendCode = async () => {
    setError("");
    if (!email.trim()) { setError("Enter your email above first, then press Verify your email."); return; }
    try {
      await base44.auth.resendOtp(email);
      setOtpCode("");
      setShowOtp(true);
      setResendIn(30);
    } catch (err) {
      const msg = err.message || "";
      if (/not found/i.test(msg)) setError("We couldn't find an account with that email. Check the spelling, or create an account below.");
      else if (/already verified/i.test(msg)) setError("That email is already verified. Log in with your password.");
      else setError(msg || "Couldn't send a code. Try again in a moment.");
    }
  };

  const handleResend = async () => {
    setError("");
    try {
      await base44.auth.resendOtp(email);
      setResendIn(30);
      setOtpCode("");
      toast({ title: "New code sent", description: `Check ${email} (and your Spam folder). Use the code from the newest email.` });
    } catch (err) {
      setError(err.message || "Failed to resend code");
    }
  };

  const handleVerifyCode = async () => {
    setError("");
    setLoading(true);
    try {
      const result = await base44.auth.verifyOtp({ email, otpCode });
      if (result?.access_token) base44.auth.setToken(result.access_token);
      else if (password) await base44.auth.loginViaEmailPassword(email, password);
      else {
        toast({ title: "Email verified", description: "Log in with your password." });
        setShowOtp(false);
        return;
      }
      // Someone who left sign-up before entering the code never got to the step
      // that saves their callsign; Callsign Management is where they add it.
      const me = await base44.auth.me().catch(() => null);
      window.location.href = me && !me.callsign_verified ? "/callsign-management" : returnTo;
    } catch (err) {
      setError(err.message || "Invalid verification code");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = () => {
    base44.auth.loginWithProvider("google", returnTo);
  };

  const handleFacebook = () => {
    base44.auth.loginWithProvider("facebook", returnTo);
  };

  const handleApple = () => {
    base44.auth.loginWithProvider("apple", returnTo);
  };

  const handleMicrosoft = () => {
    base44.auth.loginWithProvider("microsoft", returnTo);
  };

  if (showOtp) {
    const backToLogin = () => { setShowOtp(false); setOtpCode(""); setError(""); };
    return (
      <AuthLayout icon={Mail} title="Verify your email" subtitle={`Your email isn't verified yet. Enter the 6-digit code we just sent to ${email}`}>
        {error && <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>}
        <div className="flex justify-center mb-6">
          <InputOTP maxLength={6} value={otpCode} onChange={setOtpCode} autoFocus autoComplete="one-time-code">
            <InputOTPGroup>
              <InputOTPSlot index={0} /><InputOTPSlot index={1} /><InputOTPSlot index={2} />
              <InputOTPSlot index={3} /><InputOTPSlot index={4} /><InputOTPSlot index={5} />
            </InputOTPGroup>
          </InputOTP>
        </div>
        <Button className="w-full h-12 font-medium" onClick={handleVerifyCode} disabled={loading || otpCode.length < 6}>
          {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Verifying...</> : "Verify and log in"}
        </Button>
        <p className="text-center text-sm text-muted-foreground mt-4">
          Didn't receive the code?{" "}
          <button onClick={handleResend} disabled={resendIn > 0} className="text-primary font-medium hover:underline disabled:text-muted-foreground disabled:no-underline disabled:cursor-not-allowed">
            {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"}
          </button>
        </p>

        <VerifyEmailHelp onBack={backToLogin} />

        <p className="text-center text-xs text-muted-foreground mt-4">Still stuck? <Link to="/contact" className="text-primary hover:underline">Contact us</Link> and we'll help you get in.</p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      icon={LogIn}
      title="Welcome back"
      subtitle="Log in to your account"
      footer={
        <>
          Don't have an account?{" "}
          <Link
            to={"/register" + (returnTo !== "/" ? "?returnTo=" + encodeURIComponent(returnTo) : "")}
            className="text-primary font-medium hover:underline"
          >
            Create one
          </Link>
        </>
      }
    >
      <Button
        variant="outline"
        className="w-full h-12 text-sm font-medium mb-3"
        onClick={handleGoogle}
      >
        <GoogleIcon className="w-5 h-5 mr-2" />
        Continue with Google
      </Button>
      <Button
        variant="outline"
        className="w-full h-12 text-sm font-medium mb-3"
        onClick={handleFacebook}
      >
        <FacebookIcon className="w-5 h-5 mr-2" />
        Continue with Facebook
      </Button>
      <Button
        variant="outline"
        className="w-full h-12 text-sm font-medium mb-3"
        onClick={handleApple}
      >
        <AppleIcon className="w-5 h-5 mr-2" />
        Continue with Apple
      </Button>
      <Button
        variant="outline"
        className="w-full h-12 text-sm font-medium mb-6"
        onClick={handleMicrosoft}
      >
        <MicrosoftIcon className="w-5 h-5 mr-2" />
        Continue with Microsoft
      </Button>

      <div className="relative mb-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-card px-3 text-muted-foreground">or</span>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="email"
              type="email"
              autoComplete="email"
              autoFocus
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link to="/forgot-password" className="text-xs text-primary hover:underline">
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <Button type="submit" className="w-full h-12 font-medium" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Logging in...
            </>
          ) : (
            "Log in"
          )}
        </Button>
      </form>
      <p className="text-center text-xs text-muted-foreground mt-4">
        Signed up but never entered your email code?{" "}
        <button type="button" onClick={sendCode} className="text-primary font-medium hover:underline">Verify your email</button>
      </p>
    </AuthLayout>
  );
}