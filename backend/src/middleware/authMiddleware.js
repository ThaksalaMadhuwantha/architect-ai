import { createClient } from '@supabase/supabase-js';
import User from '../models/User.js';

const getSupabase = () => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
};

export const protect = async (req, res, next) => {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.split(' ')[1] : null;

    if (!token) {
      return res.status(401).json({ success: false, message: 'Unauthorized. Please sign in.' });
    }

    const supabase = getSupabase();
    if (!supabase) {
      return res.status(500).json({ success: false, message: 'Supabase configuration missing on server.' });
    }

    // Verify Supabase access token
    const { data: { user: sbUser }, error } = await supabase.auth.getUser(token);

    if (error || !sbUser) {
      return res.status(401).json({ success: false, message: 'Invalid or expired session. Please sign in again.' });
    }

    // Sync Supabase user with MongoDB User collection
    let user = await User.findOne({ email: sbUser.email });
    if (!user) {
      const meta = sbUser.user_metadata || {};
      const displayName = meta.full_name || meta.name || meta.user_name || sbUser.email.split('@')[0];
      user = await User.create({
        name: displayName,
        email: sbUser.email,
        password: `oauth_${sbUser.id}_${Date.now()}`,
      });
    }

    req.user = user;
    req.supabaseUser = sbUser;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error.message);
    return res.status(401).json({ success: false, message: 'Authentication failed.' });
  }
};