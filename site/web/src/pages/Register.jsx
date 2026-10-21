import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserPlus, Mail, Lock, Loader2, BadgeCheck, CheckCircle2, AlertCircle, Radio } from "lucide-react";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import AuthLayout from "@/components/AuthLayout";
import GoogleIcon from "@/components/GoogleIcon";
import FacebookIcon from "@/components/FacebookIcon";
import AppleIcon from "@/components/AppleIcon";
import MicrosoftIcon from "@/components/MicrosoftIcon";
import SignupAnnouncement from "@/components/SignupAnnouncement";
import VerifyEmailHelp from "@/components/VerifyEmailHelp";
import { toast } from "@/components/ui/use-toast";
import { safeReturnTo } from "@/lib/authReturnTo";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

export default function Register() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [callsign, setCallsign] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showOtp, setShowOtp] = useState(false);
  // Seconds until "Resend" can be pressed again, so people don't fire off a
  // pile of codes (only the newest one works) while the first is still on its way.
  const [resendIn, setResendIn] = useState(0);
  useEffect(() => {
    if (resendIn <= 0) return undefined;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);
  const [otpCode, setOtpCode] = useState("");

  // FCC verification state
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState(null); // { valid, verified, fccReachable, licensee, status, message }
  const [googleSignupOpen, setGoogleSignupOpen] = useState(false);
  const [socialProvider, setSocialProvider] = useState("google");
  const [googleSignupCallsign, setGoogleSignupCallsign] = useState("");
  const [googleSignupVerifyResult, setGoogleSignupVerifyResult] = useState(null);
  const [googleSignupVerifying, setGoogleSignupVerifying] = useState(false);

  // Modern FCC-issued GMRS callsigns (W + 3 letters + 3 digits, e.g. WRJR646) can take
  // up to a week to appear in OpenCallbook's mirror, and the FCC's own License View API
  // has been dead for a while (see base44/shared/fcc.ts) -- so a brand-new licensee can
  // hit a hard "not found" with no path forward right when they're most likely to be
  // signing up. A callsign in that exact format that simply wasn't found yet is let
  // through as pending instead of permanently blocked; anything that doesn't even look
  // like a real callsign is still rejected.
  const isLikelyNewGmrsCallsign = (cs) => /^W[A-Z]{3}\d{3}$/.test(cs);
  const pendingNewGmrs = !!(verifyResult && verifyResult.found === false && isLikelyNewGmrsCallsign(callsign.trim().toUpperCase()));
  const verificationOk = !!(verifyResult && (verifyResult.verified || verifyResult.fccReachable === false || pendingNewGmrs));
  const canCreate = email.trim() && password && confirmPassword && password === confirmPassword && verificationOk;

  const handleVerify = async () => {
    setError("");
    setVerifyResult(null);
    const cs = callsign.trim().toUpperCase();
    if (!cs) { setError("Enter your callsign first."); return; }
    setVerifying(true);
    try {
      const res = await base44.functions.invoke("verifyCallsign", { callsign: cs });
      setVerifyResult(res.data);
      if (!res.data.valid) setError(res.data.message);
    } catch (err) {
      setError(err.message || "Could not reach the FCC verification service.");
    } finally {
      setVerifying(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (password !== confirmPassword) { setError("Passwords do not match"); return; }
    if (!callsign.trim()) { setError("Please enter your callsign."); return; }
    // canCreate/verificationOk only ever disabled the submit button -- that's a
    // UI hint, not a guard, since submitting the form another way (e.g. the
    // "Go"/Enter key on a mobile keyboard, from the email or password field)
    // fires this handler directly regardless of the button's disabled state.
    // Without this check, an account could be created with a callsign that was
    // never actually verified, leaving it permanently stuck with no callsign
    // on file and no explanation.
    if (!verificationOk) { setError("Please verify your callsign before creating an account."); return; }
    setLoading(true);
    try {
      // Let the authentication provider enforce email uniqueness. The former
      // pre-registration lookup exposed account existence to unauthenticated callers.
      await base44.auth.register({ email, password });
      setShowOtp(true);
      setResendIn(30);
    } catch (err) {
      setError(err.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  const handleVerify2 = async () => {
    setError("");
    setLoading(true);
    try {
      const result = await base44.auth.verifyOtp({ email, otpCode });
      if (result?.access_token) {
        base44.auth.setToken(result.access_token);
      }
      // Sensitive User fields (callsign, license data, and callsign_verified) are
      // server-controlled. Do not write them with auth.updateMe(), because that endpoint
      // is reachable from the browser. The callsign claim function performs its own
      // server-side FCC verification, then sync-my-callsign writes the protected User
      // fields with service-role authority.
      const cs = callsign.trim().toUpperCase();
      const licenseStatus = verifyResult?.verified ? "Active" : "Pending";
      let saveFailed = false;
      let claimStatus = null;

      const me = await base44.auth.me().catch(() => null);

      if (me) {
        // Claim the callsign or request access if already taken. This function
        // independently verifies the license server-side; client verification
        // results are never trusted for User security fields.
        try {
          const claimResult = await base44.functions.invoke('callsign-claim-or-request', {
            callsign: cs,
            display_name: me?.full_name || '',
            license_verified: verifyResult?.verified || false,
          });
          claimStatus = claimResult?.data?.status || null;

          // Populate the legacy User.callsign field and protected verification
          // fields through the authenticated backend function, not auth.updateMe().
          if (claimStatus === 'primary' || claimStatus === 'authorized') {
            const syncResult = await base44.functions.invoke('sync-my-callsign', {});
            if (!syncResult?.data?.ok) {
              saveFailed = true;
            }
          }
        } catch (e) {
          console.error('callsign registration finalization failed:', e);
          saveFailed = true;
        }

        // Seed the Profile entity so the verified badge is visible immediately.
        try {
          const existing = await base44.entities.Profile.filter({ created_by_id: me.id }, '-updated_date', 1).catch(() => []);
          if (!existing?.length) {
            await base44.entities.Profile.create({
              display_name: me.full_name || '',
              callsign: cs,
              license_number: verifyResult?.frn || '',
              license_status: licenseStatus,
            });
          }
        } catch (e) {
          console.error('Failed to seed profile after registration:', e);
        }
      }

      // GMRS callsigns are commonly shared across a family, so claimStatus === 'pending'
      // (someone else already holds this callsign) is an expected, non-error outcome, not
      // a failure -- but callsign_verified is intentionally left false until the primary
      // holder approves, so this account still needs to land on Callsign Management (exempt
      // from ProtectedRoute's verification gate) to see and track that pending request,
      // rather than being sent into the app and hitting a generic, unexplained "Callsign
      // Verification Required" wall.
      window.location.href = (saveFailed || claimStatus === 'pending' || !verifyResult?.verified) ? '/callsign-management' : safeReturnTo();
    } catch (err) {
      setError(err.message || "Invalid verification code");
    } finally {
      setLoading(false);
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

  const googlePendingNewGmrs = !!(
    googleSignupVerifyResult &&
    googleSignupVerifyResult.found === false &&
    isLikelyNewGmrsCallsign(googleSignupCallsign.trim().toUpperCase())
  );
  const googleSignupOk = !!(googleSignupVerifyResult && (googleSignupVerifyResult.verified || googlePendingNewGmrs));

  const openSocialSignup = (provider) => {
    setSocialProvider(provider);
    const cs = callsign.trim().toUpperCase();
    setGoogleSignupCallsign(cs);
    setGoogleSignupVerifyResult(
      cs && (verifyResult?.verified || pendingNewGmrs) && verifyResult?.callsign === cs ? verifyResult : null
    );
    setGoogleSignupOpen(true);
  };

  const verifyGoogleSignupCallsign = async () => {
    setGoogleSignupVerifyResult(null);
    const cs = googleSignupCallsign.trim().toUpperCase();
    if (!cs) return;
    setGoogleSignupVerifying(true);
    try {
      const res = await base44.functions.invoke("verifyCallsign", { callsign: cs });
      setGoogleSignupVerifyResult(res.data);
    } catch (err) {
      setGoogleSignupVerifyResult({
        valid: false,
        verified: false,
        message: err.message || "Could not reach the callsign verification service.",
      });
    } finally {
      setGoogleSignupVerifying(false);
    }
  };

  const handleSocialSignup = () => {
    const cs = googleSignupCallsign.trim().toUpperCase();
    if (!cs || !googleSignupOk) return;

    const params = new URLSearchParams();
    const signupKey = socialProvider === "facebook" ? "facebook_signup" : socialProvider === "apple" ? "apple_signup" : socialProvider === "microsoft" ? "microsoft_signup" : "google_signup";
    params.set(signupKey, "1");
    params.set("callsign", cs);
    params.set("returnTo", safeReturnTo());

    setGoogleSignupOpen(false);
    base44.auth.loginWithProvider(socialProvider, `/callsign-management?${params.toString()}`);
  };

  if (showOtp) {
    const backToForm = () => { setShowOtp(false); setOtpCode(""); setError(""); };
    return (
      <AuthLayout icon={Mail} title="Verify your email" subtitle={`We sent a 6-digit code to ${email}`}>
        {error && <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>}
        <div className="flex justify-center mb-6">
          <InputOTP maxLength={6} value={otpCode} onChange={setOtpCode} autoFocus autoComplete="one-time-code">
            <InputOTPGroup>
              <InputOTPSlot index={0} /><InputOTPSlot index={1} /><InputOTPSlot index={2} />
              <InputOTPSlot index={3} /><InputOTPSlot index={4} /><InputOTPSlot index={5} />
            </InputOTPGroup>
          </InputOTP>
        </div>
        <Button className="w-full h-12 font-medium" onClick={handleVerify2} disabled={loading || otpCode.length < 6}>
          {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Verifying...</> : "Verify"}
        </Button>
        <p className="text-center text-sm text-muted-foreground mt-4">
          Didn't receive the code?{" "}
          <button onClick={handleResend} disabled={resendIn > 0} className="text-primary font-medium hover:underline disabled:text-muted-foreground disabled:no-underline disabled:cursor-not-allowed">
            {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"}
          </button>
        </p>

        <VerifyEmailHelp onBack={backToForm} />

        <Button variant="outline" className="w-full h-11 mt-4 text-sm font-medium" onClick={() => { backToForm(); openSocialSignup("google"); }}>
          <GoogleIcon className="w-4 h-4 mr-2" /> Sign up with Google instead
        </Button>
        <p className="text-center text-xs text-muted-foreground mt-1.5">Signing up with Google doesn't need an email code.</p>
        <p className="text-center text-xs text-muted-foreground mt-4">Still stuck? <Link to="/contact" className="text-primary hover:underline">Contact us</Link> and we'll help you get in.</p>
      </AuthLayout>
    );
  }

  return (
    <>
    <SignupAnnouncement />
    <AuthLayout
      icon={UserPlus}
      title="Create your account"
      subtitle="Join the GMRS and amateur radio community — it's free"
      footer={
        <>
          Already have an account?{" "}
          <Link to={"/login" + (safeReturnTo() !== "/" ? "?returnTo=" + encodeURIComponent(safeReturnTo()) : "")} className="text-primary font-medium hover:underline">
            Log in
          </Link>
        </>
      }
    >
      <Button variant="outline" className="w-full h-12 text-sm font-medium mb-2" onClick={() => openSocialSignup("google")}>
        <GoogleIcon className="w-5 h-5 mr-2" />
        Continue with Google
      </Button>
      <Button variant="outline" className="w-full h-12 text-sm font-medium mb-2" onClick={() => openSocialSignup("facebook")}>
        <FacebookIcon className="w-5 h-5 mr-2" />
        Continue with Facebook
      </Button>
      <Button variant="outline" className="w-full h-12 text-sm font-medium mb-2" onClick={() => openSocialSignup("apple")}>
        <AppleIcon className="w-5 h-5 mr-2" />
        Continue with Apple
      </Button>
      <Button variant="outline" className="w-full h-12 text-sm font-medium mb-2" onClick={() => openSocialSignup("microsoft")}>
        <MicrosoftIcon className="w-5 h-5 mr-2" />
        Continue with Microsoft
      </Button>
      <p className="text-center text-xs text-muted-foreground mb-6">
        Google, Facebook, Apple, and Microsoft signup require a verified GMRS or HAM callsign.
      </p>

      <Dialog open={googleSignupOpen} onOpenChange={setGoogleSignupOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Radio className="w-5 h-5" />
              Verify your callsign to continue
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              Enter your GMRS or HAM callsign and verify it before continuing with {socialProvider === "facebook" ? "Facebook" : socialProvider === "apple" ? "Apple" : socialProvider === "microsoft" ? "Microsoft" : "Google"} signup.
            </p>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                value={googleSignupCallsign}
                onChange={(e) => {
                  setGoogleSignupCallsign(e.target.value.toUpperCase());
                  setGoogleSignupVerifyResult(null);
                }}
                placeholder="Example: WRAB123 or W1AW"
                className="h-11 flex-1 uppercase font-mono"
                autoFocus
              />
              <Button
                type="button"
                variant="secondary"
                onClick={verifyGoogleSignupCallsign}
                disabled={googleSignupVerifying || !googleSignupCallsign.trim()}
                className="h-11"
              >
                {googleSignupVerifying ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <BadgeCheck className="w-4 h-4 mr-1.5" />}
                {googleSignupVerifying ? "Checking…" : "Verify"}
              </Button>
            </div>

            {googleSignupVerifyResult && (
              <div className={"flex items-start gap-2 p-3 rounded-lg text-sm " + (
                googleSignupVerifyResult.verified
                  ? "bg-success/10 text-success"
                  : googleSignupVerifyResult.valid
                    ? "bg-orange-50 text-orange-700 dark:bg-orange-950/30 dark:text-orange-300"
                    : "bg-destructive/10 text-destructive"
              )}>
                {googleSignupVerifyResult.verified
                  ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                  : <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />}
                <div>
                  <div className="font-medium">
                    {googleSignupVerifyResult.verified ? "Callsign verified" : googlePendingNewGmrs ? "Not in the FCC database yet" : googleSignupVerifyResult.status || "Verification failed"}
                  </div>
                  <div className="text-xs opacity-90 mt-0.5">
                    {googlePendingNewGmrs
                      ? "This looks like a valid GMRS callsign, but new licenses can take up to a week to appear in the FCC database. You can still continue — it'll show as pending until we can confirm it."
                      : googleSignupVerifyResult.message}
                  </div>
                  {googleSignupVerifyResult.found && googleSignupVerifyResult.radioService && (
                    <div className="text-xs mt-1">
                      Service: {googleSignupVerifyResult.radioService === "HAM" ? "Amateur radio (HAM)" : "GMRS"}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setGoogleSignupOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSocialSignup} disabled={!googleSignupOk || googleSignupVerifying}>
              {socialProvider === "facebook" ? <FacebookIcon className="w-4 h-4 mr-2" /> : socialProvider === "apple" ? <AppleIcon className="w-4 h-4 mr-2" /> : socialProvider === "microsoft" ? <MicrosoftIcon className="w-4 h-4 mr-2" /> : <GoogleIcon className="w-4 h-4 mr-2" />}
              Continue with {socialProvider === "facebook" ? "Facebook" : socialProvider === "apple" ? "Apple" : socialProvider === "microsoft" ? "Microsoft" : "Google"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="relative mb-6">
        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
        <div className="relative flex justify-center text-xs uppercase"><span className="bg-card px-3 text-muted-foreground">or</span></div>
      </div>

      <div className="mb-5 flex items-start gap-2.5 p-3 rounded-lg bg-primary/10 border border-primary/20 text-sm">
        <BadgeCheck className="w-4 h-4 mt-0.5 shrink-0 text-primary" />
        <div>
          <span className="font-semibold text-foreground">A valid GMRS or amateur radio (HAM) license is required to join.</span>
          <span className="text-muted-foreground"> You'll verify your FCC callsign below. Don't have one yet? </span>
          <a href="https://www.fcc.gov/wireless/bureau-divisions/mobility-division/general-mobile-radio-service-gmrs" target="_blank" rel="noopener noreferrer" className="text-primary font-medium hover:underline">Get a GMRS license</a>
          <span className="text-muted-foreground"> or </span>
          <a href="https://www.arrl.org/getting-licensed" target="_blank" rel="noopener noreferrer" className="text-primary font-medium hover:underline">learn how to get an amateur radio license.</a>
        </div>
      </div>

      {error && <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="callsign">Callsign (GMRS or HAM) *</Label>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1 min-w-0">
              <Radio className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="callsign"
                value={callsign}
                onChange={(e) => { setCallsign(e.target.value.toUpperCase()); setVerifyResult(null); }}
                onBlur={() => {
                  const cs = callsign.trim().toUpperCase();
                  if (cs && (!verifyResult || verifyResult.callsign !== cs)) handleVerify();
                }}
                placeholder="e.g. WRAB123 (GMRS) or W1AW (HAM)"
                className="pl-9 h-12 w-full uppercase font-mono"
                required
              />
            </div>
            <Button type="button" variant="secondary" className="h-12 px-4 w-full sm:w-auto shrink-0" onClick={handleVerify} disabled={verifying || !callsign.trim()}>
              {verifying ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <BadgeCheck className="w-4 h-4 mr-1.5" />}
              Verify
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">We confirm your callsign against the FCC ULS database.</p>
          {verifyResult && (
            <div className={`flex items-start gap-2 p-3 rounded-lg text-sm ${
              verifyResult.verified ? "bg-success/10 text-success"
                : verifyResult.valid ? "bg-orange-50 text-orange-700 dark:bg-orange-950/30 dark:text-orange-300"
                : "bg-destructive/10 text-destructive"
            }`}>
              {verifyResult.verified ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />}
              <div className="min-w-0">
                <div className="font-medium">{verifyResult.verified ? "Verified with the FCC" : pendingNewGmrs ? "Not in the FCC database yet" : verifyResult.status || "Not verified"}</div>
                <div className="text-xs opacity-90 mt-0.5">
                  {pendingNewGmrs
                    ? "This looks like a valid GMRS callsign, but new licenses can take up to a week to appear in the FCC database. You can still create your account — it'll show as pending until we can confirm it."
                    : verifyResult.message}
                </div>
                {verifyResult.found && (
                  <div className="text-xs mt-1 space-y-0.5">
                    {verifyResult.licensee && <div>Licensee: {verifyResult.licensee}</div>}
                    {verifyResult.radioService
                      ? <div>Service: {verifyResult.radioService === 'HAM' ? 'Amateur radio (HAM)' : 'GMRS'}{verifyResult.operatorClass ? ` — ${verifyResult.operatorClass}` : ''}</div>
                      : verifyResult.service && <div>Service: {verifyResult.service}</div>}
                    {verifyResult.status && <div>Status: {verifyResult.status}</div>}
                    {verifyResult.expiration && <div>Expires: {new Date(verifyResult.expiration).toLocaleDateString()}</div>}
                    {verifyResult.frn && <div>FRN: {verifyResult.frn}</div>}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input id="email" type="email" autoComplete="email" autoFocus={false} placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} className="pl-10 h-12" required />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input id="password" type="password" autoComplete="new-password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} className="pl-10 h-12" required />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">Confirm Password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input id="confirm" type="password" autoComplete="new-password" placeholder="••••••••" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="pl-10 h-12" required />
          </div>
        </div>

        <Button type="submit" className="w-full h-12 font-medium" disabled={loading || !canCreate}>
          {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Creating account...</>
            : !email ? "Enter your email"
            : !password ? "Enter a password"
            : password !== confirmPassword ? "Passwords don't match"
            : !verificationOk ? "Verify your callsign"
            : "Create account"}
        </Button>
        {callsign.trim() && !verificationOk && (
          <p className="text-center text-xs text-muted-foreground -mt-1">
            We check your callsign against the FCC ULS database automatically — {verifying ? "verifying…" : "enter it and we'll confirm your license"}.
          </p>
        )}
      </form>
    </AuthLayout>
    </>
  );
}