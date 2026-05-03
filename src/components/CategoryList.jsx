import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Plus, Folder, Edit2, Trash2, Loader2, MoreHorizontal, Download, Upload } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuPortal, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipProvider, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from '@/components/ui/use-toast';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { db } from '@/lib/db';
import { syncService } from '@/lib/syncService';
import { cn } from '@/lib/utils';
import { v4 as uuidv4 } from 'uuid';

const colorOptions = [
  { name: 'neutral', label: 'Padrão', bg: 'bg-gray-100', text: 'text-gray-800' },
  { name: 'blue', label: 'Azul', bg: 'bg-blue-100', text: 'text-blue-800' },
  { name: 'green', label: 'Verde', bg: 'bg-green-100', text: 'text-green-800' },
  { name: 'yellow', label: 'Amarelo', bg: 'bg-yellow-100', text: 'text-yellow-800' },
  { name: 'orange', label: 'Laranja', bg: 'bg-orange-100', text: 'text-orange-800' },
  { name: 'red', label: 'Vermelho', bg: 'bg-red-100', text: 'text-red-800' },
  { name: 'purple', label: 'Roxo', bg: 'bg-purple-100', text: 'text-purple-800' },
  { name: 'pink', label: 'Rosa', bg: 'bg-pink-100', text: 'text-pink-800' },
  { name: 'teal', label: 'Verde-azulado', bg: 'bg-teal-100', text: 'text-teal-800' },
];

