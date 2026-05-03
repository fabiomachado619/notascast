import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, useMotionValue, AnimatePresence } from 'framer-motion';
import { Plus, Trash2, Edit, Palette, GitBranchPlus, Scan, ZoomIn, ZoomOut, Move, UnfoldVertical, FoldVertical, Info, Loader2 } from 'lucide-react';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import { HexColorPicker } from 'react-colorful';
import { useLiveQuery } from 'dexie-react-hooks';
import { useDebounce } from 'use-debounce';
import { v4 as uuidv4 } from 'uuid';
import * as d3 from 'd3-hierarchy';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useToast } from '@/components/ui/use-toast';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { db } from '@/lib/db';
import { syncService } from '@/lib/syncService';

const NODE_WIDTH = 120;
const NODE_HEIGHT = 60;

const MindMapNode = React.memo(({ node, onUpdate, onSelect, selectedNodeId, isPanning, onNodeDragEnd, onToggleCollapse, onOpenNote, dragConstraints }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [tempLabel, setTempLabel] = useState(node.label);

  const handleDoubleClick = (e) => {
    e.stopPropagation();
    setIsEditing(true);
  };

  const handleLabelChange = () => {
    if (tempLabel.trim() && tempLabel !== node.label) {
      onUpdate(node.id, { label: tempLabel.trim() });
    }
    setIsEditing(false);
  };

  return (
    <motion.div
      layoutId={node.id}
      drag
      dragMomentum={false}
      dragConstraints={dragConstraints}
      onDragEnd={(e, info) => onNodeDragEnd(node.id, info)}
      onClick={() => onSelect(node.id)}
      onDoubleClick={handleDoubleClick}
      className="absolute flex flex-col items-center justify-center p-2 rounded-lg shadow-md cursor-pointer text-white"
      style={{
        left: node.x,
        top: node.y,
        width: `${NODE_WIDTH}px`,
        minHeight: `${NODE_HEIGHT}px`,
        backgroundColor: node.color,
        border: `3px solid ${selectedNodeId === node.id ? '#F59E0B' : 'transparent'}`,
        pointerEvents: isPanning ? 'none' : 'auto',
      }}
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.5 }}
      whileHover={{ scale: 1.05 }}
    >
      <div className="absolute top-1 right-1 flex space-x-1">
        <button onClick={(e) => { e.stopPropagation(); onOpenNote(node.id); }} className="w-5 h-5 bg-black/20 rounded-full flex items-center justify-center text-white text-xs hover:bg-black/40"><Info size={12} /></button>
      </div>
      <div className="flex items-center justify-center grow mt-2">
        {isEditing ? (
          <Input autoFocus value={tempLabel} onChange={(e) => setTempLabel(e.target.value)} onBlur={handleLabelChange} onKeyPress={(e) => e.key === 'Enter' && handleLabelChange()} onClick={(e) => e.stopPropagation()} className="h-6 text-center bg-transparent border-gray-300 text-white" />
        ) : (
          <span className="font-semibold text-sm px-2 text-center break-words max-w-full">{node.label}</span>
        )}
      </div>
       {node.childrenCount > 0 && (
         <button onClick={(e) => { e.stopPropagation(); onToggleCollapse(node.id); }} className="absolute -bottom-3 w-5 h-5 bg-gray-600 rounded-full flex items-center justify-center text-white text-xs hover:bg-gray-700">
          {node.collapsed ? '+' : '-'}
        </button>
       )}
    </motion.div>
  );
});

const getTreeLayout = (nodes, edges, rootNodeId) => {
    if (!rootNodeId || !nodes || nodes.length === 0) return { layoutNodes: [], layoutEdges: [] };

    const nodeMap = new Map(nodes.map(n => ({...n, children: []})).map(n => [n.id, n]));
    edges.forEach(edge => {
        const parent = nodeMap.get(edge.source);
        const child = nodeMap.get(edge.target);
        if (parent && child) {
            parent.children.push(child);
        }
    });

    const root = nodeMap.get(rootNodeId);
    if (!root) return { layoutNodes: [], layoutEdges: [] };

    const hierarchy = d3.hierarchy(root, d => d.collapsed ? null : d.children);
    const treeLayout = d3.tree().nodeSize([NODE_HEIGHT + 60, NODE_WIDTH + 80]);
    const treeData = treeLayout(hierarchy);
    
    const layoutNodes = treeData.descendants().map(d => {
      const { x, y } = d;
      const originalNode = d.data;
      originalNode.childrenCount = d.children?.length || 0;
      return { ...originalNode, x: y, y: x }; // Swap x and y for a horizontal layout
    });

    const layoutEdges = treeData.links().map(l => ({
        id: `${l.source.data.id}-${l.target.data.id}`,
        source: l.source.data,
        target: l.target.data
    }));

    return { layoutNodes, layoutEdges };
};


