// js/modules/contacts.js
// Módulo responsável pelo gerenciamento de contatos (CRUD, persistência, busca e compartilhamento).

import { state, CONTACTS_KEY, CONTACT_TAGS_KEY, CONTACTS_LAYOUT_KEY } from '../state.js';
import { getStorageData, setStorageData } from '../storage.js';
import { showNotification, escapeHtml } from '../utils.js';
import { t } from '../i18n.js';

// DOM Element helper
const el = (id) => document.getElementById(id);

let currentContactEditId = null;

// ─── Storage ──────────────────────────────────────────────────────────────────
export async function loadContacts() {
    try {
        state.contacts = await getStorageData(CONTACTS_KEY, []);
        if (!Array.isArray(state.contacts)) state.contacts = [];
        state.contacts = state.contacts.filter(c => c !== null && typeof c === 'object');
    } catch (e) {
        state.contacts = [];
    }

    try {
        state.contactCustomTags = await getStorageData(CONTACT_TAGS_KEY, []);
        if (!Array.isArray(state.contactCustomTags)) state.contactCustomTags = [];
    } catch (e) {
        state.contactCustomTags = [];
    }

    try {
        state.contactsLayout = await getStorageData(CONTACTS_LAYOUT_KEY, 'grid');
        if (state.contactsLayout !== 'grid' && state.contactsLayout !== 'folders') {
            state.contactsLayout = 'grid';
        }
    } catch (e) {
        state.contactsLayout = 'grid';
    }
}

export async function saveContacts() {
    await setStorageData(CONTACTS_KEY, state.contacts);
    updateContactsStats();
}

