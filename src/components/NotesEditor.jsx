import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import ReactQuill, { Quill } from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import { Plus, FileText, Trash2, History, Copy, Loader2, RefreshCw, Save, XCircle } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { toast } from '@/components/ui/use-toast';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { db } from '@/lib/db';
import { syncService } from '@/lib/syncService';

const HIGHLIGHT_COLORS = ['#FFF59D', '#B9F6CA', '#F8BBD0', '#BBDEFB', '#E1BEE7'];
const BackgroundStyle = Quill.import('attributors/style/background');
Quill.register(BackgroundStyle, true);

const modules = {
  toolbar: {
    container: [
      [{ 'header': [1, 2, 3, false] }],
      ['bold', 'italic', 'underline'],
      [{ 'list': 'ordered'}, { 'list': 'bullet' }],
      ['blockquote', 'code-block'],
      [{ 'background': HIGHLIGHT_COLORS }, { 'background': [] }],
    ],
  },
};

const convertChecklistsToBullet = (htmlString) => {
  if (!htmlString) return '';
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, 'text/html');
    const listItems = doc.querySelectorAll('li[data-list]');
    if (listItems.length === 0) return htmlString;
    
    listItems.forEach(li => {
      li.removeAttribute('data-list');
    });
    return doc.body.innerHTML;
  } catch (error) {
    console.error("Error converting checklist items:", error);
    return htmlString;
  }
};

