import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'hospital-research-session';
const subscribers = new Set();

const readSession = () => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw);
  } catch (error) {
    console.error('Failed to parse session', error);
    return null;
  }
};

const writeSession = (session) => {
  if (typeof window === 'undefined') return;
  if (!session) {
    window.localStorage.removeItem(STORAGE_KEY);
  } else {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  }
  subscribers.forEach((cb) => cb(session));
};

export const getSession = () => readSession();

export const saveSession = (session) => {
  writeSession(session);
};

export const clearSession = () => {
  writeSession(null);
};

export const updateTokens = ({ accessToken, refreshToken }) => {
  const current = readSession();
  if (!current) return;
  const updated = {
    ...current,
    accessToken: accessToken || current.accessToken,
    refreshToken: refreshToken || current.refreshToken,
  };
  writeSession(updated);
};

const subscribe = (cb) => {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
};

const AuthContext = createContext({
  user: null,
  accessToken: null,
  refreshToken: null,
  isAuthenticated: false,
  loading: true,
  setSession: () => {},
  logout: () => {},
});

export const AuthProvider = ({ children }) => {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setSession(readSession());
    setLoading(false);
    const unsubscribe = subscribe((next) => {
      setSession(next);
    });
    return () => unsubscribe();
  }, []);

  const value = useMemo(
    () => ({
      user: session?.user ?? null,
      accessToken: session?.accessToken ?? null,
      refreshToken: session?.refreshToken ?? null,
      isAuthenticated: Boolean(session?.accessToken && session?.user),
      loading,
      setSession: (nextSession) => saveSession(nextSession),
      logout: () => clearSession(),
    }),
    [session, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
