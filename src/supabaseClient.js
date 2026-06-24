import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://cffosiozfhadpjvgljgj.supabase.co'
const supabaseKey = 'sb_publishable_-Ug7RWjsZSvfmW32UBft8w_RbuDZcZZ'
export const supabase = createClient(supabaseUrl, supabaseKey)
