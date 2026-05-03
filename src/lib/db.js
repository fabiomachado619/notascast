import Dexie from 'dexie';

export const DB_NAME = 'notascat';
export const DB_VERSION = 307;

export const db = new Dexie(DB_NAME);

db.version(DB_VERSION).stores({
  categories: 'id, owner_user_id, name, color, order_index, updated_at, deleted_at, [owner_user_id+deleted_at]',
  notes: 'id, category_id, owner_user_id, updated_at, deleted_at, [owner_user_id+category_id+deleted_at]',
  links: 'id, category_id, owner_user_id, updated_at, deleted_at, [owner_user_id+category_id+deleted_at]',
  webhooks: 'id, category_id, owner_user_id, updated_at, deleted_at, [owner_user_id+category_id+deleted_at]',
  webhook_logs: 'id, webhook_id, owner_user_id, sent_at, updated_at, deleted_at, [owner_user_id+sent_at]',
  contacts: 'id, owner_user_id, category_id, name, email, phone_e164, updated_at, deleted_at, &[owner_user_id+category_id+phone_e164], [owner_user_id+category_id+deleted_at]',
  sync_queue: '++id, table, record_id, operation, priority, attempts, nextRunAt',
  app_state: 'key',
  finance_payables: 'id, owner_user_id, category_id, due_at, status, amount_remaining, updated_at, deleted_at, transaction_id, [owner_user_id+deleted_at]',
  finance_transactions: 'id, owner_user_id, category_id, transaction_date, type, updated_at, deleted_at, payable_id, [owner_user_id+deleted_at+transaction_date]',
  finance_categories: 'id, owner_user_id, name, updated_at, deleted_at, [owner_user_id+deleted_at], &[owner_user_id+name]',
});

export async function recoverAndOpenDb() {
  console.log("Iniciando processo de recuperação do banco de dados...");
  
  const backup = {};
  try {
    const syncQueue = await db.sync_queue.toArray();
    const appState = await db.app_state.toArray();
    backup.sync_queue = syncQueue;
    backup.app_state = appState;
    localStorage.setItem('notascat.syncBackup', JSON.stringify(backup));
    console.log("Backup da fila de sincronização e estado do app realizado com sucesso.");
  } catch (e) {
    console.error("Falha ao fazer backup dos dados antes de deletar DB:", e);
  }

  try {
    if (db.isOpen()) {
        db.close();
    }
    await Dexie.delete(DB_NAME);
    console.log("Banco de dados antigo deletado com sucesso.");

    db.version(DB_VERSION).stores({
      categories: 'id, owner_user_id, name, color, order_index, updated_at, deleted_at, [owner_user_id+deleted_at]',
      notes: 'id, category_id, owner_user_id, updated_at, deleted_at, [owner_user_id+category_id+deleted_at]',
      links: 'id, category_id, owner_user_id, updated_at, deleted_at, [owner_user_id+category_id+deleted_at]',
      webhooks: 'id, category_id, owner_user_id, updated_at, deleted_at, [owner_user_id+category_id+deleted_at]',
      webhook_logs: 'id, webhook_id, owner_user_id, sent_at, updated_at, deleted_at, [owner_user_id+sent_at]',
      contacts: 'id, owner_user_id, category_id, name, email, phone_e164, updated_at, deleted_at, &[owner_user_id+category_id+phone_e164], [owner_user_id+category_id+deleted_at]',
      sync_queue: '++id, table, record_id, operation, priority, attempts, nextRunAt',
      app_state: 'key',
      finance_payables: 'id, owner_user_id, category_id, due_at, status, amount_remaining, updated_at, deleted_at, transaction_id, [owner_user_id+deleted_at]',
      finance_transactions: 'id, owner_user_id, category_id, transaction_date, type, updated_at, deleted_at, payable_id, [owner_user_id+deleted_at+transaction_date]',
      finance_categories: 'id, owner_user_id, name, updated_at, deleted_at, [owner_user_id+deleted_at], &[owner_user_id+name]',
    });

    await db.open();
    console.log("Banco de dados recriado com a versão correta.");

    const restoredBackup = JSON.parse(localStorage.getItem('notascat.syncBackup'));
    if (restoredBackup) {
      if (restoredBackup.sync_queue && restoredBackup.sync_queue.length > 0) {
        await db.sync_queue.bulkAdd(restoredBackup.sync_queue);
      }
      if (restoredBackup.app_state && restoredBackup.app_state.length > 0) {
        await db.app_state.bulkPut(restoredBackup.app_state);
      }
      console.log("Backup restaurado para o novo banco de dados.");
      localStorage.removeItem('notascat.syncBackup');
    }
  } catch (error) {
    console.error("Falha catastrófica na recuperação do DB:", error);
    await Dexie.delete(DB_NAME);
  }
}