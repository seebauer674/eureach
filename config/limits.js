// Central credit configuration — single source of truth
// plans.credits: monthly allocation (-1 = unlimited)
// plans.monthlyArticles: articles per month cap (-1 = unlimited)
// costs: credits deducted per action (0 = free, unlisted = 0)
module.exports = {
  plans: {
    free:    { credits: 150,  sites: 1,  crmLeads: 5,  wordpress: false, monthlyArticles: 0  },
    trial:   { credits: 300,  sites: 1,  crmLeads: 5,  wordpress: false, monthlyArticles: 3  },
    paid:    { credits: 800,  sites: 3,  crmLeads: -1, wordpress: true,  monthlyArticles: 6  },
    agency:  { credits: -1,   sites: -1, crmLeads: -1, wordpress: true,  monthlyArticles: -1 },
    // legacy names — fall back to paid behaviour
    starter: { credits: 800,  sites: 3,  crmLeads: -1, wordpress: true,  monthlyArticles: 6  },
    pro:     { credits: 800,  sites: 3,  crmLeads: -1, wordpress: true,  monthlyArticles: 6  },
  },
  costs: {
    leadSearch:       2,
    leadScore:        5,
    articleGenerate:  10,
    auditCreate:      5,
    auditShareCreate: 1,
    outreach:         8,
    whatsapp:         3,
    competitorCreate: 8,
    competitorCheck:  5,
  },
};
