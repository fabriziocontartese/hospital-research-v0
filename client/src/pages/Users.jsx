import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/apiClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import UserTable from '../components/UserTable';
import styles from '../styles/UsersPage.module.css';

const roleLabels = {
  admin: 'Admin',
  researcher: 'Researcher',
  staff: 'Staff',
};

const Users = () => {
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [teamFilter, setTeamFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [showInvite, setShowInvite] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [teams, setTeams] = useState([]);
  const [showTeamsModal, setShowTeamsModal] = useState(false);
  const [teamDraft, setTeamDraft] = useState('');
  const [teamModalMessage, setTeamModalMessage] = useState('');
  const queryClient = useQueryClient();

  const usersQuery = useQuery({
    queryKey: ['users', roleFilter, statusFilter],
    queryFn: async () => {
      const params = {};
      if (roleFilter !== 'all') params.role = roleFilter;
      if (statusFilter !== 'all') params.isActive = statusFilter === 'active';
      const response = await apiClient.get('/api/users', { params });
      return response.data.users;
    },
  });

  const inviteMutation = useMutation({
    mutationFn: (payload) => apiClient.post('/api/users', payload).then((res) => res.data),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setFeedback(
        res.tempPassword
          ? `User created. Temporary password: ${res.tempPassword}`
          : 'User created.'
      );
      setShowInvite(false);
    },
    onError: (err) => {
      setFeedback(err.response?.data?.error || 'Unable to create user.');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => apiClient.patch(`/api/users/${id}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setFeedback('User updated.');
    },
    onError: (err) => {
      setFeedback(err.response?.data?.error || 'Unable to update user.');
    },
  });

  const users = useMemo(() => usersQuery.data ?? [], [usersQuery.data]);

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return users.filter((userItem) => {
      if (teamFilter === 'none') {
        if ((userItem.category || '').trim()) {
          return false;
        }
      } else if (teamFilter !== 'all') {
        if ((userItem.category || '').toLowerCase() !== teamFilter.toLowerCase()) {
          return false;
        }
      }

      if (!query) return true;

      const teamName = (userItem.category || '').toLowerCase();
      return (
        userItem.displayName?.toLowerCase().includes(query) ||
        userItem.email.toLowerCase().includes(query) ||
        teamName.includes(query)
      );
    });
  }, [users, search, teamFilter]);

  const summary = useMemo(() => {
    const base = { admin: 0, researcher: 0, staff: 0 };
    filteredUsers.forEach((u) => {
      if (base[u.role] !== undefined) {
        base[u.role] += 1;
      }
    });
    return base;
  }, [filteredUsers]);

  const handleSaveUser = async (user, payload) => {
    const userId = user.id || user._id;
    if (!userId) return;
    return updateMutation.mutateAsync({
      id: userId,
      payload,
    });
  };

  const deleteMutation = useMutation({
    mutationFn: (id) => apiClient.delete(`/api/users/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setFeedback('User deleted.');
    },
    onError: (err) => {
      setFeedback(err.response?.data?.error || 'Unable to delete user.');
    },
  });

  const handleDeleteUser = (user) => {
    const userId = user.id || user._id;
    if (!userId) return Promise.resolve();
    return deleteMutation.mutateAsync(userId);
  };

  useEffect(() => {
    setTeams((previous) => {
      const normalized = new Map(
        previous.map((team) => [team.toLowerCase(), team])
      );

      users.forEach((userItem) => {
        const value = (userItem.category || '').trim();
        if (!value) return;
        const lower = value.toLowerCase();
        if (!normalized.has(lower)) {
          normalized.set(lower, value);
        }
      });

      const merged = Array.from(normalized.values()).sort((a, b) => a.localeCompare(b));

      const changed =
        merged.length !== previous.length || merged.some((team, index) => team !== previous[index]);

      return changed ? merged : previous;
    });
  }, [users]);

  const handleTeamAdd = (newTeam) => {
    const trimmedTeam = newTeam.trim();
    if (!trimmedTeam) {
      setTeamModalMessage('Enter a team name to add.');
      return;
    }

    let added = false;
    setTeams((previous) => {
      const lower = trimmedTeam.toLowerCase();
      if (previous.some((team) => team.toLowerCase() === lower)) {
        return previous;
      }
      added = true;
      const next = [...previous, trimmedTeam].sort((a, b) => a.localeCompare(b));
      return next;
    });

    if (added) {
      setTeamModalMessage(`Added "${trimmedTeam}".`);
      setTeamDraft('');
    } else {
      setTeamModalMessage(`"${trimmedTeam}" is already in the list.`);
    }
  };

  const handleTeamRemove = (team) => {
    const normalized = team.toLowerCase();
    const stillInUse = users.some(
      (userItem) => (userItem.category || '').toLowerCase() === normalized
    );
    if (stillInUse) {
      setTeamModalMessage('Remove this team from all users before deleting it.');
      return;
    }

    setTeams((previous) => previous.filter((item) => item.toLowerCase() !== normalized));
    setTeamModalMessage(`Removed "${team}".`);
  };

  const closeTeamsModal = () => {
    setShowTeamsModal(false);
    setTeamDraft('');
    setTeamModalMessage('');
  };

  const handleInvite = (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    inviteMutation.mutate({
      email: form.get('email'),
      displayName: form.get('displayName'),
      role: form.get('role'),
      category: form.get('category') || undefined,
    });
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1>Team directory</h1>
          <p>Invite new researchers and staff, or adjust their permissions and teams.</p>
        </div>
        <Button onClick={() => setShowInvite(true)}>Invite user</Button>
      </div>

      <section className={styles.summaryGrid}>
        {Object.entries(summary).map(([role, count]) => (
          <Card key={role}>
            <CardHeader className={styles.summaryHeader}>
              <CardTitle>{roleLabels[role]}</CardTitle>
              <span className={styles.summaryValue}>{count}</span>
            </CardHeader>
          </Card>
        ))}
      </section>

      <Card>
        <CardHeader
          actions={
            <div className={styles.headerActions}>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setTeamDraft('');
                  setTeamModalMessage('');
                  setShowTeamsModal(true);
                }}
              >
                Manage teams
              </Button>
            </div>
          }
        >
          <CardTitle>Users ({filteredUsers.length})</CardTitle>
          <CardDescription>Refine filters and edit profiles inline.</CardDescription>
        </CardHeader>
        <CardContent className={styles.usersSection}>
          <div className={styles.usersFilters}>
            <label className={styles.filterItem}>
              <span>Search</span>
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Find by name, email, or team"
              />
            </label>
            <label className={styles.filterItem}>
              <span>Role</span>
              <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
                <option value="all">All roles</option>
                <option value="admin">Admin</option>
                <option value="researcher">Researcher</option>
                <option value="staff">Staff</option>
              </select>
            </label>
            <label className={styles.filterItem}>
              <span>Team</span>
              <select value={teamFilter} onChange={(event) => setTeamFilter(event.target.value)}>
                <option value="all">All teams</option>
                <option value="none">No team</option>
                {teams.map((team) => (
                  <option key={team} value={team}>
                    {team}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.filterItem}>
              <span>Status</span>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
          </div>

          {feedback ? <div className={styles.feedbackBanner}>{feedback}</div> : null}

          {usersQuery.isLoading ? (
            <div className={styles.emptyState}>Loading users…</div>
          ) : filteredUsers.length === 0 ? (
            <div className={styles.emptyState}>No users match the current filters.</div>
          ) : (
            <UserTable
              users={filteredUsers}
              teams={teams}
              onSaveUser={handleSaveUser}
              onDeleteUser={handleDeleteUser}
              savingUserId={updateMutation.isLoading ? updateMutation.variables?.id : null}
              deletingUserId={deleteMutation.isLoading ? deleteMutation.variables : null}
            />
          )}
        </CardContent>
      </Card>

      {showTeamsModal ? (
        <div className={styles.modalBackdrop} onClick={closeTeamsModal}>
          <div
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <Card>
              <CardHeader>
                <CardTitle>Manage teams</CardTitle>
                <CardDescription>
                  Teams appear in filters and user assignments. Remove teams once no members use them.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form
                  className={styles.teamModalForm}
                  onSubmit={(event) => {
                    event.preventDefault();
                    handleTeamAdd(teamDraft);
                  }}
                >
                  <Input
                    value={teamDraft}
                    onChange={(event) => setTeamDraft(event.target.value)}
                    placeholder="Add a team name"
                  />
                  <Button type="submit" size="sm">
                    Add
                  </Button>
                </form>

                <div className={styles.teamList}>
                  {teams.length === 0 ? (
                    <span className={styles.teamEmpty}>No teams yet. Add your first team above.</span>
                  ) : (
                    teams.map((team) => (
                      <div key={team} className={styles.teamRow}>
                        <span className={styles.teamName}>{team}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className={styles.teamRemove}
                          onClick={() => handleTeamRemove(team)}
                        >
                          Remove
                        </Button>
                      </div>
                    ))
                  )}
                </div>

                {teamModalMessage ? (
                  <div className={styles.teamModalMessage}>{teamModalMessage}</div>
                ) : null}

                <div className={styles.modalActions}>
                  <Button type="button" variant="ghost" onClick={closeTeamsModal}>
                    Close
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : null}

      {showInvite ? (
        <div className={styles.modalBackdrop} onClick={() => setShowInvite(false)}>
          <div
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <Card>
              <CardHeader>
                <CardTitle>Invite new user</CardTitle>
                <CardDescription>Send an invitation email with a temporary password.</CardDescription>
              </CardHeader>
              <CardContent>
                <form className={styles.modalForm} onSubmit={handleInvite}>
                  <label>
                    Email
                    <Input name="email" type="email" required placeholder="user@organisation.org" />
                  </label>
                  <label>
                    Display name
                    <Input name="displayName" required placeholder="Dr. Taylor Rivera" />
                  </label>
                  <label>
                    Team
                    <Input name="category" placeholder="e.g. Cardiology" />
                  </label>
                  <label>
                    Role
                    <select name="role" defaultValue="researcher">
                      <option value="researcher">Researcher</option>
                      <option value="staff">Staff</option>
                    </select>
                  </label>
                  <div className={styles.modalActions}>
                    <Button type="button" variant="ghost" onClick={() => setShowInvite(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={inviteMutation.isLoading}>
                      {inviteMutation.isLoading ? 'Sending…' : 'Send invite'}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default Users;
