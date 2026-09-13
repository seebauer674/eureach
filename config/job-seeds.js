'use strict';

// Templates seeded when a user creates a new site.
// Each entry in a template array becomes a recurring_job for that site.
// weekday: 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat, 7=Sun

const TEMPLATES = {
  services_marketplace: [
    { channel: 'SEO & Content',  job_type: 'article',         title: 'Write a weekly blog post for your niche',       weekday: 2, frequency: 'weekly',    est_minutes: 45 },
    { channel: 'Outreach',       job_type: 'outreach',         title: 'Follow up on open outreach leads',              weekday: 3, frequency: 'weekly',    est_minutes: 20 },
    { channel: 'Social',         job_type: 'facebook_ad',      title: 'Review and refresh Facebook ad performance',    weekday: 4, frequency: 'biweekly',  est_minutes: 30 },
    { channel: 'Social',         job_type: 'instagram_post',   title: 'Post a service highlight on Instagram',         weekday: 5, frequency: 'weekly',    est_minutes: 20 },
    { channel: 'Email',          job_type: 'email_campaign',   title: 'Send monthly newsletter to subscribers',        weekday: 1, frequency: 'monthly',   est_minutes: 60 },
    { channel: 'SEO & Content',  job_type: 'search_console',   title: 'Check Search Console for new queries & issues', weekday: 1, frequency: 'biweekly', est_minutes: 15 },
  ],
  b2b_service: [
    { channel: 'SEO & Content',  job_type: 'article',          title: 'Publish a thought-leadership article',          weekday: 2, frequency: 'biweekly', est_minutes: 60 },
    { channel: 'Social',         job_type: 'linkedin_post',    title: 'Share an insight or case study on LinkedIn',    weekday: 3, frequency: 'weekly',    est_minutes: 20 },
    { channel: 'Outreach',       job_type: 'outreach',         title: 'Reach out to 5 new B2B prospects',              weekday: 4, frequency: 'weekly',    est_minutes: 30 },
    { channel: 'Social',         job_type: 'linkedin_ad',      title: 'Review LinkedIn Campaign Manager performance',  weekday: 5, frequency: 'biweekly', est_minutes: 20 },
    { channel: 'Email',          job_type: 'email_campaign',   title: 'Send monthly client update email',              weekday: 1, frequency: 'monthly',   est_minutes: 45 },
    { channel: 'SEO & Content',  job_type: 'aeo_check',        title: 'Run AI visibility check for your brand',        weekday: 1, frequency: 'monthly',   est_minutes: 15 },
  ],
  content_site: [
    { channel: 'SEO & Content',  job_type: 'article',          title: 'Publish 2 new articles this week',             weekday: 2, frequency: 'weekly',    est_minutes: 90 },
    { channel: 'SEO & Content',  job_type: 'article',          title: 'Update or repurpose an old article',           weekday: 4, frequency: 'weekly',    est_minutes: 45 },
    { channel: 'SEO & Content',  job_type: 'citation',         title: 'Build citations for your site this week',      weekday: 3, frequency: 'biweekly', est_minutes: 30 },
    { channel: 'Social',         job_type: 'instagram_post',   title: 'Post content highlights on Instagram',         weekday: 5, frequency: 'weekly',    est_minutes: 20 },
    { channel: 'SEO & Content',  job_type: 'search_console',   title: 'Review GSC performance and fix issues',        weekday: 1, frequency: 'biweekly', est_minutes: 20 },
    { channel: 'SEO & Content',  job_type: 'analytics',        title: 'Review GA4 traffic and top pages',             weekday: 1, frequency: 'monthly',   est_minutes: 20 },
  ],
};

const TEMPLATE_LABELS = {
  services_marketplace: 'Services Marketplace',
  b2b_service:          'B2B Service',
  content_site:         'Content Site',
};

module.exports = { TEMPLATES, TEMPLATE_LABELS };
