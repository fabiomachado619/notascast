import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, ShieldCheck, Wifi, Link2, WalletCards, Bell, LayoutGrid } from 'lucide-react';

function LoginPage() {
  const { signIn, signUp, loading, resendConfirmation } = useSupabaseAuth();
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);

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
            title: 'Confirmacao necessaria',
            description: 'Enviamos um link de confirmacao para o seu e-mail. Verifique sua caixa de entrada.',
            duration: 9000,
          });
        } else {
          toast({
            title: 'Conta criada com sucesso!',
            description: 'Voce ja pode fazer o login.',
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

  return (
    <>
      <Helmet>
        <title>Login - NotasCat</title>
        <meta name="description" content="Acesse sua conta ou crie uma nova no NotasCat." />
      </Helmet>
      <div className="min-h-screen w-full lg:grid lg:grid-cols-2 bg-gray-50">
        <div className="hidden lg:flex flex-col justify-between p-10 xl:p-14 bg-slate-950 text-white">
          <div className="space-y-8">
            <div className="inline-flex items-center rounded-full border border-white/20 px-3 py-1 text-xs font-medium tracking-wide">
              NOTASCAT
            </div>
            <div className="space-y-4">
              <h1 className="text-4xl xl:text-5xl font-bold leading-tight">
                Organize sua vida, seus conteudos e suas financas em um so lugar.
              </h1>
              <p className="text-slate-300 text-lg leading-relaxed max-w-xl">
                Categorias, notas ricas, contatos, links, webhooks e controle financeiro com sincronizacao em nuvem para acessar de qualquer dispositivo.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
              <div className="rounded-lg border border-white/15 bg-white/5 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold"><LayoutGrid className="h-4 w-4" /> Organizacao por categorias</div>
                <p className="mt-2 text-sm text-slate-300">Separe por temas e mantenha tudo facil de encontrar.</p>
              </div>
              <div className="rounded-lg border border-white/15 bg-white/5 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold"><WalletCards className="h-4 w-4" /> Gestao financeira</div>
                <p className="mt-2 text-sm text-slate-300">Entradas, saidas e contas a pagar em um painel unico.</p>
              </div>
              <div className="rounded-lg border border-white/15 bg-white/5 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold"><Link2 className="h-4 w-4" /> Links e webhooks</div>
                <p className="mt-2 text-sm text-slate-300">Centralize links uteis e automatize acoes com webhooks.</p>
              </div>
              <div className="rounded-lg border border-white/15 bg-white/5 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold"><Wifi className="h-4 w-4" /> Nuvem e sincronizacao</div>
                <p className="mt-2 text-sm text-slate-300">Acesse seus dados no celular, notebook ou desktop.</p>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-md border border-white/15 bg-white/5 px-3 py-2">
              <p className="text-lg font-bold">100%</p>
              <p className="text-xs text-slate-300">Sincronizado</p>
            </div>
            <div className="rounded-md border border-white/15 bg-white/5 px-3 py-2">
              <p className="text-lg font-bold">24h</p>
              <p className="text-xs text-slate-300">Acesso online</p>
            </div>
            <div className="rounded-md border border-white/15 bg-white/5 px-3 py-2">
              <p className="text-lg font-bold">Tudo</p>
              <p className="text-xs text-slate-300">Num so app</p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-center py-8 sm:py-10 lg:py-12 px-4 sm:px-6 lg:px-8 bg-white">
          <div className="w-full max-w-md space-y-6 sm:space-y-8">
            <div>
              <motion.h1
                className="text-3xl sm:text-4xl font-bold tracking-tight text-gray-900 text-center"
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
              >
                {isSignUp ? 'Crie sua conta' : 'Acesse sua conta'}
              </motion.h1>
              <p className="mt-3 flex items-center justify-center gap-2 text-sm text-gray-600">
                <ShieldCheck className="h-4 w-4 text-emerald-600" /> Seus dados ficam protegidos e sincronizados na nuvem.
              </p>
              <p className="mt-2 text-center text-sm text-gray-600">
                Ou{' '}
                <button onClick={() => { setIsSignUp(!isSignUp); setNeedsConfirmation(false); }} className="font-medium text-blue-600 hover:text-blue-500">
                  {isSignUp ? 'faca login com uma conta existente' : 'crie uma conta gratuitamente'}
                </button>
              </p>
            </div>
            <form className="mt-6 sm:mt-8 space-y-5 sm:space-y-6" onSubmit={handleSubmit}>
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
                    autoComplete={isSignUp ? 'new-password' : 'current-password'}
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
                Nao recebeu o e-mail?{' '}
                <button onClick={handleResend} className="font-medium text-blue-600 hover:text-blue-500">
                  Reenviar confirmacao
                </button>
              </div>
            )}
            <div className="lg:hidden pt-2 sm:pt-4">
              <div className="rounded-lg border bg-slate-50 p-4 space-y-3">
                <p className="text-sm font-semibold text-slate-900">Tudo em um so lugar</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 text-sm">
                  <div className="rounded-md border bg-white p-3 flex items-center gap-2"><LayoutGrid className="h-4 w-4 text-blue-600" /> Categorias e organizacao</div>
                  <div className="rounded-md border bg-white p-3 flex items-center gap-2"><WalletCards className="h-4 w-4 text-blue-600" /> Controle financeiro diario</div>
                  <div className="rounded-md border bg-white p-3 flex items-center gap-2"><Link2 className="h-4 w-4 text-blue-600" /> Links e webhooks</div>
                  <div className="rounded-md border bg-white p-3 flex items-center gap-2"><Bell className="h-4 w-4 text-blue-600" /> Lembretes e notificacoes</div>
                  <div className="rounded-md border bg-white p-3 flex items-center gap-2 sm:col-span-2"><Wifi className="h-4 w-4 text-blue-600" /> Acesse no celular, notebook e desktop</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default LoginPage;
