import { FinalCta } from "@/components/landing/final-cta";
import { Footer } from "@/components/landing/footer";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { Nav } from "@/components/landing/nav";
import { ProgressSection } from "@/components/landing/progress-section";
import { Roles } from "@/components/landing/roles";
import { SampleReport } from "@/components/landing/sample-report";

export default function MarketingHome() {
  return (
    <div className="bg-ink flex flex-1 flex-col">
      <Nav />
      <Hero />
      <HowItWorks />
      <SampleReport />
      <Roles />
      <ProgressSection />
      <FinalCta />
      <Footer />
    </div>
  );
}
