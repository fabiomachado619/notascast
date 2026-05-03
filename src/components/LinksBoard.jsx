import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Plus, Link as LinkIcon, Copy, Trash2, Edit2, Loader2, Search, SortAsc, SortDesc } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from '@/components/ui/use-toast';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { db } from '@/lib/db';
import { syncService } from '@/lib/syncService';

function LinksBoard({ categoryId }) {
  const [newLink, setNewLink] = useState({ title: '', content: '' });
  const [editingLink, setEditingLink] = useState(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { user } = useSupabaseAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOrder, setSortOrder] = useState('desc'); // 'asc' for oldest, 'desc' for newest
  const [links, setLinks] = useState([]);

  const fetchLinks = useCallback(async () => {
    if (user) {
      const dbLinks = await db.links
        .where({ category_id: categoryId, owner_user_id: user.id })
        .filter(l => !l.deleted_at || l.deleted_at === 0)
        .toArray();
      setLinks(dbLinks);
    }
  }, [categoryId, user]);

  useEffect(() => {
    fetchLinks();
    
    const handleRemoteUpdate = (event) => {
      const { table } = event.detail;
      if (table === 'links') {
        fetchLinks();
      }
    };

    document.addEventListener('remoteUpdate', handleRemoteUpdate);
    return () => document.removeEventListener('remoteUpdate', handleRemoteUpdate);
  }, [fetchLinks]);

  const handleCreateLink = async () => {
    if (!newLink.title.trim() || !newLink.content.trim() || !user || isSubmitting) return;

    setIsSubmitting(true);
    const link = {
      category_id: categoryId,
      title: newLink.title.trim(),
      content: newLink.content.trim(),
    };

    await syncService.saveLocalThenSync('links', link);
    await fetchLinks();

    setNewLink({ title: '', content: '' });
    setIsDialogOpen(false);
    setIsSubmitting(false);
    toast({ title: "Link criado" });
  };

  const handleUpdateLink = async (linkId, updates) => {
    await syncService.saveLocalThenSync('links', { id: linkId, ...updates });
    await fetchLinks();
    setEditingLink(null);
    toast({ title: "Link atualizado" });
  };

  const handleDeleteLink = async (linkId) => {
    await syncService.softDelete('links', linkId);
    await fetchLinks();
    toast({ title: "Link excluído", variant: "destructive" });
  };

  const copyContent = async (content) => {
    try {
      await navigator.clipboard.writeText(content);
      toast({ title: "Conteúdo copiado" });
    } catch (error) {
      toast({ title: "Erro ao copiar", variant: "destructive" });
    }
  };

  const filteredAndSortedLinks = React.useMemo(() => {
    if (!links) return [];
    
    const filtered = links.filter(link => 
      (link.title && link.title.toLowerCase().includes(searchTerm.toLowerCase())) || 
      (link.content && link.content.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    return filtered.sort((a, b) => {
      const dateA = new Date(a.updated_at);
      const dateB = new Date(b.updated_at);
      if (sortOrder === 'asc') return dateA - dateB;
      return dateB - dateA;
    });
  }, [links, searchTerm, sortOrder]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div className="flex-grow relative">
           <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
           <Input 
             placeholder="Buscar links..."
             className="pl-9"
             value={searchTerm}
             onChange={(e) => setSearchTerm(e.target.value)}
           />
        </div>
        
        <div className="flex items-center gap-2">
           <Button variant="outline" size="icon" onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}>
               {sortOrder === 'asc' ? <SortAsc className="h-4 w-4" /> : <SortDesc className="h-4 w-4" />}
           </Button>
           <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
             <DialogTrigger asChild>
               <Button className="flex items-center space-x-2">
                 <Plus className="h-4 w-4" />
                 <span>Novo link</span>
               </Button>
             </DialogTrigger>
             <DialogContent>
               <DialogHeader>
                 <DialogTitle>Criar novo link</DialogTitle>
               </DialogHeader>
               <div className="space-y-4">
                 <Input placeholder="Título do link" value={newLink.title} onChange={(e) => setNewLink({ ...newLink, title: e.target.value })} disabled={isSubmitting} />
                 <Textarea placeholder="Conteúdo do link (URL, texto, etc.)" value={newLink.content} onChange={(e) => setNewLink({ ...newLink, content: e.target.value })} rows={4} disabled={isSubmitting} />
                 <div className="flex justify-end space-x-2">
                   <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isSubmitting}>Cancelar</Button>
                   <Button onClick={handleCreateLink} disabled={isSubmitting || !newLink.title.trim() || !newLink.content.trim()}>
                     {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Criar
                   </Button>
                 </div>
               </div>
             </DialogContent>
           </Dialog>
        </div>
      </div>

      {filteredAndSortedLinks.length === 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <LinkIcon className="h-16 w-16 text-gray-300 mx-auto mb-4" />
          <h4 className="text-lg font-medium text-gray-900 mb-2">{links?.length > 0 ? 'Nenhum link encontrado' : 'Nenhum link ainda'}</h4>
          <p className="text-gray-600">{links?.length > 0 ? 'Tente uma busca diferente.' : 'Crie seu primeiro link útil para esta categoria.'}</p>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredAndSortedLinks.map((link, index) => (
            <motion.div
              key={link.id}
              layout
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ delay: index * 0.05 }}
              className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-md transition-shadow flex flex-col"
            >
              <div className="flex items-start justify-between mb-3">
                <button onClick={() => copyContent(link.title)} className="flex-1 text-left min-w-0">
                  <h4 className="font-semibold text-gray-900 hover:text-blue-600 transition-colors cursor-pointer truncate" title={link.title}>
                    {link.title}
                  </h4>
                </button>
                <div className="flex items-center space-x-1 ml-2">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditingLink(link.id === editingLink ? null : link.id)}><Edit2 className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600 hover:text-red-800" onClick={() => handleDeleteLink(link.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
              
              <p onClick={() => copyContent(link.content)} className="flex-grow text-gray-600 text-sm break-words cursor-pointer hover:text-blue-600" title="Clique para copiar">
                {link.content}
              </p>
              
              {editingLink === link.id && (
                <div className="mt-3 space-y-2">
                  <Input defaultValue={link.title} onBlur={(e) => handleUpdateLink(link.id, { title: e.target.value })} placeholder="Título" />
                  <Textarea defaultValue={link.content} onBlur={(e) => handleUpdateLink(link.id, { content: e.target.value })} placeholder="Conteúdo" rows={3}/>
                </div>
              )}
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

export default LinksBoard;