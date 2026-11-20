import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

const publicUser = (u) => ({ id: u._id, name: u.name, email: u.email });

export const register = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Name, email සහ password අවශ්‍යයි.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password අකුරු 6කට වඩා තිබිය යුතුයි.' });
    }

    const exists = await User.findOne({ email: email.toLowerCase() });
    if (exists) {
      return res.status(409).json({ success: false, message: 'මේ email එකෙන් account එකක් දැනටමත් තියෙනවා.' });
    }

    const user = await User.create({ name, email, password });
    res.status(201).json({ success: true, token: signToken(user._id), user: publicUser(user) });
  } catch (error) {
    console.error('Register Error:', error);
    res.status(500).json({ success: false, message: 'Server error. පසුව නැවත උත්සාහ කරන්න.' });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email සහ password අවශ්‍යයි.' });
    }

    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
    if (!user || !(await user.matchPassword(password))) {
      return res.status(401).json({ success: false, message: 'Email හෝ password වැරදියි.' });
    }

    res.json({ success: true, token: signToken(user._id), user: publicUser(user) });
  } catch (error) {
    console.error('Login Error:', error);
    res.status(500).json({ success: false, message: 'Server error. පසුව නැවත උත්සාහ කරන්න.' });
  }
};

export const getMe = (req, res) => {
  res.json({ success: true, user: publicUser(req.user) });
};
