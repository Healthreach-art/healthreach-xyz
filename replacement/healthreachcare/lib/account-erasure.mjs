// Remove direct account identifiers while keeping linked financial records and
// booking references intact for reconciliation and dispute handling.
export async function eraseAccountWorkspace(env, account) {
  if (!account?.uid) return;
  const accountId = account.uid;
  const project = JSON.parse(env.FIREBASE_WEB_CONFIG || '{}').projectId;
  if (!project) return;
  const key = `firebase-market:${project}`;
  const row = await env.DB.prepare('SELECT data FROM workspaces WHERE id=?').bind(key).first();
  if (!row?.data) return;
  const s = JSON.parse(row.data);
  const ownedDocuments = (s.documents || []).filter(document => document.ownerId === accountId && !document.purged);
  for (const document of ownedDocuments) if (document.key) await env.BUCKET?.delete(document.key);
  s.documents = (s.documents || []).filter(document => document.ownerId !== accountId);
  if (account.role === 'Patient') {
    delete s.profiles?.[accountId];
    for (const record of s.records || []) if (record.patientId === accountId) {
      record.patientName = 'Deleted account';
      record.patientEmail = '';
      record.address = '';
      delete record.addressDetails;
      delete record.careNotes;
      delete record.requirements;
      delete record.identity;
      record.history = (record.history || []).map(event => ({ ...event, actor: event.actor === account.fullName ? 'Deleted account' : event.actor }));
    }
    for (const checkout of s.checkouts || []) if (checkout.patientId === accountId) { checkout.address = ''; checkout.patientId = 'deleted-account'; }
    s.conversations = (s.conversations || []).map(thread => thread.participants?.includes(accountId)
      ? { ...thread, archived: true, archivedAt: new Date().toISOString(), messages: [], participants: thread.participants.filter(id => id !== accountId) }
      : thread);
    s.notifications = (s.notifications || []).filter(item => item.recipientId !== accountId && item.patientId !== accountId);
    s.tickets = (s.tickets || []).filter(item => item.patientId !== accountId);
    s.privacyRequests = (s.privacyRequests || []).filter(item => item.accountId !== accountId);
    s.reminders = (s.reminders || []).filter(item => item.accountId !== accountId);
  } else {
    const provider = s.providers?.find(item => item.id === accountId);
    if (provider) { provider.status = 'Deleted'; provider.acceptingOrders = false; provider.name = 'Removed provider'; provider.location = ''; provider.description = ''; provider.coordinates = null; provider.publication = { ...(provider.publication || {}), status: 'Draft' }; }
    const driver = s.drivers?.[accountId];
    if (driver) { driver.status = 'Deleted'; driver.online = false; driver.name = 'Removed driver'; driver.email = ''; driver.serviceArea = ''; driver.publicProfile = null; }
    for (const product of s.products || []) if (product.ownerId === accountId) { product.active = false; product.removed = true; }
    s.notifications = (s.notifications || []).filter(item => item.recipientId !== accountId);
    s.conversations = (s.conversations || []).map(thread => thread.participants?.includes(accountId)
      ? { ...thread, archived: true, archivedAt: new Date().toISOString(), messages: [], participants: thread.participants.filter(id => id !== accountId) }
      : thread);
  }
  const updated = JSON.stringify(s);
  const result = await env.DB.prepare('UPDATE workspaces SET data=?,updated=? WHERE id=? AND data=?')
    .bind(updated, new Date().toISOString(), key, row.data).run();
  if (!result.meta.changes) throw Error('Workspace changed during account deletion. Refresh and retry.');
}
