import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import CategoryList from '@/components/CategoryList';
import { Button } from '@/components/ui/button';
import { LogOut, Landmark } from 'lucide-react';
import { db } from '@/lib/db';
import { useNavigate, useLocation } from 'react-router-dom';
import PinDialog from '@/components/PinDialog';
import QuickTransactionForm from '@/components/QuickTransactionForm';

function HomePage() {
  const { user, signOut } = useSupabaseAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isPinDialogOpen, setIsPinDialogOpen] = useState(false);

  React.useEffect(() => {
    db.app_state.put({ key: 'lastOpenPage', value: '/app' });
  }, []);

  const handleFinanceClick = () => {
    setIsPinDialogOpen(true);
  };

  const handlePinSuccess = () => {
    setIsPinDialogOpen(false);
    navigate('/financas', { state: { from: location.pathname } });
  };

  const handleTransactionSaved = () => {
    // Logic to refresh data if needed, but dexie-react-hooks should handle it.
  };

  return (
    <>
      <Helmet>
        <title>Dashboard — NotasCat</title>
        <meta name="description" content="Gerencie suas categorias e finanças." />
      </Helmet>
      
      <div className="flex flex-col h-screen bg-gray-50">
        <header className="flex-shrink-0 bg-white shadow-sm border-b sticky top-0 z-10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <motion.h1 
                className="text-2xl font-bold text-gray-900"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
              >
                NotasCat
              </motion.h1>
              
              <div className="flex items-center space-x-4">
                <span className="text-sm text-gray-600 hidden sm:inline">
                  {user?.email}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleFinanceClick}
                  className="flex items-center space-x-2"
                >
                  <Landmark className="h-4 w-4" />
                  <span className="hidden sm:inline">Finanças</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={signOut}
                  className="flex items-center space-x-2"
                >
                  <LogOut className="h-4 w-4" />
                  <span className="hidden sm:inline">Sair</span>
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
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                <div className="xl:col-span-2">
                  <div className="flex justify-between items-center mb-8">
                    <div>
                      <h2 className="text-3xl font-bold text-gray-900">Suas Categorias</h2>
                      <p className="text-gray-600 mt-1">Organize seus conteúdos por categorias</p>
                    </div>
                  </div>
                  <CategoryList />
                </div>
                <div className="xl:col-span-1">
                   <h2 className="text-3xl font-bold text-gray-900 mb-2">Adicionar Lançamento</h2>
                   <p className="text-gray-600 mt-1 mb-8">Registre uma transação ou despesa a pagar.</p>
                   <QuickTransactionForm onTransactionSaved={handleTransactionSaved}/>
                </div>
              </div>
            </motion.div>
          </div>
        </main>
      </div>
      <PinDialog
        isOpen={isPinDialogOpen}
        onClose={() => setIsPinDialogOpen(false)}
        onSuccess={handlePinSuccess}
      />
    </>
  );
}

export default HomePage;