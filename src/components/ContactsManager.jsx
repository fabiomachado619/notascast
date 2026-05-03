import React, { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, User, Upload, Download, Loader2, Users, Search, Edit, Trash2, FileWarning, Phone, ArrowUpDown, X, RefreshCw } from 'lucide-react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { useLiveQuery } from 'dexie-react-hooks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/components/ui/use-toast';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { db } from '@/lib/db';
import { syncService } from '@/lib/syncService';
import { normalizeBrazilianPhoneNumber, parseContactDate, generateCsv, downloadCsv } from '@/utils/contactUtils';
import { v4 as uuidv4 } from 'uuid';

const FIELD_MAPPING = {
  name: { label: 'Nome', synonyms: ['nome', 'name', 'full_name', 'contato'] },
  whatsapp_raw: { label: 'WhatsApp', synonyms: ['whatsapp', 'telefone', 'celular', 'phone', 'mobile', 'fone', 'tel'] },
  email: { label: 'E-mail', synonyms: ['email', 'e-mail', 'mail'] },
  gender: { label: 'Sexo', synonyms: ['sexo', 'gender', 'gênero'] },
  birthday: { label: 'Aniversário', synonyms: ['aniversario', 'aniversário', 'birthday', 'nasc', 'dt_nasc'] },
  origin: { label: 'Origem', synonyms: ['origem', 'source', 'campaign', 'origem_cadastro'] },
  description: { label: 'Descrição', synonyms: ['descricao', 'descrição', 'notes', 'observacao'] }
};

const normalizeHeader = (header) => header.toLowerCase().replace(/_|\s/g, '').normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const autoMapColumns = (headers) => {
  const mapping = {};
  const usedHeaders = new Set();

  Object.keys(FIELD_MAPPING).forEach(fieldKey => {
    const fieldInfo = FIELD_MAPPING[fieldKey];
    for (const header of headers) {
      if (usedHeaders.has(header)) continue;
      const normalizedHeader = normalizeHeader(header);
      if (fieldInfo.synonyms.includes(normalizedHeader)) {
        mapping[fieldKey] = header;
        usedHeaders.add(header);
        break;
      }
    }
  });
  return mapping;
};