const MindMap = ({ categoryId, categoryName }) => {
  const { user } = useSupabaseAuth();
  const { toast } = useToast();
  const canvasRef = useRef(null);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [isAutoLayout, setIsAutoLayout] = useState(true);

  const mapData = useLiveQuery(() => user ? db.maps.where({ category_id: categoryId }).filter(m => !m.deleted_at).first() : null, [categoryId, user?.id]);
  const allNodes = useLiveQuery(() => mapData?.id ? db.map_nodes.where({ map_id: mapData.id }).filter(n => !n.deleted_at).toArray() : [], [mapData?.id], []);
  const allEdges = useLiveQuery(() => mapData?.id ? db.map_edges.where({ map_id: mapData.id }).filter(e => !e.deleted_at).toArray() : [], [mapData?.id], []);
  
  const rootNode = useLiveQuery(async () => {
    if (!mapData?.id || !allEdges || !allNodes) return null;
    const targets = new Set(allEdges.map(e => e.target));
    return allNodes.find(n => !targets.has(n.id));
  }, [mapData?.id, allNodes, allEdges]);
  const rootNodeId = rootNode?.id;
  
  const [manualNodes, setManualNodes] = useState([]);
  
  useEffect(() => {
    if (allNodes) {
        setManualNodes(allNodes);
    }
  }, [allNodes]);


  const { layoutNodes: autoLayoutNodes, layoutEdges } = isAutoLayout ? getTreeLayout(allNodes, allEdges, rootNodeId) : { layoutNodes: manualNodes, layoutEdges: allEdges.map(e => ({id: e.id, source: manualNodes.find(n => n.id === e.source), target: manualNodes.find(n => n.id === e.target)})) };

  const finalNodes = isAutoLayout ? autoLayoutNodes : manualNodes;

  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [noteEditorNodeId, setNoteEditorNodeId] = useState(null);
  const [isPanning, setIsPanning] = useState(false);
  
  const scale = useMotionValue(1);
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  useEffect(() => {
    if (mapData?.view_state) {
      scale.set(mapData.view_state.scale || 1);
      x.set(mapData.view_state.x || 0);
      y.set(mapData.view_state.y || 0);
    }
  }, [mapData?.id]);
  
  const [debouncedViewState] = useDebounce({ scale: scale.get(), x: x.get(), y: y.get() }, 1000);

  useEffect(() => {
    const handleKeyDown = (e) => { if (e.code === 'Space') { e.preventDefault(); setIsSpacePressed(true); } };
    const handleKeyUp = (e) => { if (e.code === 'Space') { setIsSpacePressed(false); } };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => { window.removeEventListener('keydown', handleKeyDown); window.removeEventListener('keyup', handleKeyUp); };
  }, []);

  useEffect(() => {
    const initMap = async () => {
      if (user && categoryId && !mapData && categoryName && (!allNodes || allNodes.length === 0)) {
        const newMapId = uuidv4();
        await syncService.saveLocalThenSync('maps', { id: newMapId, category_id: categoryId, name: `Mapa de ${categoryName}`, view_state: {x: 0, y: 0, scale: 1} });
        const newRootNodeId = uuidv4();
        await syncService.saveLocalThenSync('map_nodes', {
          id: newRootNodeId, map_id: newMapId, label: categoryName || 'Central', color: '#3B82F6', x: 0, y: 0, note_richtext: '', collapsed: false
        });
        setSelectedNodeId(newRootNodeId);
      } else if (rootNodeId && !selectedNodeId) {
        setSelectedNodeId(rootNodeId);
      }
    };
    initMap();
  }, [user, mapData, categoryId, categoryName, rootNodeId, allNodes]);

  useEffect(() => {
    if (mapData?.id) {
      syncService.saveLocalThenSync('maps', { id: mapData.id, view_state: debouncedViewState });
    }
  }, [debouncedViewState, mapData?.id]);

  const handleUpdateNode = useCallback(async (id, updates) => {
    if (!mapData?.id) return;
    await syncService.saveLocalThenSync('map_nodes', { id, map_id: mapData.id, ...updates });
  }, [mapData?.id]);

  const handleToggleCollapse = useCallback(async (id) => {
    const node = allNodes.find(n => n.id === id);
    if (node) {
      handleUpdateNode(id, { collapsed: !node.collapsed });
    }
  }, [allNodes, handleUpdateNode]);

  const handleNodeDragEnd = useCallback(async (id, info) => {
    if (isAutoLayout) {
        setIsAutoLayout(false);
        toast({title: "Layout automático desativado.", description: "Arraste os nós livremente."});
    }

    const currentScale = scale.get();
    const newX = info.point.x;
    const newY = info.point.y;

    const nodeUpdate = { 
        x: newX,
        y: newY 
    };
    
    setManualNodes(prevNodes => prevNodes.map(n => n.id === id ? {...n, ...nodeUpdate} : n));
    
    await handleUpdateNode(id, nodeUpdate);

  }, [handleUpdateNode, scale, isAutoLayout, toast]);

  const handleAddChild = async () => {
    if (!selectedNodeId || !mapData?.id) return;
    const parentNode = finalNodes.find(n => n.id === selectedNodeId);
    if (!parentNode) return;

    const newNodeId = uuidv4();
    const newNode = {
      id: newNodeId, map_id: mapData.id, label: 'Novo Nó', color: parentNode.color,
      x: parentNode.x + 150, y: parentNode.y + Math.random() * 100 - 50, note_richtext: '', collapsed: false,
    };
    const newEdge = { id: uuidv4(), map_id: mapData.id, source: selectedNodeId, target: newNodeId };
    
    await syncService.saveLocalThenSync('map_nodes', newNode);
    await syncService.saveLocalThenSync('map_edges', newEdge);
    
    setSelectedNodeId(newNodeId);
    toast({ title: "Nó filho adicionado!" });
  };
  
  const handleDeleteNode = async () => {
    if (!selectedNodeId || selectedNodeId === rootNodeId || !mapData?.id) return;
    
    let nodesToDelete = new Set([selectedNodeId]);
    let edgesToDelete = new Set();
    const q = [selectedNodeId];
    
    while(q.length > 0) {
      const currentId = q.shift();
      const childrenEdges = allEdges.filter(e => e.source === currentId);
      childrenEdges.forEach(e => {
        edgesToDelete.add(e.id);
        nodesToDelete.add(e.target);
        q.push(e.target);
      });
    }
    const parentEdge = allEdges.find(e => e.target === selectedNodeId);
    if(parentEdge) edgesToDelete.add(parentEdge.id);
    
    for (const id of nodesToDelete) { await syncService.softDelete('map_nodes', id); }
    for (const id of edgesToDelete) { await syncService.softDelete('map_edges', id); }

    setSelectedNodeId(rootNodeId);
    toast({ title: "Nó e filhos removidos.", variant: "destructive" });
  };
  
  const setBranchColor = async (color) => {
    if (!selectedNodeId || !mapData?.id) return;
    const nodesToUpdate = [];
    const queue = [selectedNodeId];
    const visited = new Set([selectedNodeId]);
    
    while(queue.length > 0) {
        const currentId = queue.shift();
        nodesToUpdate.push({id: currentId, color});
        allEdges.forEach(edge => {
            if(edge.source === currentId && !visited.has(edge.target)) {
                visited.add(edge.target);
                queue.push(edge.target);
            }
        });
    }
    await syncService.saveLocalThenSync('map_nodes', nodesToUpdate);
    toast({ title: 'Cor do ramo alterada!' });
  };

  const centerOnNode = (nodeId) => {
    const node = finalNodes.find(n => n.id === nodeId);
    const canvas = canvasRef.current;
    if (!node || !canvas) return;
    
    x.set(-node.x * scale.get() + canvas.clientWidth / 2 - (NODE_WIDTH / 2) * scale.get());
    y.set(-node.y * scale.get() + canvas.clientHeight / 2 - (NODE_HEIGHT / 2) * scale.get());
  };
  
  const zoom = (factor, center) => {
    const newScale = Math.max(0.2, Math.min(3, scale.get() * factor));
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();

    const centerPoint = center || {x: rect.width / 2, y: rect.height / 2};
    const worldPoint = { x: (centerPoint.x - x.get()) / scale.get(), y: (centerPoint.y - y.get()) / scale.get() };
    
    x.set(centerPoint.x - worldPoint.x * newScale);
    y.set(centerPoint.y - worldPoint.y * newScale);
    scale.set(newScale);
  };
  
  const toggleCollapseAll = (collapse) => {
    const updates = allNodes.filter(n => n.id !== rootNodeId).map(n => ({ id: n.id, collapsed: collapse }));
    syncService.saveLocalThenSync('map_nodes', updates);
  }

  const noteEditorNode = allNodes?.find(n => n.id === noteEditorNodeId);

  const getBezierPath = (source, target) => {
    if (!source || !target) return '';
    const sx = source.x + NODE_WIDTH / 2;
    const sy = source.y + NODE_HEIGHT / 2;
    const tx = target.x + NODE_WIDTH / 2;
    const ty = target.y + NODE_HEIGHT / 2;
    const dx = tx - sx;
    const dy = ty - sy;
    return `M ${sx},${sy} C ${sx + dx * 0.5},${sy} ${sx + dx * 0.5},${ty} ${tx},${ty}`;
  };
  
  const effectiveIsPanning = isPanning || isSpacePressed;

  if (!user || !allNodes) {
    return <div className="flex justify-center items-center h-[70vh]"><Loader2 className="w-8 h-8 animate-spin" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-between items-center gap-2">
        <h3 className="text-xl font-semibold text-gray-900">Mapa Mental</h3>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={handleAddChild} disabled={!selectedNodeId}><GitBranchPlus className="h-4 w-4 mr-2" />Add Filho</Button>
          <Button size="sm" variant="destructive" onClick={handleDeleteNode} disabled={!selectedNodeId || selectedNodeId === rootNodeId}><Trash2 className="h-4 w-4 mr-2" />Deletar</Button>
          <Popover>
            <PopoverTrigger asChild><Button size="sm" variant="outline" disabled={!selectedNodeId}><Palette className="h-4 w-4 mr-2" />Cor</Button></PopoverTrigger>
            <PopoverContent className="w-auto p-0 border-none bg-transparent shadow-none">
              <HexColorPicker color={finalNodes.find(n => n.id === selectedNodeId)?.color || '#000'} onChange={(color) => handleUpdateNode(selectedNodeId, { color })} />
              <Button size="sm" className="w-full mt-2" onClick={() => setBranchColor(finalNodes.find(n => n.id === selectedNodeId).color)}>Aplicar ao Ramo</Button>
            </PopoverContent>
          </Popover>
          <Button size="sm" variant="outline" onClick={() => setIsPanning(p => !p)} className={effectiveIsPanning ? 'bg-blue-200' : ''}><Move className="h-4 w-4 mr-2" />{effectiveIsPanning ? 'Navegar' : 'Selecionar'}</Button>
           <Button size="sm" variant="outline" onClick={() => setIsAutoLayout(!isAutoLayout)}>{isAutoLayout ? 'Desativar Layout Auto' : 'Ativar Layout Auto'}</Button>
        </div>
      </div>

      <div className="relative w-full h-[70vh] bg-gray-50 rounded-lg border border-gray-200 overflow-hidden" ref={canvasRef}>
        <motion.div 
            className={`w-full h-full ${effectiveIsPanning ? 'cursor-grab active:cursor-grabbing' : ''}`} 
            style={{ x, y, scale, position: 'absolute', top: 0, left: 0 }} 
            drag={effectiveIsPanning} 
            dragConstraints={canvasRef} 
            onWheel={(e) => { e.preventDefault(); zoom(e.deltaY > 0 ? 0.9 : 1.1, {x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY}); }}
        >
          <svg className="absolute top-0 left-0 w-[10000px] h-[10000px] -translate-x-1/2 -translate-y-1/2" style={{ pointerEvents: 'none' }}>
            <g>
              <AnimatePresence>
                {layoutEdges.map(edge => (<motion.path key={edge.id} d={getBezierPath(edge.source, edge.target)} fill="none" stroke="#9CA3AF" strokeWidth="2" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} exit={{ pathLength: 0 }} />))}
              </AnimatePresence>
            </g>
          </svg>
          <AnimatePresence>
            {finalNodes?.map(node => (<MindMapNode key={node.id} node={node} onUpdate={handleUpdateNode} onSelect={setSelectedNodeId} selectedNodeId={selectedNodeId} isPanning={effectiveIsPanning} onNodeDragEnd={handleNodeDragEnd} onToggleCollapse={handleToggleCollapse} onOpenNote={setNoteEditorNodeId} dragConstraints={canvasRef} />))}
          </AnimatePresence>
        </motion.div>
        <div className="absolute top-2 right-2 flex flex-col space-y-2">
          <Button size="icon" variant="outline" onClick={() => zoom(1.2)}><ZoomIn className="h-4 w-4"/></Button>
          <Button size="icon" variant="outline" onClick={() => zoom(0.8)}><ZoomOut className="h-4 w-4"/></Button>
          <Button size="icon" variant="outline" onClick={() => { centerOnNode(rootNodeId); scale.set(1); }}><Scan className="h-4 w-4"/></Button>
          <Button size="icon" variant="outline" onClick={() => toggleCollapseAll(true)}><FoldVertical className="h-4 w-4"/></Button>
          <Button size="icon" variant="outline" onClick={() => toggleCollapseAll(false)}><UnfoldVertical className="h-4 w-4"/></Button>
        </div>
      </div>
      
      {noteEditorNode && (
        <Dialog open={!!noteEditorNodeId} onOpenChange={(open) => !open && setNoteEditorNodeId(null)}>
          <DialogContent className="sm:max-w-[625px]">
            <DialogHeader><DialogTitle>Editar Nota de "{noteEditorNode.label}"</DialogTitle></DialogHeader>
            <ReactQuill theme="snow" value={noteEditorNode.note_richtext || ''} onChange={(content) => handleUpdateNode(noteEditorNodeId, { note_richtext: content })} />
            <DialogFooter><DialogClose asChild><Button>Fechar</Button></DialogClose></DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default MindMap;