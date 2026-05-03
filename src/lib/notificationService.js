import { db } from './db';
import { differenceInDays, startOfDay } from 'date-fns';

export async function requestNotificationPermission() {
    if (!('Notification' in window)) {
        alert('Este navegador não suporta notificações desktop');
        return 'denied';
    }

    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
        console.log('Permissão para notificações concedida.');
    } else {
        console.log('Permissão para notificações negada.');
    }
    return permission;
}

export async function registerPeriodicSync() {
    if ('serviceWorker' in navigator && 'PeriodicSyncManager' in window) {
        const registration = await navigator.serviceWorker.ready;
        try {
            await registration.periodicSync.register('notascat-notification-check', {
                minInterval: 4 * 60 * 60 * 1000, // 4 hours
            });
            console.log('Sincronização periódica para notificações registrada.');
        } catch (error) {
            console.error('Falha ao registrar sincronização periódica:', error);
        }
    } else {
        console.log('Sincronização periódica não suportada.');
        // Fallback to interval check if periodic sync is not available
        setInterval(() => {
            document.dispatchEvent(new CustomEvent('checkPayableNotifications'));
        }, 4 * 60 * 60 * 1000);
    }
}

export async function checkAndSendPayableNotifications() {
    console.log("Verificando contas a pagar para notificação...");
    const payables = await db.finance_payables
        .where('status').anyOf('pendente', 'atrasado')
        .and(p => !p.deleted_at)
        .toArray();

    const today = startOfDay(new Date());
    const notificationsToSend = [];

    for (const payable of payables) {
        const dueDate = startOfDay(new Date(payable.due_at));
        const daysDiff = differenceInDays(dueDate, today);

        const notificationKey = `notif_${payable.id}_${daysDiff}`;
        const alreadySent = await db.app_state.get(notificationKey);

        if (alreadySent) continue;

        let shouldNotify = false;
        let title = '';

        if (daysDiff < 0 && daysDiff % 1 === 0) { // Daily notification for overdue
            shouldNotify = true;
            title = `Conta atrasada: ${payable.description}`;
        } else if ([0, 1, 3, 7].includes(daysDiff)) {
            shouldNotify = true;
            title = `Vencimento próximo: ${payable.description}`;
        }

        if (shouldNotify) {
            notificationsToSend.push({
                title,
                body: `Vence ${daysDiff === 0 ? 'hoje' : `em ${daysDiff} dia(s)`}. Valor: R$ ${payable.amount.toFixed(2)}`,
                key: notificationKey,
            });
        }
    }

    if (notificationsToSend.length > 0) {
        const registration = await navigator.serviceWorker.ready;
        for (const notif of notificationsToSend) {
            registration.showNotification(notif.title, {
                body: notif.body,
                icon: '/icon-192.png',
                badge: '/icon-maskable.png',
                tag: notif.key, // Use a tag to prevent duplicate notifications
            });
            await db.app_state.put({ key: notif.key, value: true });
        }
    }
}