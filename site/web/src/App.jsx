import { lazy, Suspense } from 'react'
import WidgetErrorBoundary from '@/components/WidgetErrorBoundary';
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate, useLocation } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import ScrollToTop from './components/ScrollToTop';
import OfflineIndicator from '@/components/OfflineIndicator';
// Lazy: pulls in livekit-client, which is large and otherwise loaded eagerly
// by every visitor on every page even if they never open the radio.
// Retry once on failure — "Failed to fetch dynamically imported module" is a
// transient Vite dev-server issue (stale module URL after HMR/restart) that a
// single retry resolves by picking up the fresh URL.
const RadioWidget = lazy(() =>
  import('@/components/radio/RadioWidget').catch(() =>
    new Promise((r) => setTimeout(r, 300)).then(() => import('@/components/radio/RadioWidget'))
  )
);
import ProtectedRoute from '@/components/ProtectedRoute';
import AdminRoute from '@/components/AdminRoute';
import Layout from '@/components/Layout';
import AdminLayout from '@/components/admin/AdminLayout';
import RouteLoadingFallback from '@/components/RouteLoadingFallback';

// Lazy-loaded pages — code-split for faster initial load
const Landing = lazy(() => import('@/pages/Landing'));
const Login = lazy(() => import('@/pages/Login'));
const Register = lazy(() => import('@/pages/Register'));
const ForgotPassword = lazy(() => import('@/pages/ForgotPassword'));
const ResetPassword = lazy(() => import('@/pages/ResetPassword'));
const Dashboard = lazy(() => import('@/pages/Dashboard'));
const Repeaters = lazy(() => import('@/pages/Repeaters'));
const HamDirectory = lazy(() => import('@/pages/HamDirectory'));
const Logbook = lazy(() => import('@/pages/Logbook'));
const Equipment = lazy(() => import('@/pages/Equipment'));
const EquipmentGuide = lazy(() => import('@/pages/EquipmentGuide'));
const EquipmentDetail = lazy(() => import('@/pages/EquipmentDetail'));
const Clubs = lazy(() => import('@/pages/Clubs'));
const ClubDetail = lazy(() => import('@/pages/ClubDetail'));
const ClubManager = lazy(() => import('@/pages/ClubManager'));
const ClubPageView = lazy(() => import('@/pages/ClubPageView'));
const Events = lazy(() => import('@/pages/Events'));
const TripPlanner = lazy(() => import('@/pages/TripPlanner'));
const GPS = lazy(() => import('@/pages/GPS'));
const Profile = lazy(() => import('@/pages/Profile'));
const CallsignManagement = lazy(() => import('@/pages/CallsignManagement'));
const MemberProfile = lazy(() => import('@/pages/MemberProfile'));
const Forums = lazy(() => import('@/pages/Forums'));
const ForumPost = lazy(() => import('@/pages/ForumPost'));
const ThankYou = lazy(() => import('@/pages/ThankYou'));
const Messages = lazy(() => import('@/pages/Messages'));
const MemberDirectory = lazy(() => import('@/pages/MemberDirectory'));
const Leaderboard = lazy(() => import('@/pages/Leaderboard'));
const BugReport = lazy(() => import('@/pages/BugReport'));
const RadioPage = lazy(() => import('@/pages/RadioPage'));
const AccessDenied = lazy(() => import('@/pages/AccessDenied'));
const AdminDashboard = lazy(() => import('@/pages/admin/AdminDashboard'));
const AdminUsers = lazy(() => import('@/pages/admin/AdminUsers'));
const AdminRepeaters = lazy(() => import('@/pages/admin/AdminRepeaters'));
const AdminMap = lazy(() => import('@/pages/admin/AdminMap'));
const AdminFcc = lazy(() => import('@/pages/admin/AdminFcc'));
const AdminReports = lazy(() => import('@/pages/admin/AdminReports'));
const AdminNotifications = lazy(() => import('@/pages/admin/AdminNotifications'));
const AdminEmail = lazy(() => import('@/pages/admin/AdminEmail'));
const AdminAnalytics = lazy(() => import('@/pages/admin/AdminAnalytics'));
const AdminSecurity = lazy(() => import('@/pages/admin/AdminSecurity'));
const AdminAudit = lazy(() => import('@/pages/admin/AdminAudit'));
const AdminSettings = lazy(() => import('@/pages/admin/AdminSettings'));
const AdminBadges = lazy(() => import('@/pages/admin/AdminBadges'));
const AdminCallsigns = lazy(() => import('@/pages/admin/AdminCallsigns'));
const AdminTags = lazy(() => import('@/pages/admin/AdminTags'));
const AdminRadio = lazy(() => import('@/pages/admin/AdminRadio'));
const AdminApiKeys = lazy(() => import('@/pages/admin/AdminApiKeys'));
const AdminPota = lazy(() => import('@/pages/admin/AdminPota'));
const AdminSota = lazy(() => import('@/pages/admin/AdminSota'));
const AdminSdr = lazy(() => import('@/pages/admin/AdminSdr'));
const AdminRoles = lazy(() => import('@/pages/admin/AdminRoles'));
const AdminEquipment = lazy(() => import('@/pages/admin/AdminEquipment'));
const AdminStore = lazy(() => import('@/pages/admin/AdminStore'));
const About = lazy(() => import('@/pages/About'));
const Privacy = lazy(() => import('@/pages/Privacy'));
const Terms = lazy(() => import('@/pages/Terms'));
const Partners = lazy(() => import('@/pages/Partners'));
const Contact = lazy(() => import('@/pages/Contact'));
const Faq = lazy(() => import('@/pages/Faq'));
const ApiDocs = lazy(() => import('@/pages/ApiDocs'));
const Features = lazy(() => import('@/pages/Features'));
const AboutGmrs = lazy(() => import('@/pages/AboutGmrs'));
const AboutHam = lazy(() => import('@/pages/AboutHam'));
const GetLicensed = lazy(() => import('@/pages/GetLicensed'));
const Tools = lazy(() => import('@/pages/Tools'));
const FrequencyCalculator = lazy(() => import('@/pages/tools/FrequencyCalculator'));
const ToneCalculator = lazy(() => import('@/pages/tools/ToneCalculator'));
const ChannelPlanner = lazy(() => import('@/pages/tools/ChannelPlanner'));
const AntennaCalculator = lazy(() => import('@/pages/tools/AntennaCalculator'));
const CoaxLossCalculator = lazy(() => import('@/pages/tools/CoaxLossCalculator'));
const PowerCalculator = lazy(() => import('@/pages/tools/PowerCalculator'));
const DistanceCalculator = lazy(() => import('@/pages/tools/DistanceCalculator'));
const WeatherTool = lazy(() => import('@/pages/tools/WeatherTool'));
const SunriseSunset = lazy(() => import('@/pages/tools/SunriseSunset'));
const MorseCode = lazy(() => import('@/pages/tools/MorseCode'));
const SpaceWeather = lazy(() => import('@/pages/tools/SpaceWeather'));
const HfPropagation = lazy(() => import('@/pages/tools/HfPropagation'));
const AdifTool = lazy(() => import('@/pages/tools/AdifTool'));
const DxCluster = lazy(() => import('@/pages/tools/DxCluster'));
const WsprTool = lazy(() => import('@/pages/tools/WsprTool'));
const PskReporterTool = lazy(() => import('@/pages/tools/PskReporterTool'));
const SatelliteTracker = lazy(() => import('@/pages/tools/SatelliteTracker'));
const AwardsTracker = lazy(() => import('@/pages/tools/AwardsTracker'));
const QslManager = lazy(() => import('@/pages/tools/QslManager'));
const ContestLogger = lazy(() => import('@/pages/tools/ContestLogger'));
const HamExam = lazy(() => import('@/pages/tools/HamExam'));
const HamStudy = lazy(() => import('@/pages/tools/HamStudy'));
const DigitalRadio = lazy(() => import('@/pages/tools/DigitalRadio'));
const QrzLogbook = lazy(() => import('@/pages/tools/QrzLogbook'));
const ConfirmationsImport = lazy(() => import('@/pages/tools/ConfirmationsImport'));
const AprsTool = lazy(() => import('@/pages/tools/AprsTool'));
const RbnTool = lazy(() => import('@/pages/tools/RbnTool'));
const Sota = lazy(() => import('@/pages/tools/Sota'));
const SotaSummitDetail = lazy(() => import('@/pages/SotaSummitDetail'));
const SotaActivationDetail = lazy(() => import('@/pages/SotaActivationDetail'));
const Sdr = lazy(() => import('@/pages/tools/Sdr'));
const FccLookup = lazy(() => import('@/pages/tools/FccLookup'));
const NetControl = lazy(() => import('@/pages/tools/NetControl'));
const NetControlMapView = lazy(() => import('@/pages/tools/NetControlMapView'));
const Pota = lazy(() => import('@/pages/tools/Pota'));
const FlightRadar = lazy(() => import('@/pages/tools/FlightRadar'));
const EmergencyIntel = lazy(() => import('@/pages/tools/EmergencyIntel'));
const PotaActivationDetail = lazy(() => import('@/pages/PotaActivationDetail'));
const PotaParkDetail = lazy(() => import('@/pages/PotaParkDetail'));
const Help = lazy(() => import('@/pages/Help'));
const Marketplace = lazy(() => import('@/pages/Marketplace'));
const Store = lazy(() => import('@/pages/Store'));
const StoreThanks = lazy(() => import('@/pages/StoreThanks'));
const StoreOrders = lazy(() => import('@/pages/StoreOrders'));
const DesktopOAuthCallback = lazy(() => import('@/pages/DesktopOAuthCallback'));

