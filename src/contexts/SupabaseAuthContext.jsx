import React, { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from 'react';
    import { supabase } from '@/lib/customSupabaseClient';
    import { useToast } from '@/components/ui/use-toast';
    import { syncService } from '@/lib/syncService';
    import { db, DB_NAME, DB_VERSION, recoverAndOpenDb } from '@/lib/db';
    import Dexie from 'dexie';

    const AuthContext = createContext(undefined);
    const dbChannel = new BroadcastChannel('notascat-db');

    const ADMIN_EMAIL = 'eletricapoweron@gmail.com';
    const ADMIN_PASSWORD = 'saga2011';

    export const SupabaseAuthProvider = ({ children }) => {
      const { toast } = useToast();

      const [user, setUser] = useState(null);
      const [session, setSession] = useState(null);
      const [loading, setLoading] = useState(true);
      const [initialized, setInitialized] = useState(false);
      const [isDbReady, setIsDbReady] = useState(false);
      const [dbStatus, setDbStatus] = useState("Carregando...");
      const authFlowStarted = useRef(false);

      const initializeDb = useCallback(async () => {
        try {
          setDbStatus("Abrindo cache local...");
          if (!db.isOpen()) {
            await db.open();
          }
          setIsDbReady(true);
          setDbStatus("Cache pronto.");
          console.log("IndexedDB opened successfully with version", db.verno);
        } catch (error) {
          if (error instanceof Dexie.VersionError) {
            console.warn("VersionError detectado. Tentando recuperar...", error);
            setDbStatus("Atualizando cache...");
            dbChannel.postMessage({ type: 'DB_RECOVERY_START' });
            await recoverAndOpenDb();
            dbChannel.postMessage({ type: 'DB_RECOVERY_COMPLETE' });
            setIsDbReady(true);
            setDbStatus("Cache atualizado.");
          } else {
            console.error("Falha ao abrir o IndexedDB:", error);
            setDbStatus("Erro no cache.");
            toast({
                variant: "destructive",
                title: "Erro Crítico de Banco de Dados",
                description: "Não foi possível carregar o banco de dados local. Tente limpar os dados do site.",
            });
          }
        }
      }, [toast]);
      
      useEffect(() => {
        const handleDbMessage = (event) => {
            if(event.data.type === 'DB_RECOVERY_START') {
                setDbStatus("Cache sendo atualizado por outra aba...");
                if(db.isOpen()) db.close();
            }
            if (event.data.type === 'DB_RECOVERY_COMPLETE') {
                console.log("Recuperação do DB concluída, recarregando a página.");
                window.location.reload();
            }
        };
        dbChannel.addEventListener('message', handleDbMessage);
        initializeDb();
        return () => dbChannel.removeEventListener('message', handleDbMessage);
      }, [initializeDb]);

      const upsertAdminProfile = useCallback(async (adminUser) => {
        const { error } = await supabase
          .from('app_users')
          .upsert({
            email: ADMIN_EMAIL,
            auth_user_id: adminUser.id,
            role: 'admin',
            status: 'active',
            expires_at: null,
          }, { onConflict: 'email' });

        if (error) {
          console.error("Falha ao garantir perfil de admin:", error);
          toast({ variant: 'destructive', title: 'Erro de Perfil', description: 'Não foi possível configurar o perfil de administrador.' });
        }
      }, [toast]);

      const handleSession = useCallback(async (currentSession) => {
        const currentUser = currentSession?.user ?? null;
        
        setUser(currentUser);
        setSession(currentSession);

        if (!currentUser) {
          syncService.deinitialize();
        }
        
        setInitialized(true);
        setLoading(false);
      }, [toast]);

      useEffect(() => {
        if (isDbReady && user && !syncService.getUserId()) {
          (async () => {
            if (user.email === ADMIN_EMAIL) {
              await upsertAdminProfile(user);
            }
            setDbStatus("Sincronizando dados...");
            await syncService.initialize(user.id);
            setDbStatus("Tudo pronto!");
          })();
        }
      }, [isDbReady, user, upsertAdminProfile]);

      const restoreAdminAndStartSession = useCallback(async () => {
        setLoading(true);
        setDbStatus("Restaurando sessão...");
      
        try {
          const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
      
          if (signInError) {
            if (signInError.message.includes('Invalid login credentials') || signInError.message.includes('User not found')) {
              const { data: signUpData, error: signUpError } = await supabase.auth.signUp({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
              
              if (signUpError && !signUpError.message.includes('User already registered')) {
                throw new Error(`Falha no signUp: ${signUpError.message}`);
              }
      
              if (signUpData.user && signUpData.user.identities && signUpData.user.identities.length === 0) {
                throw new Error("O Auto-confirm não está ativado no Supabase. Confirme o e-mail do admin antes de continuar.");
              }
      
              const { data: finalSignInData, error: finalSignInError } = await supabase.auth.signInWithPassword({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
      
              if (finalSignInError) {
                throw new Error(`Falha no login pós-cadastro: ${finalSignInError.message}`);
              }
              await handleSession(finalSignInData.session);
      
            } else {
              throw new Error(`Erro no login: ${signInError.message}`);
            }
          } else {
            await handleSession(signInData.session);
          }
        } catch (error) {
          console.error("Erro no fluxo de restauração de admin:", error);
          toast({ variant: "destructive", title: "Erro na Restauração", description: error.message });
          setLoading(false);
          setInitialized(true); 
        }
      }, [handleSession, toast]);
      
      const handleSignOut = useCallback(() => {
        setUser(null);
        setSession(null);
        setInitialized(true);
        setLoading(false);
        syncService.deinitialize();
        db.delete().then(() => {
            console.log("Database deleted on sign out.");
            window.location.reload();
        }).catch(err => {
            console.error("Could not delete database on sign out.", err);
            window.location.reload();
        });
      }, []);

      useEffect(() => {
        if (!isDbReady || authFlowStarted.current) return;
        authFlowStarted.current = true;
        
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session) {
                handleSession(session);
            } else {
                setLoading(false);
                setInitialized(true);
            }
        });
        
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
          (event, session) => {
            if (event === 'SIGNED_OUT') {
                handleSignOut();
            } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
                handleSession(session);
            } else if (event === 'INITIAL_SESSION' && !session) {
                setLoading(false);
                setInitialized(true);
            } else if (event === 'PASSWORD_RECOVERY') {
                // Handle password recovery if needed
            }
          }
        );

        return () => {
          subscription.unsubscribe();
        }
      }, [isDbReady, handleSession, handleSignOut]);

      const signUp = useCallback(async (email, password) => {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) {
          toast({ variant: "destructive", title: "Falha ao criar conta", description: error.message || "Algo deu errado" });
        }
        return { data, error };
      }, [toast]);

      const signIn = useCallback(async (email, password) => {
        setLoading(true);
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          toast({ variant: "destructive", title: "Falha ao entrar", description: "Email ou senha inválidos." });
          setLoading(false);
        } else if (data.session) {
          await handleSession(data.session);
        }
        return { data, error };
      }, [toast, handleSession]);

      const signOut = useCallback(async () => {
        const { error } = await supabase.auth.signOut();
        if (error) {
          toast({ variant: "destructive", title: "Falha ao sair", description: error.message });
        } else {
          handleSignOut();
        }
        return { error };
      }, [toast, handleSignOut]);

      const resendConfirmation = useCallback(async (email) => {
        const { error } = await supabase.auth.resend({ type: 'signup', email: email });
        if (error) {
            toast({ variant: 'destructive', title: 'Erro ao reenviar', description: 'Não foi possível reenviar o e-mail.' });
        } else {
            toast({ title: 'E-mail reenviado!', description: 'Verifique sua caixa de entrada.' });
        }
      }, [toast]);
      
      const restoreAdmin = useCallback(async () => {
        await restoreAdminAndStartSession();
      }, [restoreAdminAndStartSession]);

      const hardReset = useCallback(async () => {
        setLoading(true);
        setDbStatus("Iniciando reset completo...");
        
        try {
          syncService.deinitialize();
          if (db.isOpen()) db.close();
          await Dexie.delete(DB_NAME);
          localStorage.clear();
          sessionStorage.clear();
          
          const registrations = await navigator.serviceWorker.getRegistrations();
          for(const registration of registrations) {
            await registration.unregister();
          }
          
          setDbStatus("Cache local limpo. Limpando dados remotos...");
          
          const { data: { user: adminUser }, error: adminError } = await supabase.auth.admin.createUser({
            email: ADMIN_EMAIL,
            password: ADMIN_PASSWORD,
            email_confirm: true,
          });
      
          if (adminError && !adminError.message.includes('already registered')) {
            throw new Error(`Falha ao criar admin: ${adminError.message}`);
          }
      
          const { data: { session: adminSession }, error: sessionError } = await supabase.auth.signInWithPassword({
            email: ADMIN_EMAIL,
            password: ADMIN_PASSWORD,
          });
      
          if (sessionError) throw new Error(`Falha ao logar como admin: ${sessionError.message}`);
      
          const tablesToTruncate = [
            'webhook_logs', 'webhooks', 'finance_transactions', 'finance_payables',
            'links', 'notes', 'categories', 'finance_categories', 'app_user_settings', 'app_users'
          ];
      
          for (const table of tablesToTruncate) {
            const { error: deleteError } = await supabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
            if (deleteError) console.warn(`Warn ao limpar ${table}: ${deleteError.message}`);
          }
      
          await upsertAdminProfile(adminSession.user);
      
          const { data: hashData, error: hashError } = await supabase.functions.invoke('hash-pin', { body: JSON.stringify({ pin: '1234' }) });
          if (hashError) throw new Error('Falha ao gerar hash do PIN');
      
          await supabase.from('app_user_settings').upsert({
            user_id: adminSession.user.id,
            pin_hash: hashData.hashedPin,
          }, { onConflict: 'user_id' });
      
          toast({ title: "Reset completo!", description: "O aplicativo foi restaurado para o estado inicial." });
          
        } catch (error) {
          console.error("Erro no hard reset:", error);
          toast({ variant: "destructive", title: "Falha no Reset", description: error.message });
        } finally {
          setDbStatus("Reset finalizado. Recarregando...");
          setTimeout(() => window.location.reload(), 1000);
        }
      }, [toast, upsertAdminProfile]);

      const value = useMemo(() => ({
        user,
        session,
        loading,
        initialized: initialized && isDbReady,
        dbStatus,
        signUp,
        signIn,
        signOut,
        resendConfirmation,
        restoreAdmin,
        hardReset,
      }), [user, session, loading, initialized, isDbReady, dbStatus, signUp, signIn, signOut, resendConfirmation, restoreAdmin, hardReset]);

      return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
    };

    export const useSupabaseAuth = () => {
      const context = useContext(AuthContext);
      if (context === undefined) {
        throw new Error('useSupabaseAuth must be used within a SupabaseAuthProvider');
      }
      return context;
    };