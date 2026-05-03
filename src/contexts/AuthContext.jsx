import React, { createContext, useContext, useState, useEffect } from 'react';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { syncService } from '@/lib/syncService';

const AuthContext = createContext();

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initializeAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      let currentUser = session?.user;

      if (!currentUser) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: 'eletricapoweron@gmail.com',
          password: 'saga2011',
        });

        if (error && (error.message.includes('Invalid login credentials') || error.message.includes('Email not confirmed'))) {
            const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
              email: 'eletricapoweron@gmail.com',
              password: 'saga2011',
          });
          currentUser = signUpData?.user;
          if(signUpError && !signUpError.message.includes('User already registered')) {
            console.error("Sign up error:", signUpError);
          } else if (signUpData.user) {
             // After a fresh sign-up, try to sign in again to get a session
             const { data: signInData } = await supabase.auth.signInWithPassword({
                email: 'eletricapoweron@gmail.com',
                password: 'saga2011',
             });
             currentUser = signInData?.user;
          }
        } else {
          currentUser = data?.user;
        }
      }
      
      setUser(currentUser);
      if (currentUser) {
          window.userId = currentUser.id;
          await syncService.initialize(currentUser.id);
      }

      const { data: authListener } = supabase.auth.onAuthStateChange(
        async (_event, session) => {
          const newSessionUser = session?.user ?? null;
          setUser(newSessionUser);
          if (newSessionUser) {
              window.userId = newSessionUser.id;
              await syncService.initialize(newSessionUser.id);
          } else {
              window.userId = null;
              syncService.deinitialize();
          }
        }
      );
      
      setLoading(false);
      return () => authListener.subscription.unsubscribe();
    };

    initializeAuth();
  }, []);

  const signIn = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    toast({ title: "Sessão iniciada", description: "Bem-vindo ao NotasCat!" });
    return { data, error };
  };

  const signUp = async (email, password) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    toast({ title: "Conta criada!", description: "Bem-vindo ao NotasCat!" });
    return { data, error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    toast({ title: "Sessão encerrada", description: "Até logo!" });
  };

  const value = {
    user,
    loading,
    signIn,
    signUp,
    signOut,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}