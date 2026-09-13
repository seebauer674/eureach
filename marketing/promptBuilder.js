function buildBusinessContext(business, brand) {
  const lines = [];
  if (business.businessName)        lines.push(`Business Name: ${business.businessName}`);
  if (business.industry)            lines.push(`Industry: ${business.industry}`);
  if (business.businessDescription) lines.push(`Description: ${business.businessDescription}`);
  if (business.city || business.country)
    lines.push(`Location: ${[business.city, business.country].filter(Boolean).join(', ')}`);
  if (business.businessUrl)         lines.push(`Website: ${business.businessUrl}`);
  if (business.customerType)        lines.push(`Customer Type: ${business.customerType}`);
  if (business.uniqueStrength)      lines.push(`Unique Strength / USP: ${business.uniqueStrength}`);
  if (business.mainKeyword)         lines.push(`Primary Keyword: ${business.mainKeyword}`);
  if (business.services)            lines.push(`Services: ${business.services}`);
  if (business.phone)               lines.push(`Phone: ${business.phone}`);

  if (brand && Object.keys(brand).length) {
    if (brand.slogan)         lines.push(`Brand Slogan: ${brand.slogan}`);
    if (brand.tone)           lines.push(`Tone of Voice: ${brand.tone}`);
    if (brand.targetAudience) lines.push(`Target Audience: ${brand.targetAudience}`);
  }

  return lines.length ? lines.join('\n') : 'No business profile provided.';
}

function buildBriefContext(brief) {
  if (!brief || !Object.keys(brief).length) return 'No campaign brief provided.';
  const lines = [];
  if (brief.what)         lines.push(`Promoting: ${brief.what}`);
  if (brief.product)      lines.push(`Product / Service: ${brief.product}`);
  if (brief.benefit)      lines.push(`Main Benefit: ${brief.benefit}`);
  if (brief.problem)      lines.push(`Problem Being Solved: ${brief.problem}`);
  if (brief.objective)    lines.push(`Campaign Objective: ${brief.objective}`);
  if (brief.audience)     lines.push(`Target Audience: ${brief.audience}`);
  if (brief.location)     lines.push(`Location: ${brief.location}`);
  if (brief.offer)        lines.push(`Offer / Promotion: ${brief.offer}`);
  if (brief.price)        lines.push(`Price: ${brief.price}`);
  if (brief.cta)          lines.push(`CTA: ${brief.cta}`);
  if (brief.tone)         lines.push(`Tone: ${brief.tone}`);
  if (brief.language)     lines.push(`Content Language: ${brief.language}`);
  if (brief.instructions) lines.push(`Additional Instructions: ${brief.instructions}`);
  return lines.join('\n');
}

// Assembles the full user message for any generator
function buildUserMessage(business, brand, brief) {
  return [
    '=== BUSINESS PROFILE ===',
    buildBusinessContext(business, brand),
    '',
    '=== CAMPAIGN BRIEF ===',
    buildBriefContext(brief),
  ].join('\n');
}

module.exports = { buildBusinessContext, buildBriefContext, buildUserMessage };