function NotesEditor({ categoryId }) {
  const [activeNoteId, setActiveNoteId] = useState(null);
  const [newNoteTitle, setNewNoteTitle] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { user } = useSupabaseAuth();
  const editorRef = useRef(null);
  const mainContentRef = useRef(null);
  
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [remoteUpdateAvailable, setRemoteUpdateAvailable] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [nextNoteId, setNextNoteId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  const notes = useLiveQuery(
    () => user ? db.notes.where({ category_id: categoryId, owner_user_id: user.id, deleted_at: 0 }).sortBy('updated_at') : [],
    [categoryId, user?.id],
    []
  );
  
  const lastNoteId = useLiveQuery(() => db.app_state.get(`lastNoteId_${categoryId}`), [categoryId]);
  const activeNote = useLiveQuery(() => activeNoteId ? db.notes.get(activeNoteId) : null, [activeNoteId]);

  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [saveStatus, setSaveStatus] = useState('Salvo');

  const hasUnsavedChangesRef = useRef(hasUnsavedChanges);
  hasUnsavedChangesRef.current = hasUnsavedChanges;

  const handleSave = useCallback(async () => {
    if (!activeNote || !user || !hasUnsavedChangesRef.current || isSaving) return;

    setIsSaving(true);
    setSaveStatus('Salvando...');

    const previousVersion = {
      content: activeNote.content_richtext,
      saved_at: activeNote.updated_at,
    };
    
    const updatedVersions = [...(activeNote.versions || []).slice(-9), previousVersion];

    try {
      await syncService.saveLocalThenSync('notes', {
        id: activeNote.id,
        title: noteTitle,
        content_richtext: noteContent,
        versions: updatedVersions,
      });
      
      setHasUnsavedChanges(false);
      setRemoteUpdateAvailable(false);
      setSaveStatus('Sincronizando...');
      toast({ title: "Nota salva!" });
      
      setTimeout(() => {
          const currentSyncStatus = syncService.getSyncStatus();
          if (currentSyncStatus === 'Sincronizado' || currentSyncStatus === 'Offline') {
            setSaveStatus('Salvo');
          }
      }, 3000);

    } catch (error) {
      console.error("Error saving note:", error);
      toast({ title: "Erro ao salvar", description: "Não foi possível salvar a nota.", variant: "destructive" });
      setSaveStatus('Erro');
    } finally {
      setIsSaving(false);
    }
  }, [user, activeNote, noteTitle, noteContent, isSaving, toast]);

  useEffect(() => {
    const event = new CustomEvent('noteDirtyState', { detail: { isDirty: hasUnsavedChanges }});
    document.dispatchEvent(event);
  }, [hasUnsavedChanges]);

  useEffect(() => {
    const event = new CustomEvent('noteSavingState', { detail: { isSaving }});
    document.dispatchEvent(event);
  }, [isSaving]);

  useEffect(() => {
    const saveRequestHandler = () => handleSave();
    document.addEventListener('requestNoteSave', saveRequestHandler);
    return () => document.removeEventListener('requestNoteSave', saveRequestHandler);
  }, [handleSave]);

  useEffect(() => {
    const handleSyncStatus = (e) => {
        const { status } = e.detail;
        if (status === 'Sincronizado' && saveStatus === 'Sincronizando...') {
            setSaveStatus('Salvo');
        }
    };
    document.addEventListener('syncStatusChange', handleSyncStatus);
    return () => document.removeEventListener('syncStatusChange', handleSyncStatus);
  }, [saveStatus]);

  useEffect(() => {
    const handleRemoteUpdate = (event) => {
      const { table, record } = event.detail;
      if (table === 'notes' && record.id === activeNoteId) {
        if (hasUnsavedChangesRef.current) {
          setRemoteUpdateAvailable(true);
        } else {
          setNoteTitle(record.title);
          setNoteContent(record.content_richtext || '');
          setSaveStatus('Salvo');
        }
      }
    };
    document.addEventListener('remoteUpdate', handleRemoteUpdate);
    return () => document.removeEventListener('remoteUpdate', handleRemoteUpdate);
  }, [activeNoteId]);
  
  useEffect(() => {
    const handleKeyDown = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 's') {
        event.preventDefault();
        if (hasUnsavedChanges) {
          handleSave();
        }
      }
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'h') {
        event.preventDefault();
        if (editorRef.current) {
          const quill = editorRef.current.getEditor();
          const range = quill.getSelection();
          if (range) {
            const format = quill.getFormat(range);
            if (format.background) {
              quill.format('background', false);
            } else {
              quill.format('background', HIGHLIGHT_COLORS[0]);
            }
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [hasUnsavedChanges, handleSave]);


  const handleReloadNote = async () => {
    const freshNote = await db.notes.get(activeNoteId);
    if (freshNote) {
      setNoteTitle(freshNote.title);
      setNoteContent(freshNote.content_richtext || '');
      setRemoteUpdateAvailable(false);
      setHasUnsavedChanges(false);
      setSaveStatus('Salvo');
      toast({ title: "Nota recarregada com a versão mais recente." });
    }
  };

  useEffect(() => {
    if (notes && notes.length > 0 && !activeNoteId) {
        const noteToSelect = lastNoteId?.value && notes.some(n => n.id === lastNoteId.value) 
          ? lastNoteId.value 
          : notes[notes.length - 1].id;
        setActiveNoteId(noteToSelect);
    }
  }, [notes, activeNoteId, categoryId, lastNoteId]);

  useEffect(() => {
    if (activeNote) {
      setNoteTitle(activeNote.title);
      const convertedContent = convertChecklistsToBullet(activeNote.content_richtext);
      setNoteContent(convertedContent || '');
      setHasUnsavedChanges(false);
      setSaveStatus('Salvo');
      setRemoteUpdateAvailable(false);
      setIsSaving(false);
      db.app_state.put({ key: `lastNoteId_${categoryId}`, value: activeNote.id });
    } else {
      setNoteTitle('');
      setNoteContent('');
      setHasUnsavedChanges(false);
    }
  }, [activeNote, categoryId]);

  const handleContentChange = (content) => {
    setNoteContent(content);
    if (!hasUnsavedChanges) setHasUnsavedChanges(true);
  };
  
  const handleTitleChange = (e) => {
    setNoteTitle(e.target.value);
    if (!hasUnsavedChanges) setHasUnsavedChanges(true);
  };
  
  const handleDiscard = () => {
    if (activeNote) {
      setNoteTitle(activeNote.title);
      setNoteContent(activeNote.content_richtext || '');
      setHasUnsavedChanges(false);
      toast({ title: 'Alterações descartadas' });
    }
  };

  const handleCreateNote = async () => {
    if (!newNoteTitle.trim() || !user || isSubmitting) return;

    setIsSubmitting(true);
    const note = {
      category_id: categoryId,
      title: newNoteTitle.trim(),
      content_richtext: '',
      versions: [],
    };

    const newRecord = await syncService.saveLocalThenSync('notes', note);
    
    const switchNote = (targetNoteId) => {
      setActiveNoteId(targetNoteId);
      setNewNoteTitle('');
      setIsDialogOpen(false);
      setIsSubmitting(false);
      toast({ title: "Nota criada" });
    }

    if(hasUnsavedChanges) {
        setNextNoteId(newRecord.id);
        setShowConfirmDialog(true);
    } else {
        switchNote(newRecord.id);
    }
  };

  const handleSwitchNote = (noteId) => {
    if (noteId === activeNoteId || isSaving) return;
    if (hasUnsavedChanges) {
      setNextNoteId(noteId);
      setShowConfirmDialog(true);
    } else {
      setActiveNoteId(noteId);
    }
  };

  const confirmAndSwitch = async (save) => {
    if (save && hasUnsavedChanges) {
      await handleSave();
    }
    setShowConfirmDialog(false);
    if(nextNoteId) {
        setActiveNoteId(nextNoteId);
        setNextNoteId(null);
    }
    setHasUnsavedChanges(false);
  };

  const handleDeleteNote = async (noteId) => {
    await syncService.softDelete('notes', noteId);

    if (activeNoteId === noteId) {
      const remainingNotes = notes?.filter(n => n.id !== noteId).sort((a,b) => new Date(b.updated_at) - new Date(a.updated_at)) || [];
      setActiveNoteId(remainingNotes.length > 0 ? remainingNotes[0].id : null);
    }
    toast({ title: "Nota excluída", variant: "destructive" });
  };
  
  const displayNotes = notes || [];
  
  const copyNoteContent = () => {
    const text = editorRef.current?.getEditor().getText() || '';
    navigator.clipboard.writeText(text);
    toast({ title: "Conteúdo da nota copiado!" });
  };

  const getSaveStatusChip = () => {
    if (remoteUpdateAvailable) {
      return (
        <span className="text-xs px-2 py-1 rounded bg-yellow-100 text-yellow-800 flex items-center cursor-pointer" onClick={handleReloadNote}>
          <RefreshCw className="h-3 w-3 mr-1" />
          Versão mais nova disponível
        </span>
      );
    }
    if (hasUnsavedChanges) {
      return <span className="text-xs px-2 py-1 rounded bg-yellow-100 text-yellow-800">Não salvo</span>;
    }
    if (isSaving) {
        return <span className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-800 animate-pulse">Salvando...</span>;
    }
    switch (saveStatus) {
      case 'Sincronizando...':
        return <span className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-800 animate-pulse">{saveStatus}</span>;
      case 'Erro':
        return <span className="text-xs px-2 py-1 rounded bg-red-100 text-red-800">Erro</span>;
      default:
        const lastUpdated = activeNote?.updated_at ? new Date(activeNote.updated_at).toLocaleString() : 'Salvo';
        return <span className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-800">{lastUpdated}</span>;
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 h-full">
        <div className="md:col-span-1 flex flex-col" ref={mainContentRef}>
        <div className="flex justify-between items-center mb-4">
          <h4 className="font-medium text-gray-900">Suas notas</h4>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="flex items-center space-x-2"><Plus className="h-4 w-4" /><span>Nova</span></Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Criar nova nota</DialogTitle></DialogHeader>
              <Input placeholder="Título da nota" value={newNoteTitle} onChange={(e) => setNewNoteTitle(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleCreateNote()} disabled={isSubmitting}/>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isSubmitting}>Cancelar</Button>
                <Button onClick={handleCreateNote} disabled={isSubmitting || !newNoteTitle.trim()}>
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Criar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
        
        <div className="flex-1 space-y-2 overflow-y-auto">
          {displayNotes.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <p className="text-sm text-gray-600">Crie sua primeira nota.</p>
            </div>
          ) : (
            displayNotes.sort((a,b) => new Date(b.updated_at) - new Date(a.updated_at)).map((note) => (
              <div key={note.id} className={`p-3 rounded-lg border cursor-pointer transition-colors ${activeNoteId === note.id ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-200 hover:bg-gray-50'}`} onClick={() => handleSwitchNote(note.id)}>
                <div className="flex items-center justify-between">
                  <h5 className="font-medium text-sm truncate">{note.title}</h5>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); handleDeleteNote(note.id); }}><Trash2 className="h-3 w-3 text-red-500" /></Button>
                </div>
                <p className="text-xs text-gray-500 mt-1">{new Date(note.updated_at || note.created_at).toLocaleDateString()}</p>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="md:col-span-3 bg-white rounded-lg border border-gray-200 flex flex-col relative note-editor-pane">
        {activeNote ? (
          <>
            <div className="flex-shrink-0 flex flex-col md:flex-row items-start md:items-center justify-between mb-4 gap-2 p-6 pb-0">
              <Input value={noteTitle} onChange={handleTitleChange} className="text-2xl font-bold border-none p-0 focus:ring-0 !shadow-none" placeholder="Título da nota" />
              <div className="flex items-center space-x-2 self-end md:self-center">
                <div className="flex-shrink-0">{getSaveStatusChip()}</div>
                <Button variant="ghost" size="icon" onClick={copyNoteContent}><Copy className="h-4 w-4" /></Button>
                 {activeNote.versions && activeNote.versions.length > 0 && (
                  <Dialog>
                    <DialogTrigger asChild><Button variant="ghost" size="icon"><History className="h-4 w-4" /></Button></DialogTrigger>
                    <DialogContent>
                      <DialogHeader><DialogTitle>Histórico de versões</DialogTitle></DialogHeader>
                      <div className="space-y-2 max-h-60 overflow-y-auto">
                        {activeNote.versions.slice().reverse().map((version, index) => (
                          <div key={index} className="p-3 border rounded-lg cursor-pointer hover:bg-gray-50" onClick={() => setNoteContent(version.content)}>
                            <p className="text-sm text-gray-600 mb-1">{new Date(version.saved_at).toLocaleString()}</p>
                            <p className="text-xs text-gray-500 truncate">{version.content?.replace(/<[^>]+>/g, '').substring(0, 100) || 'Vazio'}...</p>
                          </div>
                        ))}
                      </div>
                    </DialogContent>
                  </Dialog>
                )}
              </div>
            </div>
            <div className="flex-grow min-h-0 relative">
               <ReactQuill 
                ref={editorRef}
                theme="snow" 
                value={noteContent} 
                onChange={handleContentChange} 
                modules={modules}
                className="h-full"
              />
            </div>
            {hasUnsavedChanges && (
              <>
                <motion.div
                  className="note-actionbar md:flex"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <Button type="button" variant="ghost" onClick={handleDiscard} disabled={isSaving} className="flex items-center gap-2 text-red-600 hover:text-red-700">
                    <XCircle className="h-4 w-4" /> Descartar
                  </Button>
                  <Button type="button" onClick={handleSave} disabled={isSaving} className="flex items-center gap-2">
                    {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} 
                    {isSaving ? 'Salvando...' : 'Salvar Alterações'}
                  </Button>
                </motion.div>

                <motion.div
                  className="md:hidden"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                >
                  <Button 
                    size="icon" 
                    className="note-fab" 
                    onClick={handleSave} 
                    disabled={isSaving}
                    aria-label="Salvar"
                  >
                    {isSaving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
                  </Button>
                </motion.div>
              </>
            )}
          </>
        ) : (
          <div className="m-auto text-center p-6">
            <FileText className="h-16 w-16 text-gray-300 mx-auto mb-4" />
            <h4 className="text-lg font-medium text-gray-900 mb-2">Selecione ou crie uma nota</h4>
            <p className="text-gray-600">Escolha uma nota da lista para começar a editar.</p>
          </div>
        )}
      </div>

      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Você tem alterações não salvas!</DialogTitle>
            <DialogDescription>
              Deseja salvar suas alterações antes de trocar de nota?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => confirmAndSwitch(false)}>
              Descartar e Sair
            </Button>
            <Button onClick={() => confirmAndSwitch(true)}>
              Salvar e Sair
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default NotesEditor;