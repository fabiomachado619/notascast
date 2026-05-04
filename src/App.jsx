import React, { useState, useEffect } from 'react';
import { HashRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Toaster } from '@/components/ui/toaster';
import { SupabaseAuthProvider, useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import LoginPage from '@/pages/LoginPage';
import HomePage from '@/pages/HomePage';
import CategoryPage from '@/pages/CategoryPage';
import FinancePage from '@/pages/FinancePage';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Wifi, WifiOff, ServerCog, UploadCloud, Loader2 } from 'lucide-react';
import { syncService } from '@/lib/syncService';
import PWAInstallPrompt from '@/components/PWAInstallPrompt';
import { db } from './lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { checkAndSendPayableNotifications } from '@/lib/notificationService';
import { useToast } from "@/components/ui/use-toast";
import Clock from '@/components/Clock';
import { formatRelative } from 'date-fns';
import { ptBR } from 'date-fns/locale';

function getPlatform() {
  const userAgent = window.navigator.userAgent || window.navigator.vendor || window.opera;
  if (/iPad|iPhone|iPod/.test(userAgent) && !window.MSStream) {
    return 'ios';
  }
  if (/android/i.test(userAgent)) {
    return 'android';
  }
  return 'desktop';
}

function AuthRouter() {
  const { user, loading, initialized, dbStatus } = useSupabaseAuth();
  const location = useLocation();

  if (loading || !initialized) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="animate-spin rounded-full h-12 w-12 text-blue-600 mx-auto" />
          <p className="mt-4 text-gray-600">{dbStatus}</p>
        </div>
      </div>
    );
  }

  if (user && initialized) {
    if (location.pathname === '/') {
      return <Navigate to="/app" replace />;
    }
    return <ProtectedRoutes />;
  }

  if (!user && (location.pathname.startsWith('/app') || location.pathname.startsWith('/financas'))) {
    return <Navigate to="/" replace />;
  }

  return (
    <Routes>
      <Route path="/" element={<LoginPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function ProtectedRoutes() {
  const navigate = useNavigate();
  const location = useLocation();
  const lastOpenPage = useLiveQuery(() => db.app_state.get('lastOpenPage'), []);

  useEffect(() => {
  }, [lastOpenPage, location.pathname, navigate]);
  
  return (
    <>
      <Routes>
        <Route path="/app" element={<HomePage />} />
        <Route path="/app/c/:id" element={<CategoryPage />} />
        <Route path="/financas" element={<FinancePage />} />
        <Route path="*" element={<Navigate to="/app" replace />} />
      </Routes>
      <AppStatusIndicator />
    </>
  );
}

function AppStatusIndicator() {
  const [isOnline, setIsOnline] = useState(syncService.isOnline());
  const [syncStatus, setSyncStatus] = useState(syncService.getSyncStatus());
  const [lastSyncTime, setLastSyncTime] = useState(null);

  useEffect(() => {
    const handleOnlineStatus = (e) => setIsOnline(e.detail.isOnline);
    const handleSyncStatus = (e) => {
        setSyncStatus(e.detail.status);
        if (e.detail.lastSyncTime) {
            setLastSyncTime(e.detail.lastSyncTime);
            localStorage.setItem('lastSyncTime', e.detail.lastSyncTime.toISOString());
        }
    };

    document.addEventListener('onlineStatusChange', handleOnlineStatus);
    document.addEventListener('syncStatusChange', handleSyncStatus);
    
    const storedTime = localStorage.getItem('lastSyncTime');
    if (storedTime) {
      setLastSyncTime(new Date(storedTime));
    }

    return () => {
      document.removeEventListener('onlineStatusChange', handleOnlineStatus);
      document.removeEventListener('syncStatusChange', handleSyncStatus);
    };
  }, []);
  
  const getStatusChip = () => {
      if (!isOnline) {
          return (
              <div className="flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-800">
                  <WifiOff className="h-4 w-4" />
                  <span>Offline</span>
              </div>
          );
      }
      switch (syncStatus) {
          case 'Atualizando':
              return (
                  <div className="flex items-center gap-2 rounded-full bg-blue-100 px-3 py-1.5 text-sm font-medium text-blue-800 animate-pulse">
                      <UploadCloud className="h-4 w-4" />
                      <span>Atualizando...</span>
                  </div>
              );
          case 'Sincronizado':
              return (
                  <div className="flex items-center gap-2 rounded-full bg-green-100 px-3 py-1.5 text-sm font-medium text-green-800">
                      <ServerCog className="h-4 w-4" />
                      <span className="flex flex-col text-left">
                        <span>Sincronizado</span>
                        {lastSyncTime && (
                           <span className="text-xs text-green-700 -mt-1 capitalize">
                                {formatRelative(lastSyncTime, new Date(), { locale: ptBR })}
                            </span>
                        )}
                      </span>
                  </div>
              );
          default:
            return null;
      }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 pointer-events-none flex flex-col items-end gap-2 print:hidden">
      {getStatusChip()}
      <Clock />
    </div>
  );
}

function App() {
  const [installPrompt, setInstallPrompt] = useState(null);
  const [isInstallPromptOpen, setIsInstallPromptOpen] = useState(false);
  const platform = getPlatform();
  const { toast } = useToast();

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        toast({
            title: "Ícone atualizado!",
            description: "Feche e abra novamente ou reinstale o app para ver o novo ícone. ✨",
            duration: 9000
        });
      });
    }
  }, [toast]);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setInstallPrompt(e);
      
      const alreadyShown = localStorage.getItem('pwaInstallPromptShown');
      if (!alreadyShown) {
        setIsInstallPromptOpen(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    const alreadyShown = localStorage.getItem('pwaInstallPromptShown');
    if (platform === 'ios' && !isStandalone && !alreadyShown) {
      setTimeout(() => setIsInstallPromptOpen(true), 2000);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, [platform]);

  useEffect(() => {
    const handleNotificationCheck = () => checkAndSendPayableNotifications();
    document.addEventListener('checkPayableNotifications', handleNotificationCheck);
    return () => document.removeEventListener('checkPayableNotifications', handleNotificationCheck);
  }, []);

  const handleInstallClick = () => {
    if (installPrompt) {
      installPrompt.prompt();
      installPrompt.userChoice.then((choiceResult) => {
        if (choiceResult.outcome === 'accepted') {
          console.log('User accepted the install prompt');
        } else {
          console.log('User dismissed the install prompt');
        }
        setInstallPrompt(null);
        setIsInstallPromptOpen(false);
        localStorage.setItem('pwaInstallPromptShown', 'true');
      });
    } else {
      setIsInstallPromptOpen(false);
      localStorage.setItem('pwaInstallPromptShown', 'true');
    }
  };

  const handleClosePrompt = () => {
    setIsInstallPromptOpen(false);
    localStorage.setItem('pwaInstallPromptShown', 'true');
  };

  return (
    <Router>
      <SupabaseAuthProvider>
        <TooltipProvider>
          <div className="min-h-screen bg-white">
            <AuthRouter />
            <Toaster />
            <PWAInstallPrompt
              isOpen={isInstallPromptOpen}
              onClose={handleClosePrompt}
              onInstall={handleInstallClick}
              platform={platform}
            />
          </div>
        </TooltipProvider>
      </SupabaseAuthProvider>
    </Router>
  );
}

export default App;
