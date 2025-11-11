import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/apiClient';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import styles from '../styles/PlatformOrganizations.module.css';

/* ---------- constants ---------- */

const STATUS = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'suspended', label: 'Suspended' },
];

const STATUS_CLASS = (s, css) =>
  ({
    approved: css.statusApproved,
    pending: css.statusPending,
    rejected: css.statusRejected,
    suspended: css.statusSuspended,
  }[s] || '');

const toEditState = (org) =>
  org
    ? {
        name: org.name || '',
        country: org.country || '',
        contactEmail: org.contactEmail || '',
        message: org.message || '',
        status: org.status || 'pending',
        isActive: Boolean(org.isActive),
      }
    : null;

const initialCreate = {
  name: '',
  country: '',
  contactEmail: '',
  status: 'pending',
  message: '',
  createAdmin: true,
  adminEmail: '',
  adminDisplayName: '',
};

const initialAdmin = {
  email: '',
  displayName: '',
  activateOrg: false,
};

/* ---------- small utils ---------- */

function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function fmtDate(x) {
  if (!x) return '—';
  try {
    return new Date(x).toLocaleString();
  } catch {
    return x;
  }
}

/* ---------- modal shell ---------- */

function Modal({ open, onClose, children, labelledBy }) {
  if (!open) return null;
  return (
    <div className={styles.modalBackdrop} onClick={onClose} role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
      <div className={styles.modalContainer} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

/* ---------- page ---------- */

const PlatformOrganizations = () => {
  const qc = useQueryClient();

  // filters
  const [statusFilter, setStatusFilter] = useState('all');
  const [activeFilter, setActiveFilter] = useState('all');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search, 250);

  // ui state
  const [banner, setBanner] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showManage, setShowManage] = useState(false);

  // forms
  const [createState, setCreateState] = useState(initialCreate);
  const [editState, setEditState] = useState(null);
  const [adminDraft, setAdminDraft] = useState(initialAdmin);

  // selection
  const [manageOrgId, setManageOrgId] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  // feedback
  const [adminFeedback, setAdminFeedback] = useState('');
  const [adminError, setAdminError] = useState('');
  const [manageFeedback, setManageFeedback] = useState('');
  const [manageError, setManageError] = useState('');
  const [deleteError, setDeleteError] = useState('');

  const filters = useMemo(() => {
    const params = {};
    if (statusFilter !== 'all') params.status = statusFilter;
    if (activeFilter !== 'all') params.isActive = activeFilter === 'active';
    if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
    return params;
  }, [statusFilter, activeFilter, debouncedSearch]);

  /* ---------- queries ---------- */

  const orgsQuery = useQuery({
    queryKey: ['superadmin', 'orgs', filters],
    queryFn: async () => {
      const res = await apiClient.get('/api/superadmin/orgs', { params: filters });
      return res.data.organizations;
    },
    keepPreviousData: true,
  });

  const adminsQuery = useQuery({
    queryKey: ['superadmin', 'admins', { orgId: manageOrgId || null }],
    queryFn: async () => {
      if (!manageOrgId) return [];
      const res = await apiClient.get('/api/superadmin/admins', { params: { orgId: manageOrgId } });
      return res.data.admins;
    },
    enabled: showManage && Boolean(manageOrgId),
  });

// ✅ Memoize raw organizations so it does NOT trigger downstream useMemo recalculations
const organizations = useMemo(() => orgsQuery.data ?? [], [orgsQuery.data]);

// ✅ Safe: this depends only on memoized organizations + manageOrgId
const manageOrg = useMemo(
  () => organizations.find((x) => x.id === manageOrgId) || null,
  [organizations, manageOrgId]
);

  useEffect(() => {
    if (!showManage || !manageOrgId) return;
    if (manageOrg) setEditState(toEditState(manageOrg));
  }, [showManage, manageOrgId, manageOrg]);

  /* ---------- mutations ---------- */

  const createMutation = useMutation({
    mutationFn: (payload) => apiClient.post('/api/superadmin/orgs', payload).then((r) => r.data),
    onSuccess: (data) => {
      const msg = data.admin?.tempPassword
        ? `Organization created. Temporary admin password: ${data.admin.tempPassword}`
        : 'Organization created.';
      setBanner({ type: 'success', message: msg });
      setCreateState(initialCreate);
      setShowCreate(false);

      setManageOrgId(data.organization.id);
      setEditState(toEditState(data.organization));
      setManageFeedback(msg);
      setShowManage(true);

      qc.invalidateQueries({ queryKey: ['superadmin', 'orgs'] });
    },
    onError: (err) => {
      setBanner({ type: 'error', message: err.response?.data?.error || 'Unable to create organization.' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) =>
      apiClient.patch(`/api/superadmin/orgs/${id}`, payload).then((r) => r.data),
    onSuccess: (data) => {
      setManageFeedback('Organization updated.');
      setManageError('');
      setEditState(toEditState(data.organization));
      qc.invalidateQueries({ queryKey: ['superadmin', 'orgs'] });
      qc.invalidateQueries({ queryKey: ['superadmin', 'admins'] });
    },
    onError: (err) => {
      setManageFeedback('');
      setManageError(err.response?.data?.error || 'Unable to update organization.');
    },
  });

  const adminCreateMutation = useMutation({
    mutationFn: ({ orgId, payload }) =>
      apiClient.post(`/api/superadmin/orgs/${orgId}/admins`, payload).then((r) => r.data),
    onSuccess: (data) => {
      setAdminFeedback(
        data.admin?.tempPassword ? `Admin created. Temporary password: ${data.admin.tempPassword}` : 'Admin created.'
      );
      setAdminError('');
      setAdminDraft(initialAdmin);
      qc.invalidateQueries({ queryKey: ['superadmin', 'admins'] });
      qc.invalidateQueries({ queryKey: ['superadmin', 'orgs'] });
    },
    onError: (err) => {
      setAdminFeedback('');
      setAdminError(err.response?.data?.error || 'Unable to create admin.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (orgId) => apiClient.delete(`/api/superadmin/orgs/${orgId}`).then((r) => r.data),
    onSuccess: () => {
      setDeleteError('');
      setShowManage(false);
      setManageOrgId(null);
      resetManage();
      setBanner({ type: 'success', message: 'Organization deleted.' });
      qc.invalidateQueries({ queryKey: ['superadmin', 'orgs'] });
      qc.invalidateQueries({ queryKey: ['superadmin', 'admins'] });
    },
    onError: (err) => {
      setDeleteError(err.response?.data?.error || 'Unable to delete organization.');
    },
  });

  /* ---------- handlers ---------- */

  function resetManage() {
    setAdminDraft(initialAdmin);
    setAdminFeedback('');
    setAdminError('');
    setManageFeedback('');
    setManageError('');
    setDeleteConfirm(false);
    setDeleteError('');
    setEditState(null);
  }

  function openCreate() {
    setCreateState(initialCreate);
    setBanner(null);
    setShowCreate(true);
  }

  function openManage(id) {
    resetManage();
    setManageOrgId(id);
    setShowManage(true);
  }

  function closeManage() {
    setShowManage(false);
    setManageOrgId(null);
    resetManage();
  }

  function handleCreateSubmit(e) {
    e.preventDefault();
    const payload = {
      name: createState.name.trim(),
      country: createState.country.trim(),
      contactEmail: createState.contactEmail.trim(),
      status: createState.status,
      message: createState.message.trim() || undefined,
      isActive: createState.status === 'approved',
    };
    if (createState.createAdmin) {
      payload.admin = {
        email: createState.adminEmail.trim(),
        displayName: createState.adminDisplayName.trim(),
      };
    }
    createMutation.mutate(payload);
  }

  function handleEditSubmit(e) {
    e.preventDefault();
    if (!manageOrgId || !editState) return;
    const payload = {
      name: editState.name.trim(),
      country: editState.country.trim(),
      contactEmail: editState.contactEmail.trim(),
      status: editState.status,
      message: editState.message.trim() || undefined,
      isActive: Boolean(editState.isActive),
    };
    updateMutation.mutate({ id: manageOrgId, payload });
  }

  function handleCreateAdmin(e) {
    e.preventDefault();
    if (!manageOrgId) return;
    adminCreateMutation.mutate({
      orgId: manageOrgId,
      payload: {
        email: adminDraft.email.trim(),
        displayName: adminDraft.displayName.trim(),
        activateOrg: adminDraft.activateOrg || undefined,
      },
    });
  }

  function quickUpdate(next) {
    if (!manageOrgId) return;
    updateMutation.mutate({ id: manageOrgId, payload: next });
  }

  /* ---------- render ---------- */

  return (
    <div className={styles.page}>
      <div className={styles.headerRow}>
        <div>
          <h1>Platform Organizations</h1>
          <p className={styles.muted}>Approve hospitals, manage contacts, control access.</p>
        </div>
        <div className={styles.headerActions}>
          <Button variant="primary" onClick={openCreate}>New Organization</Button>
        </div>
      </div>

      {banner ? (
        <div className={banner.type === 'error' ? styles.errorBanner : styles.feedbackBanner}>{banner.message}</div>
      ) : null}

      <Card>
        <CardHeader
          actions={
            <Button variant="ghost" onClick={() => orgsQuery.refetch()} disabled={orgsQuery.isFetching}>
              Refresh
            </Button>
          }
        >
          <CardTitle>Organizations</CardTitle>
        </CardHeader>
        <CardContent>
          <div className={styles.filters}>
            <Input placeholder="Search by name or email" value={search} onChange={(e) => setSearch(e.target.value)} />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">All statuses</option>
              {STATUS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <select value={activeFilter} onChange={(e) => setActiveFilter(e.target.value)}>
              <option value="all">All states</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          {orgsQuery.isLoading ? (
            <div className={styles.emptyState}>Loading…</div>
          ) : orgsQuery.isError ? (
            <div className={styles.error}>Failed to load organizations.</div>
          ) : organizations.length === 0 ? (
            <div className={styles.emptyState}>No organizations match the current filters.</div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Contact</th>
                  <th>Status</th>
                  <th>Active</th>
                  <th>Updated</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {organizations.map((org) => (
                  <tr key={org.id}>
                    <td>
                      <strong>{org.name}</strong>
                      <div className={styles.muted}>{org.country}</div>
                    </td>
                    <td>{org.contactEmail}</td>
                    <td>
                      <span className={`${styles.badge} ${STATUS_CLASS(org.status, styles)}`}>
                        {STATUS.find((x) => x.value === org.status)?.label || org.status}
                      </span>
                    </td>
                    <td>{org.isActive ? 'Active' : 'Inactive'}</td>
                    <td>{fmtDate(org.updatedAt)}</td>
                    <td>
                      <div className={styles.actions}>
                        <Button
                          size="sm"
                          variant={manageOrgId === org.id && showManage ? 'primary' : 'outline'}
                          onClick={() => openManage(org.id)}
                        >
                          Manage
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Create modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} labelledBy="create-org-title">
        <Card className={styles.modalCard}>
          <CardHeader actions={<Button variant="ghost" onClick={() => setShowCreate(false)}>Close</Button>}>
            <CardTitle id="create-org-title">New organization</CardTitle>
          </CardHeader>
          <CardContent className={styles.modalContent}>
            <form className={styles.modalForm} onSubmit={handleCreateSubmit}>
              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label htmlFor="create-name">Organization name</label>
                  <Input
                    id="create-name"
                    required
                    value={createState.name}
                    onChange={(e) => setCreateState((p) => ({ ...p, name: e.target.value }))}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label htmlFor="create-country">Country</label>
                  <Input
                    id="create-country"
                    required
                    value={createState.country}
                    onChange={(e) => setCreateState((p) => ({ ...p, country: e.target.value }))}
                  />
                </div>
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="create-contact">Primary contact email</label>
                <Input
                  id="create-contact"
                  type="email"
                  required
                  value={createState.contactEmail}
                  onChange={(e) => setCreateState((p) => ({ ...p, contactEmail: e.target.value }))}
                />
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="org-status">Initial status</label>
                <select
                  id="org-status"
                  value={createState.status}
                  onChange={(e) => setCreateState((p) => ({ ...p, status: e.target.value }))}
                >
                  {STATUS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
                <span className={styles.muted}>Approving will immediately activate all admin accounts created.</span>
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="org-notes">Notes (internal)</label>
                <textarea
                  id="org-notes"
                  className={styles.textarea}
                  value={createState.message}
                  onChange={(e) => setCreateState((p) => ({ ...p, message: e.target.value }))}
                  placeholder="Optional notes."
                />
              </div>

              <div className={styles.checkboxRow}>
                <input
                  type="checkbox"
                  id="create-admin"
                  checked={createState.createAdmin}
                  onChange={(e) => setCreateState((p) => ({ ...p, createAdmin: e.target.checked }))}
                />
                <label htmlFor="create-admin">Create an initial admin account</label>
              </div>

              {createState.createAdmin ? (
                <>
                  <div className={styles.formGroup}>
                    <label htmlFor="create-admin-email">Admin email</label>
                    <Input
                      id="create-admin-email"
                      required
                      type="email"
                      value={createState.adminEmail}
                      onChange={(e) => setCreateState((p) => ({ ...p, adminEmail: e.target.value }))}
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label htmlFor="create-admin-name">Admin display name</label>
                    <Input
                      id="create-admin-name"
                      required
                      value={createState.adminDisplayName}
                      onChange={(e) => setCreateState((p) => ({ ...p, adminDisplayName: e.target.value }))}
                    />
                  </div>
                </>
              ) : null}

              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Creating…' : 'Create organization'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </Modal>

      {/* Manage modal */}
      <Modal open={showManage && Boolean(manageOrgId)} onClose={closeManage} labelledBy="manage-org-title">
        <Card className={styles.modalCard}>
          <CardHeader actions={<Button variant="ghost" onClick={closeManage}>Close</Button>}>
            <CardTitle id="manage-org-title">
              Manage “{manageOrg?.name || editState?.name || 'Organization'}”
            </CardTitle>
            <p className={styles.modalSubtitle}>
              {(manageOrg?.country || editState?.country || '—')} ·{' '}
              {(manageOrg?.contactEmail || editState?.contactEmail || '—')} ·{' '}
              {(manageOrg?.isActive || editState?.isActive) ? 'Active' : 'Inactive'}
            </p>
          </CardHeader>

          <CardContent className={styles.modalContent}>
            {/* details */}
            <section className={styles.modalSection}>
              <h4>Organization details</h4>
              <form className={styles.modalForm} onSubmit={handleEditSubmit}>
                <div className={styles.formGroup}>
                  <label htmlFor="edit-name">Organization name</label>
                  <Input
                    id="edit-name"
                    required
                    value={editState?.name || ''}
                    onChange={(e) => setEditState((p) => ({ ...p, name: e.target.value }))}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label htmlFor="edit-country">Country</label>
                  <Input
                    id="edit-country"
                    required
                    value={editState?.country || ''}
                    onChange={(e) => setEditState((p) => ({ ...p, country: e.target.value }))}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label htmlFor="edit-contact">Primary contact email</label>
                  <Input
                    id="edit-contact"
                    required
                    type="email"
                    value={editState?.contactEmail || ''}
                    onChange={(e) => setEditState((p) => ({ ...p, contactEmail: e.target.value }))}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label htmlFor="edit-status">Status</label>
                  <select
                    id="edit-status"
                    value={editState?.status || 'pending'}
                    onChange={(e) => setEditState((p) => ({ ...p, status: e.target.value }))}
                  >
                    {STATUS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className={styles.checkboxRow}>
                  <input
                    type="checkbox"
                    id="edit-active"
                    checked={Boolean(editState?.isActive)}
                    onChange={(e) => setEditState((p) => ({ ...p, isActive: e.target.checked }))}
                  />
                  <label htmlFor="edit-active">Organization is active</label>
                </div>
                <div className={styles.formGroup}>
                  <label htmlFor="edit-notes">Internal notes</label>
                  <textarea
                    id="edit-notes"
                    className={styles.textarea}
                    value={editState?.message || ''}
                    onChange={(e) => setEditState((p) => ({ ...p, message: e.target.value }))}
                  />
                </div>

                {manageFeedback ? <div className={styles.feedback}>{manageFeedback}</div> : null}
                {manageError ? <div className={styles.error}>{manageError}</div> : null}

                <div className={styles.modalActions}>
                  <Button type="submit" disabled={updateMutation.isPending}>
                    {updateMutation.isPending ? 'Saving…' : 'Save changes'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={updateMutation.isPending}
                    onClick={() => quickUpdate({ status: 'approved', isActive: true })}
                  >
                    Approve
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={updateMutation.isPending}
                    onClick={() => quickUpdate({ status: 'suspended', isActive: false })}
                  >
                    Suspend
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={updateMutation.isPending}
                    onClick={() => quickUpdate({ status: 'rejected', isActive: false })}
                  >
                    Reject
                  </Button>
                </div>
              </form>
            </section>

            {/* admins */}
            <section className={styles.modalSection}>
              <div className={styles.modalSectionHeader}>
                <h4>Admin accounts</h4>
                <span className={styles.muted}>
                  {adminsQuery.isFetching ? 'Refreshing…' : `${(adminsQuery.data || []).length} total`}
                </span>
              </div>

              {adminsQuery.isLoading ? (
                <div className={styles.modalEmpty}>Loading admin accounts…</div>
              ) : (adminsQuery.data || []).length === 0 ? (
                <div className={styles.modalEmpty}>No admin accounts yet. Create one below.</div>
              ) : (
                <table className={styles.adminTable}>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Status</th>
                      <th>Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(adminsQuery.data || []).map((a) => (
                      <tr key={a.id}>
                        <td>{a.displayName || '—'}</td>
                        <td>{a.email}</td>
                        <td>{a.isActive ? 'Active' : 'Inactive'}</td>
                        <td>{fmtDate(a.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            {/* create admin */}
            <section className={styles.modalSection}>
              <h4>Create admin account</h4>
              <form className={styles.modalForm} onSubmit={handleCreateAdmin}>
                <div className={styles.formGroup}>
                  <label htmlFor="modal-admin-email">Admin email</label>
                  <Input
                    id="modal-admin-email"
                    required
                    type="email"
                    value={adminDraft.email}
                    onChange={(e) => setAdminDraft((p) => ({ ...p, email: e.target.value }))}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label htmlFor="modal-admin-name">Display name</label>
                  <Input
                    id="modal-admin-name"
                    required
                    value={adminDraft.displayName}
                    onChange={(e) => setAdminDraft((p) => ({ ...p, displayName: e.target.value }))}
                  />
                </div>
                <div className={styles.checkboxRow}>
                  <input
                    type="checkbox"
                    id="modal-activate-org"
                    checked={adminDraft.activateOrg}
                    onChange={(e) => setAdminDraft((p) => ({ ...p, activateOrg: e.target.checked }))}
                  />
                  <label htmlFor="modal-activate-org">Reactivate this organization if currently inactive</label>
                </div>

                {adminFeedback ? <div className={styles.feedback}>{adminFeedback}</div> : null}
                {adminError ? <div className={styles.error}>{adminError}</div> : null}

                <Button type="submit" disabled={adminCreateMutation.isPending}>
                  {adminCreateMutation.isPending ? 'Creating…' : 'Create admin'}
                </Button>
              </form>
            </section>

            {/* destructive */}
            <section className={styles.modalSection}>
              <h4>Delete organization</h4>
              <p className={styles.muted}>
                Removing this organization permanently deletes all accounts, studies, forms, tasks, and patient records.
              </p>
              <label className={styles.checkboxRow}>
                <input
                  type="checkbox"
                  checked={deleteConfirm}
                  onChange={(e) => setDeleteConfirm(e.target.checked)}
                />
                <span>I understand this action cannot be undone.</span>
              </label>
              {deleteError ? <div className={styles.error}>{deleteError}</div> : null}
              <Button
                type="button"
                className={styles.dangerButton}
                variant="outline"
                disabled={!deleteConfirm || deleteMutation.isPending}
                onClick={() => manageOrgId && deleteMutation.mutate(manageOrgId)}
              >
                {deleteMutation.isPending ? 'Deleting…' : 'Delete organization'}
              </Button>
            </section>
          </CardContent>
        </Card>
      </Modal>
    </div>
  );
};

export default PlatformOrganizations;
