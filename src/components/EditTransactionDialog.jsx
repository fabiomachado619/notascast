import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { syncService } from '@/lib/syncService';
import { useToast } from '@/components/ui/use-toast';
import { format, parseISO } from 'date-fns';

function EditTransactionDialog({ transaction, isOpen, onClose, onTransactionUpdate }) {
    const { toast } = useToast();
    const [amount, setAmount] = useState('');
    const [description, setDescription] = useState('');
    const [type, setType] = useState('saida');
    const [categoryId, setCategoryId] = useState('');
    const [transactionDate, setTransactionDate] = useState('');

    const financeCategories = useLiveQuery(() => db.finance_categories.where('deleted_at').equals(0).toArray(), []);

    useEffect(() => {
        if (transaction) {
            setAmount(transaction.amount.toString());
            setDescription(transaction.description);
            setType(transaction.type);
            setCategoryId(transaction.category_id || '');

            // Ensure date is correctly formatted for datetime-local input
            const date = typeof transaction.transaction_date === 'string' 
                ? parseISO(transaction.transaction_date) 
                : new Date(transaction.transaction_date);

            // Format to 'yyyy-MM-ddTHH:mm'
            const localISOString = format(date, "yyyy-MM-dd'T'HH:mm");
            setTransactionDate(localISOString);
        }
    }, [transaction]);

    const handleSave = async () => {
        if (!amount || !description) {
            toast({ title: "Campos obrigatórios", description: "Preencha o valor e a descrição.", variant: "destructive" });
            return;
        }

        const updatedTransaction = {
            ...transaction,
            amount: parseFloat(amount),
            description,
            type,
            category_id: categoryId || null,
            transaction_date: new Date(transactionDate).toISOString(),
        };

        await syncService.saveLocalThenSync('finance_transactions', updatedTransaction);
        toast({ title: "Transação atualizada com sucesso!" });
        if(onTransactionUpdate) onTransactionUpdate();
        onClose();
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Editar Transação</DialogTitle>
                    <DialogDescription>Atualize os detalhes da sua transação.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="amount" className="text-right">Valor</Label>
                        <Input id="amount" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="col-span-3" />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="description" className="text-right">Descrição</Label>
                        <Input id="description" value={description} onChange={(e) => setDescription(e.target.value)} className="col-span-3" />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="type" className="text-right">Tipo</Label>
                        <select id="type" value={type} onChange={(e) => setType(e.target.value)} className="col-span-3 flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm">
                            <option value="saida">Saída</option>
                            <option value="entrada">Entrada</option>
                        </select>
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="category" className="text-right">Categoria</Label>
                        <select id="category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="col-span-3 flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm">
                            <option value="">Sem Categoria</option>
                            {financeCategories?.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                        </select>
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="transaction_date" className="text-right">Data</Label>
                        <Input id="transaction_date" type="datetime-local" value={transactionDate} onChange={(e) => setTransactionDate(e.target.value)} className="col-span-3" />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Cancelar</Button>
                    <Button onClick={handleSave}>Salvar Alterações</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export default EditTransactionDialog;