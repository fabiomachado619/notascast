import React, { useEffect, useState, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Settings, Home, Save, Loader2 } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import LinksBoard from '@/components/LinksBoard';
import NotesEditor from '@/components/NotesEditor';
import WebhookManager from '@/components/WebhookManager';
import ContactsManager from '@/components/ContactsManager';
import { useToast } from '@/components/ui/use-toast';
import { db } from '@/lib/db';

function CategoryPage() {
  const { id } = useParams();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [showSaveButton, setShowSaveButton] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const category = useLiveQuery(() => db.categories.get(id), [id]);
  
  useEffect(() => {
    db.app_state.put({ key: 'lastOpenPage', value: location.pathname });
  }, [location.pathname]);

  const handleGoBack = () => {
    navigate(-1);
  };

  const handleGoHome = () => {
    navigate('/app');
  };

  const handleSettingsClick = () => {
    toast({
      title: "🚧 Em construção!",
      description: "Esta funcionalidade ainda não foi implementada. Peça em um próximo prompt! 🚀",
    });
  };

  const handleNoteSave = useCallback(() => {
    document.dispatchEvent(new CustomEvent('requestNoteSave'));
  }, []);

  useEffect(() => {
    const handleNoteDirty = (e) => setShowSaveButton(e.detail.isDirty);
    const handleNoteSaving = (e) => setIsSaving(e.detail.isSaving);

    document.addEventListener('noteDirtyState', handleNoteDirty);
    document.addEventListener('noteSavingState', handleNoteSaving);

    return () => {
      document.removeEventListener('noteDirtyState', handleNoteDirty);
      document.removeEventListener('noteSavingState', handleNoteSaving);
    };
  }, []);

  if (!category) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-background">
        <div className="text-center">
          <Loader2 className="animate-spin rounded-full h-8 w-8 text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Carregando categoria...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>{category.name} — NotasCat</title>
        <meta name="description" content={`Gerencie links e notas da categoria ${category.name}.`} />
      </Helmet>
      
      <div className="flex flex-col h-screen bg-gray-50 dark:bg-background">
        <header className="flex-shrink-0 bg-white dark:bg-zinc-900/50 dark:border-b-zinc-800 backdrop-blur-sm shadow-sm border-b sticky top-0 z-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center space-x-2">
                <Button variant="ghost" size="sm" className="flex items-center space-x-2" onClick={handleGoBack}>
                  <ArrowLeft className="h-4 w-4" />
                  <span className="hidden sm:inline">Voltar</span>
                </Button>
                <Button variant="ghost" size="sm" className="flex items-center space-x-2" onClick={handleGoHome}>
                  <Home className="h-4 w-4" />
                  <span className="hidden sm:inline">Início</span>
                </Button>
                <motion.h1 
                  className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100 truncate"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                >
                  {category.name}
                </motion.h1>
              </div>
              
              <div className="flex items-center space-x-2">
                {showSaveButton && (
                  <Button size="sm" onClick={handleNoteSave} disabled={isSaving}>
                    {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Salvar
                  </Button>
                )}
                <Button variant="outline" size="sm" className="hidden sm:flex items-center space-x-2" onClick={handleSettingsClick}>
                  <Settings className="h-4 w-4" />
                  <span>Configurações</span>
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
              <Tabs defaultValue="notes" className="w-full">
                <TabsList className="grid w-full grid-cols-4 mb-8">
                  <TabsTrigger value="contacts">Contatos</TabsTrigger>
                  <TabsTrigger value="links">Links</TabsTrigger>
                  <TabsTrigger value="notes">Textos</TabsTrigger>
                  <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
                </TabsList>

                <TabsContent value="contacts">
                  <ContactsManager categoryId={id} categoryName={category.name} />
                </TabsContent>
                
                <TabsContent value="links">
                  <LinksBoard categoryId={id} />
                </TabsContent>
                
                <TabsContent value="notes">
                  <NotesEditor categoryId={id} />
                </TabsContent>
                
                <TabsContent value="webhooks">
                  <WebhookManager categoryId={id} />
                </TabsContent>
              </Tabs>
            </motion.div>
          </div>
        </main>
      </div>
    </>
  );
}

export default CategoryPage;