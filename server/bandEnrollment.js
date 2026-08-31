export function bandDistrict(enrollment) {
  if (enrollment < 250) return { band: "Under 250", cohort: "Exclude" };
  if (enrollment < 500) return { band: "250-499", cohort: "C" };
  if (enrollment < 1000) return { band: "500-999", cohort: "B" };
  if (enrollment < 2500) return { band: "1,000-2,500", cohort: "A" };
  if (enrollment < 5000) return { band: "2,500-5,000", cohort: "A+" };
  if (enrollment < 10000) return { band: "5,000-10,000", cohort: "D" };
  return { band: "10,000+", cohort: "Exclude / Watch list" };
}

export function isBorderline(enrollment) {
  const edges = [250, 500, 1000, 2500, 5000, 10000];
  return edges.some((edge) => Math.abs(enrollment - edge) / edge <= 0.1);
}