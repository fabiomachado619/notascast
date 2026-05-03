import React, { useState } from 'react';
import { db } from '@/lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Calendar as CalendarIcon, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/components/ui/use-toast';
import { syncService } from '@/lib/syncService';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';

function QuickTransactionForm({ onTransactionSaved }) {
    const { user } = useSupabaseAuth();
    const [type, setType] = useState('saida');
    const [amount, setAmount] = useState('');
    const [description, setDescription] = useState('');
    const [categoryId, setCategoryId] = useState('');
    const [date, setDate] = useState(new Date());
    const [isLoading, setIsLoading] = useState(false);
    const [isPayable, setIsPayable] = useState(false);

    const financeCategories = useLiveQuery(() => 
        user ? db.finance_categories.where({ owner_user_id: user.id, deleted_at: 0 }).toArray() : [],
    [user?.id]);
    
    const resetForm = () => {
        setAmount('');
        setDescription('');
        setCategoryId('');
        setDate(new Date());
        setIsLoading(false);
        setIsPayable(false);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsLoading(true);

        const numericAmount = parseFloat(amount.replace(',', '.'));

        if (isNaN(numericAmount) || numericAmount <= 0) {
            toast({ variant: 'destructive', title: 'Valor inválido', description: 'Por favor, insira um valor numérico positivo.' });
            setIsLoading(false);
            return;
        }

        const recordData = {
            amount: numericAmount,
            description,
            category_id: categoryId || '00000000-0000-0000-0000-000000000000', // Sem Categoria
        };

        try {
            let savedRecord, table;
            if(isPayable){
                table = 'finance_payables';
                recordData.due_at = date.toISOString();
                recordData.status = 'pendente';
                recordData.amount_remaining = numericAmount;
                savedRecord = await syncService.saveLocalThenSync(table, recordData);
                toast({ title: 'Conta a pagar adicionada!' });
            } else {
                table = 'finance_transactions';
                recordData.type = type;
                recordData.transaction_date = date.toISOString();
                savedRecord = await syncService.saveLocalThenSync(table, recordData);
                toast({ title: 'Transação adicionada!' });
            }
            onTransactionSaved(savedRecord, table);
            resetForm();
        } catch (error) {
            toast({ variant: 'destructive', title: 'Erro ao salvar', description: error.message });
            setIsLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6 bg-white p-6 rounded-lg shadow-md border">
            <div className="grid grid-cols-3 gap-2 rounded-lg bg-gray-100 p-1">
                <Button type="button" onClick={() => { setType('entrada'); setIsPayable(false); }} className={cn(type === 'entrada' && !isPayable ? 'bg-green-500 text-white shadow' : 'bg-transparent text-gray-600')}>Entrada</Button>
                <Button type="button" onClick={() => { setType('saida'); setIsPayable(false); }} className={cn(type === 'saida' && !isPayable ? 'bg-red-500 text-white shadow' : 'bg-transparent text-gray-600')}>Saída</Button>
                <Button type="button" onClick={() => setIsPayable(true)} className={cn(isPayable ? 'bg-yellow-500 text-white shadow' : 'bg-transparent text-gray-600')}>A Pagar</Button>
            </div>

            <div className="space-y-2">
                <Label htmlFor="amount">Valor</Label>
                <Input id="amount" type="text" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" required />
            </div>

            <div className="space-y-2">
                <Label htmlFor="description">Descrição</Label>
                <Input id="description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex: Almoço, Salário" required />
            </div>

            <div className="space-y-2">
                <Label htmlFor="category">Categoria</Label>
                <select
                    id="category"
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                    <option value="">Sem Categoria</option>
                    {financeCategories?.map((cat) => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                </select>
            </div>

            <div className="space-y-2">
                <Label htmlFor="date">{isPayable ? 'Data de Vencimento' : 'Data da Transação'}</Label>
                <Popover>
                    <PopoverTrigger asChild>
                        <Button
                            variant={'outline'}
                            className={cn('w-full justify-start text-left font-normal', !date && 'text-muted-foreground')}
                        >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {date ? format(date, 'PPP', { locale: ptBR }) : <span>Escolha uma data</span>}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                        <Calendar mode="single" selected={date} onSelect={setDate} initialFocus />
                    </PopoverContent>
                </Popover>
            </div>

            <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {isLoading ? 'Salvando...' : (isPayable ? 'Adicionar Conta a Pagar' : 'Adicionar Transação')}
            </Button>
        </form>
    );
}

export default QuickTransactionForm;