import { supabase } from './customSupabaseClient';
    import { db } from './db';
    import { toast } from '@/components/ui/use-toast';
    import { v4 as uuidv4 } from 'uuid';

    const FINANCE_TABLES = ['finance_categories', 'finance_transactions', 'finance_payables'];
    const NOTES_EXTRAS_TABLES = ['links', 'webhooks', 'webhook_logs', 'contacts'];
    const ALL_SYNC_TABLES = ['notes', 'categories', ...FINANCE_TABLES, ...NOTES_EXTRAS_TABLES];
    const TABLES_IN_ORDER = [
      'categories', 'finance_categories', 'notes', 'finance_transactions', 'finance_payables', 'links', 'webhooks', 'webhook_logs', 'contacts'
    ];

    const SEM_CATEGORIA_ID = '00000000-0000-0000-0000-000000000000';
    const SEM_CATEGORIA_NAME = 'Sem Categoria';

    class SyncService {
      constructor() {
        this.userId = null;
        this.isSyncing = false;
        this.isForceSyncing = false;
        this.realtimeChannel = null;
        this.online = navigator.onLine;
        this.syncStatus = 'Sincronizado';
        this.lastUpdatedCache = {};
        this.pullInterval = null;
        this.debounceTimers = {};
        this.refetchDebounceTimer = null;
        this.realtimeEventCounts = {};
      }

      setSyncStatus = (status, lastSyncTime = null) => {
        if (this.syncStatus !== status || lastSyncTime) {
            this.syncStatus = status;
            document.dispatchEvent(new CustomEvent('syncStatusChange', { detail: { status, lastSyncTime } }));
        }
      }

      getSyncStatus = () => this.syncStatus;
      
      getUserId = () => this.userId;

      async initialize(userId) {
        if (!supabase.realtime || !userId) return;
        if (this.userId === userId) return; 
        
        this.deinitialize();
        this.userId = userId;
        this.online = navigator.onLine;
        
        this.setSyncStatus(this.isOnline() ? 'Sincronizado' : 'Offline');

        window.addEventListener('online', this.handleOnline);
        window.addEventListener('offline', this.handleOffline);
        
        if (navigator.serviceWorker.controller) {
            navigator.serviceWorker.addEventListener('message', this.handleServiceWorkerMessage);
        }

        if (this.isOnline()) {
          await this.ensureSemCategoriaExists();
          await this.cleanupStuckQueueItems();
          await this.cleanupInvalidPayableLinks();
          
          await this.pullFromSupabase();
          await this.flushQueue();
          this.subscribeToChanges();
        }
        
        this.startPullInterval();
      }
      
      startPullInterval() {
        if (this.pullInterval) clearInterval(this.pullInterval);
        this.pullInterval = setInterval(() => {
            if (this.isOnline()) {
                this.pullFromSupabase();
            }
        }, 3000);
      }

      deinitialize() {
        this.userId = null;
        this.lastUpdatedCache = {};
        window.removeEventListener('online', this.handleOnline);
        window.removeEventListener('offline', this.handleOffline);
        Object.values(this.debounceTimers).forEach(clearTimeout);
        this.debounceTimers = {};
        if (this.refetchDebounceTimer) clearTimeout(this.refetchDebounceTimer);
        this.refetchDebounceTimer = null;
        this.realtimeEventCounts = {};
        this.isForceSyncing = false;

        if (navigator.serviceWorker.controller) {
            navigator.serviceWorker.removeEventListener('message', this.handleServiceWorkerMessage);
        }
        if (this.realtimeChannel) {
          supabase.removeChannel(this.realtimeChannel);
          this.realtimeChannel = null;
        }
        if(this.pullInterval) {
            clearInterval(this.pullInterval);
            this.pullInterval = null;
        }
      }
      
      isOnline = () => this.online;

      handleOnline = async () => {
        if (this.online) return;
        this.online = true;
        this.setSyncStatus('Atualizando');
        console.log("App is online, flushing queue.");
        document.dispatchEvent(new CustomEvent('onlineStatusChange', { detail: { isOnline: true } }));
        
        if (!this.realtimeChannel && this.userId) {
          this.subscribeToChanges();
        }
        await this.flushQueue();
        await this.pullFromSupabase();
        this.startPullInterval();
      }
      
      handleOffline = () => {
        if (!this.online) return;
        this.online = false;
        if(this.pullInterval) {
            clearInterval(this.pullInterval);
            this.pullInterval = null;
        }
        this.setSyncStatus('Offline');
        console.log("App is offline.");
        document.dispatchEvent(new CustomEvent('onlineStatusChange', { detail: { isOnline: false } }));
      }
      
      handleServiceWorkerMessage = (event) => {
        if (event.data && event.data.type === 'SYNC_REQUEST') {
          console.log('Received sync request from Service Worker');
          this.flushQueue();
        }
        if (event.data && event.data.type === 'NOTIFICATION_CHECK_REQUEST') {
            console.log('Received notification check request from Service Worker');
            document.dispatchEvent(new CustomEvent('checkPayableNotifications'));
        }
      }
      
      async saveLocalThenSync(table, data, debounceMs = 4000) {
        if (!this.userId) throw new Error("Usuário não autenticado para operação de sincronia.");

        const isUpdate = !!data.id;
        
        let record;
        if (isUpdate) {
            const existingRecord = await db[table].get(data.id);
            record = { ...existingRecord, ...data, updated_at: new Date().toISOString(), owner_user_id: this.userId };
        } else {
            record = {
                ...data,
                id: data.id || uuidv4(),
                owner_user_id: this.userId,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                deleted_at: 0,
            };
             if(table === 'finance_payables') {
                record.amount_remaining = data.amount_remaining !== undefined ? data.amount_remaining : data.amount;
            }
        }
        
        await db[table].put(record);

        const debounceKey = `${table}-${record.category_id || 'global'}`;
        if (this.debounceTimers[debounceKey]) {
            clearTimeout(this.debounceTimers[debounceKey]);
        }

        this.debounceTimers[debounceKey] = setTimeout(() => {
            this.flushQueue(table, record.category_id);
            delete this.debounceTimers[debounceKey];
        }, debounceMs);

        return record;
      }
      
      async makePartialPayment(payableId, paymentAmount) {
        if (!this.userId) throw new Error("Usuário não autenticado.");
        if (paymentAmount <= 0) throw new Error("O valor do pagamento deve ser positivo.");

        const payable = await db.finance_payables.get(payableId);
        if (!payable) throw new Error("Conta a pagar não encontrada.");

        const amountRemaining = payable.amount_remaining ?? payable.amount;
        if (paymentAmount > amountRemaining) {
            throw new Error("O valor do pagamento não pode ser maior que o saldo devedor.");
        }

        const now = new Date();
        const transactionDate = new Date(now.getTime() - (4 * 60 * 60 * 1000));
        const newAmountRemaining = parseFloat((amountRemaining - paymentAmount).toFixed(2));
        
        const transactionData = {
            id: uuidv4(),
            amount: paymentAmount,
            type: 'saida',
            description: `Pagamento${newAmountRemaining > 0 ? ' parcial' : ''}: ${payable.description}`,
            category_id: payable.category_id || SEM_CATEGORIA_ID,
            transaction_date: transactionDate.toISOString(),
            payable_id: payableId,
            owner_user_id: this.userId,
            created_at: now.toISOString(),
            updated_at: now.toISOString(),
            deleted_at: 0
        };

        const updatedPayableData = {
            id: payableId,
            amount_remaining: newAmountRemaining,
            status: newAmountRemaining > 0 ? 'parcial' : 'pago',
            paid_at: newAmountRemaining === 0 ? now.toISOString() : null,
            transaction_id: newAmountRemaining === 0 ? transactionData.id : null,
            updated_at: now.toISOString(),
        };

        await db.transaction('rw', 'finance_transactions', 'finance_payables', async () => {
          await db.finance_transactions.put(transactionData);
          await db.finance_payables.put({ ...payable, ...updatedPayableData });
        });

        this.triggerSync();
        return { savedTransaction: transactionData, updatedPayable: { ...payable, ...updatedPayableData } };
      }
      
      async softDelete(table, id) {
        if (!this.userId) throw new Error("Usuário não autenticado.");
        const now = new Date().toISOString();
        const existingRecord = await db[table].get(id);

        if (existingRecord) {
            const updatedRecord = { ...existingRecord, deleted_at: now, updated_at: now };
            await this.saveLocalThenSync(table, updatedRecord, 500);

             if (table === 'finance_transactions' && existingRecord.payable_id) {
                const payable = await db.finance_payables.get(existingRecord.payable_id);
                if (payable) {
                    const newAmountRemaining = (payable.amount_remaining || 0) + existingRecord.amount;
                    const newStatus = newAmountRemaining >= payable.amount ? 'pendente' : 'parcial';
                    await this.saveLocalThenSync('finance_payables', {
                        id: payable.id,
                        amount_remaining: newAmountRemaining,
                        status: newStatus,
                        paid_at: null,
                        transaction_id: null,
                    }, 500);
                }
            }
        }
      }

      async softDeleteBatch(table, ids) {
        if (!this.userId) throw new Error("Usuário não autenticado.");
        const now = new Date().toISOString();
        const recordsToUpdate = await db[table].bulkGet(ids);
      
        const updatedRecords = recordsToUpdate
          .filter(Boolean)
          .map(record => ({ ...record, deleted_at: now, updated_at: now }));
      
        if (updatedRecords.length > 0) {
          await db[table].bulkPut(updatedRecords);
          this.flushQueue(table);
        }
      }
      
      triggerSync = (debounceMs = 1000) => {
        const debounceKey = `global-flush`;
        if (this.debounceTimers[debounceKey]) {
            clearTimeout(this.debounceTimers[debounceKey]);
        }

        this.debounceTimers[debounceKey] = setTimeout(() => {
            if (this.isOnline()) {
                this.flushQueue();
            } else {
               if ('serviceWorker' in navigator && 'SyncManager' in window) {
                    navigator.serviceWorker.ready.then(sw => sw.sync.register('notascat-sync'));
                }
            }
            delete this.debounceTimers[debounceKey];
        }, debounceMs);
      }
      
      async flushQueue(specificTable = null, categoryId = null) {
        if (this.isSyncing || !this.isOnline() || !this.userId) return 0;
        this.isSyncing = true;
        this.setSyncStatus('Atualizando');

        let sentCount = 0;
        try {
          const tablesToProcess = specificTable ? [specificTable] : TABLES_IN_ORDER;
          
          for (const table of tablesToProcess) {
            let recordsToSync = await db[table].where('updated_at').above(await this.getLocalLastUpdated(table)).toArray();
            
            if (categoryId) {
              recordsToSync = recordsToSync.filter(r => r.category_id === categoryId);
            }

            if (recordsToSync.length > 0) {
              const sentInTable = await this.processUpserts(table, recordsToSync);
              sentCount += sentInTable;
            }
          }
        } finally {
          this.isSyncing = false;
          this.setSyncStatus('Sincronizado', new Date());
          document.dispatchEvent(new CustomEvent('flushComplete', { detail: { table: specificTable, categoryId } }));
        }
        return sentCount;
      }

      async processUpserts(table, records) {
        const CHUNK_SIZE = 1000;
        let successfulySentCount = 0;
        for (let i = 0; i < records.length; i += CHUNK_SIZE) {
            const chunk = records.slice(i, i + CHUNK_SIZE);
            const recordsForSupabase = chunk.map(r => {
                const recordCopy = { ...r };
                if (!recordCopy.owner_user_id) recordCopy.owner_user_id = this.userId;
                recordCopy.updated_at = null; // Let the trigger handle it
                if (recordCopy.deleted_at === 0) recordCopy.deleted_at = null;
                return recordCopy;
            });
            
            const onConflictKey = table === 'contacts' ? 'owner_user_id,category_id,phone_e164' : 'id';
            const { error } = await supabase.from(table).upsert(recordsForSupabase, { onConflict: onConflictKey });

            if (error) {
              if (error.code === '23503' || error.message.includes('foreign key constraint')) { 
                console.warn(`Violação de FK na tabela ${table}. A operação será tentada novamente mais tarde.`);
              } else if (error.message !== 'Failed to fetch') {
                console.error(`Erro ao sincronizar upserts para a tabela ${table}:`, error);
              }
              return successfulySentCount; 
            }
            successfulySentCount += chunk.length;
        }
        return successfulySentCount;
      }
      
      async pullFromSupabase(specificTable = null, filters = {}, isFullFetch = false) {
        if (!this.userId || !this.isOnline()) return { receivedCount: 0, error: null };
        this.setSyncStatus('Atualizando');

        const tablesToPull = specificTable ? [specificTable] : ALL_SYNC_TABLES;
        let totalReceived = 0;
        let lastError = null;

        for (const table of tablesToPull) {
           if (!db.table(table)) {
            console.warn(`Table ${table} does not exist in local DB. Skipping pull.`);
            continue;
          }
          const localLastUpdated = isFullFetch ? new Date(0).toISOString() : await this.getLocalLastUpdated(table);
          
          let query = supabase
            .from(table)
            .select('*')
            .eq('owner_user_id', this.userId);

          Object.keys(filters).forEach(key => {
            if (filters[key] === null) {
              query = query.is(key, null);
            } else {
              query = query.eq(key, filters[key]);
            }
          });
            
          if (localLastUpdated !== new Date(0).toISOString()) {
            query = query.gt('updated_at', localLastUpdated);
          }

          const { data, error } = await query;
          
          if (error) {
            lastError = error;
            if (error.message === 'Failed to fetch') {
              this.handleOffline();
            } else {
              console.error(`Erro ao puxar ${table}:`, error);
            }
            continue;
          }

          if (data && data.length > 0) {
            await this.mergeData(table, data, isFullFetch && table === specificTable);
            totalReceived += data.length;
          }
        }
        this.setSyncStatus('Sincronizado', new Date());
        return { receivedCount: totalReceived, error: lastError };
      }

      async forceSyncCategory(table, categoryId) {
        if (this.isForceSyncing || !this.isOnline()) {
          return { sentCount: 0, receivedCount: 0, error: !this.isOnline() ? 'Offline' : 'Sync in progress' };
        }
        this.isForceSyncing = true;
        this.setSyncStatus('Sincronizando...');
        try {
          const localItems = await db[table].where({ category_id: categoryId, owner_user_id: this.userId }).toArray();
          const sentCount = await this.processUpserts(table, localItems);

          const { receivedCount, error } = await this.pullFromSupabase(table, { category_id: categoryId, deleted_at: null }, true);
          if (error) throw error;
          
          document.dispatchEvent(new CustomEvent('requestRefetch', { detail: { table, categoryId } }));
          return { sentCount, receivedCount, error: null };
        } catch (error) {
          console.error("Force sync failed:", error);
          return { sentCount: 0, receivedCount: 0, error: error.message };
        } finally {
          this.isForceSyncing = false;
          this.setSyncStatus('Sincronizado', new Date());
        }
      }

      async getLocalLastUpdated(table) {
        try {
            if (this.lastUpdatedCache[table]) return this.lastUpdatedCache[table];

            const meta = await db.app_state.get(`lastUpdated_${table}`);
            if (meta && meta.value) {
                let dateValue = meta.value;
                if (typeof dateValue === 'number') {
                    dateValue = new Date(dateValue).toISOString();
                }
                if (!isNaN(new Date(dateValue).getTime())) {
                    this.lastUpdatedCache[table] = dateValue;
                    return dateValue;
                }
            }
            return new Date(0).toISOString();
        } catch (error) {
            console.error(`Falha ao obter o último 'updated_at' para a tabela ${table}:`, error);
            return new Date(0).toISOString();
        }
      }

      async mergeData(table, remoteRecords, isFullFetch = false) {
        let maxTimestamp = new Date(0).getTime();
        const localLastUpdatedTime = this.lastUpdatedCache[table] ? new Date(this.lastUpdatedCache[table]).getTime() : 0;
        
        if (!isFullFetch) {
            maxTimestamp = localLastUpdatedTime;
        }

        const recordsToPut = [];
        const idsToDelete = [];

        if (isFullFetch) {
            const categoryId = remoteRecords[0]?.category_id;
            if (categoryId) {
                await db[table].where({ category_id: categoryId, owner_user_id: this.userId }).delete();
                console.log(`Cache local para categoria ${categoryId} limpo antes da mesclagem completa.`);
            }
        }

        const remoteIds = remoteRecords.map(r => r.id);
        const localRecords = isFullFetch ? [] : await db[table].bulkGet(remoteIds);
        const localRecordMap = new Map(localRecords.filter(Boolean).map(lr => [lr.id, lr]));

        for (const remote of remoteRecords) {
            const local = localRecordMap.get(remote.id);
            const remoteTimestamp = new Date(remote.updated_at).getTime();

            if (remote.deleted_at && remote.deleted_at !== 0) {
                if(local) idsToDelete.push(remote.id);
            } else {
                remote.deleted_at = 0;
                if (!local || remoteTimestamp > new Date(local.updated_at).getTime()) {
                    recordsToPut.push(remote);
                }
            }

            if (remoteTimestamp > maxTimestamp) {
                maxTimestamp = remoteTimestamp;
            }
             document.dispatchEvent(new CustomEvent('remoteUpdate', { detail: { table, record: remote } }));
        }

        if (idsToDelete.length > 0) await db[table].bulkDelete(idsToDelete);
        if (recordsToPut.length > 0) await db[table].bulkPut(recordsToPut);
        
        if (maxTimestamp > localLastUpdatedTime) {
            const lastUpdatedISO = new Date(maxTimestamp).toISOString();
            await db.app_state.put({ key: `lastUpdated_${table}`, value: lastUpdatedISO });
            this.lastUpdatedCache[table] = lastUpdatedISO;
        }
      }

      subscribeToChanges() {
        if (this.realtimeChannel || !this.userId) return;

        this.realtimeChannel = supabase.channel('main-channel')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'notes', filter: `owner_user_id=eq.${this.userId}` }, (payload) => this.handleRealtimePayload(payload))
          .on('postgres_changes', { event: '*', schema: 'public', table: 'categories', filter: `owner_user_id=eq.${this.userId}` }, (payload) => this.handleRealtimePayload(payload))
          .on('postgres_changes', { event: '*', schema: 'public', table: 'finance_categories', filter: `owner_user_id=eq.${this.userId}` }, (payload) => this.handleRealtimePayload(payload))
          .on('postgres_changes', { event: '*', schema: 'public', table: 'finance_transactions', filter: `owner_user_id=eq.${this.userId}` }, (payload) => this.handleRealtimePayload(payload))
          .on('postgres_changes', { event: '*', schema: 'public', table: 'finance_payables', filter: `owner_user_id=eq.${this.userId}` }, (payload) => this.handleRealtimePayload(payload))
          .on('postgres_changes', { event: '*', schema: 'public', table: 'links', filter: `owner_user_id=eq.${this.userId}` }, (payload) => this.handleRealtimePayload(payload))
          .on('postgres_changes', { event: '*', schema: 'public', table: 'webhooks', filter: `owner_user_id=eq.${this.userId}` }, (payload) => this.handleRealtimePayload(payload))
          .on('postgres_changes', { event: '*', schema: 'public', table: 'webhook_logs', filter: `owner_user_id=eq.${this.userId}` }, (payload) => this.handleRealtimePayload(payload))
          .on('postgres_changes', { event: '*', schema: 'public', table: 'contacts', filter: `owner_user_id=eq.${this.userId}` }, (payload) => this.handleRealtimePayload(payload))
          .subscribe((status, err) => {
            if (status === 'SUBSCRIBED') {
              console.log('Inscrito em alterações em tempo real!');
            }
            if (err) {
              console.error('Erro na inscrição em tempo real:', err);
            }
          });
      }

      async handleRealtimePayload(payload) {
        const { table, new: newRecord, old: oldRecord, eventType } = payload;
        let record;
        let recordId;
        
        if (eventType === 'DELETE') {
            record = oldRecord;
            recordId = oldRecord.id;
        } else {
            record = newRecord;
            recordId = newRecord.id;
        }
        
        if (!recordId || (record.owner_user_id && record.owner_user_id !== this.userId)) {
          return; 
        }

        const localRecord = await db[table].get(recordId);

        if (localRecord && new Date(localRecord.updated_at) >= new Date(record.updated_at)) {
            return;
        }
        
        this.setSyncStatus('Atualizando');
        
        if (record.deleted_at === null) {
            record.deleted_at = 0;
        }

        if (eventType === 'DELETE' || (record.deleted_at && record.deleted_at !== 0)) {
            if(localRecord) await db[table].delete(recordId);
        } else {
            await db[table].put(record);
        }

        document.dispatchEvent(new CustomEvent('remoteUpdate', { detail: { table, record } }));

        if (!this.realtimeEventCounts[table]) {
            this.realtimeEventCounts[table] = 0;
            setTimeout(() => { this.realtimeEventCounts[table] = 0; }, 10000);
        }
        this.realtimeEventCounts[table]++;

        if (this.realtimeEventCounts[table] > 300) {
            if (this.refetchDebounceTimer) clearTimeout(this.refetchDebounceTimer);
            this.refetchDebounceTimer = setTimeout(() => {
                document.dispatchEvent(new CustomEvent('requestRefetch', { detail: { table, categoryId: record.category_id } }));
                this.setSyncStatus('Sincronizado', new Date());
                this.realtimeEventCounts[table] = 0;
            }, 1000);
        }
      }

      async ensureSemCategoriaExists() {
        if (!this.userId || !this.isOnline()) return;

        const semCategoriaData = {
          id: SEM_CATEGORIA_ID,
          name: SEM_CATEGORIA_NAME,
          owner_user_id: this.userId,
          created_at: new Date(0).toISOString(),
          updated_at: new Date(0).toISOString(),
          deleted_at: null,
        };

        await db.finance_categories.put({ ...semCategoriaData, deleted_at: 0 });

        if (this.isOnline()) {
          const { error } = await supabase
            .from('finance_categories')
            .upsert(semCategoriaData, { onConflict: 'id' });

          if (error) {
            if(error.message !== 'Failed to fetch') {
              console.error("Falha ao garantir 'Sem Categoria' no Supabase:", error);
            }
          }
        }
      }


      async cleanupStuckQueueItems() {
        if (!this.userId) return;
        const stuckItems = await db.sync_queue.toArray();
        if (stuckItems.length > 0) {
            await db.sync_queue.clear();
            console.log("Fila de sincronização antiga limpa. A nova sincronização é baseada em timestamps.");
        }
      }
      
      async cleanupInvalidPayableLinks() {
        if (!this.userId || !this.isOnline()) return;
        const payablesWithLinks = await db.finance_payables.where('owner_user_id').equals(this.userId).and(p => !!p.transaction_id).toArray();
        
        if (payablesWithLinks.length === 0) return;

        const transactionIds = payablesWithLinks.map(p => p.transaction_id).filter(Boolean);
        if(transactionIds.length === 0) return;
        
        const { data: existingTransactions, error } = await supabase
            .from('finance_transactions')
            .select('id')
            .in('id', transactionIds);

        if (error) {
            if (error.message !== 'Failed to fetch') {
                console.error("Erro ao verificar transações existentes:", error);
            }
            return;
        }

        const existingTxIds = new Set(existingTransactions.map(tx => tx.id));
        const payablesToClean = payablesWithLinks.filter(p => !existingTxIds.has(p.transaction_id));

        if (payablesToClean.length > 0) {
            for(const p of payablesToClean) {
                const updatedPayable = { ...p, transaction_id: null, status: 'pendente' };
                await db.finance_payables.put(updatedPayable);
                this.triggerSync();
            }
        }
      }
    }

    export const syncService = new SyncService();