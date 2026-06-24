import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://cffosiozfhadpjvgljgj.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNmZm9zaW96ZmhhZHBqdmdsamdqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5NDM4NDUsImV4cCI6MjA5NzUxOTg0NX0.XrNzVHrYXiObZ1AlojFTIauLyriZdiBuWfv_uQTxPXY'
export const supabase = createClient(supabaseUrl, supabaseKey)
