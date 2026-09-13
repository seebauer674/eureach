// Central credit configuration — single source of truth
// plans.credits: monthly allocation (-1 = unlimited)
// plans.monthlyArticles: articles per month cap (-1 = unlimited)
// plans.freeLeadSearches: monthly lead searches for free users (paid users: unlimited)
// plans.freeAudits: monthly audits for free users (paid users: see monthlyAudits)
// plans.marketingPosts: social/ad posts per month for Marketing Creator
// plans.marketingCampaigns: full campaigns per month
// costs: credits deducted per action (0 = free, unlisted = 0)
module.exports = {
  plans: {
    free:    { credits: 150,  sites: 1,  crmLeads: 5,  wordpress: false, monthlyArticles: 1,  freeLeadSearches: 3, freeAudits: 1,  marketingPosts: 2,  marketingCampaigns: 0  },
    trial:   { credits: 300,  sites: 1,  crmLeads: 5,  wordpress: false, monthlyArticles: 3,  marketingPosts: 5,  marketingCampaigns: 1  },
    paid:    { credits: 800,  sites: 3,  crmLeads: -1, wordpress: true,  monthlyArticles: 6,  monthlyAudits: 10,  marketingPosts: 20, marketingCampaigns: 3  },
    agency:  { credits: -1,   sites: -1, crmLeads: -1, wordpress: true,  monthlyArticles: -1, marketingPosts: -1, marketingCampaigns: -1 },
    // legacy names — fall back to paid behaviour
    starter: { credits: 800,  sites: 3,  crmLeads: -1, wordpress: true,  monthlyArticles: 6,  marketingPosts: 20, marketingCampaigns: 3  },
    pro:     { credits: 800,  sites: 3,  crmLeads: -1, wordpress: true,  monthlyArticles: 6,  marketingPosts: 20, marketingCampaigns: 3  },
  },
  costs: {
    leadSearch:         2,
    leadScore:          5,
    articleGenerate:    10,
    auditCreate:        5,
    auditShareCreate:   1,
    outreach:           8,
    whatsapp:           3,
    competitorCreate:   8,
    competitorCheck:    5,
    // Marketing Creator
    socialPost:         5,
    adGenerate:         8,
    campaignGenerate:   20,
    imageConcept:       3,
    videoScript:        10,
  },
};
