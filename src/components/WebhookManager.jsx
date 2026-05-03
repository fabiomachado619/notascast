import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Plus, Webhook, Send, Trash2, Clock, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from '@/components/ui/use-toast';
import { normalizeBR } from '@/utils/phone';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { db } from '@/lib/db';
import { syncService } from '@/lib/syncService';

function WebhookManager({ categoryId }) {
  const [newWebhook, setNewWebhook] = useState({ name: '', description: '', url: '' });
  const [sendData, setSendData] = useState({ name: '', whatsapp: '', email: '' });
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSendDialogOpen, setIsSendDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedWebhook, setSelectedWebhook] = useState(null);
  const { user } = useSupabaseAuth();
  const [webhooks, setWebhooks] = useState([]);
  const [logs, setLogs] = useState([]);

  const fetchData = useCallback(async () => {
    if (user) {
      const dbWebhooks = await db.webhooks
        .where({ category_id: categoryId, owner_user_id: user.id })
        .filter(w => !w.deleted_at || w.deleted_at === 0)
        .toArray();
      const dbLogs = await db.webhook_logs
        .where({ owner_user_id: user.id })
        .reverse()
        .sortBy('sent_at');
        
      setWebhooks(dbWebhooks);
      setLogs(dbLogs);
    }
  }, [categoryId, user]);

  useEffect(() => {
    fetchData();

    const handleRemoteUpdate = (event) => {
      const { table } = event.detail;
      if (table === 'webhooks' || table === 'webhook_logs') {
        fetchData();
      }
    };

    document.addEventListener('remoteUpdate', handleRemoteUpdate);
    return () => document.removeEventListener('remoteUpdate', handleRemoteUpdate);
  }, [fetchData]);
  
  const isValidUrl = (url) => {
    try {
      new URL(url);
      return true;
    } catch (_) {
      return false;
    }
  };

  const handleCreateWebhook = async () => {
    if (!newWebhook.name.trim() || !isValidUrl(newWebhook.url) || !user || isSubmitting) {
        toast({ title: "Dados inválidos", description: "Verifique o nome e a URL do webhook.", variant: "destructive" });
        return;
    }

    setIsSubmitting(true);
    const webhook = {
      category_id: categoryId,
      name: newWebhook.name.trim(),
      description: newWebhook.description.trim(),
      url: newWebhook.url.trim(),
    };

    await syncService.saveLocalThenSync('webhooks', webhook);
    await fetchData();

    setNewWebhook({ name: '', description: '', url: '' });
    setIsDialogOpen(false);
    setIsSubmitting(false);
    toast({ title: "Webhook criado" });
  };

  const handleDeleteWebhook = async (webhookId) => {
    await syncService.softDelete('webhooks', webhookId);
    await fetchData();
    toast({ title: "Webhook excluído", variant: "destructive" });
  };
  
  const triggerWebhookSend = async (webhook, payload) => {
    const logEntry = {
      webhook_id: webhook.id,
      name: payload.name,
      whatsapp: payload.whatsapp,
      email: payload.email,
      sent_at: new Date().toISOString(),
      status: 'pending'
    };

    const savedLog = await syncService.saveLocalThenSync('webhook_logs', logEntry);
    await fetchData();
    
    if (syncService.isOnline()) {
      try {
        const response = await fetch(webhook.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          mode: 'cors'
        });
        const status = response.ok ? 'success' : 'error';
        await syncService.saveLocalThenSync('webhook_logs', { id: savedLog.id, status });
        await fetchData();
        toast({ title: response.ok ? "Disparo enviado" : "Falha no envio (servidor respondeu com erro)" });
      } catch (error) {
        await syncService.saveLocalThenSync('webhook_logs', { id: savedLog.id, status: 'error' });
        await fetchData();
        toast({ title: "Falha no envio (erro de rede)", description: error.message, variant: "destructive" });
      }
    } else {
        toast({ title: "Você está offline", description: "O webhook será disparado quando a conexão for restabelecida." });
    }
  }


  const handleSendWebhook = async (webhook) => {
    if (!sendData.name.trim() || !sendData.whatsapp.trim() || !sendData.email.trim() || isSubmitting) {
      toast({ title: "Dados incompletos", variant: "destructive" });
      return;
    }
    
    setIsSubmitting(true);
    const payload = {
      name: sendData.name.trim(),
      whatsapp: normalizeBR(sendData.whatsapp),
      email: sendData.email.trim()
    };
    
    await triggerWebhookSend(webhook, payload);

    setSendData({ name: '', whatsapp: '', email: '' });
    setIsSendDialogOpen(false);
    setSelectedWebhook(null);
    setIsSubmitting(false);
  };
  
  const displayWebhooks = webhooks || [];
  const getWebhookLogs = (webhookId) => (logs || []).filter(log => log.webhook_id === webhookId).slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-xl font-semibold text-gray-900">Webhooks</h3>
          <p className="text-gray-600">Configure destinos para envio de dados via POST JSON</p>
        </div>
        
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild><Button className="flex items-center space-x-2"><Plus className="h-4 w-4" /><span>Novo destino</span></Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Criar novo webhook</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <Input placeholder="Nome do webhook" value={newWebhook.name} onChange={(e) => setNewWebhook({ ...newWebhook, name: e.target.value })} disabled={isSubmitting}/>
              <Textarea placeholder="Descrição (opcional)" value={newWebhook.description} onChange={(e) => setNewWebhook({ ...newWebhook, description: e.target.value })} rows={2} disabled={isSubmitting}/>
              <Input placeholder="URL do webhook" value={newWebhook.url} onChange={(e) => setNewWebhook({ ...newWebhook, url: e.target.value })} disabled={isSubmitting}/>
              <div className="flex justify-end space-x-2">
                <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isSubmitting}>Cancelar</Button>
                <Button onClick={handleCreateWebhook} disabled={isSubmitting || !newWebhook.name.trim() || !isValidUrl(newWebhook.url)}>
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Criar
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Dialog open={isSendDialogOpen} onOpenChange={setIsSendDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Enviar dados para {selectedWebhook?.name}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Input placeholder="Nome" value={sendData.name} onChange={(e) => setSendData({ ...sendData, name: e.target.value })} disabled={isSubmitting} />
            <Input placeholder="WhatsApp (ex: 11987654321)" value={sendData.whatsapp} onChange={(e) => setSendData({ ...sendData, whatsapp: e.target.value })} disabled={isSubmitting} />
            <Input placeholder="Email" type="email" value={sendData.email} onChange={(e) => setSendData({ ...sendData, email: e.target.value })} disabled={isSubmitting} />
            <div className="bg-gray-50 p-3 rounded-lg">
              <p className="text-sm text-gray-600 mb-2">Payload que será enviado:</p>
              <pre className="text-xs bg-white p-2 rounded border">{JSON.stringify({ name: sendData.name || "Nome", whatsapp: normalizeBR(sendData.whatsapp || "11987654321"), email: sendData.email || "email@exemplo.com" }, null, 2)}</pre>
            </div>
            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setIsSendDialogOpen(false)} disabled={isSubmitting}>Cancelar</Button>
              <Button onClick={() => handleSendWebhook(selectedWebhook)} disabled={isSubmitting || !sendData.name || !sendData.whatsapp || !sendData.email}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Enviar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {displayWebhooks.length === 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <Webhook className="h-16 w-16 text-gray-300 mx-auto mb-4" />
          <h4 className="text-lg font-medium text-gray-900 mb-2">Nenhum webhook ainda</h4>
          <p className="text-gray-600">Crie seu primeiro webhook para esta categoria.</p>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {displayWebhooks.map((webhook, index) => (
            <motion.div key={webhook.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.1 }} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center space-x-3 min-w-0">
                  <div className="p-2 bg-green-100 rounded-lg"><Webhook className="h-6 w-6 text-green-600" /></div>
                  <div className="min-w-0">
                    <h4 className="font-semibold text-gray-900 truncate" title={webhook.name}>{webhook.name}</h4>
                    {webhook.description && (<p className="text-sm text-gray-600 truncate" title={webhook.description}>{webhook.description}</p>)}
                  </div>
                </div>
                <div className="flex items-center space-x-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setSelectedWebhook(webhook); setIsSendDialogOpen(true); }}><Send className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600 hover:text-red-800" onClick={() => handleDeleteWebhook(webhook.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
              <div className="mb-4"><p className="text-sm text-gray-600 font-mono bg-gray-50 p-2 rounded truncate">{webhook.url}</p></div>
              <div className="space-y-2">
                <h5 className="text-sm font-medium text-gray-900 flex items-center"><Clock className="h-4 w-4 mr-1" />Últimos envios</h5>
                {getWebhookLogs(webhook.id).length === 0 ? (<p className="text-xs text-gray-500">Nenhum envio ainda</p>) : (
                  <div className="space-y-1">
                    {getWebhookLogs(webhook.id).map(log => (
                      <div key={log.id} className="flex items-center justify-between text-xs">
                        <span className="text-gray-600 truncate">{log.name} • {log.whatsapp}</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${log.status === 'success' ? 'bg-green-100 text-green-800' : log.status === 'error' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}`}>{log.status}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

export default WebhookManager;