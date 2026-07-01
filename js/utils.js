// js/utils.js

export function showNotification(message, type = 'success', force = false) {
    const notif = document.createElement('div');
    notif.className = 'notification';
    notif.style.background = type === 'error' ? 'var(--accent-error)' : 'var(--accent-success)';
    notif.style.position = 'fixed';
    notif.style.top = '20px';
    notif.style.right = '20px';
    notif.style.padding = '12px 24px';
    notif.style.borderRadius = '12px';
    notif.style.color = 'white';
    notif.style.zIndex = '20000';
    notif.innerText = message;
    document.body.appendChild(notif);
    setTimeout(() => notif.remove(), 3000);
}

export function escapeHtml(text) {
    if (typeof text !== 'string') return text;
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

export function sanitizeHtml(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const allowedTags = ['B', 'I', 'UL', 'LI', 'BR', 'DIV', 'SPAN', 'P'];

    function clean(node) {
        for (let i = node.childNodes.length - 1; i >= 0; i--) {
            const child = node.childNodes[i];
            if (child.nodeType === 1) {
                if (!allowedTags.includes(child.tagName)) {
                    const text = document.createTextNode(child.textContent);
                    node.replaceChild(text, child);
                } else {
                    while (child.attributes.length > 0) {
                        child.removeAttribute(child.attributes[0].name);
                    }
                    clean(child);
                }
            } else if (child.nodeType !== 3) {
                node.removeChild(child);
            }
        }
    }

    clean(doc.body);
    return doc.body.innerHTML;
}

export function getDaysUntilDue(dateString) {
    if (!dateString) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dateString + 'T00:00:00');
    return Math.ceil((due - today) / (1000 * 60 * 60 * 24));
}

export function getDueDateClass(dateString) {
    const days = getDaysUntilDue(dateString);
    if (days < 0) return 'overdue';
    if (days === 0) return 'due-today';
    if (days <= 3) return 'due-soon';
    return '';
}

export function getDueDateText(dateString) {
    // Importação dinâmica de t() para evitar dependência circular
    const t = window._t || ((k) => k);
    const days = getDaysUntilDue(dateString);
    if (days === 0) return t('dueToday');
    if (days === 1) return t('dueTomorrow');
    if (days < 0) return t('overdueText', { days: Math.abs(days) });
    return t('dueInText', { days: days });
}

export function generateCalendarLink(reminder) {
    const title = encodeURIComponent(reminder.title);
    let details = '';
    if (reminder.description) {
        details += reminder.description.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ') + '\n\n';
    }
    if (reminder.links && reminder.links.length > 0) {
        details += reminder.links.join('\n') + '\n';
    }
    const encodedDetails = encodeURIComponent(details);
    let dates = '';
    if (reminder.dueDate) {
        const dateStr = reminder.dueDate.replace(/-/g, '');
        dates = `&dates=${dateStr}/${dateStr}`;
    }
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&details=${encodedDetails}${dates}`;
}
