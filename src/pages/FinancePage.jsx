import React, { useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Bell, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { db } from '@/lib/db';
import PayablesDashboard from '@/components/PayablesDashboard';
import { requestNotificationPermission, registerPeriodicSync } from '@/lib/notificationService';
import FinanceDashboard from '@/components/FinanceDashboard';
import TransactionHistory from '@/components/TransactionHistory';
import FinanceCategoryManager from '@/components/FinanceCategoryManager';

function FinancePage() {
  const navigate = useNavigate();

  useEffect(() => {
    db.app_state.put({ key: 'lastOpenPage', value: '/financas' });
    requestNotificationPermission().then((permission) => {
      if (permission === 'granted') {
        registerPeriodicSync();
      }
    });
  }, []);

  const handleGoBack = () => {
    navigate(-1);
  };

  const handleGoHome = () => {
    navigate('/app');
  };

  return (
    <>
      <Helmet>
        <title>Financas - NotasCat</title>
        <meta name="description" content="Gerencie suas financas, transacoes e contas a pagar." />
      </Helmet>

      <div className="flex flex-col h-screen bg-gray-50">
        <header className="flex-shrink-0 bg-white shadow-sm border-b sticky top-0 z-10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center space-x-2 sm:space-x-4">
                <Button variant="ghost" size="icon" className="sm:hidden" onClick={handleGoBack}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" className="hidden sm:flex items-center space-x-2" onClick={handleGoBack}>
                  <ArrowLeft className="h-4 w-4" />
                  <span>Voltar</span>
                </Button>
                <Button variant="ghost" size="icon" className="sm:hidden" onClick={handleGoHome}>
                  <Home className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" className="hidden sm:flex items-center space-x-2" onClick={handleGoHome}>
                  <Home className="h-4 w-4" />
                  <span>Inicio</span>
                </Button>
                <motion.h1
                  className="text-xl sm:text-2xl font-bold text-gray-900 truncate"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                >
                  Financas
                </motion.h1>
              </div>

              <div className="flex items-center space-x-2">
                <Button variant="outline" size="sm" className="hidden sm:flex items-center space-x-2" onClick={requestNotificationPermission}>
                  <Bell className="h-4 w-4" />
                  <span>Notificacoes</span>
                </Button>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <Tabs defaultValue="dashboard" className="w-full">
                <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 mb-8">
                  <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
                  <TabsTrigger value="history">Historico</TabsTrigger>
                  <TabsTrigger value="payables">A Pagar</TabsTrigger>
                  <TabsTrigger value="categories">Categorias</TabsTrigger>
                </TabsList>

                <TabsContent value="dashboard">
                  <FinanceDashboard />
                </TabsContent>

                <TabsContent value="history">
                  <TransactionHistory />
                </TabsContent>

                <TabsContent value="payables">
                  <PayablesDashboard />
                </TabsContent>

                <TabsContent value="categories">
                  <FinanceCategoryManager />
                </TabsContent>
              </Tabs>
            </motion.div>
          </div>
        </main>
      </div>
    </>
  );
}

export default FinancePage;
