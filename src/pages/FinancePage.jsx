import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Bell, Home, Settings, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { db } from '@/lib/db';
import PayablesDashboard from '@/components/PayablesDashboard';
import { requestNotificationPermission, registerPeriodicSync } from '@/lib/notificationService';
import FinanceDashboard from '@/components/FinanceDashboard';
import TransactionHistory from '@/components/TransactionHistory';
import FinanceCategoryManager from '@/components/FinanceCategoryManager';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';

async function getHashedPin(pin) {
  const { data, error } = await supabase.functions.invoke('hash-pin', {
    body: JSON.stringify({ pin }),
  });
  if (error) throw error;
  return data.hashedPin;
}

function ChangePinDialog({ isOpen, onClose }) {
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const { user } = useSupabaseAuth();

  const resetForm = () => {
    setCurrentPin('');
    setNewPin('');
    setConfirmPin('');
    setError('');
    setIsLoading(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handlePinChange = (setter) => (e) => {
    const value = e.target.value;
    if (/^\d*$/.test(value) && value.length <= 8) {
      setter(value);
      setError('');
    }
  };

  const handleSubmit = async () => {
    if (!currentPin || !newPin || !confirmPin) {
      setError('Todos os campos são obrigatórios.');
      return;
    }
    if (newPin.length < 4) {
      setError('O novo PIN deve ter pelo menos 4 dígitos.');
      return;
    }
    if (newPin !== confirmPin) {
      setError('Os novos PINs não coincidem.');
      return;
    }

    setIsLoading(true);
    try {
      const { data: settings, error: fetchError } = await supabase
        .from('app_user_settings')
        .select('pin_hash')
        .eq('user_id', user.id)
        .single();

      if (fetchError || !settings) throw new Error('Não foi possível verificar o PIN atual.');

      const currentPinHash = await getHashedPin(currentPin);
      if (currentPinHash !== settings.pin_hash) {
        setError('O PIN atual está incorreto.');
        setIsLoading(false);
        return;
      }

      const newPinHash = await getHashedPin(newPin);
      const { error: updateError } = await supabase
        .from('app_user_settings')
        .update({ pin_hash: newPinHash })
        .eq('user_id', user.id);

      if (updateError) throw updateError;

      toast({ title: 'Sucesso!', description: 'Seu PIN foi atualizado.' });
      handleClose();
    } catch (err) {
      console.error("Error changing PIN:", err);
      setError(err.message || 'Ocorreu um erro ao alterar o PIN.');
      toast({ variant: 'destructive', title: 'Erro', description: 'Não foi possível alterar o PIN.' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Alterar PIN de Acesso</DialogTitle>
          <DialogDescription>
            O PIN deve conter de 4 a 8 dígitos numéricos.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <Input type="password" placeholder="PIN Atual" value={currentPin} onChange={handlePinChange(setCurrentPin)} maxLength="8" />
          <Input type="password" placeholder="Novo PIN" value={newPin} onChange={handlePinChange(setNewPin)} maxLength="8" />
          <Input type="password" placeholder="Confirmar Novo PIN" value={confirmPin} onChange={handlePinChange(setConfirmPin)} maxLength="8" />
          {error && <p className="text-sm text-destructive text-center">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isLoading}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={isLoading}>
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Salvar Alterações'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FinancePage() {
  const navigate = useNavigate();
  const [isPinDialogOpen, setIsPinDialogOpen] = useState(false);

  useEffect(() => {
    db.app_state.put({ key: 'lastOpenPage', value: '/financas' });
    requestNotificationPermission().then(permission => {
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
        <title>Finanças — NotasCat</title>
        <meta name="description" content="Gerencie suas finanças, transações e contas a pagar." />
      </Helmet>
      
      <div className="flex flex-col h-screen bg-gray-50">
        <header className="flex-shrink-0 bg-white shadow-sm border-b sticky top-0 z-10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center space-x-2 sm:space-x-4">
                <Button variant="ghost" size="icon" className="sm:hidden" onClick={handleGoBack}><ArrowLeft className="h-4 w-4" /></Button>
                <Button variant="ghost" size="sm" className="hidden sm:flex items-center space-x-2" onClick={handleGoBack}>
                  <ArrowLeft className="h-4 w-4" />
                  <span>Voltar</span>
                </Button>
                <Button variant="ghost" size="icon" className="sm:hidden" onClick={handleGoHome}><Home className="h-4 w-4" /></Button>
                <Button variant="ghost" size="sm" className="hidden sm:flex items-center space-x-2" onClick={handleGoHome}>
                  <Home className="h-4 w-4" />
                  <span>Início</span>
                </Button>
                <motion.h1 
                  className="text-xl sm:text-2xl font-bold text-gray-900 truncate"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                >
                  Finanças
                </motion.h1>
              </div>
              
              <div className="flex items-center space-x-2">
                <Button variant="ghost" size="icon" onClick={() => setIsPinDialogOpen(true)}>
                  <Settings className="h-5 w-5" />
                  <span className="sr-only">Configurações de Segurança</span>
                </Button>
                <Button variant="outline" size="sm" className="hidden sm:flex items-center space-x-2" onClick={requestNotificationPermission}>
                  <Bell className="h-4 w-4" />
                  <span>Notificações</span>
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
                  <TabsTrigger value="history">Histórico</TabsTrigger>
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
      <ChangePinDialog isOpen={isPinDialogOpen} onClose={() => setIsPinDialogOpen(false)} />
    </>
  );
}

export default FinancePage;