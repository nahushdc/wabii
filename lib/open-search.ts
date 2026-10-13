import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';

// Opens search. The intro shows only the first time; after that search opens
// directly.
export async function openSearch() {
  const { data: { user } } = await supabase.auth.getUser();
  const { data } = user
    ? await supabase.from('users').select('search_onboarding_seen').eq('id', user.id).maybeSingle()
    : { data: null };
  router.push(data?.search_onboarding_seen ? '/search-overlay' : '/search-onboarding');
}
