import { supabase } from './supabaseClient.js';

export default async function handler(req, res) {
  try {
    const { data, error } = await supabase
      .from('spores')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('Supabase list error:', error);
      return res.status(500).json({ error: 'Failed to list spores' });
    }

    return res.status(200).json({ spores: data });
  } catch (err) {
    console.error('Unhandled /api/list error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}
