'use strict';

const TEMPLATES = {
  services_marketplace: [
    { channel: 'SEO & Content',  job_type: 'article',           title: 'Write a weekly blog post for your niche',       weekday: 2, frequency: 'weekly',    est_minutes: 45 },
    { channel: 'Outreach',       job_type: 'outreach',          title: 'Follow up on open outreach leads',              weekday: 3, frequency: 'weekly',    est_minutes: 20 },
    { channel: 'Social',         job_type: 'facebook_post',     title: 'Create a Facebook post for your service',       weekday: 4, frequency: 'weekly',    est_minutes: 20 },
    { channel: 'Social',         job_type: 'instagram_post',    title: 'Post a service highlight on Instagram',         weekday: 5, frequency: 'weekly',    est_minutes: 20 },
    { channel: 'Marketing',      job_type: 'marketing_content', title: 'Create marketing content for your site',        weekday: 1, frequency: 'biweekly',  est_minutes: 30 },
    { channel: 'SEO & Content',  job_type: 'search_console',    title: 'Check Search Console for new queries & issues', weekday: 1, frequency: 'biweekly', est_minutes: 15 },
  ],
  b2b_service: [
    { channel: 'SEO & Content',  job_type: 'article',           title: 'Publish a thought-leadership article',          weekday: 2, frequency: 'biweekly', est_minutes: 60 },
    { channel: 'Social',         job_type: 'linkedin_post',     title: 'Share an insight or case study on LinkedIn',    weekday: 3, frequency: 'weekly',    est_minutes: 20 },
    { channel: 'Outreach',       job_type: 'outreach',          title: 'Reach out to 5 new B2B prospects',              weekday: 4, frequency: 'weekly',    est_minutes: 30 },
    { channel: 'Leads',          job_type: 'lead_finder',       title: 'Find new B2B leads in your niche',             weekday: 5, frequency: 'biweekly', est_minutes: 20 },
    { channel: 'Marketing',      job_type: 'marketing_content', title: 'Create marketing content for LinkedIn/email',   weekday: 1, frequency: 'biweekly',  est_minutes: 30 },
    { channel: 'SEO & Content',  job_type: 'aeo_check',         title: 'Run AI visibility check for your brand',        weekday: 1, frequency: 'monthly',   est_minutes: 15 },
  ],
  content_site: [
    { channel: 'SEO & Content',  job_type: 'article',           title: 'Publish 2 new articles this week',             weekday: 2, frequency: 'weekly',    est_minutes: 90 },
    { channel: 'SEO & Content',  job_type: 'article',           title: 'Update or repurpose an old article',           weekday: 4, frequency: 'weekly',    est_minutes: 45 },
    { channel: 'SEO & Content',  job_type: 'citation',          title: 'Build citations for your site this week',      weekday: 3, frequency: 'biweekly', est_minutes: 30 },
    { channel: 'Social',         job_type: 'facebook_post',     title: 'Share new content on Facebook',                weekday: 5, frequency: 'weekly',    est_minutes: 15 },
    { channel: 'SEO & Content',  job_type: 'competitor_check',  title: 'Check competitor rankings and content',        weekday: 1, frequency: 'biweekly', est_minutes: 20 },
    { channel: 'SEO & Content',  job_type: 'search_console',    title: 'Review GSC performance and fix issues',        weekday: 1, frequency: 'monthly',   est_minutes: 20 },
  ],
};

const TEMPLATE_LABELS = {
  services_marketplace: 'Services Marketplace',
  b2b_service:          'B2B Service',
  content_site:         'Content Site',
};

module.exports = { TEMPLATES, TEMPLATE_LABELS };
