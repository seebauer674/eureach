// Central credit configuration — single source of truth
// plans.credits: monthly allocation (-1 = unlimited)
// costs: credits deducted per action (0 = free, unlisted = 0)
module.exports = {
  plans: {
    free:    { credits: 150,  sites: 1,  crmLeads: 5,  wordpress: false },
    starter: { credits: 500,  sites: 2,  crmLeads: -1, wordpress: true  },
    pro:     { credits: 1500, sites: 3,  crmLeads: -1, wordpress: true  },
    agency:  { credits: -1,   sites: -1, crmLeads: -1, wordpress: true  },
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
