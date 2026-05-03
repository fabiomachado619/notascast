import React, { useState, useMemo, useEffect } from 'react';
    import { useLiveQuery } from 'dexie-react-hooks';
    import { db } from '@/lib/db';
    import { subDays, startOfDay, endOfDay, startOfMonth, endOfMonth, subMonths, subYears, format, addMonths, sub } from 'date-fns';
    import { ptBR } from 'date-fns/locale';
    import { BarChart, Bar, PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer, XAxis, YAxis } from 'recharts';
    import { Button } from '@/components/ui/button';
    import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
    import { Database as Data, TrendingUp, TrendingDown, DollarSign, ChevronLeft, ChevronRight, Eye, EyeOff } from 'lucide-react';
    import QuickTransactionForm from './QuickTransactionForm';
    import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';

    const COLORS = ['#10B981', '#3B82F6', '#F59E0B', '#8B5CF6', '#EC4899', '#6B7280'];

    const EmptyState = () => (
        <div className="text-center py-16 border-2 border-dashed rounded-lg">
            <div className="mx-auto h-12 w-12 text-gray-400"><Data /></div>
            <h3 className="mt-2 text-sm font-medium text-gray-900">Sem dados no período</h3>
            <p className="mt-1 text-sm text-gray-500">Nenhuma transação encontrada para os filtros selecionados.</p>
        </div>
    );


    function FinanceDashboard() {
        const { user } = useSupabaseAuth();
        const [currentMonth, setCurrentMonth] = useState(new Date());
        const [dateRange, setDateRange] = useState({
            from: startOfMonth(new Date()),
            to: endOfMonth(new Date()),
        });
        const [filterLabel, setFilterLabel] = useState('1M');
        const [filterCategoryId, setFilterCategoryId] = useState('all');
        const [showValues, setShowValues] = useState(false); // Values hidden by default

        useEffect(() => {
            const from = startOfMonth(currentMonth);
            const to = endOfMonth(currentMonth);
            setDateRange({ from, to });
            setFilterLabel(null);
        }, [currentMonth]);

        const handleFilterChange = (label) => {
            const now = new Date();
            let from, to = endOfDay(now);
            switch (label) {
                case '1D': from = startOfDay(now); break;
                case '7D': from = startOfDay(subDays(now, 6)); break;
                case '6M': from = startOfDay(subMonths(now, 5)); break;
                case '1A': from = startOfDay(subYears(now, 1)); break;
                case '1M':
                default: from = startOfMonth(now); to = endOfMonth(now); break;
            }
            setFilterLabel(label);
            setDateRange({ from, to });
            setCurrentMonth(now);
        };

        const handleTransactionSaved = (savedRecord, table) => {
          // This function forces a re-render by interacting with a dummy state
          // but the core update logic is handled by dexie-react-hooks reacting to DB changes.
          console.log(`${table} saved, Dexie will trigger UI update.`);
        };

        const transactions = useLiveQuery(() => {
            if (!user) return [];
            let query = db.finance_transactions
              .where({ owner_user_id: user.id, deleted_at: 0 });
            
            if (filterCategoryId !== 'all') {
                query = query.and(t => t.category_id === filterCategoryId);
            }

            return query.filter(t => {
                const transactionDate = new Date(t.transaction_date);
                return transactionDate >= dateRange.from && transactionDate <= dateRange.to;
            }).toArray();
        }, [dateRange, filterCategoryId, user?.id]);

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

        const data = useMemo(() => {
            if (!transactions) return null;

            const income = transactions.filter(t => t.type === 'entrada').reduce((sum, t) => sum + t.amount, 0);
            const expenses = transactions.filter(t => t.type === 'saida').reduce((sum, t) => sum + Math.abs(t.amount), 0);
            const balance = income - expenses;
            
            const expensesByCategory = transactions.filter(t => t.type === 'saida').reduce((acc, t) => {
                const catName = categoryMap[t.category_id] || 'Sem Categoria';
                acc[catName] = (acc[catName] || 0) + Math.abs(t.amount);
                return acc;
            }, {});

            const incomeByCategory = transactions.filter(t => t.type === 'entrada').reduce((acc, t) => {
                const catName = categoryMap[t.category_id] || 'Sem Categoria';
                acc[catName] = (acc[catName] || 0) + t.amount;
                return acc;
            }, {});

            const formatPieData = (data) => {
                const sorted = Object.entries(data).sort(([,a], [,b]) => b - a);
                if (sorted.length > 10) {
                    const top10 = sorted.slice(0, 9);
                    const others = sorted.slice(9).reduce((sum, [,val]) => sum + val, 0);
                    return [...top10.map(([name, value]) => ({ name, value })), { name: 'Outras', value: others }];
                }
                return sorted.map(([name, value]) => ({ name, value }));
            };
            
            const barChartData = transactions.reduce((acc, t) => {
                const day = format(new Date(t.transaction_date), 'dd/MM');
                if (!acc[day]) {
                    acc[day] = { day, entrada: 0, saida: 0 };
                }
                if (t.type === 'entrada') {
                    acc[day].entrada += t.amount;
                } else {
                    acc[day].saida += t.amount;
                }
                return acc;
            }, {});

            return {
                hasData: transactions.length > 0,
                income,
                expenses,
                balance,
                expensesByCategory: formatPieData(expensesByCategory),
                incomeByCategory: formatPieData(incomeByCategory),
                barChartData: Object.values(barChartData).sort((a,b) => a.day.localeCompare(b.day)),
            };

        }, [transactions, categoryMap]);
        
        if (!transactions || !financeCategories) {
            return <div className="text-center p-8">Carregando dados...</div>;
        }

        const formatCurrency = (value) => {
            return showValues ? value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '••••••';
        };

        return (
            <div className="space-y-8">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-2 space-y-8">
                        <div className="flex flex-col sm:flex-row gap-4 sm:items-center justify-between">
                           <div className="flex flex-wrap items-center gap-2">
                                {['1D', '7D', '1M', '6M', '1A'].map(label => (
                                    <Button key={label} variant={filterLabel === label ? 'default' : 'outline'} size="sm" onClick={() => handleFilterChange(label)}>{label}</Button>
                                ))}
                            </div>
                             <div className="flex items-center gap-2">
                                <Button variant="outline" size="icon" onClick={() => setCurrentMonth(sub(currentMonth, { months: 1 }))}>
                                    <ChevronLeft className="h-4 w-4" />
                                </Button>
                                <span className="font-semibold text-center w-32">{format(currentMonth, 'MMMM yyyy', { locale: ptBR })}</span>
                                <Button variant="outline" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
                                    <ChevronRight className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>

                        <div>
                            <label htmlFor="category-filter" className="text-sm font-medium">Filtrar por Categoria</label>
                            <select
                                id="category-filter"
                                value={filterCategoryId}
                                onChange={(e) => setFilterCategoryId(e.target.value)}
                                className="mt-1 flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                            >
                                <option value="all">Todas as categorias</option>
                                {financeCategories.map((cat) => (
                                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                                ))}
                                 <option value="sem-categoria">Sem Categoria</option>
                            </select>
                        </div>

                        <div className="relative">
                            <div className="absolute -top-6 right-0 z-10">
                                <Button variant="ghost" size="icon" onClick={() => setShowValues(!showValues)} className="h-8 w-8">
                                    {showValues ? <EyeOff className="h-5 w-5 text-gray-500" /> : <Eye className="h-5 w-5 text-gray-500" />}
                                </Button>
                            </div>
                            <div className="grid gap-4 sm:grid-cols-3">
                                <Card>
                                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                        <CardTitle className="text-sm font-medium">Receitas</CardTitle>
                                        <TrendingUp className="h-4 w-4 text-green-500" />
                                    </CardHeader>
                                    <CardContent>
                                        <div className="text-2xl font-bold text-green-600">{formatCurrency(data?.income || 0)}</div>
                                    </CardContent>
                                </Card>
                                <Card>
                                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                        <CardTitle className="text-sm font-medium">Despesas</CardTitle>
                                        <TrendingDown className="h-4 w-4 text-red-500" />
                                    </CardHeader>
                                    <CardContent>
                                        <div className="text-2xl font-bold text-red-600">{formatCurrency(data?.expenses || 0)}</div>
                                    </CardContent>
                                </Card>
                                <Card>
                                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                        <CardTitle className="text-sm font-medium">Saldo</CardTitle>
                                        <DollarSign className={`h-4 w-4 ${(data?.balance || 0) >= 0 ? 'text-blue-500' : 'text-red-500'}`} />
                                    </CardHeader>
                                    <CardContent>
                                        <div className={`text-2xl font-bold ${(data?.balance || 0) >= 0 ? 'text-blue-600' : 'text-red-600'}`}>{formatCurrency(data?.balance || 0)}</div>
                                    </CardContent>
                                </Card>
                            </div>
                        </div>

                        {!data?.hasData ? (
                            <EmptyState />
                        ) : (
                            <div className="grid gap-8">
                                 <Card>
                                    <CardHeader><CardTitle>Entradas x Saídas</CardTitle></CardHeader>
                                    <CardContent>
                                        <ResponsiveContainer width="100%" height={300}>
                                            <BarChart data={data.barChartData}>
                                                <XAxis dataKey="day" />
                                                <YAxis tickFormatter={(value) => `R$${value/1000}k`} />
                                                <Tooltip formatter={(value) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}/>
                                                <Legend />
                                                <Bar dataKey="entrada" stackId="a" fill="#10B981" name="Entradas" />
                                                <Bar dataKey="saida" stackId="a" fill="#EF4444" name="Saídas" />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </CardContent>
                                </Card>
                                <div className="grid md:grid-cols-2 gap-8">
                                    <Card>
                                        <CardHeader><CardTitle>Despesas por Categoria</CardTitle></CardHeader>
                                        <CardContent>
                                            <ResponsiveContainer width="100%" height={300}>
                                                <PieChart>
                                                    <Pie data={data.expensesByCategory} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                                                        {data.expensesByCategory.map((entry, index) => (
                                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                                        ))}
                                                    </Pie>
                                                    <Tooltip formatter={(value) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}/>
                                                    <Legend />
                                                </PieChart>
                                            </ResponsiveContainer>
                                        </CardContent>
                                    </Card>
                                    <Card>
                                        <CardHeader><CardTitle>Receitas por Categoria</CardTitle></CardHeader>
                                        <CardContent>
                                            <ResponsiveContainer width="100%" height={300}>
                                                <PieChart>
                                                    <Pie data={data.incomeByCategory} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                                                        {data.incomeByCategory.map((entry, index) => (
                                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                                        ))}
                                                    </Pie>
                                                    <Tooltip formatter={(value) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}/>
                                                    <Legend />
                                                </PieChart>
                                            </ResponsiveContainer>
                                        </CardContent>
                                    </Card>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="lg:col-span-1">
                         <h2 className="text-2xl font-bold text-gray-900 mb-2">Adicionar Lançamento</h2>
                         <p className="text-gray-600 mt-1 mb-6">Registre uma transação ou despesa a pagar.</p>
                         <QuickTransactionForm onTransactionSaved={handleTransactionSaved} />
                    </div>
                </div>
            </div>
        );
    }

    export default FinanceDashboard;