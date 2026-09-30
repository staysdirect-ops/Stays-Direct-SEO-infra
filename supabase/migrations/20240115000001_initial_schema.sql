-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Admin users table
CREATE TABLE public.admin_users (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('admin', 'sales', 'editor')),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own profile"
  ON public.admin_users
  FOR SELECT
  USING (auth.uid() = user_id OR (SELECT role FROM public.admin_users WHERE user_id = auth.uid()) = 'admin');

-- Settings table (single row configuration)
CREATE TABLE public.settings (
  id integer PRIMARY KEY DEFAULT 1,
  brand_voice text DEFAULT 'Direct, practical, no fluff. Written for busy site and project managers. British English. Plain numbers, pppn pricing, bills included, same-day quotes, 24/7 UK support. Never hype. Never invent facts.',
  company_facts jsonb DEFAULT '{}',
  claude_model text DEFAULT 'claude-sonnet-5-5',
  openai_model text DEFAULT 'gpt-4-turbo-preview',
  perplexity_model text DEFAULT 'sonar',
  radar_min_value_gbp integer DEFAULT 500000,
  radar_match_radius_miles integer DEFAULT 25,
  radar_cpv_prefixes text[] DEFAULT ARRAY['45','71','50','51','65','76'],
  seo_pages_per_day integer DEFAULT 5,
  blog_posts_per_week integer DEFAULT 3,
  daily_ai_spend_cap_usd numeric DEFAULT 10.00,
  tracked_brand_names text[] DEFAULT ARRAY['StaysDirect','Stays Direct','staysdirect.co.uk'],
  competitor_names text[] DEFAULT ARRAY['Overnightly','Comfy Workers','Contractors Den','Rentastay','Offer2Stay','On Site Stays','Trade Rentals'],
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT single_row CHECK (id = 1)
);

ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Settings are readable by authenticated users"
  ON public.settings
  FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Settings are updatable by admins only"
  ON public.settings
  FOR UPDATE
  USING ((SELECT role FROM public.admin_users WHERE user_id = auth.uid()) = 'admin');

-- Properties table
CREATE TABLE public.properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  address text NOT NULL,
  town text NOT NULL,
  postcode text NOT NULL,
  location geography(Point, 4326),
  bedrooms integer NOT NULL,
  max_guests integer NOT NULL,
  parking_spaces integer DEFAULT 0,
  van_parking boolean DEFAULT false,
  pppn_from numeric NOT NULL,
  available_from date,
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'occupied', 'offline')),
  photos jsonb DEFAULT '[]',
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Properties are readable by authenticated users"
  ON public.properties
  FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Properties are updatable by admins and sales"
  ON public.properties
  FOR UPDATE
  USING (
    (SELECT role FROM public.admin_users WHERE user_id = auth.uid()) IN ('admin', 'sales')
  );

CREATE INDEX idx_properties_location ON public.properties USING GIST (location);
CREATE INDEX idx_properties_town ON public.properties(town);
CREATE INDEX idx_properties_postcode ON public.properties(postcode);

-- Towns table
CREATE TABLE public.towns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  slug text UNIQUE NOT NULL,
  county text,
  region text,
  location geography(Point, 4326),
  population integer,
  is_active boolean DEFAULT true,
  avg_hotel_pppn numeric,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.towns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Towns are readable by authenticated users"
  ON public.towns
  FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE INDEX idx_towns_location ON public.towns USING GIST (location);
CREATE INDEX idx_towns_slug ON public.towns(slug);

-- Leads table
CREATE TABLE public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamp with time zone DEFAULT now(),
  source text NOT NULL CHECK (source IN ('radar', 'seo_form', 'calculator', 'manual')),
  company_name text,
  companies_house_number text,
  contact_name text,
  contact_role text,
  contact_email text,
  contact_phone text,
  company_website text,
  project_id text,
  project_title text,
  site_town text,
  site_postcode text,
  est_workers integer,
  start_date date,
  value_gbp integer,
  matched_property_ids uuid[],
  nearest_property_miles numeric,
  outreach_subject text,
  outreach_body text,
  linkedin_message text,
  call_script text,
  score integer DEFAULT 0,
  flags text[],
  status text DEFAULT 'new' CHECK (status IN ('new', 'researching', 'ready', 'contacted', 'replied', 'quoted', 'won', 'lost', 'do_not_contact')),
  owner uuid REFERENCES public.admin_users(user_id),
  notes text,
  landing_page text,
  utm jsonb,
  synced_at timestamp with time zone,
  updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Leads are readable by authenticated users"
  ON public.leads
  FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Leads are updatable by owner or admin"
  ON public.leads
  FOR UPDATE
  USING (
    auth.uid() = owner OR (SELECT role FROM public.admin_users WHERE user_id = auth.uid()) = 'admin'
  );

CREATE INDEX idx_leads_status ON public.leads(status);
CREATE INDEX idx_leads_source ON public.leads(source);
CREATE INDEX idx_leads_created ON public.leads(created_at DESC);

-- Create leads_export view (stable column names for external consumption)
CREATE VIEW public.leads_export AS
SELECT
  id,
  created_at,
  source,
  company_name,
  companies_house_number,
  contact_name,
  contact_role,
  contact_email,
  contact_phone,
  company_website,
  project_id,
  project_title,
  site_town,
  site_postcode,
  est_workers,
  start_date,
  value_gbp,
  matched_property_ids,
  nearest_property_miles,
  outreach_subject,
  outreach_body,
  linkedin_message,
  call_script,
  score,
  flags,
  status,
  notes,
  landing_page,
  utm,
  synced_at
FROM public.leads;

ALTER TABLE public.leads_export OWNER TO postgres;

-- API usage tracking
CREATE TABLE public.api_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  model text,
  function_name text NOT NULL,
  tokens integer,
  est_cost_usd numeric,
  created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.api_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "API usage is readable by admins only"
  ON public.api_usage
  FOR SELECT
  USING ((SELECT role FROM public.admin_users WHERE user_id = auth.uid()) = 'admin');

-- Job runs tracking
CREATE TABLE public.job_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name text NOT NULL,
  started_at timestamp with time zone DEFAULT now(),
  finished_at timestamp with time zone,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'success', 'failed')),
  items_processed integer,
  error text,
  created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.job_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Job runs are readable by admins only"
  ON public.job_runs
  FOR SELECT
  USING ((SELECT role FROM public.admin_users WHERE user_id = auth.uid()) = 'admin');

CREATE INDEX idx_job_runs_status ON public.job_runs(status);
CREATE INDEX idx_job_runs_created ON public.job_runs(created_at DESC);

-- Insert default settings row
INSERT INTO public.settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
