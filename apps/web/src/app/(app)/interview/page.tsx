import { InterviewFlow } from "@/components/interview/interview-flow";
import { ROLE_OPTIONS, type Role } from "@/lib/interview/types";

function toValidRole(value: string | undefined): Role | undefined {
  return ROLE_OPTIONS.find((option) => option.slug === value)?.slug;
}

export default async function InterviewPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  const { role } = await searchParams;

  return <InterviewFlow initialRole={toValidRole(role)} />;
}
