import React, { useState, useMemo, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { syncService } from '@/lib/syncService';
import { format, differenceInDays, addDays, startOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/use-toast';
import { MoreVertical, Edit, Trash2, CheckCircle, Clock, CalendarPlus, AlertTriangle, Loader2, TrendingDown, Hourglass, FileText, Download, Share2 } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import jsPDF from 'jspdf';

const getStatusInfo = (payable) => {
    if (payable.status === 'pago') return { text: 'Pago', color: 'text-green-600', status: 'pago' };
    if (payable.status === 'parcial') return { text: `Parcial (${(payable.amount - payable.amount_remaining).toLocaleString('pt-BR', {style:'currency', currency:'BRL'})} pagos)`, color: 'text-blue-600', status: 'parcial' };

    const today = startOfDay(new Date());
    const due = startOfDay(new Date(payable.due_at));
    const daysDiff = differenceInDays(due, today);

    if (daysDiff < 0) return { text: `Atrasado há ${-daysDiff} dia(s)`, color: 'text-red-600', status: 'atrasado' };
    if (daysDiff === 0) return { text: 'Vence hoje', color: 'text-red-600', status: 'pendente' };
    if (daysDiff <= 3) return { text: `Faltam ${daysDiff} dia(s)`, color: 'text-orange-500', status: 'pendente' };
    if (daysDiff <= 7) return { text: `Faltam ${daysDiff} dia(s)`, color: 'text-yellow-500', status: 'pendente' };
    return { text: `Faltam ${daysDiff} dia(s)`, color: 'text-green-600', status: 'pendente' };
};

const PaymentDialog = ({ payable, isOpen, onClose, onConfirm }) => {
    const amountRemaining = payable?.amount_remaining ?? payable?.amount ?? 0;
    const [paymentAmount, setPaymentAmount] = useState(amountRemaining);
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (payable) {
            setPaymentAmount(payable.amount_remaining ?? payable.amount ?? 0);
            setError('');
        }
    }, [payable]);

    const handleAmountChange = (e) => {
        const value = e.target.value;
        setPaymentAmount(value);
        const numericValue = parseFloat(value);
        if (isNaN(numericValue) || numericValue <= 0 || numericValue > amountRemaining) {
            setError(`Valor deve ser entre 0 e ${amountRemaining.toLocaleString('pt-BR', {style:'currency', currency:'BRL'})}`);
        } else {
            setError('');
        }
    };

    const handleConfirm = async () => {
        const numericValue = parseFloat(paymentAmount);
        if (error || isNaN(numericValue)) return;
        setIsLoading(true);
        await onConfirm(numericValue);
        setIsLoading(false);
        onClose();
    };
    
    if (!isOpen) return null;

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Realizar Pagamento</DialogTitle>
                    <DialogDescription>{payable.description}</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <p>Saldo devedor: <span className="font-bold">{amountRemaining.toLocaleString('pt-BR', {style:'currency', currency:'BRL'})}</span></p>
                    <div>
                        <label htmlFor="paymentAmount" className="text-sm font-medium">Valor do Pagamento</label>
                        <Input id="paymentAmount" type="number" value={paymentAmount} onChange={handleAmountChange} placeholder="Valor a pagar" />
                        {error && <p className="text-sm text-red-500 mt-1">{error}</p>}
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Cancelar</Button>
                    <Button onClick={handleConfirm} disabled={isLoading || !!error}>
                        {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Confirmar Pagamento"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

const ReceiptDialog = ({ paymentDetails, isOpen, onClose }) => {
    const { user } = useSupabaseAuth();
    if (!isOpen || !paymentDetails) return null;

    const { savedTransaction, updatedPayable } = paymentDetails;

    const generatePdf = () => {
        const doc = new jsPDF();
        doc.setFontSize(18);
        doc.text("Recibo de Pagamento", 105, 20, null, null, 'center');
        
        doc.setFontSize(12);
        doc.text(`Beneficiário: ${user.email}`, 20, 40);
        doc.text(`Data do Pagamento: ${format(new Date(savedTransaction.transaction_date), "dd/MM/yyyy HH:mm", { locale: ptBR })}`, 20, 50);
        
        doc.line(20, 60, 190, 60);

        doc.setFontSize(14);
        doc.text("Detalhes do Pagamento", 20, 70);
        
        doc.setFontSize(12);
        doc.text(`Descrição da Conta: ${updatedPayable.description}`, 20, 80);
        doc.text(`Valor Pago: ${savedTransaction.amount.toLocaleString('pt-BR', {style:'currency', currency:'BRL'})}`, 20, 90);
        doc.text(`Saldo Restante: ${updatedPayable.amount_remaining.toLocaleString('pt-BR', {style:'currency', currency:'BRL'})}`, 20, 100);
        doc.text(`ID da Transação: ${savedTransaction.id}`, 20, 110);
        
        doc.line(20, 120, 190, 120);

        doc.setFontSize(10);
        doc.text("Gerado por NotasCat", 105, 130, null, null, 'center');

        doc.save(`recibo-${savedTransaction.id.substring(0, 8)}.pdf`);
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Pagamento Realizado com Sucesso!</DialogTitle>
                </DialogHeader>
                <div className="py-4 text-center">
                    <FileText className="h-16 w-16 mx-auto text-green-500 mb-4" />
                    <p>O que você gostaria de fazer com o recibo?</p>
                </div>
                <DialogFooter className="justify-center gap-4">
                    <Button onClick={generatePdf}><Download className="mr-2 h-4 w-4" /> Baixar PDF</Button>
                    <Button onClick={() => toast({ title: '🚧 Em breve!' })} disabled><Share2 className="mr-2 h-4 w-4" /> WhatsApp</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};


function PayablesDashboard() {
    const { user } = useSupabaseAuth();
    const [filter, setFilter] = useState('');
    const [showPaid, setShowPaid] = useState(false);
    const [loadingAction, setLoadingAction] = useState(null);
    const [filterCategoryId, setFilterCategoryId] = useState('all');
    const [payables, setPayables] = useState([]);
    const [selectedPayable, setSelectedPayable] = useState(null);
    const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
    const [isReceiptDialogOpen, setIsReceiptDialogOpen] = useState(false);
    const [lastPaymentDetails, setLastPaymentDetails] = useState(null);

    const allPayables = useLiveQuery(() => {
        if (!user) return [];
        return db.finance_payables.where({ owner_user_id: user.id, deleted_at: 0 }).toArray();
    }, [user?.id]);

    useEffect(() => {
        if (allPayables) {
            setPayables(allPayables);
        }
    }, [allPayables]);

    const financeCategories = useLiveQuery(() => 
        user ? db.finance_categories.where({ owner_user_id: user.id, deleted_at: 0 }).toArray() : [],
    [user?.id]);
    
    const handleOpenPaymentDialog = (payable) => {
        setSelectedPayable(payable);
        setIsPaymentDialogOpen(true);
    };

    const handleConfirmPayment = async (amount) => {
        setLoadingAction(selectedPayable.id);
        try {
            const result = await syncService.makePartialPayment(selectedPayable.id, amount);
            toast({ title: 'Pagamento realizado com sucesso!' });
            setLastPaymentDetails(result);
            setIsReceiptDialogOpen(true);
        } catch (error) {
            toast({ variant: 'destructive', title: 'Erro ao processar pagamento', description: error.message });
        } finally {
            setLoadingAction(null);
            setIsPaymentDialogOpen(false);
            setSelectedPayable(null);
        }
    };

    const handlePostpone = async (id, days) => {
        setLoadingAction(id);
        try {
            const payable = await db.finance_payables.get(id);
            if (!payable) throw new Error("Conta não encontrada localmente.");
            
            const newDueDate = addDays(new Date(payable.due_at), days);
            const updatedPayable = {
                id: payable.id, 
                due_at: newDueDate.toISOString(),
            };
            await syncService.saveLocalThenSync('finance_payables', updatedPayable);
            toast({ title: `Vencimento adiado em ${days} dia(s)!` });
        } catch (error) {
            toast({ variant: 'destructive', title: 'Erro ao adiar', description: error.message });
        } finally {
            setLoadingAction(null);
        }
    };

    const handleDelete = async (id) => {
        setLoadingAction(id);
        try {
            await syncService.softDelete('finance_payables', id);
            toast({ title: 'Conta excluída' });
        } catch (error) {
            toast({ variant: 'destructive', title: 'Erro ao excluir', description: error.message });
        } finally {
            setLoadingAction(null);
        }
    };

    const { filteredPayables, overdueTotal, pendingTotal } = useMemo(() => {
        if (!payables) return { filteredPayables: { pending: [], overdue: [], paid: [], partial: [] }, overdueTotal: 0, pendingTotal: 0 };

        let query = payables;

        if (filterCategoryId !== 'all') {
            if (filterCategoryId === 'sem-categoria') {
                query = query.filter(p => !p.category_id || p.category_id === '00000000-0000-0000-0000-000000000000');
            } else {
                query = query.filter(p => p.category_id === filterCategoryId);
            }
        }
        
        const filtered = query.filter(p => {
            const matchesFilter = p.description.toLowerCase().includes(filter.toLowerCase());
            const matchesStatus = showPaid ? true : p.status !== 'pago';
            return matchesFilter && matchesStatus;
        });
        
        const grouped = {
            pending: filtered.filter(p => p.status === 'pendente' && differenceInDays(startOfDay(new Date(p.due_at)), startOfDay(new Date())) >= 0).sort((a, b) => new Date(a.due_at) - new Date(b.due_at)),
            overdue: filtered.filter(p => p.status === 'pendente' && differenceInDays(startOfDay(new Date(p.due_at)), startOfDay(new Date())) < 0).sort((a, b) => new Date(a.due_at) - new Date(b.due_at)),
            partial: filtered.filter(p => p.status === 'parcial').sort((a, b) => new Date(a.due_at) - new Date(b.due_at)),
            paid: filtered.filter(p => p.status === 'pago').sort((a, b) => new Date(b.paid_at) - new Date(a.paid_at)),
        };
        
        const overdueSum = grouped.overdue.reduce((sum, p) => sum + (p.amount_remaining ?? p.amount), 0);
        const pendingSum = [...grouped.pending, ...grouped.partial].reduce((sum, p) => sum + (p.amount_remaining ?? p.amount), 0);

        return { filteredPayables: grouped, overdueTotal: overdueSum, pendingTotal: pendingSum };
    }, [payables, filter, showPaid, filterCategoryId]);

    const renderPayable = (p) => {
        const statusInfo = getStatusInfo(p);
        const amountRemaining = p.amount_remaining ?? p.amount;
        return (
            <div key={p.id} className="flex items-center justify-between p-4 bg-white rounded-lg border hover:shadow-md transition-shadow">
                <div className="flex-1">
                    <p className="font-semibold text-gray-800">{p.description}</p>
                    <p className="text-sm text-gray-600">
                        {p.status === 'parcial' || p.status === 'pago' ? 
                            `${amountRemaining.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} de ${p.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`
                            : amountRemaining.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                        }
                    </p>
                    {p.status === 'pago' ? (
                        <p className="text-sm text-green-600">Pago em {format(new Date(p.paid_at), 'dd/MM/yyyy', { locale: ptBR })}</p>
                    ) : (
                        <p className={`text-sm font-medium ${statusInfo.color}`}>{statusInfo.text}</p>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    {loadingAction === p.id ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                        <>
                            {p.status !== 'pago' && (
                                <Button size="sm" onClick={() => handleOpenPaymentDialog(p)}>Pagar</Button>
                            )}
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon"><MoreVertical className="h-4 w-4" /></Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent>
                                    <DropdownMenuItem onClick={() => toast({ title: '🚧 Em breve!' })}><Edit className="mr-2 h-4 w-4" /> Editar</DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleDelete(p.id)} className="text-red-500"><Trash2 className="mr-2 h-4 w-4" /> Excluir</DropdownMenuItem>
                                    {p.status !== 'pago' && (
                                        <>
                                            <DropdownMenuItem onClick={() => handlePostpone(p.id, 1)}><CalendarPlus className="mr-2 h-4 w-4" /> Adiar 1 dia</DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => handlePostpone(p.id, 7)}><CalendarPlus className="mr-2 h-4 w-4" /> Adiar 7 dias</DropdownMenuItem>
                                        </>
                                    )}
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-8">
            <PaymentDialog isOpen={isPaymentDialogOpen} onClose={() => setIsPaymentDialogOpen(false)} payable={selectedPayable} onConfirm={handleConfirmPayment} />
            <ReceiptDialog isOpen={isReceiptDialogOpen} onClose={() => setIsReceiptDialogOpen(false)} paymentDetails={lastPaymentDetails} />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
                <Input placeholder="Filtrar por descrição..." value={filter} onChange={(e) => setFilter(e.target.value)} className="w-full" />
                <div>
                     <label htmlFor="payable-category-filter" className="text-sm font-medium">Filtrar por Categoria</label>
                     <select
                         id="payable-category-filter"
                         value={filterCategoryId}
                         onChange={(e) => setFilterCategoryId(e.target.value)}
                         className="mt-1 flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                     >
                         <option value="all">Todas as categorias</option>
                         {financeCategories?.map((cat) => (
                             <option key={cat.id} value={cat.id}>{cat.name}</option>
                         ))}
                         <option value="sem-categoria">Sem Categoria</option>
                     </select>
                </div>
                <div className="sm:col-span-2 flex justify-end">
                    <label className="flex items-center gap-2">
                        <input type="checkbox" checked={showPaid} onChange={(e) => setShowPaid(e.target.checked)} />
                        <span>Mostrar pagas</span>
                    </label>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="border-red-200 bg-red-50">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-red-800">Total Atrasado</CardTitle>
                        <TrendingDown className="h-4 w-4 text-red-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-red-600">
                            {overdueTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </div>
                        <p className="text-xs text-red-500">
                            {filteredPayables.overdue.length} conta(s) vencida(s)
                        </p>
                    </CardContent>
                </Card>
                <Card className="border-orange-200 bg-orange-50">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-orange-800">Total Pendente</CardTitle>
                        <Hourglass className="h-4 w-4 text-orange-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-orange-600">
                            {pendingTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </div>
                        <p className="text-xs text-orange-500">
                            {filteredPayables.pending.length + filteredPayables.partial.length} conta(s) a vencer
                        </p>
                    </CardContent>
                </Card>
            </div>

            {filteredPayables.overdue.length > 0 && (
                <div>
                    <h3 className="text-xl font-bold text-red-600 mb-4 flex items-center gap-2"><AlertTriangle /> Atrasadas</h3>
                    <div className="space-y-4">{filteredPayables.overdue.map(renderPayable)}</div>
                </div>
            )}
            
            {filteredPayables.partial.length > 0 && (
                <div>
                    <h3 className="text-xl font-bold text-blue-600 mb-4 flex items-center gap-2"><Clock /> Pagamento Parcial</h3>
                    <div className="space-y-4">{filteredPayables.partial.map(renderPayable)}</div>
                </div>
            )}

            {filteredPayables.pending.length > 0 && (
                <div>
                    <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2"><Clock /> Pendentes</h3>
                    <div className="space-y-4">{filteredPayables.pending.map(renderPayable)}</div>
                </div>
            )}

            {showPaid && filteredPayables.paid.length > 0 && (
                <div>
                    <h3 className="text-xl font-bold text-green-600 mb-4 flex items-center gap-2"><CheckCircle /> Pagas</h3>
                    <div className="space-y-4">{filteredPayables.paid.map(renderPayable)}</div>
                </div>
            )}

            {(!payables || (filteredPayables.pending.length === 0 && filteredPayables.overdue.length === 0 && filteredPayables.partial.length === 0 && (!showPaid || filteredPayables.paid.length === 0))) && (
                <div className="text-center py-16 border-2 border-dashed rounded-lg">
                    <p className="text-gray-500">Nenhuma conta a pagar encontrada para os filtros selecionados.</p>
                </div>
            )}
        </div>
    );
}

export default PayablesDashboard;