export async function saveContactCustomTags() {
    await setStorageData(CONTACT_TAGS_KEY, state.contactCustomTags);
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────
export function openContactFormModal(id = null) {
    const modal = el('contactFormModal');
    const title = el('contactFormModalTitle');
    
    const nameInput = el('contactNameInput');
    const phoneInput = el('contactPhoneInput');
    const emailInput = el('contactEmailInput');
    const companyInput = el('contactCompanyInput');
    const notesInput = el('contactNotesInput');

    // Reset inputs
    if (nameInput) nameInput.value = '';
    if (phoneInput) {
        phoneInput.value = '';
        phoneInput.placeholder = t('contactPhonePlaceholder') || '(xx) xxxxx-xxxx';
    }
    if (emailInput) emailInput.value = '';
    if (companyInput) companyInput.value = '';
    if (notesInput) notesInput.value = '';

    if (id) {
        // Edit Mode
        currentContactEditId = id;
        const contact = state.contacts.find(c => c.id === id);
        if (contact) {
            if (title) title.innerText = t('editContact') || 'Editar Contato';
            if (nameInput) nameInput.value = contact.name || '';
            if (phoneInput) {
                phoneInput.value = contact.phone || '';
                phoneInput.placeholder = t('contactPhonePlaceholder') || '(xx) xxxxx-xxxx';
            }
            if (emailInput) emailInput.value = contact.email || '';
            if (companyInput) companyInput.value = contact.company || '';
            if (notesInput) notesInput.value = contact.notes || '';
            state.selectedContactTags = Array.isArray(contact.tags) ? [...contact.tags] : [];
        }
    } else {
        // Create Mode
        currentContactEditId = null;
        if (title) title.innerText = t('newContact') || 'Novo Contato';
        state.selectedContactTags = [];
    }

    renderSelectedContactTagsDisplay();

    if (modal) modal.classList.add('active');
}

export function closeContactFormModal() {
    const modal = el('contactFormModal');
    if (modal) modal.classList.remove('active');
    currentContactEditId = null;
}

export async function saveContact() {
    const nameInput = el('contactNameInput');
    const phoneInput = el('contactPhoneInput');
    const emailInput = el('contactEmailInput');
    const companyInput = el('contactCompanyInput');
    const notesInput = el('contactNotesInput');

    const name = nameInput ? nameInput.value.trim() : '';
    if (!name) {
        showNotification(t('contactNameRequired') || 'Nome é obrigatório!', 'error');
        return;
    }

    const phone = phoneInput ? phoneInput.value.trim() : '';
    const email = emailInput ? emailInput.value.trim() : '';
    const company = companyInput ? companyInput.value.trim() : '';
    const notes = notesInput ? notesInput.value.trim() : '';

    if (currentContactEditId) {
        // Edit existing
        const contact = state.contacts.find(c => c.id === currentContactEditId);
        if (contact) {
            contact.name = name;
            contact.phone = phone;
            contact.email = email;
            contact.company = company;
            contact.notes = notes;
            contact.tags = [...state.selectedContactTags];
            showNotification(t('contactSaved') || 'Contato salvo com sucesso!');
        }
    } else {
        // Add new
        const contact = {
            id: Date.now(),
            name,
            phone,
            email,
            company,
            notes,
            tags: [...state.selectedContactTags],
            createdAt: new Date().toISOString()
        };
        state.contacts.unshift(contact);
        showNotification(t('contactSaved') || 'Contato salvo com sucesso!');
    }

    await saveContacts();
    closeContactFormModal();
    renderContacts();
}

export async function deleteContact(id) {
    if (!confirm(t('confirmDeleteContact') || 'Deseja excluir este contato?')) return;

    state.contacts = state.contacts.filter(c => c.id !== id);
    await saveContacts();
    closeViewContactModal();
    renderContacts();
    showNotification(t('contactRemoved') || 'Contato removido!');
}

// ─── Modal de Visualização ────────────────────────────────────────────────────
export function openViewContactModal(id) {
    const contact = state.contacts.find(c => c.id === id);
    if (!contact) return;

    const modal = el('viewContactModal');
    if (modal) modal.dataset.id = id;

    const viewName = el('viewContactName');
    const viewPhone = el('viewContactPhone');
    const viewEmail = el('viewContactEmail');
    const viewCompany = el('viewContactCompany');
    const viewNotes = el('viewContactNotes');
    const viewTags = el('viewContactTags');

    const phoneGroup = el('viewContactPhoneGroup');
    const emailGroup = el('viewContactEmailGroup');
    const companyGroup = el('viewContactCompanyGroup');
    const notesGroup = el('viewContactNotesGroup');
    const tagsGroup = el('viewContactTagsGroup');

    if (viewName) viewName.innerText = contact.name;
    
    if (viewPhone) {
        if (contact.phone) {
            viewPhone.innerText = contact.phone;
            if (phoneGroup) phoneGroup.style.display = 'block';
        } else {
            if (phoneGroup) phoneGroup.style.display = 'none';
        }
    }

    if (viewEmail) {
        if (contact.email) {
            viewEmail.innerText = contact.email;
            if (emailGroup) emailGroup.style.display = 'block';
        } else {
            if (emailGroup) emailGroup.style.display = 'none';
        }
    }

    if (viewCompany) {
        if (contact.company) {
            viewCompany.innerText = contact.company;
            if (companyGroup) companyGroup.style.display = 'block';
        } else {
            if (companyGroup) companyGroup.style.display = 'none';
        }
    }

    if (viewNotes) {
        if (contact.notes) {
            viewNotes.innerText = contact.notes;
            if (notesGroup) notesGroup.style.display = 'block';
        } else {
            if (notesGroup) notesGroup.style.display = 'none';
        }
    }

    if (viewTags) {
        const hasTags = contact.tags && contact.tags.length > 0;
        if (tagsGroup) tagsGroup.style.display = hasTags ? 'block' : 'none';
        if (hasTags) {
            viewTags.innerHTML = contact.tags.map(tag => `
                <span class="glass-btn" style="font-size: 12px; padding: 6px 14px; border-color: var(--primary); pointer-events: none;">${escapeHtml(tag)}</span>
            `).join('');
        } else {
            viewTags.innerHTML = '';
        }
    }

    // Configura botões de ação do modal
    const btnEdit = el('btnEditContact');
    if (btnEdit) btnEdit.onclick = () => { closeViewContactModal(); openContactFormModal(contact.id); };

    const btnDelete = el('btnDeleteContact');
    if (btnDelete) btnDelete.onclick = () => deleteContact(contact.id);

    const btnShare = el('btnShareContactWhatsApp');
    if (btnShare) btnShare.onclick = () => shareContactViaWhatsApp(contact.id);

    const btnCopy = el('btnCopyContactData');
    if (btnCopy) btnCopy.onclick = () => copyContactData(contact.id);

    if (modal) modal.classList.add('active');
}

export function closeViewContactModal() {
    const modal = el('viewContactModal');
    if (modal) modal.classList.remove('active');
}

// ─── Compartilhamento e Cópia ─────────────────────────────────────────────────
export function getFormattedContactText(contact) {
    let text = `*${contact.name.toUpperCase()}*\n`;
    text += `---------------------------------\n\n`;
    if (contact.company) text += `*${t('contactCompany') || 'Empresa/Cargo'}:* ${contact.company}\n`;
    if (contact.phone) text += `*${t('contactPhone') || 'Telefone'}:* ${contact.phone}\n`;
    if (contact.email) text += `*${t('contactEmail') || 'E-mail'}:* ${contact.email}\n`;
    if (contact.notes) text += `\n*${t('contactNotes') || 'Notas'}:*\n${contact.notes}\n`;
    text += `\n---------------------------------\n`;
    text += `_${t('sentVia')}_`;
    return text;
}

export function shareContactViaWhatsApp(id) {
    const contact = state.contacts.find(c => c.id === id);
    if (!contact) return;

    const text = getFormattedContactText(contact);
    const textWithoutEmojis = text.replace(/([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])/g, '');
    window.open(`https://wa.me/?text=${encodeURIComponent(textWithoutEmojis)}`, '_blank');
}

export function copyContactData(id) {
    const contact = state.contacts.find(c => c.id === id);
    if (!contact) return;

    const text = getFormattedContactText(contact);
    // Remove as marcações de negrito do markdown do WhatsApp para a área de transferência comum
    const cleanText = text.replace(/\*/g, '');
    navigator.clipboard.writeText(cleanText).then(() => {
        showNotification(t('contactCopied') || 'Dados do contato copiados!', 'success');
    }).catch(err => {
        console.error('Error copying contact data:', err);
    });
}

// ─── Renderização ─────────────────────────────────────────────────────────────
export function renderSingleContactCard(contact) {
    return `
        <div class="reminder-card-premium" data-action="view-contact" data-id="${contact.id}" style="padding: 16px; min-height: 150px; display: flex; flex-direction: column; cursor: pointer;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                <h3 style="font-size: 15px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-main);">${escapeHtml(contact.name)}</h3>
                <div style="display: flex; gap: 8px; align-items: center;" data-action="stop-prop">
                    <button class="contact-card-edit-btn" style="background:none; border:none; cursor:pointer; color: var(--text-dim); padding: 0;" data-action="edit-contact-btn" data-id="${contact.id}">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                    </button>
                </div>
            </div>
            
            <div style="flex-grow: 1; display: flex; flex-direction: column; gap: 6px;">
                ${contact.company ? `<div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--primary); letter-spacing: 0.5px;">${escapeHtml(contact.company)}</div>` : ''}
                ${contact.phone ? `<div style="font-size: 13px; color: var(--text-dim); display: flex; align-items: center; gap: 6px;">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                    <span>${escapeHtml(contact.phone)}</span>
                </div>` : ''}
                ${contact.email ? `<div style="font-size: 13px; color: var(--text-dim); display: flex; align-items: center; gap: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                    <span>${escapeHtml(contact.email)}</span>
                </div>` : ''}
                ${contact.notes ? `<div style="font-size: 12px; color: var(--text-dim); opacity: 0.7; margin-top: 4px; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; word-break: break-all;">
                    ${escapeHtml(contact.notes)}
                </div>` : ''}
            </div>
            <div style="display: flex; align-items: center; justify-content: space-between; margin-top: auto; padding-top: 12px;" data-action="stop-prop">
                <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                    ${contact.tags && contact.tags.length > 0 ? contact.tags.map(tag => `
                        <span style="background: var(--primary); color: white; padding: 4px 12px; border-radius: 8px; font-size: 11px; font-weight: 600;">${escapeHtml(tag)}</span>
                    `).join('') : ''}
                </div>
                <button title="${t('shareContact')}" data-action="share-contact-btn" data-id="${contact.id}" style="background: none; border: none; padding: 0; color: #25D366; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: transform 0.2s ease;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.746.953 3.71 1.458 5.704 1.459h.005c6.56 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                    </svg>
                </button>
            </div>
        </div>
    `;
}

export async function setContactsLayout(layout) {
    if (layout !== 'grid' && layout !== 'folders') return;
    
    state.contactsLayout = layout;
    state.selectedContactFolder = null; // Limpa pasta ativa ao mudar de layout
    await setStorageData(CONTACTS_LAYOUT_KEY, layout);
    
    // Atualiza botões ativos na UI
    const btnGrid = el('btnContactsViewGrid');
    const btnFolders = el('btnContactsViewFolders');
    if (btnGrid) btnGrid.classList.toggle('active', layout === 'grid');
    if (btnFolders) btnFolders.classList.toggle('active', layout === 'folders');
    
    // Oculta/Exibe o filtro de tags do grid clássico dependendo do layout
    const filterContainer = el('contacts-tag-filter');
    if (filterContainer) {
        filterContainer.style.display = layout === 'grid' ? 'flex' : 'none';
    }
    
    renderContacts();
}

export function openContactFolder(tag) {
    state.selectedContactFolder = tag;
    renderContacts();
}

export function goBackContactsFolders() {
    state.selectedContactFolder = null;
    renderContacts();
}

export function renderContacts() {
    const grid = el('contactsGrid');
    if (!grid) return;

    // Sincroniza estado visual dos botões no carregamento/render
    const btnGrid = el('btnContactsViewGrid');
    const btnFolders = el('btnContactsViewFolders');
    if (btnGrid) btnGrid.classList.toggle('active', state.contactsLayout === 'grid');
    if (btnFolders) btnFolders.classList.toggle('active', state.contactsLayout === 'folders');
    
    const filterContainer = el('contacts-tag-filter');
    if (filterContainer) {
        filterContainer.style.display = state.contactsLayout === 'grid' ? 'flex' : 'none';
    }

    if (state.contacts.length === 0) {
        grid.innerHTML = `<p style="color: var(--text-dim); text-align: center; width: 100%; grid-column: 1/-1;">${t('noContacts') || 'Nenhum contato cadastrado.'}</p>`;
        renderContactsTagFilter();
        updateContactsStats();
        return;
    }

    let filtered = state.contacts;

    if (state.contactsLayout === 'grid') {
        if (state.contactsTagFilter && state.contactsTagFilter !== 'all') {
            filtered = filtered.filter(c => c.tags && c.tags.includes(state.contactsTagFilter));
        }
        
        if (state.searchQuery) {
            filtered = filtered.filter(c =>
                c.name.toLowerCase().includes(state.searchQuery) ||
                (c.company && c.company.toLowerCase().includes(state.searchQuery)) ||
                (c.phone && c.phone.toLowerCase().includes(state.searchQuery)) ||
                (c.email && c.email.toLowerCase().includes(state.searchQuery)) ||
                (c.notes && c.notes.toLowerCase().includes(state.searchQuery)) ||
                (c.tags && c.tags.some(tag => tag.toLowerCase().includes(state.searchQuery)))
            );
        }

        if (filtered.length === 0) {
            grid.innerHTML = `<p style="color: var(--text-dim); text-align: center; width: 100%; grid-column: 1/-1;">${t('noContacts') || 'Nenhum contato cadastrado.'}</p>`;
            renderContactsTagFilter();
            updateContactsStats();
            return;
        }

        grid.innerHTML = filtered.map(contact => renderSingleContactCard(contact)).join('');
        renderContactsTagFilter();
    } else {
        // Modo 'folders' (Navegação Real por Pastas de Tags)
        
        let searchFiltered = state.contacts;
        if (state.searchQuery) {
            searchFiltered = searchFiltered.filter(c =>
                c.name.toLowerCase().includes(state.searchQuery) ||
                (c.company && c.company.toLowerCase().includes(state.searchQuery)) ||
                (c.phone && c.phone.toLowerCase().includes(state.searchQuery)) ||
                (c.email && c.email.toLowerCase().includes(state.searchQuery)) ||
                (c.notes && c.notes.toLowerCase().includes(state.searchQuery)) ||
                (c.tags && c.tags.some(tag => tag.toLowerCase().includes(state.searchQuery)))
            );
        }

        if (state.selectedContactFolder === null) {
            // ESTADO 1: Raiz das Pastas (Lista de Pastas)
            const allTags = new Set();
            state.contacts.forEach(c => {
                if (c && c.tags) c.tags.forEach(tag => allTags.add(tag));
            });
            const sortedTags = Array.from(allTags).sort();

            let htmlContent = '';

            sortedTags.forEach(tag => {
                const contactsInFolder = searchFiltered.filter(c => c.tags && c.tags.includes(tag));
                
                if (contactsInFolder.length > 0) {
                    htmlContent += `
                        <div class="reminder-card-premium" data-action="open-contact-folder" data-folder="${escapeHtml(tag)}" style="padding: 24px; min-height: 120px; display: flex; align-items: center; gap: 16px; cursor: pointer; transition: transform 0.2s ease, border-color 0.2s ease;">
                            <div style="background: rgba(255, 193, 7, 0.1); color: #FFC107; width: 48px; height: 48px; border-radius: 12px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                                </svg>
                            </div>
                            <div style="flex-grow: 1; min-width: 0;">
                                <h3 style="font-size: 15px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(tag)}</h3>
                                <p style="font-size: 12px; color: var(--text-dim); margin-top: 4px;">${contactsInFolder.length} ${contactsInFolder.length === 1 ? 'contato' : 'contatos'}</p>
                            </div>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--text-dim); flex-shrink: 0;">
                                <polyline points="9 18 15 12 9 6"></polyline>
                            </svg>
                        </div>
                    `;
                }
            });

            const untaggedContacts = searchFiltered.filter(c => !c.tags || c.tags.length === 0);
            if (untaggedContacts.length > 0) {
                const untaggedLabel = t('noTags') || 'Sem Tag';
                htmlContent += `
                    <div class="reminder-card-premium" data-action="open-contact-folder" data-folder="_untagged" style="padding: 24px; min-height: 120px; display: flex; align-items: center; gap: 16px; cursor: pointer; transition: transform 0.2s ease, border-color 0.2s ease;">
                        <div style="background: rgba(255, 193, 7, 0.1); color: #FFC107; width: 48px; height: 48px; border-radius: 12px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                            </svg>
                        </div>
                        <div style="flex-grow: 1; min-width: 0;">
                            <h3 style="font-size: 15px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(untaggedLabel)}</h3>
                            <p style="font-size: 12px; color: var(--text-dim); margin-top: 4px;">${untaggedContacts.length} ${untaggedContacts.length === 1 ? 'contato' : 'contatos'}</p>
                        </div>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--text-dim); flex-shrink: 0;">
                            <polyline points="9 18 15 12 9 6"></polyline>
                        </svg>
                    </div>
                `;
            }

            if (!htmlContent) {
                grid.innerHTML = `<p style="color: var(--text-dim); text-align: center; width: 100%; grid-column: 1/-1;">${t('noContacts') || 'Nenhum contato ou pasta encontrado.'}</p>`;
            } else {
                grid.innerHTML = htmlContent;
            }
        } else {
            // ESTADO 2: Dentro de uma Pasta Específica
            const folder = state.selectedContactFolder;
            const isUntagged = folder === '_untagged';
            const folderName = isUntagged ? (t('noTags') || 'Sem Tag') : folder;

            const contactsInFolder = searchFiltered.filter(c => {
                if (isUntagged) return !c.tags || c.tags.length === 0;
                return c.tags && c.tags.includes(folder);
            });

            grid.innerHTML = `
                <div style="grid-column: 1 / -1; display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
                    <button data-action="go-back-contacts-folders" class="glass-btn" style="display: flex; align-items: center; gap: 8px; padding: 8px 16px; cursor: pointer;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="19" y1="12" x2="5" y2="12"></line>
                            <polyline points="12 19 5 12 12 5"></polyline>
                        </svg>
                        <span data-i18n="back">Voltar</span>
                    </button>
                    <div style="display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: var(--primary);">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FFC107" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: #FFC107;">
                            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                            <path d="M2 10h20"></path>
                        </svg>
                        <span>${escapeHtml(folderName)}</span>
                        <span style="background: rgba(255,255,255,0.05); color: var(--text-dim); padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; text-transform: none; letter-spacing: 0;">${contactsInFolder.length}</span>
                    </div>
                </div>
                ${contactsInFolder.length === 0 
                  ? `<p style="color: var(--text-dim); text-align: center; width: 100%; grid-column: 1/-1; padding-top: 24px;">${t('noContacts') || 'Nenhum contato encontrado nesta pasta.'}</p>`
                  : contactsInFolder.map(contact => renderSingleContactCard(contact)).join('')
                }
            `;
        }
    }

    updateContactsStats();
}

export function updateContactsStats() {
    const countTotal = el('contacts-count-total');
    if (countTotal) countTotal.innerText = state.contacts.length;

    const countTags = el('contacts-count-tags');
    if (countTags) {
        const activeTags = new Set();
        state.contacts.forEach(c => {
            if (c && c.tags) c.tags.forEach(t => activeTags.add(t));
        });
        countTags.innerText = activeTags.size;
    }
}

export function renderContactsTagFilter() {
    const container = el('contacts-tag-filter');
    if (!container) return;

    const allTags = new Set();
    state.contacts.forEach(c => {
        if (c && c.tags) c.tags.forEach(tag => allTags.add(tag));
    });
    const sortedTags = Array.from(allTags).sort();

    const renderTag = (tag, label, isActive) => `
        <button data-action="set-contacts-tag-filter" data-tag="${tag}" 
                class="glass-btn ${isActive ? 'primary' : ''}" 
                style="padding: 6px 14px; border-radius: 20px; font-size: 11px; white-space: nowrap; font-weight: 600;">
            ${label}
        </button>
    `;

    container.innerHTML = `
        ${renderTag('all', t('all'), state.contactsTagFilter === null || state.contactsTagFilter === 'all')}
        ${sortedTags.map(tag => renderTag(tag, tag, state.contactsTagFilter === tag)).join('')}
    `;
}

export function renderSelectedContactTagsDisplay() {
    const display = el('selectedContactTagsDisplay');
    if (!display) return;

    if (!Array.isArray(state.selectedContactTags)) state.selectedContactTags = [];

    display.innerHTML = state.selectedContactTags.map(tag => `
        <span class="glass-btn" style="font-size: 11px; padding: 4px 10px; border-color: var(--primary); display: flex; align-items: center; gap: 6px;" data-action="remove-contact-tag" data-tag="${escapeHtml(tag)}">
            ${escapeHtml(tag)} 
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </span>
    `).join('');
}

export function removeSelectedContactTag(tag) {
    if (!Array.isArray(state.selectedContactTags)) state.selectedContactTags = [];
    state.selectedContactTags = state.selectedContactTags.filter(t => t !== tag);
    renderSelectedContactTagsDisplay();
}

// ─── Seleção de Tags para Contatos ──────────────────────────────────────────────
export function openContactTagSelection() {
    const modal = el('contactTagSelectionModal');
    if (modal) {
        renderContactTagSelectionList();
        modal.classList.add('active');
    }
}

export function closeContactTagSelection() {
    const modal = el('contactTagSelectionModal');
    if (modal) modal.classList.remove('active');
}

export function confirmContactTagSelection() {
    closeContactTagSelection();
}

export function renderContactTagSelectionList() {
    const list = el('contactTagSelectionList');
    if (!list) return;

    if (!Array.isArray(state.selectedContactTags)) state.selectedContactTags = [];
    if (!Array.isArray(state.contactCustomTags)) state.contactCustomTags = [];

    const allUsedTags = new Set(state.contactCustomTags);
    state.contacts.forEach(c => {
        if (c && c.tags) c.tags.forEach(tag => allUsedTags.add(tag));
    });
    const sortedTags = Array.from(allUsedTags).sort();

    list.innerHTML = sortedTags.map(tag => `
        <div class="tag-selection-item ${state.selectedContactTags.includes(tag) ? 'selected' : ''}" 
             data-action="toggle-contact-tag" data-tag="${escapeHtml(tag)}"
             style="padding: 8px 16px; border-radius: 20px; border: 1px solid var(--border-glass); cursor: pointer; background: ${state.selectedContactTags.includes(tag) ? 'var(--primary)' : 'var(--bg-glass)'}; font-size: 13px; display: flex; align-items: center; gap: 8px;">
            <span style="flex: 1;">${escapeHtml(tag)}</span>
            <div style="display: flex; gap: 4px;" data-action="stop-prop">
                <button class="tag-action-btn" data-action="edit-contact-tag" data-tag="${escapeHtml(tag)}" 
                        style="background: none; border: none; color: var(--text-dim); cursor: pointer; padding: 2px;" title="${t('editTag')}">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                </button>
                <button class="tag-action-btn" data-action="delete-contact-tag" data-tag="${escapeHtml(tag)}" 
                        style="background: none; border: none; color: var(--accent-error); cursor: pointer; padding: 2px;" title="${t('deleteTag')}">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
            </div>
        </div>
    `).join('') || `<p style="font-size: 12px; color: var(--text-dim);">${t('noTagsAuto')}</p>`;
}

export function toggleContactTagSelection(tag) {
    if (!Array.isArray(state.selectedContactTags)) state.selectedContactTags = [];
    const idx = state.selectedContactTags.indexOf(tag);
    if (idx > -1) state.selectedContactTags.splice(idx, 1);
    else state.selectedContactTags.push(tag);
    renderSelectedContactTagsDisplay();
    renderContactTagSelectionList();
}

export async function addNewContactTagToSelection() {
    const input = el('newContactTagInput');
    const tag = input ? input.value.trim() : '';
    if (tag) {
        if (!Array.isArray(state.selectedContactTags)) state.selectedContactTags = [];
        if (!Array.isArray(state.contactCustomTags)) state.contactCustomTags = [];

        if (!state.selectedContactTags.includes(tag)) {
            state.selectedContactTags.push(tag);
            if (!state.contactCustomTags.includes(tag)) {
                state.contactCustomTags.push(tag);
                await saveContactCustomTags();
            }
            renderSelectedContactTagsDisplay();
            renderContactTagSelectionList();
            if (input) input.value = '';
        }
    }
}

export async function editContactTag(oldTag) {
    const newTag = prompt(t('newTagName'), oldTag);
    if (newTag && newTag.trim() && newTag !== oldTag) {
        const trimmedNewTag = newTag.trim();

        if (!Array.isArray(state.contactCustomTags)) state.contactCustomTags = [];
        const idx = state.contactCustomTags.indexOf(oldTag);
        if (idx !== -1) state.contactCustomTags[idx] = trimmedNewTag;
        else state.contactCustomTags.push(trimmedNewTag);

        state.contacts.forEach(c => {
            if (c && c.tags && c.tags.includes(oldTag)) {
                c.tags = c.tags.map(tag => tag === oldTag ? trimmedNewTag : tag);
            }
        });

        if (!Array.isArray(state.selectedContactTags)) state.selectedContactTags = [];
        state.selectedContactTags = state.selectedContactTags.map(tag => tag === oldTag ? trimmedNewTag : tag);

        await saveContactCustomTags();
        await saveContacts();
        renderContacts();
        renderContactTagSelectionList();
        renderSelectedContactTagsDisplay();
        showNotification(t('tagEdited') || 'Tag editada com sucesso!', 'success');
    }
}

export async function deleteContactTag(tag) {
    if (confirm(t('confirmDeleteTag') || 'Deseja excluir esta tag?')) {
        if (!Array.isArray(state.contactCustomTags)) state.contactCustomTags = [];
        state.contactCustomTags = state.contactCustomTags.filter(t => t !== tag);
        state.contacts.forEach(c => {
            if (c && c.tags) c.tags = c.tags.filter(ct => ct !== tag);
        });
        if (!Array.isArray(state.selectedContactTags)) state.selectedContactTags = [];
        state.selectedContactTags = state.selectedContactTags.filter(t => t !== tag);

        await saveContactCustomTags();
        await saveContacts();
        renderContacts();
        renderContactTagSelectionList();
        renderSelectedContactTagsDisplay();
        showNotification(t('tagDeleted') || 'Tag removida com sucesso!', 'success');
    }
}

export function formatBrazilianPhone(value) {
    let digits = value.replace(/\D/g, '');
    if (digits.length > 11) {
        digits = digits.slice(0, 11);
    }
    if (digits.length === 0) {
        return '';
    }
    if (digits.length <= 2) {
        return `(${digits}`;
    }
    if (digits.length <= 6) {
        return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    }
    if (digits.length <= 10) {
        return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    }
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

// ─── Init ─────────────────────────────────────────────────────────────────────
export function init() {
    window._renderSelectedContactTagsDisplay = renderSelectedContactTagsDisplay;
    window._saveContacts = saveContacts;
    window._renderContacts = renderContacts;
    window._setContactsLayout = setContactsLayout;
    window._openContactFolder = openContactFolder;
    window._goBackContactsFolders = goBackContactsFolders;

    const phoneInput = el('contactPhoneInput');
    if (phoneInput) {
        phoneInput.addEventListener('input', (e) => {
            if (state.currentLang === 'pt') {
                const value = e.target.value;
                const formatted = formatBrazilianPhone(value);
                if (formatted !== value) {
                    e.target.value = formatted;
                }
            }
        });
    }

    console.log('Remind.hub: contacts.js inicializado.');
}