// Old /store links (and any Stripe return URL issued before the rename to
// Merch) keep working, query string included.
function KeepQueryRedirect({ to }) {
  const { search } = useLocation();
  return <Navigate to={`${to}${search}`} replace />;
}

const AuthenticatedApp = () => {
  const { isLoadingPublicSettings } = useAuth();

  if (isLoadingPublicSettings) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <Suspense fallback={<RouteLoadingFallback />}>
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/oauth/callback" element={<DesktopOAuthCallback />} />
      <Route path="/oauth/dispatch-callback" element={<DesktopOAuthCallback />} />
      <Route path="/oauth/feed-callback" element={<DesktopOAuthCallback />} />
      <Route path="/oauth/app-callback" element={<DesktopOAuthCallback />} />
      <Route path="/ThankYou" element={<ThankYou />} />
      <Route path="/access-denied" element={<AccessDenied />} />
      <Route path="/about" element={<About />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/partners" element={<Partners />} />
      <Route path="/contact" element={<Contact />} />
      <Route path="/faq" element={<Faq />} />
      <Route path="/api-docs" element={<ApiDocs />} />
      <Route path="/features" element={<Features />} />
      <Route path="/about-gmrs" element={<AboutGmrs />} />
      <Route path="/about-ham" element={<AboutHam />} />
      <Route path="/get-licensed" element={<GetLicensed />} />

      {/* Public discovery pages: visitors can browse without creating an account.
          Actions that modify data or require a member identity should still enforce auth in the page/API. */}
      <Route element={<Layout />}>
        <Route path="/merch" element={<Store />} />
        <Route path="/merch/thanks" element={<StoreThanks />} />
        <Route path="/merch/orders" element={<StoreOrders />} />
        <Route path="/store" element={<KeepQueryRedirect to="/merch" />} />
        <Route path="/store/thanks" element={<KeepQueryRedirect to="/merch/thanks" />} />
        <Route path="/store/orders" element={<KeepQueryRedirect to="/merch/orders" />} />
        <Route path="/repeaters" element={<Repeaters />} />
        <Route path="/tools/gmrs-directory" element={<Repeaters service="GMRS" />} />
        <Route path="/tools/ham-directory" element={<HamDirectory />} />
        <Route path="/equipment" element={<Equipment />} />
        <Route path="/equipment-guide" element={<EquipmentGuide />} />
        <Route path="/equipment/:id" element={<EquipmentDetail />} />
        <Route path="/clubs" element={<Clubs />} />
        <Route path="/clubs/:id" element={<ClubDetail />} />
        <Route path="/clubs/:clubId/pages/:pageId" element={<ClubPageView />} />
        <Route path="/events" element={<Events />} />
        <Route path="/forums" element={<Forums />} />
        <Route path="/forums/:id" element={<ForumPost />} />
        <Route path="/members/:id" element={<MemberProfile />} />
        <Route path="/directory" element={<MemberDirectory />} />
        <Route path="/leaderboard" element={<Leaderboard />} />
        <Route path="/tools" element={<Tools />} />
        <Route path="/tools/frequency" element={<FrequencyCalculator />} />
        <Route path="/tools/tone" element={<ToneCalculator />} />
        <Route path="/tools/channels" element={<ChannelPlanner />} />
        <Route path="/tools/antenna" element={<AntennaCalculator />} />
        <Route path="/tools/coax" element={<CoaxLossCalculator />} />
        <Route path="/tools/power" element={<PowerCalculator />} />
        <Route path="/tools/distance" element={<DistanceCalculator />} />
        <Route path="/tools/weather" element={<WeatherTool />} />
        <Route path="/tools/sunrise" element={<SunriseSunset />} />
        <Route path="/tools/morse" element={<MorseCode />} />
        <Route path="/tools/space-weather" element={<SpaceWeather />} />
        <Route path="/tools/propagation" element={<HfPropagation />} />
        <Route path="/tools/adif" element={<AdifTool />} />
        <Route path="/tools/dx-cluster" element={<DxCluster />} />
        <Route path="/tools/wspr" element={<WsprTool />} />
        <Route path="/tools/psk-reporter" element={<PskReporterTool />} />
        <Route path="/tools/satellites" element={<SatelliteTracker defaultSatellite="SO-50" />} />
        <Route path="/tools/iss" element={<SatelliteTracker defaultSatellite="ISS" />} />
        <Route path="/tools/awards" element={<AwardsTracker />} />
        <Route path="/tools/qsl" element={<QslManager />} />
        <Route path="/tools/contest" element={<ContestLogger />} />
        <Route path="/tools/ham-exam" element={<HamExam />} />
        <Route path="/tools/ham-study" element={<HamStudy />} />
        <Route path="/tools/digital" element={<DigitalRadio />} />
        <Route path="/tools/digital/:network" element={<DigitalRadio />} />
        <Route path="/tools/qrz" element={<QrzLogbook />} />
        <Route path="/tools/lotw" element={<ConfirmationsImport service="lotw" />} />
        <Route path="/tools/eqsl" element={<ConfirmationsImport service="eqsl" />} />
        <Route path="/tools/aprs" element={<AprsTool />} />
        <Route path="/tools/rbn" element={<RbnTool />} />
        <Route path="/tools/sota" element={<Sota />} />
        <Route path="/tools/sota/summits/:id" element={<SotaSummitDetail />} />
        <Route path="/tools/sota/:id" element={<SotaActivationDetail />} />
        <Route path="/tools/sdr" element={<Sdr />} />
        <Route path="/tools/fcc" element={<FccLookup />} />
        <Route path="/tools/pota" element={<Pota />} />
        <Route path="/tools/flight-radar" element={<FlightRadar />} />
        <Route path="/tools/emergency" element={<EmergencyIntel />} />
        <Route path="/tools/pota/parks/:id" element={<PotaParkDetail />} />
        <Route path="/tools/pota/:id" element={<PotaActivationDetail />} />
        <Route path="/help" element={<Help />} />
        <Route path="/marketplace" element={<Marketplace />} />
      </Route>

      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route element={<AdminRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
          <Route element={<AdminLayout />}>
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/users" element={<AdminUsers />} />
            <Route path="/admin/repeaters" element={<AdminRepeaters />} />
            <Route path="/admin/map" element={<AdminMap />} />
            <Route path="/admin/fcc" element={<AdminFcc />} />
            <Route path="/admin/reports" element={<AdminReports />} />
            <Route path="/admin/notifications" element={<AdminNotifications />} />
            <Route path="/admin/email" element={<AdminEmail />} />
            <Route path="/admin/analytics" element={<AdminAnalytics />} />
            <Route path="/admin/security" element={<AdminSecurity />} />
            <Route path="/admin/audit" element={<AdminAudit />} />
            <Route path="/admin/settings" element={<AdminSettings />} />
            <Route path="/admin/changelog" element={<Navigate to="/admin/audit" replace />} />
            <Route path="/admin/badges" element={<AdminBadges />} />
            <Route path="/admin/callsigns" element={<AdminCallsigns />} />
            <Route path="/admin/tags" element={<AdminTags />} />
            <Route path="/admin/radio" element={<AdminRadio />} />
            <Route path="/admin/api-keys" element={<AdminApiKeys />} />
            <Route path="/admin/seo" element={<Navigate to="/admin/analytics" replace />} />
            <Route path="/admin/pota" element={<AdminPota />} />
            <Route path="/admin/sota" element={<AdminSota />} />
            <Route path="/admin/sdr" element={<AdminSdr />} />
            <Route path="/admin/roles" element={<AdminRoles />} />
            <Route path="/admin/equipment" element={<AdminEquipment />} />
            <Route path="/admin/merch" element={<AdminStore />} />
            <Route path="/admin/store" element={<Navigate to="/admin/merch" replace />} />
          </Route>
        </Route>
        {/* Full-screen command-center layout — deliberately not nested in <Layout />
            (mobile-first, minimal chrome while driving). */}
        <Route path="/gps" element={<GPS />} />
        {/* Popped-out Net Control map — deliberately not nested in <Layout />
            so a second window/monitor shows just the map, no site chrome. */}
        <Route path="/tools/net-control/map/:sessionId" element={<NetControlMapView />} />
        <Route element={<Layout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/logbook" element={<Logbook />} />
          <Route path="/club-manager" element={<ClubManager />} />
          <Route path="/trips" element={<TripPlanner />} />
          <Route path="/settings" element={<Profile />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/callsign-management" element={<CallsignManagement />} />
          <Route path="/messages" element={<Messages />} />
          <Route path="/bug-report" element={<BugReport />} />
          <Route path="/radio" element={<RadioPage />} />
          <Route path="/tools/net-control" element={<NetControl />} />
        </Route>
      </Route>

      <Route path="*" element={<PageNotFound />} />
    </Routes>
    </Suspense>
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <OfflineIndicator />
          <WidgetErrorBoundary>
            <Suspense fallback={null}><RadioWidget /></Suspense>
          </WidgetErrorBoundary>
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App