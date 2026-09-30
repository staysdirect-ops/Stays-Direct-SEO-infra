import type { Role } from "./auth";

export interface NavItem {
  href: string;
  label: string;
  roles: Role[];
  group?: string;
}

export const NAV: NavItem[] = [
  { href: "/", label: "Dashboard", roles: ["sales", "editor"] },
  { href: "/radar/projects", label: "Projects", roles: ["sales"], group: "Radar" },
  { href: "/radar/leads", label: "Leads", roles: ["sales"], group: "Radar" },
  { href: "/seo/location", label: "Location pages", roles: ["editor"], group: "SEO" },
  { href: "/seo/project", label: "Project pages", roles: ["editor"], group: "SEO" },
  { href: "/seo/blog", label: "Blog", roles: ["editor"], group: "SEO" },
  { href: "/seo/topics", label: "Topics", roles: ["editor"], group: "SEO" },
  { href: "/visibility", label: "AI Visibility", roles: ["editor", "sales"] },
  { href: "/properties", label: "Properties", roles: ["sales"] },
  { href: "/towns", label: "Towns", roles: ["editor"] },
  { href: "/settings", label: "Settings", roles: [] },
  { href: "/jobs", label: "Job Runs", roles: ["sales", "editor"] },
  { href: "/usage", label: "API Usage", roles: [] },
];
