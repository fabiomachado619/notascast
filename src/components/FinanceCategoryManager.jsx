import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { syncService } from '@/lib/syncService';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { v4 as uuidv4 } from 'uuid';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { toast } from '@/components/ui/use-toast';
import { PlusCircle, Edit, Trash2, Loader2 } from 'lucide-react';

const SEM_CATEGORIA_ID = '00000000-0000-0000-0000-000000000000';

function FinanceCategoryManager() {
  const { user } = useSupabaseAuth();
  const [newCategoryName, setNewCategoryName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [deletingCategory, setDeletingCategory] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const categories = useLiveQuery(() => {
    if (!user) return [];
    return db.finance_categories
      .where({ owner_user_id: user.id, deleted_at: 0 })
      .and(c => c.id !== SEM_CATEGORIA_ID)
      .sortBy('name');
  }, [user?.id]);

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim() || !user) return;
    setIsCreating(true);

    const existing = categories && categories.find(c => c.name.toLowerCase() === newCategoryName.trim().toLowerCase());
    if (existing) {
      toast({ variant: 'destructive', title: 'Categoria já existe' });
      setIsCreating(false);
      return;
    }

    try {
      await syncService.saveLocalThenSync('finance_categories', { name: newCategoryName.trim() });
      toast({ title: `Categoria "${newCategoryName.trim()}" criada!` });
      setNewCategoryName('');
    } catch (error) {
      toast({ variant: 'destructive', title: 'Erro ao criar categoria', description: error.message });
    } finally {
      setIsCreating(false);
    }
  };

  const handleUpdateCategory = async () => {
    if (!editingCategory || !editingCategory.name.trim()) return;
    setIsEditing(true);

    const updatedCategory = { ...editingCategory, updated_at: new Date().toISOString() };

    try {
      await syncService.saveLocalThenSync('finance_categories', updatedCategory, 'update');
      toast({ title: `Categoria "${updatedCategory.name}" atualizada!` });
      setEditingCategory(null);
    } catch (error) {
      toast({ variant: 'destructive', title: 'Erro ao atualizar categoria', description: error.message });
    } finally {
      setIsEditing(false);
    }
  };

  const handleDeleteCategory = async () => {
    if (!deletingCategory) return;
    setIsDeleting(true);

    const categoryId = deletingCategory.id;

    try {
      await db.transaction('rw', db.finance_categories, db.finance_transactions, db.sync_queue, async () => {
        const now = new Date().toISOString();

        const transactionsToDelete = await db.finance_transactions.where({ category_id: categoryId, deleted_at: 0 }).toArray();
        const transactionIdsToDelete = transactionsToDelete.map(t => t.id);

        if (transactionIdsToDelete.length > 0) {
          await db.finance_transactions.where('id').anyOf(transactionIdsToDelete).modify({ deleted_at: now, updated_at: now });

          const syncQueueItems = transactionIdsToDelete.map(id => ({
            table: 'finance_transactions',
            record_id: id,
            operation: 'upsert',
            priority: 2,
          }));
          await db.sync_queue.bulkAdd(syncQueueItems);
        }

        await db.finance_categories.update(categoryId, { deleted_at: now, updated_at: now });
        await db.sync_queue.add({
          table: 'finance_categories',
          record_id: categoryId,
          operation: 'upsert',
          priority: 1,
        });
      });
      
      syncService.triggerSync();
      toast({ title: `Categoria "${deletingCategory.name}" e todas as suas transações foram excluídas.` });
      setDeletingCategory(null);

    } catch (error) {
      toast({ variant: 'destructive', title: 'Erro ao excluir categoria', description: error.message });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle>Criar Nova Categoria</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder="Nome da nova categoria"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleCreateCategory()}
            />
            <Button onClick={handleCreateCategory} disabled={isCreating || !newCategoryName.trim()}>
              {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlusCircle className="h-4 w-4" />}
              <span className="ml-2 hidden sm:inline">Criar</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Categorias Existentes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {categories?.map((cat) => (
              <div key={cat.id} className="flex items-center justify-between p-2 border rounded-md">
                <span className="text-sm font-medium">{cat.name}</span>
                <div className="flex gap-2">
                  <Button variant="ghost" size="icon" onClick={() => setEditingCategory(cat)}>
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setDeletingCategory(cat)}>
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              </div>
            ))}
            {categories?.length === 0 && (
              <p className="text-sm text-gray-500 text-center py-4">Nenhuma categoria criada ainda.</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={!!editingCategory} onOpenChange={() => setEditingCategory(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Categoria</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input
              value={editingCategory?.name || ''}
              onChange={(e) => setEditingCategory({ ...editingCategory, name: e.target.value })}
            />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancelar</Button>
            </DialogClose>
            <Button onClick={handleUpdateCategory} disabled={isEditing}>
              {isEditing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={!!deletingCategory} onOpenChange={() => setDeletingCategory(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Exclusão</DialogTitle>
          </DialogHeader>
          <p>
            Tem certeza que deseja excluir a categoria "<strong>{deletingCategory?.name}</strong>"?
            <br/><br/>
            <strong>Atenção:</strong> Todos os lançamentos financeiros (entradas e saídas) associados a esta categoria também serão excluídos. Esta ação não pode ser desfeita.
          </p>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancelar</Button>
            </DialogClose>
            <Button variant="destructive" onClick={handleDeleteCategory} disabled={isDeleting}>
              {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Excluir Tudo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default FinanceCategoryManager;