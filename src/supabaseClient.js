import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://wjkzdcjqntnmlmmgynch.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indqa3pkY2pxbnRubWxtbWd5bmNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYyMDQ4MzUsImV4cCI6MjEwMTc4MDgzNX0.BfK5LXhn7mY6hZCYUFmUDW7lscpLKL_Oam8q_u6w13Y';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);