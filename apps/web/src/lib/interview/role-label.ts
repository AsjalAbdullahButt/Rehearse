import { ROLE_OPTIONS } from "@/lib/interview/types";

/** A readable name for a stored role key. A preset gets its catalogue name; a custom role (stored
 * as its slugified title, e.g. "devops-engineer") uses the title the API kept for it when there
 * is one, else is title-cased from the slug. */
export function roleLabel(slug: string, title?: string | null): string {
  if (title) return title;
  const preset = ROLE_OPTIONS.find((option) => option.slug === slug)?.name;
  if (preset) return preset;
  return slug
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
