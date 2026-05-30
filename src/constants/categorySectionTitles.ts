export const categorySectionTitles: Record<string, { title: string; sortOrder: number }> = {
  worship: { title: "Worship", sortOrder: 10 },
  media_tech: { title: "Media & tech", sortOrder: 20 },
  kids_youth: { title: "Kids & youth", sortOrder: 30 },
  hospitality: { title: "Hospitality", sortOrder: 40 },
  events: { title: "Events", sortOrder: 50 },
  prayer_ministry: { title: "Prayer & ministry", sortOrder: 60 },
  outreach: { title: "Outreach", sortOrder: 70 },
  general: { title: "General", sortOrder: 80 },
  custom: { title: "Other", sortOrder: 90 }
};

export function sectionTitleForCategory(category: string): { title: string; sortOrder: number } {
  return (
    categorySectionTitles[category] ?? {
      title: category.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      sortOrder: 100
    }
  );
}