const ImportMappingDialog = ({ isOpen, onOpenChange, fileData, fileSheets, onConfirm, originalFile }) => {
    const [selectedSheet, setSelectedSheet] = useState(fileSheets.length > 0 ? fileSheets[0] : '');
    const [sheetData, setSheetData] = useState([]);
    const [sheetHeaders, setSheetHeaders] = useState([]);
    const [mapping, setMapping] = useState({});
    const [isLoading, setIsLoading] = useState(false);
  
    useEffect(() => {
        if (!isOpen || !originalFile) return;

        const loadSheet = (sheetName) => {
            try {
                const workbook = XLSX.read(originalFile, { type: 'binary' });
                const data = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
                const headers = data.length > 0 ? Object.keys(data[0]) : [];
                setSheetData(data);
                setSheetHeaders(headers);
                setMapping(autoMapColumns(headers));
            } catch (error) {
                console.error("Error loading sheet:", error);
            }
        };
        
        if (originalFile.name.endsWith('.csv')) {
            setSheetData(fileData);
            setSheetHeaders(fileSheets);
            setMapping(autoMapColumns(fileSheets));
        } else if (fileSheets.length > 0) {
            loadSheet(selectedSheet);
        }

    }, [isOpen, selectedSheet, originalFile, fileSheets, fileData]);

    const handleConfirm = async () => {
      if (!mapping.whatsapp_raw) {
          alert('Por favor, selecione a coluna correspondente ao WhatsApp/Telefone.');
          return;
      }
      setIsLoading(true);
      await onConfirm(sheetData, mapping);
      setIsLoading(false);
      onOpenChange(false);
    };
  
    return (
      <Dialog open={isOpen} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl">
          <DialogHeader><DialogTitle>Mapear colunas para importação</DialogTitle></DialogHeader>
          <DialogDescription>Verifique se as colunas do seu arquivo correspondem aos campos corretos. Ajuste se necessário.</DialogDescription>
          
          {fileSheets.length > 1 && !originalFile.name.endsWith('.csv') && (
            <div className="my-4">
                <label className="font-medium text-sm">Selecione a Aba/Planilha:</label>
                <select value={selectedSheet} onChange={(e) => setSelectedSheet(e.target.value)} className="w-full mt-1 p-2 border rounded-md bg-white">
                    {fileSheets.map(sheet => <option key={sheet} value={sheet}>{sheet}</option>)}
                </select>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 my-4">
            {Object.keys(FIELD_MAPPING).map(fieldKey => (
              <div key={fieldKey} className="flex items-center gap-2">
                <span className="font-medium text-gray-800 w-28 shrink-0">{FIELD_MAPPING[fieldKey].label}:</span>
                <select
                  value={mapping[fieldKey] || ''}
                  onChange={(e) => setMapping({ ...mapping, [fieldKey]: e.target.value })}
                  className="w-full p-2 border rounded-md bg-white text-sm"
                >
                  <option value="">-- Ignorar --</option>
                  {sheetHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            ))}
          </div>
          
          <div className="overflow-x-auto max-h-60 border rounded-lg bg-gray-50">
            <table className="w-full text-sm">
              <thead className="bg-gray-100 sticky top-0">
                <tr>{sheetHeaders.map(h => <th key={h} className="p-2 font-semibold text-left">{h}</th>)}</tr>
              </thead>
              <tbody>
                {sheetData.slice(0, 10).map((row, i) => (
                  <tr key={i} className="border-t">{sheetHeaders.map(h => <td key={h} className="p-2 truncate max-w-xs">{row[h] || ''}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
  
          <div className="flex justify-end space-x-2 mt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>Cancelar</Button>
            <Button onClick={handleConfirm} disabled={isLoading || !mapping.whatsapp_raw}>
              {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Upload className="mr-2 h-4 w-4"/>}
              Confirmar e Importar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
};


const ContactsManager = ({ categoryId, categoryName }) => {
  const { user } = useSupabaseAuth();
  const { toast } = useToast();
  const fileInputRef = useRef(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOrder, setSortOrder] = useState('asc');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedContact, setSelectedContact] = useState(null);
  const [selectedContacts, setSelectedContacts] = useState(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const [isImportMappingOpen, setIsImportMappingOpen] = useState(false);
  const [importOriginalFile, setImportOriginalFile] = useState(null);
  const [importFileData, setImportFileData] = useState([]);
  const [importFileSheets, setImportFileSheets] = useState([]);
  const [importProgress, setImportProgress] = useState(0);
  const [importResult, setImportResult] = useState(null);
  const [showImportResultDialog, setShowImportResultDialog] = useState(false);
  
  const [isLoadingContacts, setIsLoadingContacts] = useState(true);
  const [isForceSyncing, setIsForceSyncing] = useState(false);

  const contacts = useLiveQuery(
    () => user ? db.contacts.where({ category_id: categoryId, owner_user_id: user.id, deleted_at: 0 }).sortBy('name') : [],
    [categoryId, user?.id],
    []
  );

  const fetchContactsFromServer = useCallback(async (isFullFetch = false) => {
    if (!user || !categoryId) return;
    setIsLoadingContacts(true);
    setSearchTerm('');
    setSortOrder('asc');
    setSelectedContacts(new Set());
    
    if (syncService.isOnline()) {
        await syncService.pullFromSupabase('contacts', { category_id: categoryId, deleted_at: null }, isFullFetch);
    }
    
    setIsLoadingContacts(false);
  }, [user, categoryId]);

  const handleForceSync = async () => {
    if (isForceSyncing) return;
    if (!syncService.isOnline()) {
        toast({ title: "Offline", description: "Não é possível sincronizar. Verifique sua conexão.", variant: "destructive" });
        return;
    }

    setIsForceSyncing(true);
    toast({ title: "Sincronizando contatos..." });

    const { sentCount, receivedCount, error } = await syncService.forceSyncCategory('contacts', categoryId);

    if (error) {
        toast({ title: "Erro na Sincronização", description: error, variant: "destructive" });
    } else {
        toast({ title: "Sincronização Concluída", description: `Enviados: ${sentCount} | Recebidos: ${receivedCount}` });
    }
    setSearchTerm('');
    setSortOrder('asc');
    setSelectedContacts(new Set());
    setIsForceSyncing(false);
  };
  
  useEffect(() => {
    fetchContactsFromServer(true);
    const handleRefetch = (e) => {
        if(e.detail.table === 'contacts' && e.detail.categoryId === categoryId) {
            fetchContactsFromServer();
        }
    }
    document.addEventListener('requestRefetch', handleRefetch);
    return () => document.removeEventListener('requestRefetch', handleRefetch);
  }, [fetchContactsFromServer, categoryId]);


  const sortedAndFilteredContacts = React.useMemo(() => {
    if (!contacts) return [];
    const filtered = contacts
      .filter(c =>
        c.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.phone_e164?.includes(searchTerm)
      );

    if (sortOrder === 'desc') {
        return filtered.reverse();
    }
    return filtered;
  }, [contacts, searchTerm, sortOrder]);

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            setImportOriginalFile(file);
            const binaryStr = e.target.result;

            if (file.name.endsWith('.csv')) {
                const result = Papa.parse(binaryStr, { header: true, skipEmptyLines: true, delimiter: (d => d.includes(';') ? ';' : ',')(binaryStr.split('\n')[0]) });
                if(result.errors.length) console.warn("PapaParse errors:", result.errors);
                setImportFileData(result.data);
                setImportFileSheets(result.meta.fields);
            } else {
                const workbook = XLSX.read(binaryStr, { type: 'binary' });
                setImportFileSheets(workbook.SheetNames);
                setImportFileData([]);
            }
            setIsImportMappingOpen(true);
        } catch (error) {
            toast({ title: "Erro ao ler arquivo", description: error.message, variant: "destructive" });
        } finally {
            event.target.value = null;
        }
    };
    reader.readAsBinaryString(file);
  };
  
  const processImport = async (dataToImport, mapping) => {
    if (!user) {
        toast({ title: "Usuário não encontrado.", variant: "destructive" });
        return;
    }
    
    let createdCount = 0;
    let updatedCount = 0;
    let ignoredRows = [];
    setImportProgress(0);

    const contactsToSave = [];
    const existingContacts = await db.contacts.where({ category_id: categoryId, owner_user_id: user.id }).toArray();
    const existingPhones = new Map(existingContacts.map(c => [c.phone_e164, c]));

    for (const [index, row] of dataToImport.entries()) {
        const phoneValue = row[mapping.whatsapp_raw];
        const name = row[mapping.name];

        if (!phoneValue || !name) {
            ignoredRows.push({ rowNum: index + 1, reason: 'Nome ou Telefone faltando' });
            continue;
        }
        
        const { phone_e164, ddd, error } = normalizeBrazilianPhoneNumber(phoneValue);
        if (error) {
            ignoredRows.push({ rowNum: index + 1, reason: `Telefone inválido (${error})` });
            continue;
        }
        
        const existingContact = existingPhones.get(phone_e164);
        const contactData = {
            owner_user_id: user.id,
            category_id: categoryId,
            name,
            whatsapp_raw: phoneValue,
            phone_e164,
            ddd,
            country: 'BR',
            email: row[mapping.email]?.toLowerCase() || null,
            gender: (row[mapping.gender] || null)?.charAt(0).toUpperCase() || null,
            birthday: parseContactDate(row[mapping.birthday]) || null,
            origin: row[mapping.origin] || 'importação',
            description: row[mapping.description] || null,
            deleted_at: 0,
            updated_at: new Date().toISOString(),
        };

        if (existingContact) {
            contactsToSave.push({ ...existingContact, ...contactData });
            updatedCount++;
        } else {
            contactsToSave.push({ ...contactData, id: uuidv4(), created_at: new Date().toISOString() });
            createdCount++;
        }
    }

    if (contactsToSave.length > 0) {
        await db.contacts.bulkPut(contactsToSave);
    }

    setImportResult({ created: createdCount, updated: updatedCount, ignored: ignoredRows });
    setShowImportResultDialog(true);
    setImportProgress(0);
  };


  const handleExportFacebook = () => {
    if (!contacts || contacts.length === 0) {
      toast({ title: "Nenhum contato para exportar", variant: "destructive" });
      return;
    }
    const dataForExport = contacts.map(c => ({
      email: c.email || '',
      phone: c.phone_e164 || '',
      fn: c.name?.split(' ')[0] || '',
      ln: c.name?.split(' ').slice(1).join(' ') || '',
      gender: c.gender?.toLowerCase() === 'm' ? 'm' : c.gender?.toLowerCase() === 'f' ? 'f' : '',
      birthday: c.birthday || '',
      country: c.country || 'BR'
    }));
    const headers = ['email', 'phone', 'fn', 'ln', 'gender', 'birthday', 'country'];
    const csvString = generateCsv(headers, dataForExport);
    downloadCsv(csvString, `fb-ads-contatos-${categoryName.toLowerCase().replace(/\s/g, '_')}-${new Date().toISOString().slice(0, 10)}.csv`);
    toast({ title: "Exportação para Facebook Ads iniciada." });
  };
  
  const handleSaveContact = async (contactData) => {
    setIsSubmitting(true);
    
    if (!contactData.whatsapp_raw) {
        toast({ title: "WhatsApp é obrigatório", variant: "destructive" });
        setIsSubmitting(false);
        return;
    }
    
    const { phone_e164, ddd, error } = normalizeBrazilianPhoneNumber(contactData.whatsapp_raw);
    if(error) {
      toast({ title: "Número de WhatsApp inválido", description: error, variant: "destructive" });
      setIsSubmitting(false);
      return;
    }
    
    const isNew = !contactData.id;
    let payload;

    if (isNew) {
        payload = { ...contactData, phone_e164, ddd, category_id: categoryId, id: uuidv4(), owner_user_id: user.id };
    } else {
        payload = { ...contactData, phone_e164, ddd, category_id: categoryId, owner_user_id: user.id };
    }
    
    setIsFormOpen(false);
    setSelectedContact(null);

    try {
      await syncService.saveLocalThenSync('contacts', payload);
      toast({ title: `Contato ${isNew ? 'criado' : 'atualizado'}!` });
    } catch (e) {
      toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteContact = (contactId) => {
    syncService.softDelete('contacts', contactId);
    toast({ title: "Contato excluído", variant: "destructive" });
  };
  
  const handleBulkDelete = async () => {
    setShowDeleteConfirm(false);
    await syncService.softDeleteBatch('contacts', Array.from(selectedContacts));
    toast({ title: `${selectedContacts.size} contatos excluídos.`, variant: "destructive" });
    setSelectedContacts(new Set());
  };

  const handleSelectContact = (id) => {
    const newSelection = new Set(selectedContacts);
    if (newSelection.has(id)) {
      newSelection.delete(id);
    } else {
      newSelection.add(id);
    }
    setSelectedContacts(newSelection);
  };
  
  const handleSelectAll = () => {
    if (selectedContacts.size === sortedAndFilteredContacts.length) {
      setSelectedContacts(new Set());
    } else {
      setSelectedContacts(new Set(sortedAndFilteredContacts.map(c => c.id)));
    }
  };
  
  const openNewForm = () => {
      setSelectedContact({});
      setIsFormOpen(true);
  };
  
  const openEditForm = (contact) => {
      setSelectedContact(contact);
      setIsFormOpen(true);
  };

  const getWaLink = (phone) => `https://wa.me/${phone?.replace(/\D/g, '')}`;
  const getTelLink = (phone) => `tel:${phone?.replace(/\D/g, '')}`;

  return (
    <div className="space-y-6">
      <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".csv,.xls,.xlsx" className="hidden" />
      <ImportMappingDialog isOpen={isImportMappingOpen} onOpenChange={setIsImportMappingOpen} fileData={importFileData} fileSheets={importFileSheets} onConfirm={processImport} originalFile={importOriginalFile} />
      <ImportResultDialog 
          isOpen={showImportResultDialog} 
          onOpenChange={(open) => {
              setShowImportResultDialog(open);
              if (!open) {
                  handleForceSync();
              }
          }}
          result={importResult} 
      />
      
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
            <DialogHeader><DialogTitle>Confirmar Exclusão</DialogTitle></DialogHeader>
            <DialogDescription>Tem certeza que deseja excluir {selectedContacts.size} contato(s)? Esta ação pode ser desfeita reimportando os contatos.</DialogDescription>
            <DialogFooter>
                <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>Cancelar</Button>
                <Button variant="destructive" onClick={handleBulkDelete}>Excluir</Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>
      
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex-1 w-full">
          <h3 className="text-xl font-semibold text-gray-900">Gerenciador de Contatos</h3>
          <p className="text-gray-600">Importe, exporte e gerencie seus contatos.</p>
        </div>
        
        <AnimatePresence>
        {selectedContacts.size > 0 && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="flex items-center gap-2">
                <span className="text-sm font-medium">{selectedContacts.size} selecionado(s)</span>
                <Button variant="destructive" size="sm" onClick={() => setShowDeleteConfirm(true)}><Trash2 className="mr-2 h-4 w-4" /> Excluir</Button>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setSelectedContacts(new Set())}><X className="h-4 w-4" /></Button>
            </motion.div>
        )}
        </AnimatePresence>
        
        <div className="flex flex-wrap gap-2">
           <Button onClick={() => fileInputRef.current?.click()} disabled={importProgress > 0 || isLoadingContacts} variant="outline">
            {importProgress > 0 ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /><span>{importProgress}%</span></> : <><Upload className="mr-2 h-4 w-4" />Importar</>}
          </Button>
          <Button onClick={handleExportFacebook} variant="outline"><Download className="mr-2 h-4 w-4" />Exportar (FB)</Button>
          <Button onClick={openNewForm}><Plus className="mr-2 h-4 w-4" />Novo</Button>
        </div>
      </div>
      
      <ContactFormDialog isOpen={isFormOpen} onOpenChange={(open) => { if (!open) { setIsFormOpen(false); setSelectedContact(null); }}} contact={selectedContact} onSave={handleSaveContact} isSubmitting={isSubmitting} />

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div className="flex items-center mb-4 gap-2">
            <Checkbox id="select-all" onCheckedChange={handleSelectAll} checked={sortedAndFilteredContacts.length > 0 && selectedContacts.size === sortedAndFilteredContacts.length} />
            <label htmlFor="select-all" className="text-sm font-medium mr-4">Selecionar todos</label>
            <div className="relative flex-grow">
                <Search className="h-5 w-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <Input placeholder="Buscar por nome, e-mail ou telefone..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pl-10"/>
            </div>
            <Button variant="outline" size="icon" onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}>
                <ArrowUpDown className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={handleForceSync} disabled={isForceSyncing}>
                {isForceSyncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Sincronizar
            </Button>
        </div>
        <div className="space-y-3">
            {isLoadingContacts ? (
                 <div className="text-center py-12">
                    <Loader2 className="h-12 w-12 text-gray-300 mx-auto mb-4 animate-spin" />
                    <p className="text-gray-500">Sincronizando contatos...</p>
                </div>
            ) : (
                <AnimatePresence>
                    {sortedAndFilteredContacts?.length > 0 ? (
                    sortedAndFilteredContacts.map(contact => (
                        <motion.div key={contact.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={`flex items-center justify-between p-3 rounded-lg transition-colors ${selectedContacts.has(contact.id) ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                        <div className="flex items-center space-x-3 flex-1">
                            <Checkbox id={`cb-${contact.id}`} checked={selectedContacts.has(contact.id)} onCheckedChange={() => handleSelectContact(contact.id)} />
                            <div className="bg-blue-100 p-2 rounded-full"><User className="h-5 w-5 text-blue-600" /></div>
                            <div>
                            <p className="font-semibold text-gray-800">{contact.name}</p>
                            <p className="text-sm text-gray-600 flex items-center gap-2">
                                {contact.phone_e164}
                                <a href={getWaLink(contact.phone_e164)} target="_blank" rel="noopener noreferrer" className="text-green-500 hover:text-green-600">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M.052 24l1.688-6.164a11.91 11.91 0 0 1-1.68-5.87C.058 5.334 5.402 0 12.01 0A11.956 11.956 0 0 1 24 11.956c0 6.602-5.344 11.956-11.99 11.956a11.9 11.9 0 0 1-5.69-1.532L.052 24zm6.494-3.665a10.05 10.05 0 0 0 4.97-1.378l.35-.207 3.864 1.01-1.028-3.756.23-.368a10.062 10.062 0 0 0 1.624-5.266c0-5.54-4.502-10.043-10.042-10.043-5.54 0-10.043 4.502-10.043 10.043 0 3.205 1.503 6.04 3.93 7.844l.28.21 2.89 2.89-.756-2.78z" /></svg>
                                </a>
                                <a href={getTelLink(contact.phone_e164)} className="text-blue-500 hover:text-blue-600">
                                <Phone className="h-4 w-4" />
                                </a>
                            </p>
                            {contact.email && <p className="text-sm text-gray-500">{contact.email}</p>}
                            </div>
                        </div>
                        <div className="flex items-center space-x-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditForm(contact)}>
                            <Edit className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600 hover:text-red-700" onClick={() => handleDeleteContact(contact.id)}>
                            <Trash2 className="h-4 w-4" />
                            </Button>
                        </div>
                        </motion.div>
                    ))
                    ) : (
                    <motion.div layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-12">
                        <Users className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                        <h4 className="text-lg font-medium text-gray-800">Nenhum contato nesta categoria</h4>
                        <p className="text-gray-500">Comece adicionando ou importando seus contatos.</p>
                        {importResult && <Button variant="link" onClick={() => setShowImportResultDialog(true)}>Ver resumo da última importação</Button>}
                    </motion.div>
                    )}
                </AnimatePresence>
            )}
        </div>
        <div className="mt-4 pt-4 border-t text-sm text-gray-600">
            Total de contatos: {contacts?.length || 0}
        </div>
      </div>
    </div>
  );
};

const ContactFormDialog = ({ isOpen, onOpenChange, contact, onSave, isSubmitting }) => {
  const [formData, setFormData] = useState({});

  useEffect(() => {
    if (isOpen) {
        setFormData(contact || { name: '', email: '', whatsapp_raw: '', birthday: '', origin: '', description: '' });
    }
  }, [contact, isOpen]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };
  
  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{contact?.id ? 'Editar Contato' : 'Novo Contato'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input name="name" placeholder="Nome completo" value={formData.name || ''} onChange={handleChange} required />
          <Input name="whatsapp_raw" placeholder="WhatsApp (com DDD)" value={formData.whatsapp_raw || ''} onChange={handleChange} required />
          <Input name="email" type="email" placeholder="E-mail" value={formData.email || ''} onChange={handleChange} />
          <Input name="birthday" type="date" placeholder="Aniversário" value={formData.birthday || ''} onChange={handleChange} />
          <Input name="origin" placeholder="Origem (ex: Facebook, Indicação)" value={formData.origin || ''} onChange={handleChange} />
          <Textarea name="description" placeholder="Descrição / Observações" value={formData.description || ''} onChange={handleChange} />
          
          <div className="flex justify-end space-x-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>Cancelar</Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

const ImportResultDialog = ({ isOpen, onOpenChange, result }) => {
  if (!result) return null;
  const { created, updated, ignored } = result;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Resultado da Importação</DialogTitle></DialogHeader>
        <div className="grid grid-cols-3 gap-4 text-center my-4">
          <div className="p-4 bg-green-50 rounded-lg"><p className="text-2xl font-bold text-green-700">{created}</p><p className="text-sm text-green-600">Criados</p></div>
          <div className="p-4 bg-blue-50 rounded-lg"><p className="text-2xl font-bold text-blue-700">{updated}</p><p className="text-sm text-blue-600">Atualizados</p></div>
          <div className="p-4 bg-red-50 rounded-lg"><p className="text-2xl font-bold text-red-700">{ignored.length}</p><p className="text-sm text-red-600">Ignorados</p></div>
        </div>
        {ignored.length > 0 && (
          <div>
            <h4 className="font-semibold mb-2 flex items-center"><FileWarning className="h-4 w-4 mr-2 text-yellow-600"/>Linhas Ignoradas (primeiras 20)</h4>
            <div className="max-h-40 overflow-y-auto border rounded-md p-2 bg-gray-50 text-sm">
              <ul>
                {ignored.slice(0, 20).map((item, index) => (
                  <li key={index} className="py-1 border-b">
                    <span className="font-mono bg-gray-200 px-1 rounded">Linha {item.rowNum}</span>: {item.reason}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
        <div className="flex justify-end mt-4">
          <Button onClick={() => onOpenChange(false)}>Fechar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ContactsManager;