function CategoryList() {
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCategory, setEditingCategory] = useState(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const { user } = useSupabaseAuth();
  const fileInputRef = useRef(null);

  const categories = useLiveQuery(
    () => user ? db.categories.where({ owner_user_id: user.id, deleted_at: 0 }).sortBy('order_index') : [],
    [user?.id],
    []
  );

  useEffect(() => {
    if (user && syncService.isOnline()) {
      syncService.pullFromSupabase('categories');
    }
  }, [user]);

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim() || !user || isCreating) return;

    setIsCreating(true);
    try {
      const maxOrderIndex = categories.reduce((max, cat) => cat.order_index != null ? Math.max(max, cat.order_index) : max, -1);
      const newCategory = {
        name: newCategoryName.trim(),
        color: 'neutral',
        order_index: maxOrderIndex + 1,
      };

      await syncService.saveLocalThenSync('categories', newCategory);

      setNewCategoryName('');
      setIsDialogOpen(false);
      toast({ title: "Categoria criada!" });
    } catch (error) {
      console.error("Falha ao criar categoria:", error);
      toast({ title: "Erro ao criar categoria", description: "Tente novamente.", variant: "destructive" });
    } finally {
      setIsCreating(false);
    }
  };

  const handleRenameCategory = async (categoryId, newName) => {
    if (!newName.trim()) return;
    await syncService.saveLocalThenSync('categories', { id: categoryId, name: newName.trim() });
    setEditingCategory(null);
    toast({ title: "Categoria renomeada" });
  };
  
  const handleColorChange = async (categoryId, color) => {
    await syncService.saveLocalThenSync('categories', { id: categoryId, color: color });
    toast({ title: "Cor da categoria atualizada" });
  };

  const handleDeleteCategory = async (categoryId) => {
    await syncService.softDelete('categories', categoryId);
    toast({ title: "Categoria excluída", variant: "destructive" });
  };
  
  const handleExportCategory = async (categoryId) => {
    if (!user) return;
    try {
      toast({ title: "Exportando...", description: "Preparando dados da categoria." });
      
      const category = await db.categories.get(categoryId);
      if (!category) throw new Error("Categoria não encontrada.");

      const notes = await db.notes.where({ category_id: categoryId, owner_user_id: user.id, deleted_at: 0 }).toArray();
      const links = await db.links.where({ category_id: categoryId, owner_user_id: user.id, deleted_at: 0 }).toArray();
      const webhooks = await db.webhooks.where({ category_id: categoryId, owner_user_id: user.id, deleted_at: 0 }).toArray();

      const exportData = {
        type: "notascat.category",
        version: 1,
        exported_at: new Date().toISOString(),
        category: {
          name: category.name,
          color: category.color,
        },
        items: {
          notes: notes.map(({ title, content_richtext, updated_at }) => ({ title, content: content_richtext, updated_at })),
          links: links.map(({ title, content }) => ({ title, url: content, description: "" })),
          webhooks: webhooks.map(({ name, description, url }) => ({ name, description, endpoint_url: url })),
        }
      };
      
      const slug = category.name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
      const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const filename = `categoria-${slug}-${date}.json`;

      const jsonStr = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast({ title: "Exportação concluída!", description: `Arquivo ${filename} salvo.` });

    } catch (error) {
      console.error("Falha ao exportar categoria:", error);
      toast({ title: "Erro na Exportação", description: error.message, variant: "destructive" });
    }
  };

  const handleImportFile = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = JSON.parse(e.target.result);
        await processImport(data);
      } catch (error) {
        console.error("Falha ao importar arquivo:", error);
        toast({ title: "Erro na Importação", description: "Arquivo inválido ou corrompido.", variant: "destructive" });
      } finally {
        event.target.value = null; // Reset file input
      }
    };
    reader.readAsText(file);
  };
  
  const processImport = async (data) => {
    if (data.type !== "notascat.category" || data.version !== 1) {
      throw new Error("Formato de arquivo incompatível.");
    }
    
    toast({ title: "Importando dados...", description: "Isso pode levar alguns instantes." });

    let categoryName = data.category.name;
    const existingCategories = await db.categories.where({ owner_user_id: user.id, deleted_at: 0 }).toArray();
    while (existingCategories.some(c => c.name === categoryName)) {
      categoryName = `${categoryName} (importado)`;
    }
    
    const newCategory = await syncService.saveLocalThenSync('categories', {
      name: categoryName,
      color: data.category.color || 'neutral',
      order_index: (categories.length || 0) + 1,
    });
    
    const { notes, links, webhooks } = data.items;
    
    if (notes && notes.length > 0) {
      for (const note of notes) {
        await syncService.saveLocalThenSync('notes', {
          category_id: newCategory.id,
          title: note.title,
          content_richtext: note.content || '',
          versions: [],
        }, 3);
      }
    }
    
    if (links && links.length > 0) {
      for (const link of links) {
        await syncService.saveLocalThenSync('links', {
          category_id: newCategory.id,
          title: link.title,
          content: link.url || link.content,
        }, 6);
      }
    }
    
    if (webhooks && webhooks.length > 0) {
      for (const webhook of webhooks) {
        if (!webhook.endpoint_url) continue;
        await syncService.saveLocalThenSync('webhooks', {
          category_id: newCategory.id,
          name: webhook.name,
          description: webhook.description || '',
          url: webhook.endpoint_url,
        }, 7);
      }
    }
    
    syncService.triggerSync();
    
    toast({
      title: "Importação Concluída!",
      description: `Categoria "${categoryName}" criada com sucesso.`,
      action: <Link to={`/app/c/${newCategory.id}`}><Button variant="outline">Abrir</Button></Link>
    });
  };

  const triggerImport = () => {
    fileInputRef.current?.click();
  };

  if (!categories) {
    return (
      <div className="text-center py-12">
        <Loader2 className="h-16 w-16 text-gray-300 mx-auto mb-4 animate-spin" />
        <p className="text-gray-600">Carregando categorias...</p>
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      <input type="file" ref={fileInputRef} onChange={handleImportFile} accept=".json" className="hidden" />
      <div className="flex justify-between items-center">
        <div className="flex gap-2">
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button className="flex items-center space-x-2">
                  <Plus className="h-4 w-4" />
                  <span>Nova categoria</span>
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Criar nova categoria</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <Input
                    placeholder="Nome da categoria"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleCreateCategory()}
                    disabled={isCreating}
                  />
                  <div className="flex justify-end space-x-2">
                    <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isCreating}>Cancelar</Button>
                    <Button onClick={handleCreateCategory} disabled={isCreating || !newCategoryName.trim()}>
                      {isCreating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {isCreating ? 'Criando...' : 'Criar'}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
            <Button variant="outline" onClick={triggerImport} className="flex items-center space-x-2">
                <Upload className="h-4 w-4" />
                <span>Importar</span>
            </Button>
        </div>
      </div>

      {categories.length === 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-12">
          <Folder className="h-16 w-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Nenhuma categoria ainda</h3>
          <p className="text-gray-600">Crie sua primeira categoria para começar a organizar seus conteúdos.</p>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {categories.map((category) => (
            <CategoryCard 
              key={category.id}
              category={category} 
              editingCategory={editingCategory} 
              setEditingCategory={setEditingCategory} 
              onRename={handleRenameCategory} 
              onColorChange={handleColorChange} 
              onDelete={handleDeleteCategory}
              onExport={handleExportCategory}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const CategoryCard = ({ category, editingCategory, setEditingCategory, onRename, onColorChange, onDelete, onExport }) => {
  const cardColor = colorOptions.find(c => c.name === category.color) || colorOptions[0];
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.2 }}
      className={cn('bg-white rounded-lg shadow-sm border p-4 h-full flex flex-col hover:shadow-md transition-shadow', cardColor.bg, 'border-transparent')}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center space-x-3 flex-1 min-w-0">
          <div className="p-2 bg-white/60 rounded-lg">
            <Folder className={cn("h-6 w-6", cardColor.text)} />
          </div>
          <div className="flex-1 min-w-0">
            {editingCategory === category.id ? (
              <Input
                defaultValue={category.name}
                onBlur={(e) => onRename(category.id, e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && onRename(category.id, e.target.value)}
                className="text-lg font-semibold h-9"
                autoFocus
              />
            ) : (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild><h3 className={cn("text-lg font-semibold break-words line-clamp-2", cardColor.text)}>{category.name}</h3></TooltipTrigger>
                  <TooltipContent><p>{category.name}</p></TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        </div>
        
        <div className="flex items-center space-x-1 ml-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setEditingCategory(category.id)}><Edit2 className="mr-2 h-4 w-4" />Renomear</DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>Cor</DropdownMenuSubTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuSubContent>
                    {colorOptions.map(color => (
                      <DropdownMenuItem key={color.name} onClick={() => onColorChange(category.id, color.name)}>
                        <div className="flex items-center">
                          <div className={cn("w-4 h-4 rounded-full mr-2 border", color.bg)}></div>
                          {color.label}
                        </div>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuPortal>
              </DropdownMenuSub>
              <DropdownMenuItem onClick={() => onExport(category.id)}><Download className="mr-2 h-4 w-4" />Exportar</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onDelete(category.id)} className="text-red-600"><Trash2 className="mr-2 h-4 w-4" />Excluir</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      
      <p className={cn("text-sm mb-4 flex-grow", cardColor.text, "opacity-70")}>Gerencie links, notas e mapas</p>
      
      <Link to={`/app/c/${category.id}`} className="mt-auto">
        <Button className="w-full bg-black/5 hover:bg-black/10 text-black border border-black/10">Abrir categoria</Button>
      </Link>
    </motion.div>
  );
};

export default CategoryList;