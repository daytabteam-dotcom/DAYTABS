import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HelmetProvider } from "react-helmet-async";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import LandingPage from "@/pages/LandingPage";
import LoginPage from "@/pages/LoginPage";
import SignupPage from "@/pages/SignupPage";
import PricingPage from "@/pages/PricingPage";
import ContactPage from "@/pages/ContactPage";
import RedirectingPage from "@/pages/RedirectingPage";
import TermsPage from "@/pages/TermsPage";
import PrivacyPage from "@/pages/PrivacyPage";
import RefundPolicyPage from "@/pages/RefundPolicyPage";
import BlogIndexPage from "@/pages/BlogIndexPage";
import BlogPostPage from "@/pages/BlogPostPage";
import FeaturesIndexPage from "@/pages/FeaturesIndexPage";
import TeleprompterFeaturePage from "@/pages/TeleprompterFeaturePage";
import ContentPlannerFeaturePage from "@/pages/ContentPlannerFeaturePage";
import LinkedinContentPlannerFeaturePage from "@/pages/LinkedinContentPlannerFeaturePage";
import TiktokContentPlannerFeaturePage from "@/pages/TiktokContentPlannerFeaturePage";
import InstagramContentPlannerFeaturePage from "@/pages/InstagramContentPlannerFeaturePage";
import VideoAnalysisFeaturePage from "@/pages/VideoAnalysisFeaturePage";
import FeaturesSlugPage from "@/pages/FeaturesSlugPage";
import { LandingI18nProvider } from "@/lib/i18n";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={LandingPage} />
      <Route path="/login" component={LoginPage} />
      <Route path="/login/" component={LoginPage} />
      <Route path="/signup" component={SignupPage} />
      <Route path="/pricing" component={PricingPage} />
      <Route path="/contact" component={ContactPage} />
      <Route path="/redirecting" component={RedirectingPage} />
      <Route path="/terms" component={TermsPage} />
      <Route path="/privacy" component={PrivacyPage} />
      <Route path="/refund-policy" component={RefundPolicyPage} />
      <Route path="/features" component={FeaturesIndexPage} />
      <Route path="/features/teleprompter" component={TeleprompterFeaturePage} />
      <Route path="/features/content-planner" component={ContentPlannerFeaturePage} />
      <Route path="/features/linkedin-content-planner" component={LinkedinContentPlannerFeaturePage} />
      <Route path="/features/tiktok-content-planner" component={TiktokContentPlannerFeaturePage} />
      <Route path="/features/instagram-content-planner" component={InstagramContentPlannerFeaturePage} />
      <Route path="/features/video-analysis" component={VideoAnalysisFeaturePage} />
      <Route path="/features/:slug" component={FeaturesSlugPage} />
      <Route path="/blog" component={BlogIndexPage} />
      <Route path="/blog/:slug" component={BlogPostPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <LandingI18nProvider>
          <TooltipProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <Router />
            </WouterRouter>
            <Toaster />
          </TooltipProvider>
        </LandingI18nProvider>
      </QueryClientProvider>
    </HelmetProvider>
  );
}

export default App;
