import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LogIn, UserPlus, CheckCircle } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

function AuthForm() {
  const { toast } = useToast();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [signupSuccess, setSignupSuccess] = useState(false);
  const { signIn, signUp, resendConfirmation } = useSupabaseAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setSignupSuccess(false);

    try {
      if (isLogin) {
        await signIn(email, password);
      } else {
        const { data, error } = await signUp(email, password);
        if (data.user && !error) {
           setSignupSuccess(true);
        }
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Ocorreu um erro",
        description: "Não foi possível completar a ação. Tente novamente.",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!email) {
        toast({
            variant: 'destructive',
            title: 'Email necessário',
            description: 'Por favor, insira seu email para reenviar a confirmação.'
        });
        return;
    }
    setLoading(true);
    await resendConfirmation(email);
    setLoading(false);
  };

  const resetFormState = () => {
    setIsLogin(!isLogin);
    setSignupSuccess(false);
  };

  if (signupSuccess) {
    return (
        <motion.div
          className="bg-white rounded-lg shadow-lg p-8 text-center"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Quase lá!</h2>
          <p className="text-gray-600 mb-6">
            Enviamos um link de confirmação para <strong>{email}</strong>. Por favor, verifique sua caixa de entrada (e pasta de spam) para ativar sua conta.
          </p>
          <Button onClick={() => { setSignupSuccess(false); setIsLogin(true); }}>
            Ok, ir para o Login
          </Button>
        </motion.div>
    );
  }

  return (
    <motion.div
      className="bg-white rounded-lg shadow-lg p-8"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.1 }}
    >
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          {isLogin ? 'Bem-vindo(a) de volta!' : 'Crie sua conta'}
        </h2>
        <p className="text-gray-600">
          {isLogin ? 'Acesse sua conta para continuar' : 'É rápido e fácil!'}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="seu@email.com"
            required
            className="mt-1"
            disabled={loading}
          />
        </div>

        <div>
          <Label htmlFor="password">Senha</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Sua senha"
            required
            className="mt-1"
            disabled={loading}
          />
        </div>

        <Button
          type="submit"
          className="w-full flex items-center justify-center space-x-2"
          disabled={loading}
        >
          {loading ? (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
          ) : (
            <>
              {isLogin ? <LogIn className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
              <span>{isLogin ? 'Entrar' : 'Criar conta'}</span>
            </>
          )}
        </Button>
      </form>

      <div className="mt-6 text-center space-y-4">
         <div className="flex flex-col items-center gap-2">
            {isLogin && (
                <button
                    type="button"
                    onClick={handleResend}
                    className="text-sm text-gray-600 hover:text-blue-600 disabled:opacity-50"
                    disabled={loading}
                >
                    Não recebeu a confirmação? Reenviar e-mail
                </button>
            )}
            <button
              type="button"
              onClick={resetFormState}
              className="text-blue-600 hover:text-blue-800 text-sm font-medium disabled:opacity-50"
              disabled={loading}
            >
              {isLogin ? 'Não tem conta? Criar conta' : 'Já tem conta? Entrar'}
            </button>
        </div>
        {loading && <p className="text-sm text-gray-500 animate-pulse">Aguarde...</p>}
      </div>
    </motion.div>
  );
}

export default AuthForm;