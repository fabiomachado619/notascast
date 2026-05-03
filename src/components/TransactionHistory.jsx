import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { subDays, startOfDay, endOfDay, startOfMonth, endOfMonth, subMonths, subYears, format, addMonths, sub, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { MoreHorizontal, ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Edit, Trash2, Database, Loader2 } from 'lucide-react';
import { useDebounce } from 'use-debounce';
import { syncService } from '@/lib/syncService';
import { useToast } from '@/components/ui/use-toast';
import EditTransactionDialog from './EditTransactionDialog';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';

const EmptyState = () => (
    <div className="text-center py-16 border-2 border-dashed rounded-lg col-span-full">
        <div className="mx-auto h-12 w-12 text-gray-400"><Database /></div>
        <h3 className="mt-2 text-sm font-medium text-gray-900">Sem transações</h3>
        <p className="mt-1 text-sm text-gray-500">Nenhuma transação encontrada para os filtros selecionados.</p>
    </div>
);

const PAGE_SIZE = 20;

function TransactionHistory() {
    const { toast } = useToast();
    const { user } = useSupabaseAuth();
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [dateRange, setDateRange] = useState({ from: startOfMonth(new Date()), to: endOfMonth(new Date()) });
    const [filterLabel, setFilterLabel] = useState('1M');
    const [filterCategoryId, setFilterCategoryId] = useState('all');
    const [descriptionFilter, setDescriptionFilter] = useState('');
    const [debouncedDescription] = useDebounce(descriptionFilter, 300);
    const [typeFilter, setTypeFilter] = useState('all');
    const [editingTransaction, setEditingTransaction] = useState(null);
    const [page, setPage] = useState(1);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);

    const resetPaginationAndFilters = () => {
        setPage(1);
        setHasMore(true);
    };

    useEffect(() => {
        const from = startOfMonth(currentMonth);
        const to = endOfMonth(currentMonth);
        setDateRange({ from, to });
        setFilterLabel(null);
        resetPaginationAndFilters();
    }, [currentMonth]);
    
    useEffect(() => {
        resetPaginationAndFilters();
    }, [filterCategoryId, debouncedDescription, typeFilter]);

    const handleFilterChange = (label) => {
        const now = new Date();
        let from, to = endOfDay(now);
        switch (label) {
            case '1D': from = startOfDay(now); break;
            case '7D': from = startOfDay(subDays(now, 6)); break;
            case '6M': from = startOfDay(subMonths(now, 5)); break;
            case '1A': from = startOfDay(subYears(now, 1)); break;
            case '1M': default: from = startOfMonth(now); to = endOfMonth(now); break;
        }
        setFilterLabel(label);
        setDateRange({ from, to });
        setCurrentMonth(now);
        resetPaginationAndFilters();
    };

    const financeCategories = useLiveQuery(() => 
        user ? db.finance_categories.where({ owner_user_id: user.id, deleted_at: 0 }).toArray() : [],
    [user?.id]);
    
    const categoryMap = useMemo(() => {
        if (!financeCategories) return {};
        return financeCategories.reduce((acc, cat) => {
            acc[cat.id] = cat.name;
            return acc;
        }, {});
    }, [financeCategories]);

    const { transactions, totalCount } = useLiveQuery(() => {
        if (!user) return { transactions: [], totalCount: 0 };
        
        const fromDate = dateRange.from.toISOString();
        const toDate = dateRange.to.toISOString();

        let query = db.finance_transactions
          .where('[owner_user_id+deleted_at+transaction_date]')
          .between([user.id, 0, fromDate], [user.id, 0, toDate], true, true);
        
        const filterFunctions = [];

        if (filterCategoryId !== 'all') {
            filterFunctions.push(t => t.category_id === filterCategoryId);
        }
        if (typeFilter !== 'all') {
            filterFunctions.push(t => t.type === typeFilter);
        }
        if (debouncedDescription) {
            const lowerDesc = debouncedDescription.toLowerCase();
            filterFunctions.push(t => t.description.toLowerCase().includes(lowerDesc));
        }

        if (filterFunctions.length > 0) {
            query = query.filter(t => filterFunctions.every(fn => fn(t)));
        }

        return query.count(async (total) => {
            const results = await query
                .reverse()
                .offset((page - 1) * PAGE_SIZE)
                .limit(PAGE_SIZE)
                .toArray();
            return { transactions: results, totalCount: total };
        });

    }, [dateRange, filterCategoryId, debouncedDescription, typeFilter, page, user?.id], { transactions: [], totalCount: 0 });
    
    useEffect(() => {
        if (transactions) {
            setHasMore(transactions.length + (page - 1) * PAGE_SIZE < totalCount);
        }
    }, [transactions, totalCount, page]);

    const loadMore = useCallback(() => {
        if (hasMore && !isLoadingMore) {
            setIsLoadingMore(true);
            setPage(prevPage => prevPage + 1);
            setTimeout(() => setIsLoadingMore(false), 500);
        }
    }, [hasMore, isLoadingMore]);


    const summary = useLiveQuery(async () => {
        if (!user) return { income: 0, expenses: 0 };

        const fromDate = dateRange.from;
        const toDate = dateRange.to;

        const allTransactions = await db.finance_transactions
            .where({ owner_user_id: user.id, deleted_at: 0 })
            .and(t => {
                const txDate = new Date(t.transaction_date);
                return txDate >= fromDate && txDate <= toDate;
            })
            .toArray();

        const income = allTransactions.filter(t => t.type === 'entrada').reduce((sum, t) => sum + t.amount, 0);
        const expenses = allTransactions.filter(t => t.type === 'saida').reduce((sum, t) => sum + Math.abs(t.amount), 0);
        return { income, expenses };
    }, [dateRange, user?.id], { income: 0, expenses: 0 });

    const handleDelete = async (id) => {
        await syncService.softDelete('finance_transactions', id);
        toast({ title: "Transação excluída com sucesso!" });
    };
    
    const formatDate = (dateString) => {
        try {
            const date = typeof dateString === 'string' ? parseISO(dateString) : dateString;
            return format(date, 'dd/MM/yy HH:mm');
        } catch (error) {
            console.error("Error formatting date:", dateString, error);
            return 'Data inválida';
        }
    };
    
    const handleTransactionUpdate = () => {
      // Intentionally empty. Relies on useLiveQuery.
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row gap-4 justify-between">
                <div className="flex flex-wrap items-center gap-2">
                    {['1D', '7D', '1M', '6M', '1A'].map(label => (
                        <Button key={label} variant={filterLabel === label ? 'default' : 'outline'} size="sm" onClick={() => handleFilterChange(label)}>{label}</Button>
                    ))}
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" onClick={() => setCurrentMonth(sub(currentMonth, { months: 1 }))}><ChevronLeft className="h-4 w-4" /></Button>
                    <span className="font-semibold text-center w-32 capitalize">{format(currentMonth, 'MMMM yyyy', { locale: ptBR })}</span>
                    <Button variant="outline" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}><ChevronRight className="h-4 w-4" /></Button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <Input placeholder="Buscar por descrição..." value={descriptionFilter} onChange={(e) => setDescriptionFilter(e.target.value)} />
                <select value={filterCategoryId} onChange={(e) => setFilterCategoryId(e.target.value)} className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option value="all">Todas as categorias</option>
                    {financeCategories?.map((cat) => (<option key={cat.id} value={cat.id}>{cat.name}</option>))}
                </select>
                <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option value="all">Todos os tipos</option>
                    <option value="entrada">Entradas</option>
                    <option value="saida">Despesas</option>
                </select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Receitas no Período</CardTitle>
                        <TrendingUp className="h-4 w-4 text-green-500" />
                    </CardHeader>
                    <CardContent><div className="text-2xl font-bold text-green-600">{(summary.income).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div></CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Despesas no Período</CardTitle>
                        <TrendingDown className="h-4 w-4 text-red-500" />
                    </CardHeader>
                    <CardContent><div className="text-2xl font-bold text-red-600">{(summary.expenses).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div></CardContent>
                </Card>
            </div>

            <div className="bg-white rounded-lg shadow overflow-hidden">
                <div className="hidden md:grid md:grid-cols-[1fr,1fr,1fr,2fr,1fr,auto] gap-4 p-4 font-semibold text-sm text-gray-600 border-b">
                    <div>Data</div>
                    <div>Tipo</div>
                    <div>Categoria</div>
                    <div>Descrição</div>
                    <div className="text-right">Valor</div>
                    <div className="text-right">Ações</div>
                </div>
                <div className="divide-y">
                    {transactions && transactions.length > 0 ? transactions.map(t => (
                        <div key={t.id} className="grid grid-cols-2 md:grid-cols-[1fr,1fr,1fr,2fr,1fr,auto] gap-x-4 gap-y-2 p-4 items-center">
                            <div className="text-sm text-gray-800 col-span-2 md:col-span-1">{formatDate(t.transaction_date)}</div>
                            <div className="md:col-span-1">
                                <span className={`px-2 py-1 text-xs font-semibold rounded-full ${t.type === 'entrada' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                    {t.type === 'entrada' ? 'Entrada' : 'Saída'}
                                </span>
                            </div>
                            <div className="text-sm text-gray-600 truncate md:col-span-1 text-right md:text-left">{categoryMap[t.category_id] || 'Sem Categoria'}</div>
                            <div className="text-sm text-gray-800 font-medium truncate col-span-2 md:col-span-1">{t.description}</div>
                            <div className={`font-bold col-span-1 text-left md:text-right ${t.type === 'entrada' ? 'text-green-600' : 'text-red-600'}`}>
                                {t.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </div>
                             <div className="flex justify-end col-span-1">
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuItem onClick={() => setEditingTransaction(t)}><Edit className="mr-2 h-4 w-4" /> Editar</DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => handleDelete(t.id)} className="text-red-600 focus:text-red-600 focus:bg-red-50"><Trash2 className="mr-2 h-4 w-4" /> Excluir</DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        </div>
                    )) : <EmptyState />}
                </div>
            </div>
            {hasMore && (
                <div className="text-center mt-4">
                    <Button onClick={loadMore} disabled={isLoadingMore}>
                        {isLoadingMore ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Carregar mais
                    </Button>
                </div>
            )}
            {editingTransaction && (
                <EditTransactionDialog
                    transaction={editingTransaction}
                    isOpen={!!editingTransaction}
                    onClose={() => setEditingTransaction(null)}
                    onTransactionUpdate={handleTransactionUpdate}
                />
            )}
        </div>
    );
}

export default TransactionHistory;