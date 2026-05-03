import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { Loader2 } from 'lucide-react';

const DEFAULT_PIN = '1234';

async function getHashedPin(pin) {
  const { data, error } = await supabase.functions.invoke('hash-pin', {
    body: JSON.stringify({ pin }),
  });
  if (error) throw error;
  return data.hashedPin;
}

function PinDialog({ isOpen, onClose, onSuccess }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [pinHash, setPinHash] = useState(null);
  const { toast } = useToast();
  const { user } = useSupabaseAuth();

  const fetchOrCreatePinSettings = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      let { data: settings, error: fetchError } = await supabase
        .from('app_user_settings')
        .select('pin_hash')
        .eq('user_id', user.id)
        .maybeSingle();

      if (fetchError) throw fetchError;

      if (!settings || !settings.pin_hash) {
        const newPinHash = await getHashedPin(DEFAULT_PIN);
        const { data: newSettings, error: upsertError } = await supabase
          .from('app_user_settings')
          .upsert({ user_id: user.id, pin_hash: newPinHash }, { onConflict: 'user_id' })
          .select()
          .single();
        
        if (upsertError) throw upsertError;
        setPinHash(newSettings.pin_hash);
      } else {
        setPinHash(settings.pin_hash);
      }
    } catch (err) {
      console.error("Error with PIN settings:", err);
      setError("Não foi possível carregar as configurações de PIN.");
      toast({ variant: 'destructive', title: 'Erro de Configuração', description: 'Tente novamente mais tarde.' });
    } finally {
      setIsLoading(false);
    }
  }, [user, toast]);

  useEffect(() => {
    if (isOpen) {
      setPin('');
      setError('');
      setPinHash(null);
      fetchOrCreatePinSettings();
    }
  }, [isOpen, fetchOrCreatePinSettings]);

  const handlePinChange = (e) => {
    const value = e.target.value;
    if (/^\d*$/.test(value) && value.length <= 8) {
      setPin(value);
      setError('');
    }
  };

  const handleSubmit = async () => {
    if (pin.length < 4) {
      setError('O PIN deve ter pelo menos 4 dígitos.');
      return;
    }
    setIsLoading(true);
    try {
      const enteredPinHash = await getHashedPin(pin);
      if (enteredPinHash === pinHash) {
        onSuccess();
      } else {
        setError('PIN incorreto. Tente novamente.');
        setPin('');
        toast({
          variant: 'destructive',
          title: 'PIN Incorreto',
          description: 'O PIN inserido está incorreto.',
        });
      }
    } catch (err) {
      console.error("Error verifying PIN:", err);
      setError("Erro ao verificar o PIN. Tente novamente.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Acesso Restrito</DialogTitle>
          <DialogDescription>
            Insira o seu PIN para acessar a área financeira.
          </DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <div className="flex justify-center items-center h-24">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : (
          <div className="grid gap-4 py-4">
            <Input
              id="pin"
              type="password"
              value={pin}
              onChange={handlePinChange}
              maxLength="8"
              className="text-center text-2xl tracking-[1rem]"
              placeholder="••••"
              autoFocus
              onKeyPress={(e) => e.key === 'Enter' && handleSubmit()}
            />
            {error && <p className="text-sm text-destructive text-center">{error}</p>}
          </div>
        )}
        <Button onClick={handleSubmit} type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Acessar'}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

export default PinDialog;