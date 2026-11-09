import rateLimit from 'express-rate-limit';

const base = { standardHeaders: true, legacyHeaders: false };
const msg = (error) => ({ success: false, error });

// AI / parser routes `protect` එකට පස්සේ තියෙන නිසා req.user හැමවිටම තියෙනවා (user කෙනෙකුට වෙන වෙනම ගණන් කරනවා)
const perUser = (req) => req.user?._id?.toString() || 'anonymous';

// සාමාන්‍ය API: IP එකකට විනාඩි 15කට requests 300
export const apiLimiter = rateLimit({
  ...base, windowMs: 15 * 60 * 1000, limit: 300,
  message: msg('Requests ගොඩක් යවලා. විනාඩි කීපයකින් නැවත උත්සාහ කරන්න.'),
});

// Login / Register brute-force වලට එරෙහිව: IP එකකට විනාඩි 15කට 20
export const authLimiter = rateLimit({
  ...base, windowMs: 15 * 60 * 1000, limit: 20,
  message: msg('Login / Register උත්සාහයන් වැඩියි. විනාඩි 15කින් නැවත උත්සාහ කරන්න.'),
});

// AI requests (free quota එක user කෙනෙක් විසින් ඉවර කරන එක වළක්වන්න): user කෙනෙකුට පැයකට 30
export const aiLimiter = rateLimit({
  ...base, windowMs: 60 * 60 * 1000, limit: 30, keyGenerator: perUser,
  message: msg('පැයකට AI requests 30ක සීමාවට ලැබුණා. පසුව නැවත උත්සාහ කරන්න.'),
});

// Repo / ZIP analyze (බර වැඩක්): user කෙනෙකුට විනාඩි 15කට 15
export const parseLimiter = rateLimit({
  ...base, windowMs: 15 * 60 * 1000, limit: 15, keyGenerator: perUser,
  message: msg('Project analyze කිරීම් වැඩියි. විනාඩි කීපයකින් නැවත උත්සාහ කරන්න.'),
});
