import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, RefreshCw } from 'lucide-react';
import HeroImage from '@/components/HeroImage';

function LoginPage() {
  const { signIn, signUp, loading, resendConfirmation, hardReset } = useSupabaseAuth();
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [resetting, setResetting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    setNeedsConfirmation(false);

    if (isSignUp) {
      const { data, error } = await signUp(email, password);
      if (!error && data.user) {
        if (data.user.identities && data.user.identities.length === 0) {
          setNeedsConfirmation(true);
          toast({
            title: 'Confirmação necessária',
            description: 'Enviamos um link de confirmação para o seu e-mail. Por favor, verifique sua caixa de entrada.',
            duration: 9000,
          });
        } else {
          toast({
            title: 'Conta criada com sucesso!',
            description: 'Você já pode fazer o login.',
          });
          setIsSignUp(false);
        }
      }
    } else {
      await signIn(email, password);
    }
    setIsSubmitting(false);
  };

  const handleResend = async () => {
    await resendConfirmation(email);
  };

  const handleHardReset = async () => {
    if (window.confirm("Tem certeza que deseja resetar TUDO? Esta ação é irreversível e limpará todos os dados locais e remotos.")) {
      setResetting(true);
      await hardReset();
      setResetting(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>Login — NotasCat</title>
        <meta name="description" content="Acesse sua conta ou crie uma nova no NotasCat." />
      </Helmet>
      <div className="min-h-screen w-full lg:grid lg:grid-cols-2">
        <div className="flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
          <div className="w-full max-w-md space-y-8">
            <div>
              <motion.h1 
                className="text-4xl font-bold tracking-tight text-gray-900 text-center"
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
              >
                {isSignUp ? 'Crie sua conta' : 'Acesse sua conta'}
              </motion.h1>
              <p className="mt-2 text-center text-sm text-gray-600">
                Ou{' '}
                <button onClick={() => { setIsSignUp(!isSignUp); setNeedsConfirmation(false); }} className="font-medium text-blue-600 hover:text-blue-500">
                  {isSignUp ? 'faça login com uma conta existente' : 'crie uma conta gratuitamente'}
                </button>
              </p>
            </div>
            <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
              <div className="rounded-md shadow-sm -space-y-px">
                <div>
                  <Label htmlFor="email-address" className="sr-only">Email</Label>
                  <Input
                    id="email-address"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    className="rounded-t-md"
                    placeholder="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="password">Senha</Label>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete={isSignUp ? "new-password" : "current-password"}
                    required
                    className="rounded-b-md"
                    placeholder="Senha"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <Button type="submit" className="w-full" disabled={isSubmitting || loading}>
                  {(isSubmitting || loading) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isSignUp ? 'Criar conta' : 'Entrar'}
                </Button>
              </div>
            </form>
            {needsConfirmation && (
              <div className="text-center text-sm text-gray-600">
                Não recebeu o e-mail?{' '}
                <button onClick={handleResend} className="font-medium text-blue-600 hover:text-blue-500">
                  Reenviar confirmação
                </button>
              </div>
            )}
            <div className="mt-6 text-center">
              <Button variant="destructive" onClick={handleHardReset} disabled={resetting}>
                {resetting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Resetar App
              </Button>
            </div>
          </div>
        </div>
        <div className="hidden lg:block">
          <HeroImage />
        </div>
      </div>
    </>
  );
}

export default LoginPage;