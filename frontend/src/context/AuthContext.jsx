/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { clearWorkspaceDraft } from '../lib/workspaceDraft';

const AuthContext = createContext(null);
const GH_TOKEN_KEY = 'architect_ai_gh_token';

const formatUser = (sbUser) => {
  if (!sbUser) return null;
  const meta = sbUser.user_metadata || {};
  return {
    id: sbUser.id,
    email: sbUser.email,
    name: meta.full_name || meta.name || meta.user_name || sbUser.email?.split('@')[0] || 'Developer',
    avatar: meta.avatar_url || meta.picture || '',
    provider: sbUser.app_metadata?.provider || 'email',
  };
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [githubToken, setGithubToken] = useState(() => sessionStorage.getItem(GH_TOKEN_KEY) || '');
  const [loading, setLoading] = useState(true);

  // Persist GitHub provider_token in sessionStorage when returned by Supabase
  const syncProviderToken = (activeSession) => {
    if (activeSession?.provider_token) {
      sessionStorage.setItem(GH_TOKEN_KEY, activeSession.provider_token);
      setGithubToken(activeSession.provider_token);
    }
  };

  // Clear stale or expired GitHub token without logging the user out of the app
  const clearGithubToken = () => {
    sessionStorage.removeItem(GH_TOKEN_KEY);
    setGithubToken('');
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      setSession(currentSession);
      setUser(formatUser(currentSession?.user));
      syncProviderToken(currentSession);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setUser(formatUser(newSession?.user));
      syncProviderToken(newSession);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const login = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const register = async (name, email, password) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name } },
    });
    if (error) throw error;
  };

  const loginWithOAuth = async (provider) => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/app`,
        ...(provider === 'github' ? { scopes: 'read:user user:email repo' } : {}),
      },
    });
    if (error) throw error;
  };

  // Link GitHub to the existing Google/Email session if enabled, otherwise fallback to OAuth sign-in
  const connectGithub = async () => {
    if (session && typeof supabase.auth.linkIdentity === 'function') {
      const { error } = await supabase.auth.linkIdentity({
        provider: 'github',
        options: {
          redirectTo: `${window.location.origin}/app`,
          scopes: 'read:user user:email repo',
        },
      });
      if (!error) return;
      console.warn('Identity linking unavailable, falling back to GitHub OAuth:', error.message);
    }
    await loginWithOAuth('github');
  };

  const logout = async () => {
    await supabase.auth.signOut();
    sessionStorage.removeItem(GH_TOKEN_KEY);
    await clearWorkspaceDraft();
    setGithubToken('');
    setUser(null);
    setSession(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        githubToken,
        loading,
        login,
        register,
        loginWithOAuth,
        connectGithub,
        clearGithubToken,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);